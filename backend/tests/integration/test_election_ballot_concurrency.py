"""Concurrency, double-voting prevention, and timing tests for secret election ballots."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from src.main.python.constants.enums import CredentialStatus, DocumentType, RegistrationStatus
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import PollOption, User
from src.main.python.database.models.election import (
    ElectionBallot,
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


def _setup_active_election(client: TestClient, admin_csrf: str) -> tuple[int, list[int]]:
    """Create, publish, and freeze an election that is currently within voting_open period."""
    now = clock_of(client).now()
    payload = {
        "title": "Faculty Senate Election",
        "description": "Vote for faculty chair.",
        "registration_starts_at": (now - timedelta(days=5)).isoformat(),
        "registration_ends_at": (now - timedelta(hours=2)).isoformat(),
        "starts_at": (now - timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(days=2)).isoformat(),
        "allow_live_results": True,
        "candidates": [
            {"candidate_code": "C_1", "name": "Prof A"},
            {"candidate_code": "C_2", "name": "Prof B"},
        ],
    }
    created = envelope(post_json(client, "/api/v1/admin/elections", payload, csrf=admin_csrf), 201)
    poll_id = created["id"]
    post_json(client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=admin_csrf)

    with open_session(client) as session:
        options = session.execute(
            select(PollOption).where(PollOption.poll_id == poll_id).order_by(PollOption.position)
        ).scalars().all()
        option_ids = [opt.id for opt in options]

    return poll_id, option_ids


def _grant_voter_credential(client: TestClient, poll_id: int, user_id: int, name: str) -> None:
    now = clock_of(client).now()
    with open_session(client) as session:
        ident = VoterIdentity(
            user_id=user_id,
            version=1,
            document_type=DocumentType.STUDENT_ID.value,
            issuer="HKMU",
            document_fingerprint=f"fp_cred_{user_id}",
            document_suffix="1111",
            fingerprint_key_version=1,
            created_at=now - timedelta(days=3),
        )
        session.add(ident)
        session.flush()

        reg = ElectionRegistration(
            poll_id=poll_id,
            user_id=user_id,
            identity_id=ident.id,
            legal_name_snapshot=name,
            status=RegistrationStatus.APPROVED.value,
            submitted_at=now - timedelta(days=3),
            updated_at=now - timedelta(days=3),
        )
        session.add(reg)
        session.flush()

        cred = ElectionVoterCredential(
            id=uuid4(),
            poll_id=poll_id,
            registration_id=reg.id,
            status=CredentialStatus.ISSUED.value,
            issued_at=now - timedelta(hours=1),
        )
        session.add(cred)
        session.commit()


def test_concurrent_double_voting_prevention(auth_client: TestClient) -> None:
    """When a single voter fires multiple concurrent ballot submissions, exactly 1 succeeds."""
    admin_csrf = register_and_login(auth_client, "admin_ballot_test")
    _promote_admin(auth_client, "admin_ballot_test")
    poll_id, option_ids = _setup_active_election(auth_client, admin_csrf)

    # Freeze roster explicitly with 0 registered so far
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)

    # Register voter and grant credential
    voter_csrf = register_and_login(auth_client, "concurrent_voter_1")
    with open_session(auth_client) as session:
        voter = session.execute(select(User).where(User.username == "concurrent_voter_1")).scalar_one()
        voter_id = voter.id

    _grant_voter_credential(auth_client, poll_id, voter_id, "Voter 1")

    candidate_id = option_ids[0]

    def do_vote():
        return post_json(
            auth_client,
            f"/api/v1/elections/{poll_id}/ballots",
            {"candidate_option_id": candidate_id},
            csrf=voter_csrf,
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(do_vote) for _ in range(8)]
        responses = [f.result() for f in futures]

    successes = [r for r in responses if r.status_code == 201]
    conflicts = [r for r in responses if r.status_code == 409]

    assert len(successes) == 1, f"Expected 1 success, got {len(successes)}"
    assert len(conflicts) == 7, f"Expected 7 conflicts, got {len(conflicts)}"

    body = successes[0].json()["data"]
    assert "receipt_id" in body
    UUID(body["receipt_id"])  # must be valid UUID
    assert body["poll_id"] == poll_id

    # Verify conflict error code
    for conf in conflicts:
        assert conf.json()["code"] == int(ApiCode.ELECTION_ALREADY_VOTED)

    # Verify DB state: exactly 1 ballot exists, credential is CONSUMED
    with open_session(auth_client) as session:
        ballot_count = session.execute(
            select(func.count(ElectionBallot.id)).where(ElectionBallot.poll_id == poll_id)
        ).scalar_one()
        assert ballot_count == 1

        cred = session.execute(
            select(ElectionVoterCredential).where(ElectionVoterCredential.poll_id == poll_id)
        ).scalar_one()
        assert cred.status == CredentialStatus.CONSUMED.value
        assert cred.consumed_at is not None


def test_ballot_submission_validation_rules(auth_client: TestClient) -> None:
    """Validate invalid candidate, ineligible voter, un-frozen roster, and time boundaries."""
    admin_csrf = register_and_login(auth_client, "admin_ballot_rules")
    _promote_admin(auth_client, "admin_ballot_rules")
    poll_id, option_ids = _setup_active_election(auth_client, admin_csrf)
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)

    # Voter not eligible
    voter_csrf = register_and_login(auth_client, "ineligible_voter")
    res_ineligible = post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/ballots",
        {"candidate_option_id": option_ids[0]},
        csrf=voter_csrf,
    )
    error_body(res_ineligible, 403, int(ApiCode.NOT_ELIGIBLE))

    # Eligible voter voting for non-existent candidate
    with open_session(auth_client) as session:
        voter = session.execute(select(User).where(User.username == "ineligible_voter")).scalar_one()
        voter_id = voter.id
    _grant_voter_credential(auth_client, poll_id, voter_id, "Ineligible Now Granted")

    res_bad_candidate = post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/ballots",
        {"candidate_option_id": 999999},
        csrf=voter_csrf,
    )
    error_body(res_bad_candidate, 422, int(ApiCode.INVALID_CANDIDATE))
