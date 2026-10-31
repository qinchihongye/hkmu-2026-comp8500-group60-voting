"""Comprehensive tests for election results and the live authorization permission matrix."""

from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main.python.constants.enums import CredentialStatus, DocumentType, RegistrationStatus
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import PollOption, User
from src.main.python.database.models.election import (
    ElectionBallot,
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


def _setup_election(client: TestClient, admin_csrf: str, allow_live_results: bool) -> tuple[int, list[int]]:
    now = clock_of(client).now()
    payload = {
        "title": f"Senate Election Live={allow_live_results}",
        "description": "Test live results matrix.",
        "registration_starts_at": (now - timedelta(days=5)).isoformat(),
        "registration_ends_at": (now - timedelta(hours=2)).isoformat(),
        "starts_at": (now - timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(days=2)).isoformat(),
        "allow_live_results": allow_live_results,
        "candidates": [
            {"candidate_code": "CAN_A", "name": "Prof Alpha"},
            {"candidate_code": "CAN_B", "name": "Prof Beta"},
        ],
    }
    poll_id = envelope(post_json(client, "/api/v1/admin/elections", payload, csrf=admin_csrf), 201)["id"]
    post_json(client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=admin_csrf)
    post_json(client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)

    with open_session(client) as session:
        options = session.execute(
            select(PollOption).where(PollOption.poll_id == poll_id).order_by(PollOption.position)
        ).scalars().all()
        option_ids = [opt.id for opt in options]

    return poll_id, option_ids


def _grant_credential(client: TestClient, poll_id: int, user_id: int, name: str) -> None:
    now = clock_of(client).now()
    with open_session(client) as session:
        ident = VoterIdentity(
            user_id=user_id,
            version=1,
            document_type=DocumentType.STUDENT_ID.value,
            issuer="HKMU",
            document_fingerprint=f"fp_auth_{user_id}",
            document_suffix="4321",
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


def test_live_results_disabled_matrix(auth_client: TestClient) -> None:
    """When allow_live_results is False, candidate results are secret to everyone while active."""
    admin_csrf = register_and_login(auth_client, "admin_matrix_disabled")
    _promote_admin(auth_client, "admin_matrix_disabled")
    poll_id, option_ids = _setup_election(auth_client, admin_csrf, allow_live_results=False)

    # Register voter
    voter_csrf = register_and_login(auth_client, "matrix_voter_unvoted")
    with open_session(auth_client) as session:
        voter_id = session.execute(select(User.id).where(User.username == "matrix_voter_unvoted")).scalar_one()
    _grant_credential(auth_client, poll_id, voter_id, "Voter 1")

    # 1. Unvoted voter -> 403
    res_unvoted = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    error_body(res_unvoted, 403, int(ApiCode.ELECTION_RESULTS_NOT_AVAILABLE))

    # Voter casts ballot
    post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/ballots",
        {"candidate_option_id": option_ids[0]},
        csrf=voter_csrf,
    )

    # 2. Voted voter STILL -> 403 (because live results are turned OFF)
    res_voted = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    error_body(res_voted, 403, int(ApiCode.ELECTION_RESULTS_NOT_AVAILABLE))

    # 3. Admin can view scale, but candidate results are None
    register_and_login(auth_client, "admin_matrix_disabled")
    res_admin = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    data_admin = envelope(res_admin, 200)
    assert data_admin["scale"]["ballot_count"] == 1
    assert data_admin["candidate_results"] is None


def test_live_results_enabled_matrix(auth_client: TestClient) -> None:
    """When allow_live_results is True, admin and voted voters can view live tallies."""
    admin_csrf = register_and_login(auth_client, "admin_matrix_enabled")
    _promote_admin(auth_client, "admin_matrix_enabled")
    poll_id, option_ids = _setup_election(auth_client, admin_csrf, allow_live_results=True)

    # Register voter
    voter_csrf = register_and_login(auth_client, "matrix_voter_enabled")
    with open_session(auth_client) as session:
        voter_id = session.execute(select(User.id).where(User.username == "matrix_voter_enabled")).scalar_one()
    _grant_credential(auth_client, poll_id, voter_id, "Voter Enabled")

    # 1. Unvoted voter -> 403
    res_unvoted = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    error_body(res_unvoted, 403, int(ApiCode.ELECTION_RESULTS_NOT_AVAILABLE))

    # Voter casts ballot
    post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/ballots",
        {"candidate_option_id": option_ids[0]},
        csrf=voter_csrf,
    )

    # 2. Voted voter -> 200 with candidate results!
    res_voted = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    data_voted = envelope(res_voted, 200)
    assert data_voted["candidate_results"] is not None
    assert len(data_voted["candidate_results"]) == 2
    assert data_voted["candidate_results"][0]["vote_count"] == 1

    # 3. Admin -> 200 with candidate results!
    register_and_login(auth_client, "admin_matrix_enabled")
    res_admin = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    data_admin = envelope(res_admin, 200)
    assert data_admin["candidate_results"] is not None


def test_closed_election_final_results_and_abstention(auth_client: TestClient) -> None:
    """When an election closes, results are public to anyone and final abstentions are calculated."""
    admin_csrf = register_and_login(auth_client, "admin_matrix_close")
    _promote_admin(auth_client, "admin_matrix_close")
    poll_id, option_ids = _setup_election(auth_client, admin_csrf, allow_live_results=False)

    # Setup 2 eligible voters, 1 votes
    voter1_csrf = register_and_login(auth_client, "voter_close_1")
    with open_session(auth_client) as session:
        v1_id = session.execute(select(User.id).where(User.username == "voter_close_1")).scalar_one()
    _grant_credential(auth_client, poll_id, v1_id, "V1")

    # Cast vote
    post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/ballots",
        {"candidate_option_id": option_ids[0]},
        csrf=voter1_csrf,
    )

    # Close election via admin early close
    admin_csrf = register_and_login(auth_client, "admin_matrix_close")
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/close", {}, csrf=admin_csrf)

    # Unauthenticated visitor requests results
    # Clear session by logging in / visiting as unauthenticated client
    res_public = auth_client.get(f"/api/v1/elections/{poll_id}/results")
    data_public = envelope(res_public, 200)

    assert data_public["candidate_results"] is not None
    assert len(data_public["candidate_results"]) == 2
    assert data_public["scale"]["ballot_count"] == 1
    # abstention_count must now be calculated, remaining_count must be None
    assert data_public["scale"]["remaining_count"] is None
    assert data_public["scale"]["abstention_count"] is not None
    assert data_public["winner_option_ids"] == [option_ids[0]]
    assert data_public["is_tie"] is False
