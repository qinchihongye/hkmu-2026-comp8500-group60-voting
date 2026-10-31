"""Service handling secret ballot casting under B2 separation of identity and vote."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.constants.enums import (
    ActivityType,
    CredentialStatus,
    PollLifecycle,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollOption
from src.main.python.database.models.election import (
    ElectionBallot,
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
)
from src.main.python.fileds.response.election_response import BallotReceiptResponse
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError


class ElectionBallotService:
    """Submits secret election ballots with strict identity-ballot separation."""

    def __init__(self, session_factory: sessionmaker[Session], clock: Clock) -> None:
        self._factory = session_factory
        self._clock = clock

    def cast_ballot(
        self,
        poll_id: int,
        user_id: int,
        candidate_option_id: int,
    ) -> BallotReceiptResponse:
        """Atomically consume one voter credential and insert one anonymous ballot.

        Guarantees:
        - Strict B2 isolation: Ballot has no link to voter identity, registration, or credential.
        - Idempotency & Concurrency: Row-level lock on the credential prevents double-voting.
        - Eligibility: Only approved voters with an ISSUED credential can cast a vote.
        - Timing: Voting must be active, published, and roster frozen.
        """
        now = self._clock.now()

        with self._factory() as session:
            try:
                # 1. Lock and check election poll
                poll = session.execute(
                    select(Poll)
                    .where(
                        Poll.id == poll_id,
                        Poll.activity_type == ActivityType.ELECTION.value,
                    )
                    .with_for_update()
                ).scalar_one_or_none()

                if poll is None:
                    raise AppError(
                        404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message
                    )

                if poll.lifecycle == PollLifecycle.DRAFT.value:
                    err_code = getattr(ApiCode, "POLL_NOT_ACTIVE", ApiCode.ELECTION_NOT_OPEN)
                    raise AppError(409, err_code, "Election has not been published")

                if poll.lifecycle == PollLifecycle.CLOSED.value:
                    raise AppError(
                        409, ApiCode.ELECTION_NOT_OPEN, "Election has already closed"
                    )

                if now < poll.starts_at:
                    raise AppError(
                        409, ApiCode.ELECTION_NOT_OPEN, "Voting has not started yet"
                    )

                if now >= poll.ends_at:
                    raise AppError(
                        409, ApiCode.ELECTION_NOT_OPEN, "Voting period has ended"
                    )

                # 2. Check roster freeze
                config = session.execute(
                    select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)
                ).scalar_one_or_none()
                if config is None or config.roster_frozen_at is None:
                    raise AppError(
                        409, ApiCode.ROSTER_NOT_FROZEN, ApiCode.ROSTER_NOT_FROZEN.default_message
                    )

                # 3. Find and lock the voter's single-use credential
                cred = session.execute(
                    select(ElectionVoterCredential)
                    .join(
                        ElectionRegistration,
                        (ElectionRegistration.poll_id == ElectionVoterCredential.poll_id)
                        & (ElectionRegistration.id == ElectionVoterCredential.registration_id),
                    )
                    .where(
                        ElectionVoterCredential.poll_id == poll_id,
                        ElectionRegistration.user_id == user_id,
                    )
                    .with_for_update(of=ElectionVoterCredential)
                ).scalar_one_or_none()

                if cred is None:
                    raise AppError(
                        403,
                        ApiCode.NOT_ELIGIBLE,
                        ApiCode.NOT_ELIGIBLE.default_message,
                    )

                if cred.status == CredentialStatus.CONSUMED.value:
                    raise AppError(
                        409,
                        ApiCode.ELECTION_ALREADY_VOTED,
                        ApiCode.ELECTION_ALREADY_VOTED.default_message,
                    )

                if cred.status != CredentialStatus.ISSUED.value:
                    raise AppError(
                        403,
                        ApiCode.NOT_ELIGIBLE,
                        "Voting credential is not in an active issued state",
                    )

                # 4. Validate candidate option belongs to this poll
                option = session.execute(
                    select(PollOption).where(
                        PollOption.poll_id == poll_id,
                        PollOption.id == candidate_option_id,
                    )
                ).scalar_one_or_none()

                if option is None:
                    raise AppError(
                        422,
                        ApiCode.INVALID_CANDIDATE,
                        ApiCode.INVALID_CANDIDATE.default_message,
                    )

                # 5. Atomically transition credential to CONSUMED
                cred.status = CredentialStatus.CONSUMED.value
                cred.consumed_at = now

                # 6. Insert completely detached anonymous ballot (B2 isolation)
                receipt_id = uuid4()
                ballot = ElectionBallot(
                    receipt_id=receipt_id,
                    poll_id=poll_id,
                    candidate_option_id=candidate_option_id,
                    submitted_at=now,
                )
                session.add(ballot)
                session.commit()

                return BallotReceiptResponse(
                    receipt_id=receipt_id,
                    poll_id=poll_id,
                    submitted_at=now,
                )
            except Exception:
                session.rollback()
                raise
