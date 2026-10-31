"""Request schemas for election endpoints."""

from datetime import datetime

from pydantic import Field, StrictInt, field_validator, model_validator

from src.main.python.constants.enums import DocumentType, RegistrationStatus
from src.main.python.fileds.request.request import BaseRequestData


class CandidateInput(BaseRequestData):
    """Candidate details submitted by administrator."""

    candidate_code: str
    name: str
    statement: str | None = None

    @field_validator("candidate_code")
    @classmethod
    def clean_candidate_code(cls, value: str) -> str:
        stripped = value.strip()
        if not 1 <= len(stripped) <= 32:
            raise ValueError("Candidate code must be 1 to 32 characters")
        return stripped

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        stripped = value.strip()
        if not 1 <= len(stripped) <= 200:
            raise ValueError("Candidate name must be 1 to 200 characters")
        return stripped

    @field_validator("statement")
    @classmethod
    def clean_statement(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if len(stripped) > 500:
            raise ValueError("Statement cannot exceed 500 characters")
        return stripped if stripped else None


class CreateElectionRequest(BaseRequestData):
    """Request payload to create a new draft election."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    registration_starts_at: datetime
    registration_ends_at: datetime
    starts_at: datetime
    ends_at: datetime
    allow_live_results: bool
    candidates: list[CandidateInput] = Field(min_length=2)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        stripped = value.strip()
        if not 1 <= len(stripped) <= 200:
            raise ValueError("Title must be 1 to 200 characters")
        return stripped

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_election_constraints(self) -> "CreateElectionRequest":
        if not (
            self.registration_starts_at < self.registration_ends_at < self.starts_at < self.ends_at
        ):
            raise ValueError(
                "Time windows must satisfy: "
                "registration_starts_at < registration_ends_at < starts_at < ends_at"
            )
        codes = [c.candidate_code for c in self.candidates]
        if len(codes) != len(set(codes)):
            raise ValueError("Candidate codes must be unique within an election")
        return self


class UpdateElectionRequest(BaseRequestData):
    """Request payload to update an existing draft election."""

    version: StrictInt
    title: str | None = None
    description: str | None = None
    registration_starts_at: datetime | None = None
    registration_ends_at: datetime | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    allow_live_results: bool | None = None
    candidates: list[CandidateInput] | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not 1 <= len(stripped) <= 200:
            raise ValueError("Title must be 1 to 200 characters")
        return stripped

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @model_validator(mode="after")
    def validate_candidates_uniqueness(self) -> "UpdateElectionRequest":
        if self.candidates is not None:
            if len(self.candidates) < 2:
                raise ValueError("An election must have at least 2 candidates")
            codes = [c.candidate_code for c in self.candidates]
            if len(codes) != len(set(codes)):
                raise ValueError("Candidate codes must be unique within an election")
        return self


class RegisterVoterRequest(BaseRequestData):
    """Request payload for a voter to submit identity registration."""

    legal_name: str = Field(min_length=1, max_length=120)
    document_type: DocumentType
    issuer: str = Field(min_length=1, max_length=120)
    document_number: str = Field(min_length=1, max_length=100)

    @field_validator("legal_name")
    @classmethod
    def clean_legal_name(cls, value: str) -> str:
        stripped = value.strip()
        if not 1 <= len(stripped) <= 120:
            raise ValueError("Legal name must be 1 to 120 characters")
        return stripped

    @field_validator("issuer")
    @classmethod
    def clean_issuer(cls, value: str) -> str:
        stripped = value.strip()
        if not 1 <= len(stripped) <= 120:
            raise ValueError("Issuer must be 1 to 120 characters")
        return stripped

    @field_validator("document_number")
    @classmethod
    def clean_document_number(cls, value: str) -> str:
        stripped = value.strip()
        if not 1 <= len(stripped) <= 100:
            raise ValueError("Document number must be 1 to 100 characters")
        return stripped


class ReviewRegistrationRequest(BaseRequestData):
    """Request payload for an admin to review a registration."""

    decision: RegistrationStatus
    reason_codes: list[str] = Field(default_factory=list)
    review_note: str | None = Field(default=None, max_length=500)

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: RegistrationStatus) -> RegistrationStatus:
        if value not in {RegistrationStatus.APPROVED, RegistrationStatus.REJECTED}:
            raise ValueError("Review decision must be APPROVED or REJECTED")
        return value

    @field_validator("review_note")
    @classmethod
    def clean_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped if stripped else None


class SubmitElectionBallotRequest(BaseRequestData):
    """Request payload for a voter to cast a secret election ballot."""

    candidate_option_id: int
