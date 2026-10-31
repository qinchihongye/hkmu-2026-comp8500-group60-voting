"""Response schemas for election domain."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.main.python.constants.enums import DocumentType, ElectionPhase, RegistrationStatus


class CandidatePublic(BaseModel):
    """Candidate details visible to voters and administrators."""

    model_config = ConfigDict(extra="forbid")

    option_id: int
    candidate_code: str
    name: str
    statement: str | None
    display_order: int


class ElectionSummary(BaseModel):
    """Public summary for election lists."""

    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    description: str
    lifecycle: str
    phase: ElectionPhase
    registration_starts_at: datetime
    registration_ends_at: datetime
    starts_at: datetime
    ends_at: datetime
    allow_live_results: bool
    candidate_count: int
    roster_frozen_at: datetime | None = None
    eligible_voter_count: int | None = None
    created_at: datetime


class ElectionDetail(BaseModel):
    """Full election details including candidates and personal status."""

    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    description: str
    lifecycle: str
    phase: ElectionPhase
    registration_starts_at: datetime
    registration_ends_at: datetime
    starts_at: datetime
    ends_at: datetime
    allow_live_results: bool
    candidates: list[CandidatePublic]
    roster_frozen_at: datetime | None = None
    eligible_voter_count: int | None = None
    version: int
    created_at: datetime
    updated_at: datetime | None = None

    # Contextual fields for current caller
    user_registration_status: RegistrationStatus | None = None
    has_voted: bool = False
    can_register: bool = False
    can_vote: bool = False
    can_view_results: bool = False
    next_action: str | None = None


class VoterRegistrationSummary(BaseModel):
    """Summary of voter registration for personal history."""

    model_config = ConfigDict(extra="forbid")

    id: int
    poll_id: int
    election_title: str
    legal_name_snapshot: str
    document_type: DocumentType
    document_suffix: str
    issuer: str
    status: RegistrationStatus
    model_score: int | None = None
    model_reason_codes: list[str] | None = None
    submitted_at: datetime
    reviewed_at: datetime | None = None


class AdminRegistrationItem(BaseModel):
    """Admin view of a single voter registration row."""

    model_config = ConfigDict(extra="forbid")

    id: int
    poll_id: int
    user_id: int
    username: str
    legal_name_snapshot: str
    document_type: DocumentType
    document_suffix: str
    issuer: str
    status: RegistrationStatus
    model_score: int | None = None
    model_reason_codes: list[str] | None = None
    model_version: str | None = None
    reviewed_by: int | None = None
    reviewed_by_username: str | None = None
    reviewed_at: datetime | None = None
    submitted_at: datetime
    updated_at: datetime


class BallotReceiptResponse(BaseModel):
    """Secret ballot submission receipt."""

    model_config = ConfigDict(extra="forbid")

    receipt_id: UUID
    poll_id: int
    submitted_at: datetime


class CandidateResultItem(BaseModel):
    """Result for a candidate in an election."""

    model_config = ConfigDict(extra="forbid")

    candidate_option_id: int
    candidate_code: str
    name: str
    vote_count: int
    percentage: float


class TurnoutScaleStats(BaseModel):
    """Scale metrics for participation."""

    model_config = ConfigDict(extra="forbid")

    registration_count: int
    approved_count: int
    ballot_count: int
    remaining_count: int | None = None
    abstention_count: int | None = None
    turnout_percentage: float | None = None


class RosterFreezeResponse(BaseModel):
    """Result of explicitly freezing an election voter roster."""

    model_config = ConfigDict(extra="forbid")

    poll_id: int
    roster_frozen_at: datetime
    eligible_voter_count: int
    issued_credential_count: int


class ElectionResultResponse(BaseModel):
    """Election results response conditioned on authorization matrix."""

    model_config = ConfigDict(extra="forbid")

    poll_id: int
    title: str
    phase: ElectionPhase
    allow_live_results: bool
    scale: TurnoutScaleStats
    candidate_results: list[CandidateResultItem] | None = None
    winner_option_ids: list[int] | None = None
    is_tie: bool = False

