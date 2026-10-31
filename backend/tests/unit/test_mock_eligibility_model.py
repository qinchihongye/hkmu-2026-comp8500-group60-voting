"""Unit tests for mock eligibility model."""

from src.main.python.algorithms.election_module.mock_eligibility_model import (
    evaluate_eligibility,
    normalize_document_number,
    normalize_text,
)
from src.main.python.constants.enums import DocumentType, RegistrationStatus


def test_normalize_helpers() -> None:
    assert (
        normalize_text("  Hong Kong   Metropolitan  University ")
        == "Hong Kong Metropolitan University"
    )
    assert (
        normalize_document_number(DocumentType.RESIDENT_ID, " 110101-19900307-237X ")
        == "11010119900307237X"
    )
    assert normalize_document_number(DocumentType.HK_MACAU_PERMIT, "c 1234 5678") == "C12345678"


def test_resident_id_valid() -> None:
    # 11010119900307237X: 110101 + 19900307 + 237 + checksum
    # Let's test a valid 18-digit ID: 11010519491231002X (sum % 11 => 2 => check code is 'X')
    # Or 110101199003072375 or similar.
    # We can compute valid check code for '11010119900307237':
    # weights: [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    # sum = 1*7 + 1*9 + 0 + 1*5 + ... = 194
    # 194 % 11 = 7. Check code index 7 is '5'.
    valid_id = "110101199003072375"
    result = evaluate_eligibility(DocumentType.RESIDENT_ID, "Public Security Bureau", valid_id)
    assert result.decision == RegistrationStatus.APPROVED
    assert result.score == 100
    assert "FORMAT_VALID" in result.reason_codes


def test_resident_id_checksum_mismatch_needs_review() -> None:
    # Valid date and length, but wrong checksum digit (e.g. '0' instead of '8')
    mismatch_id = "110101199003072370"
    result = evaluate_eligibility(DocumentType.RESIDENT_ID, "Public Security Bureau", mismatch_id)
    assert result.decision == RegistrationStatus.NEEDS_REVIEW
    assert result.score == 50
    assert "CHECKSUM_MISMATCH_NEEDS_REVIEW" in result.reason_codes


def test_resident_id_invalid_format() -> None:
    result = evaluate_eligibility(DocumentType.RESIDENT_ID, "PSB", "12345")
    assert result.decision == RegistrationStatus.REJECTED
    assert result.score == 0


def test_hk_macau_permit_valid() -> None:
    permit = "C12345678"
    result = evaluate_eligibility(DocumentType.HK_MACAU_PERMIT, "Immigration Dept", permit)
    assert result.decision == RegistrationStatus.APPROVED
    assert result.score == 100


def test_hk_macau_permit_uncertain_needs_review() -> None:
    permit = "W1234567AB"
    result = evaluate_eligibility(DocumentType.HK_MACAU_PERMIT, "Immigration Dept", permit)
    assert result.decision == RegistrationStatus.NEEDS_REVIEW
    assert result.score == 60


def test_hk_macau_permit_invalid() -> None:
    permit = "12345"
    result = evaluate_eligibility(DocumentType.HK_MACAU_PERMIT, "Immigration Dept", permit)
    assert result.decision == RegistrationStatus.REJECTED


def test_student_id_valid() -> None:
    sid = "s1234567"
    result = evaluate_eligibility(DocumentType.STUDENT_ID, "HKMU Registry", sid)
    assert result.decision == RegistrationStatus.APPROVED
    assert result.score == 100


def test_student_id_unrecognized_issuer_needs_review() -> None:
    sid = "12345678"
    result = evaluate_eligibility(DocumentType.STUDENT_ID, "Unknown High School", sid)
    assert result.decision == RegistrationStatus.NEEDS_REVIEW
    assert result.score == 70


def test_inactive_user_rejected() -> None:
    result = evaluate_eligibility(
        DocumentType.STUDENT_ID,
        "HKMU",
        "s1234567",
        user_active=False,
    )
    assert result.decision == RegistrationStatus.REJECTED
    assert "ACCOUNT_INACTIVE" in result.reason_codes
