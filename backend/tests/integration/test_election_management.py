"""Integration tests for election management, drafts, publishing, and admin operations."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main.python.constants.enums import AuditAction, ElectionPhase, PollLifecycle
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import AuditEvent, Poll, PollOption, User
from src.main.python.database.models.election import ElectionCandidate, ElectionConfig
from tests.auth_support import error_body
from tests.poll_support import (
    clock_of,
    envelope,
    open_session,
    patch_json,
    post_json,
    register_and_login,
)


def _promote_admin(client: TestClient, username: str) -> None:
    with open_session(client) as session:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        user.role = "ADMIN"
        session.commit()


def _election_payload(client: TestClient, **overrides: object) -> dict[str, object]:
    now = clock_of(client).now()
    payload: dict[str, object] = {
        "title": "2026 Student Union Election",
        "description": "Choose one leader.",
        "registration_starts_at": (now + timedelta(days=1)).isoformat(),
        "registration_ends_at": (now + timedelta(days=3)).isoformat(),
        "starts_at": (now + timedelta(days=5)).isoformat(),
        "ends_at": (now + timedelta(days=10)).isoformat(),
        "allow_live_results": True,
        "candidates": [
            {
                "candidate_code": "C01",
                "name": "Alice Wang",
                "statement": "Better library services.",
            },
            {"candidate_code": "C02", "name": "Bob Li", "statement": "Healthier dining options."},
        ],
    }
    payload.update(overrides)
    return payload


def test_election_admin_permissions_guard(auth_client: TestClient) -> None:
    """Guest and non-admin users cannot access admin election endpoints."""
    # Guest access
    guest_resp = post_json(auth_client, "/api/v1/admin/elections", _election_payload(auth_client))
    error_body(guest_resp, 401, int(ApiCode.UNAUTHENTICATED))

    guest_get = auth_client.get("/api/v1/admin/elections")
    error_body(guest_get, 401, int(ApiCode.UNAUTHENTICATED))

    # Regular user access
    csrf = register_and_login(auth_client, "regular_voter")
    user_resp = post_json(
        auth_client, "/api/v1/admin/elections", _election_payload(auth_client), csrf=csrf
    )
    error_body(user_resp, 403, int(ApiCode.FORBIDDEN))

    user_get = auth_client.get("/api/v1/admin/elections")
    error_body(user_get, 403, int(ApiCode.FORBIDDEN))


def test_election_creation_and_database_persistence(auth_client: TestClient) -> None:
    """Admin creates election draft; verifies response shape, DB rows, and audit."""
    csrf = register_and_login(auth_client, "admin_user")
    _promote_admin(auth_client, "admin_user")

    res = post_json(
        auth_client, "/api/v1/admin/elections", _election_payload(auth_client), csrf=csrf
    )
    created = envelope(res, 201)

    assert created["title"] == "2026 Student Union Election"
    assert created["description"] == "Choose one leader."
    assert created["lifecycle"] == PollLifecycle.DRAFT
    assert created["phase"] == ElectionPhase.DRAFT
    assert created["allow_live_results"] is True
    assert created["version"] == 1
    assert len(created["candidates"]) == 2
    assert created["candidates"][0]["candidate_code"] == "C01"
    assert created["candidates"][0]["name"] == "Alice Wang"

    poll_id = created["id"]

    # Verify DB rows
    with open_session(auth_client) as session:
        poll = session.execute(select(Poll).where(Poll.id == poll_id)).scalar_one()
        assert poll.activity_type == "ELECTION"
        assert poll.selection_mode == "SINGLE"
        assert poll.identity_mode == "NAMED"
        assert poll.visibility == "PUBLIC"
        assert poll.lifecycle == "DRAFT"

        config = session.execute(
            select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)
        ).scalar_one()
        assert config.roster_frozen_at is None
        assert config.eligible_voter_count is None

        options = (
            session.execute(select(PollOption).where(PollOption.poll_id == poll_id)).scalars().all()
        )
        assert len(options) == 2

        candidates = (
            session.execute(select(ElectionCandidate).where(ElectionCandidate.poll_id == poll_id))
            .scalars()
            .all()
        )
        assert len(candidates) == 2

        audit = session.execute(
            select(AuditEvent).where(AuditEvent.poll_id == poll_id)
        ).scalar_one()
        assert audit.action == AuditAction.CREATE.value


def test_election_creation_validation_failures(auth_client: TestClient) -> None:
    """Fails with 422 if fewer than 2 candidates, duplicate codes, or invalid time sequence."""
    csrf = register_and_login(auth_client, "admin_validator")
    _promote_admin(auth_client, "admin_validator")

    # Less than 2 candidates
    res1 = post_json(
        auth_client,
        "/api/v1/admin/elections",
        _election_payload(auth_client, candidates=[{"candidate_code": "C01", "name": "Only One"}]),
        csrf=csrf,
    )
    error_body(res1, 422, int(ApiCode.VALIDATION_ERROR))

    # Duplicate candidate codes
    res2 = post_json(
        auth_client,
        "/api/v1/admin/elections",
        _election_payload(
            auth_client,
            candidates=[
                {"candidate_code": "SAME", "name": "Candidate A"},
                {"candidate_code": "SAME", "name": "Candidate B"},
            ],
        ),
        csrf=csrf,
    )
    error_body(res2, 422, int(ApiCode.VALIDATION_ERROR))

    # Invalid time ordering: registration_ends_at >= starts_at
    now = clock_of(auth_client).now()
    res3 = post_json(
        auth_client,
        "/api/v1/admin/elections",
        _election_payload(
            auth_client,
            registration_starts_at=(now + timedelta(days=1)).isoformat(),
            registration_ends_at=(now + timedelta(days=6)).isoformat(),
            starts_at=(now + timedelta(days=5)).isoformat(),
            ends_at=(now + timedelta(days=10)).isoformat(),
        ),
        csrf=csrf,
    )
    error_body(res3, 422, int(ApiCode.VALIDATION_ERROR))


def test_election_draft_update_and_optimistic_lock(auth_client: TestClient) -> None:
    """Draft election can be updated with version increment; stale version is rejected."""
    csrf = register_and_login(auth_client, "admin_editor")
    _promote_admin(auth_client, "admin_editor")

    created = envelope(
        post_json(
            auth_client, "/api/v1/admin/elections", _election_payload(auth_client), csrf=csrf
        ),
        201,
    )
    poll_id = created["id"]
    assert created["version"] == 1

    # Update with version 1
    updated = envelope(
        patch_json(
            auth_client,
            f"/api/v1/admin/elections/{poll_id}",
            {"title": "Updated Election Title", "version": 1},
            csrf=csrf,
        ),
        200,
    )
    assert updated["title"] == "Updated Election Title"
    assert updated["version"] == 2

    # Stale version update with version 1 fails
    stale_res = patch_json(
        auth_client,
        f"/api/v1/admin/elections/{poll_id}",
        {"title": "Stale Update", "version": 1},
        csrf=csrf,
    )
    error_body(stale_res, 409, int(ApiCode.STALE_POLL_VERSION))

    # Verify UPDATE audit recorded
    with open_session(auth_client) as session:
        audits = (
            session.execute(
                select(AuditEvent)
                .where(AuditEvent.poll_id == poll_id)
                .order_by(AuditEvent.id.asc())
            )
            .scalars()
            .all()
        )
        assert [a.action for a in audits] == [AuditAction.CREATE.value, AuditAction.UPDATE.value]


def test_election_publish_and_public_visibility(auth_client: TestClient) -> None:
    """Published election transitions phase, appears in public listings, and cannot be modified."""
    csrf = register_and_login(auth_client, "admin_publisher")
    _promote_admin(auth_client, "admin_publisher")

    created = envelope(
        post_json(
            auth_client, "/api/v1/admin/elections", _election_payload(auth_client), csrf=csrf
        ),
        201,
    )
    poll_id = created["id"]

    # Draft does not appear in public listing
    pub_list_before = envelope(auth_client.get("/api/v1/elections"), 200)
    assert not any(item["id"] == poll_id for item in pub_list_before["items"])

    # Publish
    published = envelope(
        post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=csrf),
        200,
    )
    assert published["lifecycle"] == PollLifecycle.PUBLISHED
    assert published["phase"] == ElectionPhase.REGISTRATION_SCHEDULED

    # Now appears in public listing
    pub_list_after = envelope(auth_client.get("/api/v1/elections"), 200)
    assert any(item["id"] == poll_id for item in pub_list_after["items"])

    # Public detail endpoint works
    pub_detail = envelope(auth_client.get(f"/api/v1/elections/{poll_id}"), 200)
    assert pub_detail["id"] == poll_id
    assert pub_detail["next_action"] == "WAIT_FOR_REGISTRATION"

    # Published election cannot be modified with PATCH
    blocked_patch = patch_json(
        auth_client,
        f"/api/v1/admin/elections/{poll_id}",
        {"title": "Cannot Change Now", "version": 2},
        csrf=csrf,
    )
    error_body(blocked_patch, 409, int(ApiCode.POLL_IMMUTABLE))


def test_admin_early_close_guards_and_execution(auth_client: TestClient) -> None:
    """Admin close requires roster to be frozen and voting to have started."""
    csrf = register_and_login(auth_client, "admin_closer")
    _promote_admin(auth_client, "admin_closer")

    created = envelope(
        post_json(
            auth_client, "/api/v1/admin/elections", _election_payload(auth_client), csrf=csrf
        ),
        201,
    )
    poll_id = created["id"]

    # Draft cannot be closed
    draft_close = post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/close", {}, csrf=csrf)
    error_body(draft_close, 403, int(ApiCode.FORBIDDEN))

    # Publish
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=csrf)

    # Roster not frozen -> cannot close
    unfrozen_close = post_json(
        auth_client, f"/api/v1/admin/elections/{poll_id}/close", {}, csrf=csrf
    )
    error_body(unfrozen_close, 409, int(ApiCode.ROSTER_NOT_FROZEN))

    # Simulate roster frozen in DB
    now = clock_of(auth_client).now()
    with open_session(auth_client) as session:
        cfg = session.execute(
            select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)
        ).scalar_one()
        cfg.roster_frozen_at = now
        cfg.eligible_voter_count = 5
        session.commit()

    # Voting not started yet -> cannot close
    unstarted_close = post_json(
        auth_client, f"/api/v1/admin/elections/{poll_id}/close", {}, csrf=csrf
    )
    error_body(unstarted_close, 409, int(ApiCode.ELECTION_NOT_OPEN))

    # Move clock forward into voting window
    with open_session(auth_client) as session:
        p = session.execute(select(Poll).where(Poll.id == poll_id)).scalar_one()
        p.starts_at = now - timedelta(hours=1)
        p.ends_at = now + timedelta(hours=2)
        session.commit()

    # Now close succeeds
    closed = envelope(
        post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/close", {}, csrf=csrf),
        200,
    )
    assert closed["lifecycle"] == PollLifecycle.CLOSED
    assert closed["phase"] == ElectionPhase.CLOSED

    # Verify audit event CLOSE
    with open_session(auth_client) as session:
        audits = (
            session.execute(
                select(AuditEvent)
                .where(AuditEvent.poll_id == poll_id)
                .order_by(AuditEvent.id.asc())
            )
            .scalars()
            .all()
        )
        actions = [a.action for a in audits]
        assert AuditAction.CLOSE.value in actions
