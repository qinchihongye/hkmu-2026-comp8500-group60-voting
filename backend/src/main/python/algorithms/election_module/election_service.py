"""Election domain service managing drafts, lifecycle, candidates, and queries."""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.audit_module.audit_service import AuditService
from src.main.python.config.logger_config import request_id_var
from src.main.python.constants.enums import (
    ActivityType,
    AuditAction,
    CredentialStatus,
    ElectionPhase,
    IdentityMode,
    PollLifecycle,
    RegistrationStatus,
    SelectionMode,
    Visibility,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollOption
from src.main.python.database.models.election import (
    ElectionCandidate,
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
)
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.election_request import (
    CandidateInput,
    CreateElectionRequest,
    UpdateElectionRequest,
)
from src.main.python.fileds.response.election_response import (
    CandidatePublic,
    ElectionDetail,
    ElectionSummary,
)
from src.main.python.fileds.response.response import Page
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError


def _request_id() -> str:
    val = request_id_var.get().strip()
    return val[:64] if val else "missing"


def compute_election_phase(poll: Poll, config: ElectionConfig, now: datetime) -> ElectionPhase:
    """Compute current effective election phase."""
    if poll.lifecycle == PollLifecycle.DRAFT:
        return ElectionPhase.DRAFT
    if poll.lifecycle == PollLifecycle.CLOSED or now >= poll.ends_at:
        return ElectionPhase.CLOSED
    if now < config.registration_starts_at:
        return ElectionPhase.REGISTRATION_SCHEDULED
    if now < config.registration_ends_at:
        return ElectionPhase.REGISTRATION_OPEN
    if config.roster_frozen_at is None:
        return ElectionPhase.REVIEWING
    if now < poll.starts_at:
        return ElectionPhase.VOTING_SCHEDULED
    return ElectionPhase.VOTING_OPEN


class ElectionService:
    """Service handling election administrative operations and lifecycle."""

    def __init__(self, session_factory: sessionmaker[Session], clock: Clock) -> None:
        self._factory = session_factory
        self._clock = clock
        self._audit = AuditService()

    def create_election(
        self, principal: Principal, request: CreateElectionRequest
    ) -> ElectionDetail:
        """Create a new draft election with candidates and election configuration."""
        now = self._clock.now()
        with self._factory() as session:
            try:
                poll = Poll(
                    activity_type=ActivityType.ELECTION.value,
                    title=request.title,
                    description=request.description,
                    identity_mode=IdentityMode.NAMED.value,
                    visibility=Visibility.PUBLIC.value,
                    selection_mode=SelectionMode.SINGLE.value,
                    vote_limit=None,
                    allow_live_results=request.allow_live_results,
                    lifecycle=PollLifecycle.DRAFT,
                    starts_at=request.starts_at,
                    ends_at=request.ends_at,
                    creator_id=principal.user_id,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
                session.add(poll)
                session.flush()

                config = ElectionConfig(
                    poll_id=poll.id,
                    registration_starts_at=request.registration_starts_at,
                    registration_ends_at=request.registration_ends_at,
                    roster_frozen_at=None,
                    eligible_voter_count=None,
                    created_at=now,
                    updated_at=now,
                )
                session.add(config)
                session.flush()

                self._insert_candidates(session, poll.id, request.candidates)

                self._audit.record(
                    session=session,
                    actor_id=principal.user_id,
                    action=AuditAction.CREATE,
                    poll_id=poll.id,
                    receipt_id=None,
                    request_id=_request_id(),
                    created_at=now,
                )
                session.commit()
                return self._load_election_detail(session, poll.id, now)
            except Exception:
                session.rollback()
                raise

    def update_election(
        self,
        election_id: int,
        principal: Principal,
        request: UpdateElectionRequest,
    ) -> ElectionDetail:
        """Update draft election details and candidates with optimistic locking."""
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

                if poll is None:
                    raise AppError(
                        404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                    )

                if poll.lifecycle != PollLifecycle.DRAFT:
                    raise AppError(
                        409, ApiCode.POLL_IMMUTABLE, ApiCode.POLL_IMMUTABLE.default_message
                    )

                if poll.version != request.version:
                    raise AppError(
                        409, ApiCode.STALE_POLL_VERSION, ApiCode.STALE_POLL_VERSION.default_message
                    )

                config = session.execute(
                    select(ElectionConfig)
                    .where(ElectionConfig.poll_id == election_id)
                    .with_for_update()
                ).scalar_one()

                reg_starts = request.registration_starts_at or config.registration_starts_at
                reg_ends = request.registration_ends_at or config.registration_ends_at
                vote_starts = request.starts_at or poll.starts_at
                vote_ends = request.ends_at or poll.ends_at

                if not (reg_starts < reg_ends < vote_starts < vote_ends):
                    raise AppError(
                        422,
                        ApiCode.VALIDATION_ERROR,
                        "Time windows must satisfy: "
                        "registration_starts_at < registration_ends_at < starts_at < ends_at",
                    )

                if request.title is not None:
                    poll.title = request.title
                if request.description is not None:
                    poll.description = request.description
                if request.allow_live_results is not None:
                    poll.allow_live_results = request.allow_live_results
                poll.starts_at = vote_starts
                poll.ends_at = vote_ends
                poll.version += 1
                poll.updated_at = now

                config.registration_starts_at = reg_starts
                config.registration_ends_at = reg_ends
                config.updated_at = now

                if request.candidates is not None:
                    session.execute(
                        delete(ElectionCandidate).where(ElectionCandidate.poll_id == election_id)
                    )
                    session.execute(delete(PollOption).where(PollOption.poll_id == election_id))
                    session.flush()
                    self._insert_candidates(session, election_id, request.candidates)

                self._audit.record(
                    session=session,
                    actor_id=principal.user_id,
                    action=AuditAction.UPDATE,
                    poll_id=poll.id,
                    receipt_id=None,
                    request_id=_request_id(),
                    created_at=now,
                )
                session.commit()
                return self._load_election_detail(session, poll.id, now)
            except Exception:
                session.rollback()
                raise

    def publish_election(self, election_id: int, principal: Principal) -> ElectionDetail:
        """Publish a draft election."""
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

                if poll is None:
                    raise AppError(
                        404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                    )

                if poll.lifecycle != PollLifecycle.DRAFT:
                    raise AppError(
                        409, ApiCode.POLL_IMMUTABLE, ApiCode.POLL_IMMUTABLE.default_message
                    )

                config = session.execute(
                    select(ElectionConfig)
                    .where(ElectionConfig.poll_id == election_id)
                    .with_for_update()
                ).scalar_one()

                if not (
                    config.registration_starts_at
                    < config.registration_ends_at
                    < poll.starts_at
                    < poll.ends_at
                ):
                    raise AppError(
                        422,
                        ApiCode.VALIDATION_ERROR,
                        "Time windows must satisfy: "
                        "registration_starts_at < registration_ends_at < starts_at < ends_at",
                    )

                cand_count = session.execute(
                    select(func.count(ElectionCandidate.poll_option_id)).where(
                        ElectionCandidate.poll_id == election_id
                    )
                ).scalar_one()
                if cand_count < 2:
                    raise AppError(
                        422, ApiCode.VALIDATION_ERROR, "An election must have at least 2 candidates"
                    )

                poll.lifecycle = PollLifecycle.PUBLISHED
                poll.updated_at = now

                self._audit.record(
                    session=session,
                    actor_id=principal.user_id,
                    action=AuditAction.PUBLISH,
                    poll_id=poll.id,
                    receipt_id=None,
                    request_id=_request_id(),
                    created_at=now,
                )
                session.commit()
                return self._load_election_detail(session, poll.id, now)
            except Exception:
                session.rollback()
                raise

    def close_election(self, election_id: int, principal: Principal) -> ElectionDetail:
        """Admin early close of an election.

        Only permitted after roster is frozen and voting has started.
        """
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

                if poll is None:
                    raise AppError(
                        404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                    )

                if poll.lifecycle == PollLifecycle.CLOSED:
                    return self._load_election_detail(session, poll.id, now)

                if poll.lifecycle != PollLifecycle.PUBLISHED:
                    raise AppError(403, ApiCode.FORBIDDEN, "Only published elections can be closed")

                config = session.execute(
                    select(ElectionConfig)
                    .where(ElectionConfig.poll_id == election_id)
                    .with_for_update()
                ).scalar_one()

                if config.roster_frozen_at is None:
                    raise AppError(
                        409,
                        ApiCode.ROSTER_NOT_FROZEN,
                        ApiCode.ROSTER_NOT_FROZEN.default_message,
                    )

                if now < poll.starts_at:
                    raise AppError(
                        409,
                        ApiCode.ELECTION_NOT_OPEN,
                        "Cannot close an election before voting starts",
                    )

                poll.lifecycle = PollLifecycle.CLOSED
                poll.closed_at = now
                poll.updated_at = now

                self._audit.record(
                    session=session,
                    actor_id=principal.user_id,
                    action=AuditAction.CLOSE,
                    poll_id=poll.id,
                    receipt_id=None,
                    request_id=_request_id(),
                    created_at=now,
                )
                session.commit()
                return self._load_election_detail(session, poll.id, now)
            except Exception:
                session.rollback()
                raise

    def get_admin_election(self, election_id: int) -> ElectionDetail:
        """Fetch election details for administrator view."""
        now = self._clock.now()
        with self._factory() as session:
            return self._load_election_detail(session, election_id, now)

    def list_admin_elections(self, page: int = 1, page_size: int = 20) -> Page[ElectionSummary]:
        """List all elections for administrators ordered by created_at desc."""
        now = self._clock.now()
        with self._factory() as session:
            total = session.execute(
                select(func.count(Poll.id)).where(Poll.activity_type == ActivityType.ELECTION.value)
            ).scalar_one()

            offset = (page - 1) * page_size
            rows = session.execute(
                select(Poll, ElectionConfig)
                .join(ElectionConfig, ElectionConfig.poll_id == Poll.id)
                .where(Poll.activity_type == ActivityType.ELECTION.value)
                .order_by(Poll.created_at.desc(), Poll.id.desc())
                .limit(page_size)
                .offset(offset)
            ).all()

            results: list[ElectionSummary] = []
            for poll, config in rows:
                c_count = session.execute(
                    select(func.count(ElectionCandidate.poll_option_id)).where(
                        ElectionCandidate.poll_id == poll.id
                    )
                ).scalar_one()
                results.append(
                    ElectionSummary(
                        id=poll.id,
                        title=poll.title,
                        description=poll.description,
                        lifecycle=poll.lifecycle,
                        phase=compute_election_phase(poll, config, now),
                        registration_starts_at=config.registration_starts_at,
                        registration_ends_at=config.registration_ends_at,
                        starts_at=poll.starts_at,
                        ends_at=poll.ends_at,
                        allow_live_results=poll.allow_live_results,
                        candidate_count=c_count,
                        roster_frozen_at=config.roster_frozen_at,
                        eligible_voter_count=config.eligible_voter_count,
                        created_at=poll.created_at,
                    )
                )
            return Page(items=results, page=page, page_size=page_size, total=total)

    def get_public_election(self, election_id: int, user_id: int | None = None) -> ElectionDetail:
        """Fetch election details for public / voter view."""
        now = self._clock.now()
        with self._factory() as session:
            poll = session.execute(
                select(Poll).where(
                    Poll.id == election_id,
                    Poll.activity_type == ActivityType.ELECTION.value,
                )
            ).scalar_one_or_none()

            if poll is None or poll.lifecycle == PollLifecycle.DRAFT:
                raise AppError(
                    404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                )

            detail = self._load_election_detail(session, election_id, now)
            self._populate_voter_context(detail, user_id, session)
            return detail

    def list_public_elections(self, page: int = 1, page_size: int = 20) -> Page[ElectionSummary]:
        """List published / closed elections for public."""
        now = self._clock.now()
        with self._factory() as session:
            total = session.execute(
                select(func.count(Poll.id)).where(
                    Poll.activity_type == ActivityType.ELECTION.value,
                    Poll.lifecycle.in_([PollLifecycle.PUBLISHED, PollLifecycle.CLOSED]),
                )
            ).scalar_one()

            offset = (page - 1) * page_size
            rows = session.execute(
                select(Poll, ElectionConfig)
                .join(ElectionConfig, ElectionConfig.poll_id == Poll.id)
                .where(
                    Poll.activity_type == ActivityType.ELECTION.value,
                    Poll.lifecycle.in_([PollLifecycle.PUBLISHED, PollLifecycle.CLOSED]),
                )
                .order_by(Poll.starts_at.desc(), Poll.id.desc())
                .limit(page_size)
                .offset(offset)
            ).all()

            results: list[ElectionSummary] = []
            for poll, config in rows:
                c_count = session.execute(
                    select(func.count(ElectionCandidate.poll_option_id)).where(
                        ElectionCandidate.poll_id == poll.id
                    )
                ).scalar_one()
                results.append(
                    ElectionSummary(
                        id=poll.id,
                        title=poll.title,
                        description=poll.description,
                        lifecycle=poll.lifecycle,
                        phase=compute_election_phase(poll, config, now),
                        registration_starts_at=config.registration_starts_at,
                        registration_ends_at=config.registration_ends_at,
                        starts_at=poll.starts_at,
                        ends_at=poll.ends_at,
                        allow_live_results=poll.allow_live_results,
                        candidate_count=c_count,
                        roster_frozen_at=config.roster_frozen_at,
                        eligible_voter_count=config.eligible_voter_count,
                        created_at=poll.created_at,
                    )
                )
            return Page(items=results, page=page, page_size=page_size, total=total)

    def _insert_candidates(
        self, session: Session, poll_id: int, candidates: Sequence[CandidateInput]
    ) -> None:
        for idx, cand in enumerate(candidates):
            option = PollOption(
                poll_id=poll_id,
                label=cand.name,
                position=idx,
            )
            session.add(option)
            session.flush()

            ec = ElectionCandidate(
                poll_option_id=option.id,
                poll_id=poll_id,
                candidate_code=cand.candidate_code,
                statement=cand.statement,
            )
            session.add(ec)
        session.flush()

    def _load_election_detail(
        self, session: Session, election_id: int, now: datetime
    ) -> ElectionDetail:
        poll = session.execute(
            select(Poll).where(
                Poll.id == election_id,
                Poll.activity_type == ActivityType.ELECTION.value,
            )
        ).scalar_one_or_none()

        if poll is None:
            raise AppError(
                404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
            )

        config = session.execute(
            select(ElectionConfig).where(ElectionConfig.poll_id == election_id)
        ).scalar_one()

        cand_rows = session.execute(
            select(PollOption, ElectionCandidate)
            .join(
                ElectionCandidate,
                (ElectionCandidate.poll_id == PollOption.poll_id)
                & (ElectionCandidate.poll_option_id == PollOption.id),
            )
            .where(PollOption.poll_id == election_id)
            .order_by(PollOption.position.asc(), PollOption.id.asc())
        ).all()

        candidates = [
            CandidatePublic(
                option_id=opt.id,
                candidate_code=cand.candidate_code,
                name=opt.label,
                statement=cand.statement,
                display_order=opt.position,
            )
            for opt, cand in cand_rows
        ]

        phase = compute_election_phase(poll, config, now)

        return ElectionDetail(
            id=poll.id,
            title=poll.title,
            description=poll.description,
            lifecycle=poll.lifecycle,
            phase=phase,
            registration_starts_at=config.registration_starts_at,
            registration_ends_at=config.registration_ends_at,
            starts_at=poll.starts_at,
            ends_at=poll.ends_at,
            allow_live_results=poll.allow_live_results,
            candidates=candidates,
            roster_frozen_at=config.roster_frozen_at,
            eligible_voter_count=config.eligible_voter_count,
            version=poll.version,
            created_at=poll.created_at,
            updated_at=poll.updated_at,
        )

    def _populate_voter_context(
        self, detail: ElectionDetail, user_id: int | None, session: Session
    ) -> None:
        if user_id is None:
            detail.can_register = False
            detail.can_vote = False
            detail.can_view_results = detail.phase == ElectionPhase.CLOSED
            if detail.phase == ElectionPhase.REGISTRATION_OPEN:
                detail.next_action = "LOGIN_TO_REGISTER"
            elif detail.phase == ElectionPhase.CLOSED:
                detail.next_action = "VIEW_RESULTS"
            return

        reg = session.execute(
            select(ElectionRegistration).where(
                ElectionRegistration.poll_id == detail.id,
                ElectionRegistration.user_id == user_id,
            )
        ).scalar_one_or_none()

        if reg is not None:
            detail.user_registration_status = RegistrationStatus(reg.status)
            if reg.status == RegistrationStatus.APPROVED.value:
                cred = session.execute(
                    select(ElectionVoterCredential).where(
                        ElectionVoterCredential.poll_id == detail.id,
                        ElectionVoterCredential.registration_id == reg.id,
                    )
                ).scalar_one_or_none()
                if cred and cred.status == CredentialStatus.CONSUMED.value:
                    detail.has_voted = True

        detail.can_register = (
            detail.phase == ElectionPhase.REGISTRATION_OPEN
            and detail.user_registration_status is None
        )

        detail.can_vote = (
            detail.phase == ElectionPhase.VOTING_OPEN
            and detail.user_registration_status == RegistrationStatus.APPROVED
            and not detail.has_voted
        )

        if detail.phase == ElectionPhase.CLOSED:
            detail.can_view_results = True
        elif detail.phase in (
            ElectionPhase.VOTING_OPEN,
            ElectionPhase.VOTING_SCHEDULED,
            ElectionPhase.REVIEWING,
        ):
            detail.can_view_results = detail.allow_live_results and detail.has_voted
        else:
            detail.can_view_results = False

        if detail.phase == ElectionPhase.DRAFT:
            detail.next_action = "WAIT_FOR_PUBLISH"
        elif detail.phase == ElectionPhase.REGISTRATION_SCHEDULED:
            detail.next_action = "WAIT_FOR_REGISTRATION"
        elif detail.phase == ElectionPhase.REGISTRATION_OPEN:
            if detail.user_registration_status is None:
                detail.next_action = "REGISTER"
            elif detail.user_registration_status == RegistrationStatus.PENDING:
                detail.next_action = "WAIT_FOR_REVIEW"
            elif detail.user_registration_status == RegistrationStatus.NEEDS_REVIEW:
                detail.next_action = "WAIT_FOR_ADMIN_REVIEW"
            elif detail.user_registration_status == RegistrationStatus.APPROVED:
                detail.next_action = "WAIT_FOR_ROSTER_FREEZE"
            else:
                detail.next_action = "REGISTRATION_REJECTED"
        elif detail.phase == ElectionPhase.REVIEWING:
            if detail.user_registration_status == RegistrationStatus.APPROVED:
                detail.next_action = "WAIT_FOR_ROSTER_FREEZE"
            elif detail.user_registration_status == RegistrationStatus.NEEDS_REVIEW:
                detail.next_action = "WAIT_FOR_ADMIN_REVIEW"
            else:
                detail.next_action = "WAIT_FOR_VOTING"
        elif detail.phase == ElectionPhase.VOTING_SCHEDULED:
            detail.next_action = "WAIT_FOR_VOTING_START"
        elif detail.phase == ElectionPhase.VOTING_OPEN:
            if detail.can_vote:
                detail.next_action = "VOTE"
            elif detail.has_voted:
                detail.next_action = (
                    "VIEW_RESULTS" if detail.can_view_results else "VOTED_WAIT_FOR_RESULTS"
                )
            else:
                detail.next_action = "NOT_ELIGIBLE"
        elif detail.phase == ElectionPhase.CLOSED:
            detail.next_action = "VIEW_RESULTS"
