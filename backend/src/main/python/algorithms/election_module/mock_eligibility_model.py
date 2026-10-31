"""Deterministic mock eligibility evaluation model for course demonstration.

IMPORTANT DISCLAIMER:
This module is a local format and checksum rule engine built strictly for
course demonstration and grading test cases. It is NOT connected to any
government, university, or third-party identity database.
"""

import unicodedata
from dataclasses import dataclass

from src.main.python.constants.enums import DocumentType, RegistrationStatus


@dataclass(frozen=True)
class ModelResult:
    """Evaluation result produced by mock eligibility model."""

    decision: RegistrationStatus
    score: int
    reason_codes: list[str]
    model_version: str
    normalized_document: str
    normalized_issuer: str


_ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
_ID_CHECK_CODES = "10X98765432"


def normalize_text(text: str) -> str:
    """Normalize text using Unicode NFKC and strip extra whitespace."""
    normalized = unicodedata.normalize("NFKC", text or "")
    return " ".join(normalized.strip().split())


def normalize_document_number(doc_type: DocumentType, doc_number: str) -> str:
    """Normalize document number based on type."""
    norm = unicodedata.normalize("NFKC", doc_number or "").strip().upper()
    if doc_type in {DocumentType.RESIDENT_ID, DocumentType.HK_MACAU_PERMIT}:
        # Remove hyphens and whitespace
        return norm.replace("-", "").replace(" ", "")
    if doc_type == DocumentType.STUDENT_ID:
        return norm.replace("-", "").replace(" ", "")
    return norm


def evaluate_eligibility(
    doc_type: DocumentType,
    issuer: str,
    doc_number: str,
    user_active: bool = True,
) -> ModelResult:
    """Deterministically evaluate document eligibility.

    Args:
        doc_type: Document type enum.
        issuer: Issuing authority or institution name.
        doc_number: Raw document number.
        user_active: Whether voter account is active.

    Returns:
        Deterministic ModelResult with decision, score, and reasons.
    """
    version = "mock-eligibility-v1"
    norm_doc = normalize_document_number(doc_type, doc_number)
    norm_issuer = normalize_text(issuer).upper()

    if not user_active:
        return ModelResult(
            decision=RegistrationStatus.REJECTED,
            score=0,
            reason_codes=["ACCOUNT_INACTIVE"],
            model_version=version,
            normalized_document=norm_doc,
            normalized_issuer=norm_issuer,
        )

    if not norm_issuer:
        return ModelResult(
            decision=RegistrationStatus.REJECTED,
            score=0,
            reason_codes=["ISSUER_EMPTY"],
            model_version=version,
            normalized_document=norm_doc,
            normalized_issuer=norm_issuer,
        )

    if doc_type == DocumentType.RESIDENT_ID:
        return _evaluate_resident_id(norm_doc, norm_issuer, version)
    if doc_type == DocumentType.HK_MACAU_PERMIT:
        return _evaluate_hk_macau_permit(norm_doc, norm_issuer, version)
    if doc_type == DocumentType.STUDENT_ID:
        return _evaluate_student_id(norm_doc, norm_issuer, version)

    return ModelResult(
        decision=RegistrationStatus.REJECTED,
        score=0,
        reason_codes=["DOCUMENT_TYPE_UNSUPPORTED"],
        model_version=version,
        normalized_document=norm_doc,
        normalized_issuer=norm_issuer,
    )


def _evaluate_resident_id(doc: str, issuer: str, version: str) -> ModelResult:
    if len(doc) != 18:
        return ModelResult(
            decision=RegistrationStatus.REJECTED,
            score=0,
            reason_codes=["FORMAT_LENGTH_INVALID"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    if not (doc[:17].isdigit() and (doc[17].isdigit() or doc[17] == "X")):
        return ModelResult(
            decision=RegistrationStatus.REJECTED,
            score=0,
            reason_codes=["CHARACTERS_INVALID"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    # Validate birthdate format YYYYMMDD
    year = int(doc[6:10])
    month = int(doc[10:12])
    day = int(doc[12:14])
    if not (1900 <= year <= 2026 and 1 <= month <= 12 and 1 <= day <= 31):
        return ModelResult(
            decision=RegistrationStatus.REJECTED,
            score=0,
            reason_codes=["DATE_OF_BIRTH_INVALID"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    # Calculate ISO 7064 Mod 11-2 checksum
    checksum = sum(int(doc[i]) * _ID_WEIGHTS[i] for i in range(17)) % 11
    expected_code = _ID_CHECK_CODES[checksum]

    if doc[17] == expected_code:
        return ModelResult(
            decision=RegistrationStatus.APPROVED,
            score=100,
            reason_codes=["FORMAT_VALID", "CHECKSUM_VALID"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    # If length and date are plausible but checksum mismatch, trigger manual review
    return ModelResult(
        decision=RegistrationStatus.NEEDS_REVIEW,
        score=50,
        reason_codes=["CHECKSUM_MISMATCH_NEEDS_REVIEW"],
        model_version=version,
        normalized_document=doc,
        normalized_issuer=issuer,
    )


def _evaluate_hk_macau_permit(doc: str, issuer: str, version: str) -> ModelResult:
    # Standard format: 1 capital letter (C, W, H, M) followed by 8 digits
    if len(doc) == 9 and doc[0] in {"C", "W", "H", "M"} and doc[1:].isdigit():
        return ModelResult(
            decision=RegistrationStatus.APPROVED,
            score=100,
            reason_codes=["PERMIT_FORMAT_VALID"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    # Plausible alphanumeric permit: 8-10 chars starting with a letter
    if 8 <= len(doc) <= 11 and doc[0].isalpha() and doc.isalnum():
        return ModelResult(
            decision=RegistrationStatus.NEEDS_REVIEW,
            score=60,
            reason_codes=["PERMIT_NEEDS_MANUAL_CHECK"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    return ModelResult(
        decision=RegistrationStatus.REJECTED,
        score=0,
        reason_codes=["PERMIT_FORMAT_INVALID"],
        model_version=version,
        normalized_document=doc,
        normalized_issuer=issuer,
    )


def _evaluate_student_id(doc: str, issuer: str, version: str) -> ModelResult:
    # Student ID: 8 to 12 alphanumeric characters
    if not (8 <= len(doc) <= 12 and doc.isalnum()):
        return ModelResult(
            decision=RegistrationStatus.REJECTED,
            score=0,
            reason_codes=["STUDENT_ID_LENGTH_OR_FORMAT_INVALID"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    # HKMU demo format: 8-10 characters, issuer contains recognized university keyword
    recognized_keywords = {"HKMU", "UNIVERSITY", "COLLEGE", "ACADEMY", "OUHK"}
    has_recognized_issuer = any(k in issuer for k in recognized_keywords)

    if len(doc) <= 10 and has_recognized_issuer:
        return ModelResult(
            decision=RegistrationStatus.APPROVED,
            score=100,
            reason_codes=["STUDENT_ID_VALID", "ISSUER_RECOGNIZED"],
            model_version=version,
            normalized_document=doc,
            normalized_issuer=issuer,
        )

    return ModelResult(
        decision=RegistrationStatus.NEEDS_REVIEW,
        score=70,
        reason_codes=["STUDENT_ID_NEEDS_ADMIN_CONFIRMATION"],
        model_version=version,
        normalized_document=doc,
        normalized_issuer=issuer,
    )
