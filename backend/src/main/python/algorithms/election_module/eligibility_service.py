"""Voter identity registration, deterministic mock model evaluation, and admin review service."""

import hashlib
import hmac

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased, sessionmaker

from src.main.python.algorithms.election_module.mock_eligibility_model import evaluate_eligibility
from src.main.python.config.logger_config import request_id_var
from src.main.python.constants.enums import (
    ActivityType,
    DocumentType,
    PollLifecycle,
    RegistrationStatus,
    ReviewActorType,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, User
from src.main.python.database.models.election import (
    ElectionConfig,
    ElectionRegistration,
    EligibilityReviewEvent,
    VoterIdentity,
)
from src.main.python.fileds.request.election_request import (
    RegisterVoterRequest,
    ReviewRegistrationRequest,
)
from src.main.python.fileds.response.election_response import (
    AdminRegistrationItem,
    VoterRegistrationSummary,
)
from src.main.python.fileds.response.response import Page
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError


def _request_id() -> str:
    val = request_id_var.get().strip()
    return val[:64] if val else "missing"


def compute_fingerprint(hmac_key: bytes, doc_type: str, issuer: str, doc_number: str) -> str:
    """Calculate deterministic HMAC-SHA-256 fingerprint for identity deduplication."""
    payload = f"{doc_type}:{issuer}:{doc_number}".encode()
    return hmac.new(hmac_key, payload, hashlib.sha256).hexdigest()


def compute_suffix(doc_number: str) -> str:
    """Extract masked suffix for UI display (at most 8 chars)."""
    return doc_number[-4:] if len(doc_number) >= 4 else doc_number


class EligibilityService:
    """Domain service for voter registration and manual eligibility review."""

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        clock: Clock,
        hmac_key: str,
    ) -> None:
        self._factory = session_factory
        self._clock = clock
        self._hmac_key = hmac_key.encode("utf-8")

    def register_voter(
        self,
        poll_id: int,
        user_id: int,
        request: RegisterVoterRequest,
    ) -> VoterRegistrationSummary:
        """Register voter identity snapshot and trigger mock evaluation."""
        now = self._clock.now()
        with self._factory() as session:
            try:
                poll = session.execute(
                    select(Poll).where(
                        Poll.id == poll_id,
                        Poll.activity_type == ActivityType.ELECTION.value,
                    )
                ).scalar_one_or_none()

                if poll is None or poll.lifecycle != PollLifecycle.PUBLISHED:
                    raise AppError(
                        404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                    )

                config = session.execute(
                    select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)
                ).scalar_one()

                if not (config.registration_starts_at <= now < config.registration_ends_at):
                    raise AppError(
                        409,
                        ApiCode.REGISTRATION_NOT_OPEN,
                        ApiCode.REGISTRATION_NOT_OPEN.default_message,
                    )

                if config.roster_frozen_at is not None:
                    raise AppError(
                        409,
                        ApiCode.ROSTER_ALREADY_FROZEN,
                        ApiCode.ROSTER_ALREADY_FROZEN.default_message,
                    )

                # Check duplicate registration by user
                existing_reg = session.execute(
                    select(ElectionRegistration).where(
                        ElectionRegistration.poll_id == poll_id,
                        ElectionRegistration.user_id == user_id,
                    )
                ).scalar_one_or_none()

                if existing_reg is not None:
                    raise AppError(
                        409, ApiCode.ALREADY_REGISTERED, ApiCode.ALREADY_REGISTERED.default_message
                    )

                user = session.execute(select(User).where(User.id == user_id)).scalar_one()
                user_active = user.role != "DISABLED"

                # Run deterministic mock eligibility evaluation
                eval_res = evaluate_eligibility(
                    request.document_type,
                    request.issuer,
                    request.document_number,
                    user_active=user_active,
                )

                fingerprint = compute_fingerprint(
                    self._hmac_key,
                    request.document_type.value,
                    eval_res.normalized_issuer,
                    eval_res.normalized_document,
                )
                suffix = compute_suffix(eval_res.normalized_document)

                # Check voter_identities for deduplication
                existing_ident = session.execute(
                    select(VoterIdentity).where(
                        VoterIdentity.document_type == request.document_type.value,
                        VoterIdentity.issuer == eval_res.normalized_issuer,
                        VoterIdentity.document_fingerprint == fingerprint,
                    )
                ).scalar_one_or_none()

                if existing_ident is not None:
                    if existing_ident.user_id != user_id:
                        raise AppError(
                            409,
                            ApiCode.IDENTITY_DOCUMENT_DUPLICATE,
                            ApiCode.IDENTITY_DOCUMENT_DUPLICATE.default_message,
                        )
                    identity_id = existing_ident.id
                else:
                    max_ver = session.execute(
                        select(func.coalesce(func.max(VoterIdentity.version), 0)).where(
                            VoterIdentity.user_id == user_id
                        )
                    ).scalar_one()

                    new_ident = VoterIdentity(
                        user_id=user_id,
                        version=max_ver + 1,
                        document_type=request.document_type.value,
                        issuer=eval_res.normalized_issuer,
                        document_fingerprint=fingerprint,
                        document_suffix=suffix,
                        fingerprint_key_version=1,
                        created_at=now,
                        updated_at=now,
                    )
                    session.add(new_ident)
                    session.flush()
                    identity_id = new_ident.id

                reg = ElectionRegistration(
                    poll_id=poll_id,
                    user_id=user_id,
                    identity_id=identity_id,
                    legal_name_snapshot=request.legal_name,
                    status=eval_res.decision.value,
                    model_score=eval_res.score,
                    model_reason_codes=eval_res.reason_codes,
                    model_version=eval_res.model_version,
                    submitted_at=now,
                    updated_at=now,
                )
                session.add(reg)
                session.flush()

                event = EligibilityReviewEvent(
                    registration_id=reg.id,
                    actor_type=ReviewActorType.MODEL.value,
                    actor_id=None,
                    from_status=None,
                    to_status=eval_res.decision.value,
                    score=eval_res.score,
                    reason_codes=eval_res.reason_codes,
                    model_version=eval_res.model_version,
                    review_note="Automated mock eligibility evaluation",
                    request_id=_request_id(),
                    created_at=now,
                )
                session.add(event)
                session.commit()

                return VoterRegistrationSummary(
                    id=reg.id,
                    poll_id=poll.id,
                    election_title=poll.title,
                    legal_name_snapshot=reg.legal_name_snapshot,
                    document_type=DocumentType(request.document_type.value),
                    document_suffix=suffix,
                    issuer=eval_res.normalized_issuer,
                    status=RegistrationStatus(reg.status),
                    model_score=reg.model_score,
                    model_reason_codes=reg.model_reason_codes,
                    submitted_at=reg.submitted_at,
                    reviewed_at=reg.reviewed_at,
                )
            except Exception:
                session.rollback()
                raise

    def list_user_registrations(
        self,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> Page[VoterRegistrationSummary]:
        """Fetch all election registration history for the logged-in user."""
        with self._factory() as session:
            count_query = select(func.count(ElectionRegistration.id)).where(
                ElectionRegistration.user_id == user_id
            )
            total = session.execute(count_query).scalar_one()

            offset = (page - 1) * page_size
            rows = session.execute(
                select(ElectionRegistration, Poll, VoterIdentity)
                .join(Poll, Poll.id == ElectionRegistration.poll_id)
                .join(VoterIdentity, VoterIdentity.id == ElectionRegistration.identity_id)
                .where(ElectionRegistration.user_id == user_id)
                .order_by(ElectionRegistration.submitted_at.desc())
                .limit(page_size)
                .offset(offset)
            ).all()

            results: list[VoterRegistrationSummary] = []
            for reg, poll, ident in rows:
                results.append(
                    VoterRegistrationSummary(
                        id=reg.id,
                        poll_id=poll.id,
                        election_title=poll.title,
                        legal_name_snapshot=reg.legal_name_snapshot,
                        document_type=DocumentType(ident.document_type),
                        document_suffix=ident.document_suffix,
                        issuer=ident.issuer,
                        status=RegistrationStatus(reg.status),
                        model_score=reg.model_score,
                        model_reason_codes=reg.model_reason_codes,
                        submitted_at=reg.submitted_at,
                        reviewed_at=reg.reviewed_at,
                    )
                )
            return Page(items=results, page=page, page_size=page_size, total=total)

    def list_admin_registrations(
        self,
        poll_id: int,
        status: RegistrationStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Page[AdminRegistrationItem]:
        """Fetch paginated registrations for admin review with optional status filtering."""
        with self._factory() as session:
            reviewer = aliased(User)
            base_query = (
                select(
                    ElectionRegistration,
                    User.username,
                    VoterIdentity.document_type,
                    VoterIdentity.document_suffix,
                    VoterIdentity.issuer,
                    reviewer.username.label("reviewer_username"),
                )
                .join(User, User.id == ElectionRegistration.user_id)
                .join(VoterIdentity, VoterIdentity.id == ElectionRegistration.identity_id)
                .outerjoin(reviewer, reviewer.id == ElectionRegistration.reviewed_by)
                .where(ElectionRegistration.poll_id == poll_id)
            )

            if status is not None:
                base_query = base_query.where(ElectionRegistration.status == status.value)

            count_query = select(func.count()).select_from(base_query.subquery())
            total = session.execute(count_query).scalar_one()

            offset = (page - 1) * page_size
            rows = session.execute(
                base_query.order_by(
                    ElectionRegistration.submitted_at.desc(),
                    ElectionRegistration.id.desc(),
                )
                .limit(page_size)
                .offset(offset)
            ).all()

            items: list[AdminRegistrationItem] = []
            for reg, username, doc_type, suffix, issuer, rev_name in rows:
                items.append(
                    AdminRegistrationItem(
                        id=reg.id,
                        poll_id=reg.poll_id,
                        user_id=reg.user_id,
                        username=username,
                        legal_name_snapshot=reg.legal_name_snapshot,
                        document_type=DocumentType(doc_type),
                        document_suffix=suffix,
                        issuer=issuer,
                        status=RegistrationStatus(reg.status),
                        model_score=reg.model_score,
                        model_reason_codes=reg.model_reason_codes,
                        model_version=reg.model_version,
                        reviewed_by=reg.reviewed_by,
                        reviewed_by_username=rev_name,
                        reviewed_at=reg.reviewed_at,
                        submitted_at=reg.submitted_at,
                        updated_at=reg.updated_at,
                    )
                )
            return Page(items=items, page=page, page_size=page_size, total=total)

    def review_registration(
        self,
        poll_id: int,
        registration_id: int,
        admin_id: int,
        request: ReviewRegistrationRequest,
    ) -> AdminRegistrationItem:
        """Process manual review by administrator for NEEDS_REVIEW registrations."""
        now = self._clock.now()
        with self._factory() as session:
            try:
                config = session.execute(
                    select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)
                ).scalar_one_or_none()

                if config is None:
                    raise AppError(
                        404, ApiCode.ELECTION_NOT_FOUND, ApiCode.ELECTION_NOT_FOUND.default_message
                    )

                if config.roster_frozen_at is not None:
                    raise AppError(
                        409,
                        ApiCode.ROSTER_ALREADY_FROZEN,
                        ApiCode.ROSTER_ALREADY_FROZEN.default_message,
                    )

                reg = session.execute(
                    select(ElectionRegistration)
                    .where(
                        ElectionRegistration.poll_id == poll_id,
                        ElectionRegistration.id == registration_id,
                    )
                    .with_for_update()
                ).scalar_one_or_none()

                if reg is None:
                    raise AppError(404, ApiCode.NOT_FOUND, ApiCode.NOT_FOUND.default_message)

                if reg.status != RegistrationStatus.NEEDS_REVIEW.value:
                    raise AppError(
                        409,
                        ApiCode.FORBIDDEN,
                        "Only registrations in NEEDS_REVIEW status can be manually reviewed",
                    )

                from_status = reg.status
                reg.status = request.decision.value
                reg.reviewed_by = admin_id
                reg.reviewed_at = now
                reg.updated_at = now

                event = EligibilityReviewEvent(
                    registration_id=reg.id,
                    actor_type=ReviewActorType.ADMIN.value,
                    actor_id=admin_id,
                    from_status=from_status,
                    to_status=request.decision.value,
                    score=None,
                    reason_codes=request.reason_codes,
                    model_version=None,
                    review_note=request.review_note,
                    request_id=_request_id(),
                    created_at=now,
                )
                session.add(event)
                session.commit()

                # Load updated view item
                reviewer_name = session.execute(
                    select(User.username).where(User.id == admin_id)
                ).scalar_one()
                user = session.execute(select(User).where(User.id == reg.user_id)).scalar_one()
                ident = session.execute(
                    select(VoterIdentity).where(VoterIdentity.id == reg.identity_id)
                ).scalar_one()

                return AdminRegistrationItem(
                    id=reg.id,
                    poll_id=reg.poll_id,
                    user_id=reg.user_id,
                    username=user.username,
                    legal_name_snapshot=reg.legal_name_snapshot,
                    document_type=DocumentType(ident.document_type),
                    document_suffix=ident.document_suffix,
                    issuer=ident.issuer,
                    status=RegistrationStatus(reg.status),
                    model_score=reg.model_score,
                    model_reason_codes=reg.model_reason_codes,
                    model_version=reg.model_version,
                    reviewed_by=admin_id,
                    reviewed_by_username=reviewer_name,
                    reviewed_at=reg.reviewed_at,
                    submitted_at=reg.submitted_at,
                    updated_at=reg.updated_at,
                )
            except Exception:
                session.rollback()
                raise
