"""Integration tests for voter identity registration, mock model, and admin review."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main.python.constants.enums import (
    DocumentType,
    RegistrationStatus,
    ReviewActorType,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import User
from src.main.python.database.models.election import (
    ElectionRegistration,
    EligibilityReviewEvent,
    VoterIdentity,
)
from tests.auth_support import PASSWORD, error_body
from tests.poll_support import (
    clock_of,
    envelope,
    open_session,
    post_json,
    register_and_login,
)


def _promote_admin(client: TestClient, username: str) -> None:
    with open_session(client) as session:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        user.role = "ADMIN"
        session.commit()


def _setup_open_election(client: TestClient, admin_csrf: str) -> int:
    """Create and publish an election that is currently in REGISTRATION_OPEN phase."""
    now = clock_of(client).now()
    payload = {
        "title": "Campus Representative Election",
        "description": "Vote for student leadership.",
        "registration_starts_at": (now - timedelta(hours=1)).isoformat(),
        "registration_ends_at": (now + timedelta(days=2)).isoformat(),
        "starts_at": (now + timedelta(days=3)).isoformat(),
        "ends_at": (now + timedelta(days=7)).isoformat(),
        "allow_live_results": False,
        "candidates": [
            {"candidate_code": "CAN_1", "name": "Candidate Alpha"},
            {"candidate_code": "CAN_2", "name": "Candidate Beta"},
        ],
    }
    created = envelope(post_json(client, "/api/v1/admin/elections", payload, csrf=admin_csrf), 201)
    poll_id = created["id"]
    post_json(client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=admin_csrf)
    return poll_id


def test_voter_registration_flow_and_privacy(auth_client: TestClient) -> None:
    """Voter registers; verifies masked storage, zero raw doc in DB, and model review event."""
    admin_csrf = register_and_login(auth_client, "admin_user")
    _promote_admin(auth_client, "admin_user")
    poll_id = _setup_open_election(auth_client, admin_csrf)

    voter_csrf = register_and_login(auth_client, "voter_alice")
    raw_id = "110101199003072375"

    reg_payload = {
        "legal_name": "Alice Wang",
        "document_type": DocumentType.RESIDENT_ID.value,
        "issuer": "Beijing Municipal PSB",
        "document_number": raw_id,
    }

    res = post_json(
        auth_client, f"/api/v1/elections/{poll_id}/registrations", reg_payload, csrf=voter_csrf
    )
    summary = envelope(res, 201)

    assert summary["poll_id"] == poll_id
    assert summary["legal_name_snapshot"] == "Alice Wang"
    assert summary["document_suffix"] == "2375"
    assert summary["status"] == RegistrationStatus.APPROVED.value
    assert summary["model_score"] == 100

    # Verify Database rows
    with open_session(auth_client) as session:
        # Check raw ID is NOT stored anywhere in voter_identities
        ident = session.execute(select(VoterIdentity)).scalar_one()
        assert raw_id not in ident.document_fingerprint
        assert ident.document_suffix == "2375"
        assert ident.version == 1

        reg = session.execute(
            select(ElectionRegistration).where(ElectionRegistration.poll_id == poll_id)
        ).scalar_one()
        assert reg.status == RegistrationStatus.APPROVED.value

        event = session.execute(
            select(EligibilityReviewEvent).where(EligibilityReviewEvent.registration_id == reg.id)
        ).scalar_one()
        assert event.actor_type == ReviewActorType.MODEL.value
        assert event.to_status == RegistrationStatus.APPROVED.value


def test_registration_window_guard(auth_client: TestClient) -> None:
    """Cannot register before registration starts or after it ends."""
    admin_csrf = register_and_login(auth_client, "admin_window")
    _promote_admin(auth_client, "admin_window")

    now = clock_of(auth_client).now()
    # Create election with future registration start
    payload = {
        "title": "Future Election",
        "description": "Not open yet.",
        "registration_starts_at": (now + timedelta(days=1)).isoformat(),
        "registration_ends_at": (now + timedelta(days=3)).isoformat(),
        "starts_at": (now + timedelta(days=4)).isoformat(),
        "ends_at": (now + timedelta(days=6)).isoformat(),
        "allow_live_results": True,
        "candidates": [
            {"candidate_code": "C1", "name": "A"},
            {"candidate_code": "C2", "name": "B"},
        ],
    }
    poll_id = envelope(
        post_json(auth_client, "/api/v1/admin/elections", payload, csrf=admin_csrf), 201
    )["id"]
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=admin_csrf)

    voter_csrf = register_and_login(auth_client, "early_voter")
    res = post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/registrations",
        {
            "legal_name": "Bob",
            "document_type": DocumentType.STUDENT_ID.value,
            "issuer": "HKMU",
            "document_number": "s1234567",
        },
        csrf=voter_csrf,
    )
    error_body(res, 409, int(ApiCode.REGISTRATION_NOT_OPEN))


def test_duplicate_registration_and_duplicate_identity_across_accounts(
    auth_client: TestClient,
) -> None:
    """Prevents double registration by same account and binding same document to another account."""
    admin_csrf = register_and_login(auth_client, "admin_dedup")
    _promote_admin(auth_client, "admin_dedup")
    poll_id = _setup_open_election(auth_client, admin_csrf)

    user1_csrf = register_and_login(auth_client, "user_one")
    doc_payload = {
        "legal_name": "Charlie",
        "document_type": DocumentType.STUDENT_ID.value,
        "issuer": "HKMU Registry",
        "document_number": "s12345678",
    }

    # First registration succeeds
    post_json(
        auth_client, f"/api/v1/elections/{poll_id}/registrations", doc_payload, csrf=user1_csrf
    )

    # Same user registers again -> 409 ALREADY_REGISTERED
    dup_reg = post_json(
        auth_client, f"/api/v1/elections/{poll_id}/registrations", doc_payload, csrf=user1_csrf
    )
    error_body(dup_reg, 409, int(ApiCode.ALREADY_REGISTERED))

    # Different user tries to use the same document -> 409 IDENTITY_DOCUMENT_DUPLICATE
    user2_csrf = register_and_login(auth_client, "user_two")
    conflict_doc = post_json(
        auth_client, f"/api/v1/elections/{poll_id}/registrations", doc_payload, csrf=user2_csrf
    )
    error_body(conflict_doc, 409, int(ApiCode.IDENTITY_DOCUMENT_DUPLICATE))


def test_admin_manual_review_flow(auth_client: TestClient) -> None:
    """Uncertain document triggers NEEDS_REVIEW; admin can review and approve."""
    admin_csrf = register_and_login(auth_client, "admin_reviewer")
    _promote_admin(auth_client, "admin_reviewer")
    poll_id = _setup_open_election(auth_client, admin_csrf)

    voter_csrf = register_and_login(auth_client, "voter_uncertain")
    # Checksum mismatch triggers NEEDS_REVIEW
    res = post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/registrations",
        {
            "legal_name": "David",
            "document_type": DocumentType.RESIDENT_ID.value,
            "issuer": "PSB",
            "document_number": "110101199003072370",
        },
        csrf=voter_csrf,
    )
    reg_summary = envelope(res, 201)
    assert reg_summary["status"] == RegistrationStatus.NEEDS_REVIEW.value
    reg_id = reg_summary["id"]

    # Re-login as admin
    login_res = post_json(
        auth_client, "/api/v1/auth/login", {"username": "admin_reviewer", "password": PASSWORD}
    )
    admin_csrf = str(envelope(login_res, 200)["csrf_token"])

    # Admin lists registrations filtered by NEEDS_REVIEW
    admin_list = envelope(
        auth_client.get(f"/api/v1/admin/elections/{poll_id}/registrations?status=NEEDS_REVIEW"),
        200,
    )
    assert any(item["id"] == reg_id for item in admin_list["items"])

    # Admin reviews and approves
    review_res = post_json(
        auth_client,
        f"/api/v1/admin/elections/{poll_id}/registrations/{reg_id}/review",
        {
            "decision": RegistrationStatus.APPROVED.value,
            "reason_codes": ["OFFLINE_PASSPORT_VERIFIED"],
            "review_note": "Verified by department office in person.",
        },
        csrf=admin_csrf,
    )
    reviewed = envelope(review_res, 200)
    assert reviewed["status"] == RegistrationStatus.APPROVED.value
    assert reviewed["reviewed_by_username"] == "admin_reviewer"

    # Verify audit review event appended in DB
    with open_session(auth_client) as session:
        events = (
            session.execute(
                select(EligibilityReviewEvent)
                .where(EligibilityReviewEvent.registration_id == reg_id)
                .order_by(EligibilityReviewEvent.id.asc())
            )
            .scalars()
            .all()
        )
        assert len(events) == 2
        assert events[0].actor_type == ReviewActorType.MODEL.value
        assert events[1].actor_type == ReviewActorType.ADMIN.value
        assert events[1].to_status == RegistrationStatus.APPROVED.value
        assert events[1].review_note == "Verified by department office in person."

    # Cannot review an already APPROVED registration again
    again = post_json(
        auth_client,
        f"/api/v1/admin/elections/{poll_id}/registrations/{reg_id}/review",
        {"decision": RegistrationStatus.REJECTED.value},
        csrf=admin_csrf,
    )
    error_body(again, 409, int(ApiCode.FORBIDDEN))


def test_my_registrations_query(auth_client: TestClient) -> None:
    """User can fetch their own registration history across elections."""
    admin_csrf = register_and_login(auth_client, "admin_query")
    _promote_admin(auth_client, "admin_query")
    poll_id = _setup_open_election(auth_client, admin_csrf)

    voter_csrf = register_and_login(auth_client, "voter_history")
    post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/registrations",
        {
            "legal_name": "Eva",
            "document_type": DocumentType.STUDENT_ID.value,
            "issuer": "HKMU",
            "document_number": "s99887766",
        },
        csrf=voter_csrf,
    )

    my_regs = envelope(auth_client.get("/api/v1/me/election-registrations"), 200)
    assert len(my_regs["items"]) == 1
    assert my_regs["items"][0]["election_title"] == "Campus Representative Election"
    assert my_regs["items"][0]["document_suffix"] == "7766"
    assert my_regs["items"][0]["status"] == RegistrationStatus.APPROVED.value
