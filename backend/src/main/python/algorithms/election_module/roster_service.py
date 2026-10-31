"""Service handling explicit election voter roster freezing and credential issuance."""

from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.audit_module.audit_service import AuditService
from src.main.python.config.logger_config import request_id_var
from src.main.python.constants.enums import (
    ActivityType,
    AuditAction,
    CredentialStatus,
    PollLifecycle,
    RegistrationStatus,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll
from src.main.python.database.models.election import (
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
)
from src.main.python.fileds.response.election_response import RosterFreezeResponse
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError


def _request_id() -> str:
    val = request_id_var.get().strip()
    return val[:64] if val else "missing"


class RosterService:
    """Domain service for voter roster freeze and single-use credential generation."""

    def __init__(self, session_factory: sessionmaker[Session], clock: Clock) -> None:
        self._factory = session_factory
        self._clock = clock
        self._audit = AuditService()

    def freeze_roster(self, election_id: int, admin_id: int) -> RosterFreezeResponse:
        """Freeze eligibility roster and issue credentials atomically and idempotently."""
        now = self._clock.now()
        with self._factory() as session:
            try:
                poll = session.execute(
                    select(Poll)
                    .where(
                        Poll.id == election_id,
                        Poll.activity_type == ActivityType.ELECTION.value,
                    )
                    .with_for_update()
                ).scalar_one_or_none()

                if poll is None or poll.lifecycle != PollLifecycle.PUBLISHED:
                    raise AppError(
                        404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                    )

                config = session.execute(
                    select(ElectionConfig)
                    .where(ElectionConfig.poll_id == election_id)
                    .with_for_update()
                ).scalar_one()

                # Idempotency check: if already frozen, return existing stats without re-issuing
                if config.roster_frozen_at is not None:
                    issued_count = session.execute(
                        select(func.count(ElectionVoterCredential.id)).where(
                            ElectionVoterCredential.poll_id == election_id
                        )
                    ).scalar_one()
                    return RosterFreezeResponse(
                        poll_id=election_id,
                        roster_frozen_at=config.roster_frozen_at,
                        eligible_voter_count=config.eligible_voter_count or 0,
                        issued_credential_count=issued_count,
                    )

                # Ensure registration window has ended
                if now < config.registration_ends_at:
                    raise AppError(
                        409,
                        ApiCode.REGISTRATION_NOT_OPEN,
                        "Registration window has not closed yet; cannot freeze roster",
                    )

                # Ensure no registrations are pending or need review
                pending_count = session.execute(
                    select(func.count(ElectionRegistration.id)).where(
                        ElectionRegistration.poll_id == election_id,
                        ElectionRegistration.status.in_([
                            RegistrationStatus.PENDING.value,
                            RegistrationStatus.NEEDS_REVIEW.value,
                        ]),
                    )
                ).scalar_one()

                if pending_count > 0:
                    raise AppError(
                        409,
                        ApiCode.PENDING_REVIEWS_EXIST,
                        ApiCode.PENDING_REVIEWS_EXIST.default_message,
                    )

                # Query all approved registrations
                approved_regs = (
                    session.execute(
                        select(ElectionRegistration).where(
                            ElectionRegistration.poll_id == election_id,
                            ElectionRegistration.status == RegistrationStatus.APPROVED.value,
                        )
                    )
                    .scalars()
                    .all()
                )

                eligible_count = len(approved_regs)
                config.roster_frozen_at = now
                config.eligible_voter_count = eligible_count
                config.updated_at = now

                # Batch issue single-use credentials
                for reg in approved_regs:
                    cred = ElectionVoterCredential(
                        id=uuid4(),
                        poll_id=election_id,
                        registration_id=reg.id,
                        status=CredentialStatus.ISSUED.value,
                        issued_at=now,
                        consumed_at=None,
                    )
                    session.add(cred)

                self._audit.record(
                    session=session,
                    actor_id=admin_id,
                    action=AuditAction.FREEZE_ROSTER,
                    poll_id=election_id,
                    receipt_id=None,
                    request_id=_request_id(),
                    created_at=now,
                )

                session.commit()

                return RosterFreezeResponse(
                    poll_id=election_id,
                    roster_frozen_at=now,
                    eligible_voter_count=eligible_count,
                    issued_credential_count=eligible_count,
                )
            except Exception:
                session.rollback()
                raise

