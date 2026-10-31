"""Integration and concurrency tests for election voter roster freeze."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from src.main.python.constants.enums import (
    AuditAction,
    CredentialStatus,
    DocumentType,
    RegistrationStatus,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import AuditEvent, User
from src.main.python.database.models.election import (
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
    VoterIdentity,
)
from tests.auth_support import error_body
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


def _setup_election_for_freeze(client: TestClient, admin_csrf: str) -> int:
    """Create election where registration window is already closed, ready for roster freeze."""
    now = clock_of(client).now()
    payload = {
        "title": "Faculty Senate Election",
        "description": "Vote for faculty chair.",
        "registration_starts_at": (now - timedelta(days=5)).isoformat(),
        "registration_ends_at": (now - timedelta(hours=1)).isoformat(),
        "starts_at": (now + timedelta(hours=2)).isoformat(),
        "ends_at": (now + timedelta(days=3)).isoformat(),
        "allow_live_results": True,
        "candidates": [
            {"candidate_code": "C_1", "name": "Prof A"},
            {"candidate_code": "C_2", "name": "Prof B"},
        ],
    }
    created = envelope(post_json(client, "/api/v1/admin/elections", payload, csrf=admin_csrf), 201)
    poll_id = created["id"]
    post_json(client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=admin_csrf)
    return poll_id


def test_roster_freeze_blocked_by_open_registration_or_pending_reviews(auth_client: TestClient) -> None:
    """Roster cannot be frozen before registration ends, or if pending reviews exist."""
    admin_csrf = register_and_login(auth_client, "admin_freeze_guard")
    _promote_admin(auth_client, "admin_freeze_guard")

    # 1. Blocked because registration window is still open
    now = clock_of(auth_client).now()
    open_payload = {
        "title": "Open Election",
        "description": "Registration currently open.",
        "registration_starts_at": (now - timedelta(hours=1)).isoformat(),
        "registration_ends_at": (now + timedelta(hours=5)).isoformat(),
        "starts_at": (now + timedelta(hours=10)).isoformat(),
        "ends_at": (now + timedelta(days=2)).isoformat(),
        "allow_live_results": True,
        "candidates": [{"candidate_code": "C1", "name": "A"}, {"candidate_code": "C2", "name": "B"}],
    }
    open_poll_id = envelope(post_json(auth_client, "/api/v1/admin/elections", open_payload, csrf=admin_csrf), 201)["id"]
    post_json(auth_client, f"/api/v1/admin/elections/{open_poll_id}/publish", {}, csrf=admin_csrf)

    res1 = post_json(auth_client, f"/api/v1/admin/elections/{open_poll_id}/freeze-roster", {}, csrf=admin_csrf)
    error_body(res1, 409, int(ApiCode.REGISTRATION_NOT_OPEN))

    # 2. Blocked because pending review exists
    poll_id = _setup_election_for_freeze(auth_client, admin_csrf)
    # Insert a registration with NEEDS_REVIEW directly into DB to simulate
    with open_session(auth_client) as session:
        user = User(username="pending_voter", display_name="Pending", password_hash="hash", role="USER")
        session.add(user)
        session.flush()
        ident = VoterIdentity(
            user_id=user.id,
            version=1,
            document_type=DocumentType.STUDENT_ID.value,
            issuer="HKMU",
            document_fingerprint=f"fp_{user.id}",
            document_suffix="1234",
            fingerprint_key_version=1,
            created_at=now - timedelta(days=2),
        )
        session.add(ident)
        session.flush()
        reg = ElectionRegistration(
            poll_id=poll_id,
            user_id=user.id,
            identity_id=ident.id,
            legal_name_snapshot="Pending Voter",
            status=RegistrationStatus.NEEDS_REVIEW.value,
            submitted_at=now - timedelta(days=2),
            updated_at=now - timedelta(days=2),
        )
        session.add(reg)
        session.commit()

    res2 = post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)
    error_body(res2, 409, int(ApiCode.PENDING_REVIEWS_EXIST))


def test_roster_freeze_success_and_idempotency(auth_client: TestClient) -> None:
    """Freeze generates single-use credentials for approved voters and is idempotent."""
    admin_csrf = register_and_login(auth_client, "admin_freeze_success")
    _promote_admin(auth_client, "admin_freeze_success")
    poll_id = _setup_election_for_freeze(auth_client, admin_csrf)

    now = clock_of(auth_client).now()
    # Insert 3 approved registrations
    with open_session(auth_client) as session:
        for i in range(3):
            u = User(username=f"approved_voter_{i}", display_name=f"Voter {i}", password_hash="h", role="USER")
            session.add(u)
            session.flush()
            ident = VoterIdentity(
                user_id=u.id,
                version=1,
                document_type=DocumentType.STUDENT_ID.value,
                issuer="HKMU",
                document_fingerprint=f"fp_approved_{u.id}",
                document_suffix="5678",
                fingerprint_key_version=1,
                created_at=now - timedelta(days=2),
            )
            session.add(ident)
            session.flush()
            reg = ElectionRegistration(
                poll_id=poll_id,
                user_id=u.id,
                identity_id=ident.id,
                legal_name_snapshot=f"Voter {i}",
                status=RegistrationStatus.APPROVED.value,
                submitted_at=now - timedelta(days=2),
                updated_at=now - timedelta(days=2),
            )
            session.add(reg)
        session.commit()

    # Freeze roster
    res = post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)
    result = envelope(res, 200)

    assert result["poll_id"] == poll_id
    assert result["eligible_voter_count"] == 3
    assert result["issued_credential_count"] == 3
    first_frozen_at = result["roster_frozen_at"]

    # Verify DB state
    with open_session(auth_client) as session:
        cfg = session.execute(select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)).scalar_one()
        assert cfg.eligible_voter_count == 3
        assert cfg.roster_frozen_at is not None

        creds = session.execute(
            select(ElectionVoterCredential).where(ElectionVoterCredential.poll_id == poll_id)
        ).scalars().all()
        assert len(creds) == 3
        for c in creds:
            assert c.status == CredentialStatus.ISSUED.value
            assert c.consumed_at is None

        audits = session.execute(
            select(AuditEvent).where(
                AuditEvent.poll_id == poll_id,
                AuditEvent.action == AuditAction.FREEZE_ROSTER.value,
            )
        ).scalars().all()
        assert len(audits) == 1

    # Call freeze a second time -> idempotent, same timestamp, no additional credentials or audits
    res_second = post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)
    result_second = envelope(res_second, 200)
    assert result_second["roster_frozen_at"] == first_frozen_at
    assert result_second["eligible_voter_count"] == 3
    assert result_second["issued_credential_count"] == 3

    with open_session(auth_client) as session:
        cred_count = session.execute(
            select(func.count(ElectionVoterCredential.id)).where(ElectionVoterCredential.poll_id == poll_id)
        ).scalar_one()
        assert cred_count == 3
        audit_count = session.execute(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.poll_id == poll_id,
                AuditEvent.action == AuditAction.FREEZE_ROSTER.value,
            )
        ).scalar_one()
        assert audit_count == 1


def test_concurrent_roster_freeze_calls(auth_client: TestClient) -> None:
    """Concurrent freeze requests on the same election must serialize cleanly and result in exactly N credentials."""
    admin_csrf = register_and_login(auth_client, "admin_freeze_threads")
    _promote_admin(auth_client, "admin_freeze_threads")
    poll_id = _setup_election_for_freeze(auth_client, admin_csrf)

    now = clock_of(auth_client).now()
    with open_session(auth_client) as session:
        for i in range(5):
            u = User(username=f"conc_voter_{i}", display_name=f"Voter {i}", password_hash="h", role="USER")
            session.add(u)
            session.flush()
            ident = VoterIdentity(
                user_id=u.id,
                version=1,
                document_type=DocumentType.STUDENT_ID.value,
                issuer="HKMU",
                document_fingerprint=f"fp_conc_{u.id}",
                document_suffix="9999",
                fingerprint_key_version=1,
                created_at=now - timedelta(days=2),
            )
            session.add(ident)
            session.flush()
            reg = ElectionRegistration(
                poll_id=poll_id,
                user_id=u.id,
                identity_id=ident.id,
                legal_name_snapshot=f"Voter {i}",
                status=RegistrationStatus.APPROVED.value,
                submitted_at=now - timedelta(days=2),
                updated_at=now - timedelta(days=2),
            )
            session.add(reg)
        session.commit()

    def do_freeze():
        return post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(do_freeze) for _ in range(4)]
        responses = [f.result() for f in futures]

    for resp in responses:
        assert resp.status_code == 200

    with open_session(auth_client) as session:
        cred_count = session.execute(
            select(func.count(ElectionVoterCredential.id)).where(ElectionVoterCredential.poll_id == poll_id)
        ).scalar_one()
        assert cred_count == 5
        audit_count = session.execute(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.poll_id == poll_id,
                AuditEvent.action == AuditAction.FREEZE_ROSTER.value,
            )
        ).scalar_one()
        assert audit_count == 1

