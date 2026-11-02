"""Integration test for election winning threshold (自动胜出并结束选举)."""

from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main.python.constants.enums import ElectionPhase, PollLifecycle
from src.main.python.database.models import User
from src.main.python.database.models.election import ElectionConfig
from tests.auth_support import error_body
from tests.poll_support import (
    clock_of,
    envelope,
    login,
    open_session,
    post_json,
    register_and_login,
)


def _promote_admin(client: TestClient, username: str) -> None:
    with open_session(client) as session:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        user.role = "ADMIN"
        session.commit()


def test_election_winning_threshold_auto_closes(auth_client: TestClient) -> None:
    """When a candidate reaches winning_threshold, the election auto-closes immediately."""
    register_and_login(auth_client, "admin_user")
    _promote_admin(auth_client, "admin_user")
    register_and_login(auth_client, "voter_one")
    register_and_login(auth_client, "voter_two")

    now = clock_of(auth_client).now()
    payload = {
        "title": "2026 FTU Presidential Election",
        "description": "Winning threshold test.",
        "registration_starts_at": (now + timedelta(days=1)).isoformat(),
        "registration_ends_at": (now + timedelta(days=3)).isoformat(),
        "starts_at": (now + timedelta(days=5)).isoformat(),
        "ends_at": (now + timedelta(days=10)).isoformat(),
        "winning_threshold": 1,
        "allow_live_results": True,
        "candidates": [
            {"candidate_code": "C01", "name": "Alice Wang", "statement": "Better campus"},
            {"candidate_code": "C02", "name": "Bob Li", "statement": "Better food"},
        ],
    }

    # 1. Admin creates draft election with winning_threshold=1
    admin_csrf = login(auth_client, "admin_user")
    create_resp = post_json(auth_client, "/api/v1/admin/elections", payload, csrf=admin_csrf)
    created_data = envelope(create_resp, 201)
    election_id = created_data["id"]
    alice_option_id = created_data["candidates"][0]["option_id"]
    bob_option_id = created_data["candidates"][1]["option_id"]
    assert created_data["winning_threshold"] == 1

    # 2. Publish election
    pub_resp = post_json(auth_client, f"/api/v1/admin/elections/{election_id}/publish", {}, csrf=admin_csrf)
    envelope(pub_resp, 200)

    # 3. Advance to registration open
    clock_of(auth_client).advance(timedelta(days=2))

    # Voter 1 registers
    v1_csrf = login(auth_client, "voter_one")
    r1 = post_json(
        auth_client,
        f"/api/v1/elections/{election_id}/registrations",
        {
            "document_type": "STUDENT_ID",
            "issuer": "FTU",
            "document_number": "STU10001",
            "legal_name": "Voter One",
        },
        csrf=v1_csrf,
    )
    envelope(r1, 201)

    # Voter 2 registers
    v2_csrf = login(auth_client, "voter_two")
    r2 = post_json(
        auth_client,
        f"/api/v1/elections/{election_id}/registrations",
        {
            "document_type": "STUDENT_ID",
            "issuer": "FTU",
            "document_number": "STU10002",
            "legal_name": "Voter Two",
        },
        csrf=v2_csrf,
    )
    envelope(r2, 201)

    # 4. Advance past registration end, admin freezes roster
    clock_of(auth_client).advance(timedelta(days=2))
    admin_csrf = login(auth_client, "admin_user")
    freeze_resp = post_json(auth_client, f"/api/v1/admin/elections/{election_id}/freeze-roster", {}, csrf=admin_csrf)
    envelope(freeze_resp, 200)

    # 5. Advance to voting open
    clock_of(auth_client).advance(timedelta(days=2))

    # Verify election phase is VOTING
    detail_before = envelope(auth_client.get(f"/api/v1/elections/{election_id}"), 200)
    assert detail_before["phase"] == ElectionPhase.VOTING

    # 6. Voter 1 casts ballot for Alice
    v1_csrf = login(auth_client, "voter_one")
    ballot_resp = post_json(
        auth_client,
        f"/api/v1/elections/{election_id}/ballots",
        {"candidate_option_id": alice_option_id},
        csrf=v1_csrf,
    )
    envelope(ballot_resp, 201)

    # 7. Alice reached winning_threshold (1 vote)! Election should immediately be CLOSED / RESULTS
    detail_after = envelope(auth_client.get(f"/api/v1/elections/{election_id}"), 200)
    assert detail_after["phase"] == ElectionPhase.RESULTS
    assert detail_after["lifecycle"] == "CLOSED"

    # 8. Check results: Alice is the elected winner
    results_resp = auth_client.get(f"/api/v1/elections/{election_id}/results")
    res_data = envelope(results_resp, 200)
    assert res_data["phase"] == ElectionPhase.RESULTS
    assert res_data["winner_option_ids"] == [alice_option_id]

    # 9. Voter 2 attempts to vote now, rejected because election is closed
    v2_csrf = login(auth_client, "voter_two")
    ballot2_resp = post_json(
        auth_client,
        f"/api/v1/elections/{election_id}/ballots",
        {"candidate_option_id": bob_option_id},
        csrf=v2_csrf,
    )
    assert ballot2_resp.status_code == 409
