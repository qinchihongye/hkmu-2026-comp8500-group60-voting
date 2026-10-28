"""管理员审计与演示场次。审计不包含选项，新场次不覆盖历史。"""

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from src.main.python.cli import SeedConflict, create_demo_round
from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, User
from tests.auth_support import envelope, error_body
from tests.poll_support import (
    ACCESS_PASSWORD,
    cast,
    create_poll,
    ensure_guest,
    login,
    open_session,
    publish_poll,
    register_and_login,
)


def test_admin_audit_has_no_option_or_anonymous_link(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """记名审计可查，匿名票不产生审计，响应里没有选项。"""
    csrf = register_and_login(auth_client, "ada")
    named = create_poll(auth_client, csrf, title="记名审计")
    named_id = int(named["id"])
    publish_poll(auth_client, csrf, named_id, 1)
    anonymous = create_poll(auth_client, csrf, title="匿名审计", identity_mode="ANONYMOUS")
    anonymous_id = int(anonymous["id"])
    publish_poll(auth_client, csrf, anonymous_id, 1)
    guest_csrf = ensure_guest(auth_client)
    named_detail = envelope(auth_client.get(f"/api/v1/polls/{named_id}"), 200)
    anonymous_detail = envelope(auth_client.get(f"/api/v1/polls/{anonymous_id}"), 200)
    named_option = int(named_detail["options"][0]["id"])
    envelope(cast(auth_client, guest_csrf, named_id, named_option), 201)
    envelope(
        cast(auth_client, guest_csrf, anonymous_id, int(anonymous_detail["options"][0]["id"])),
        201,
    )
    error_body(auth_client.get("/api/v1/admin/audit-events"), 403, int(ApiCode.FORBIDDEN))

    with TestClient(auth_app) as admin:
        register_and_login(admin, "cara")
        with open_session(auth_client) as session:
            user = session.scalar(select(User).where(User.username == "cara"))
            assert user is not None
            user.role = UserRole.ADMIN
            session.commit()
        login(admin, "cara")
        page = envelope(admin.get("/api/v1/admin/audit-events"), 200)
        assert page["total"] >= 1
        assert "option_id" not in admin.get("/api/v1/admin/audit-events").text
        named_params = {"poll_id": named_id, "action": "VOTE_NAMED"}
        named_page = envelope(admin.get("/api/v1/admin/audit-events", params=named_params), 200)
        assert named_page["total"] == 1
        event = named_page["items"][0]
        assert set(event) == {
            "id",
            "actor_id",
            "action",
            "poll_id",
            "receipt_id",
            "created_at",
            "request_id",
        }
        assert event["action"] == "VOTE_NAMED"
        assert "option" not in event
        anonymous_votes = envelope(
            admin.get(
                "/api/v1/admin/audit-events",
                params={"poll_id": anonymous_id, "action": "VOTE_NAMED"},
            ),
            200,
        )
        assert anonymous_votes["total"] == 0
        assert admin.get("/api/v1/admin/audit-events").headers["cache-control"] == "no-store"
        assert admin.get("/api/v1/admin/audit-events").headers["referrer-policy"] == "no-referrer"


def test_new_demo_round_does_not_overwrite_history(
    auth_client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """每轮新增四种组合，不改已有投票，日志不含访问密码。"""
    register_and_login(auth_client, "demo_user")
    ada_csrf = register_and_login(auth_client, "ada")
    kept = create_poll(auth_client, ada_csrf, title="原有投票")
    kept_id = int(kept["id"])
    caplog.set_level(logging.INFO, logger="voting")
    first = create_demo_round(
        auth_client.app.state.session_factory,
        auth_client.app.state.clock,
        "http://localhost:5173",
        ACCESS_PASSWORD,
    )
    second = create_demo_round(
        auth_client.app.state.session_factory,
        auth_client.app.state.clock,
        "http://localhost:5173",
        ACCESS_PASSWORD,
    )
    assert len(first) == 4
    assert len(second) == 4
    assert set(first).isdisjoint(second)
    assert ACCESS_PASSWORD not in caplog.text
    with open_session(auth_client) as session:
        kept_row = session.get(Poll, kept_id)
        assert kept_row is not None
        assert kept_row.title == "原有投票"
        assert kept_row.version == 1
        rows = session.scalars(select(Poll).where(Poll.id.in_(first))).all()
        modes = {(row.identity_mode, row.visibility, row.lifecycle) for row in rows}
        private = next(
            row
            for row in rows
            if row.visibility == "PRIVATE" and row.lifecycle == "PUBLISHED"
        )
        draft = next(row for row in rows if row.lifecycle == "DRAFT")
        private_share = private.share_code
        private_hash = private.private_password_hash
        private_password = private.private_password
        draft_share = draft.share_code
    assert modes == {
        ("NAMED", "PUBLIC", "PUBLISHED"),
        ("ANONYMOUS", "PUBLIC", "CLOSED"),
        ("NAMED", "PRIVATE", "PUBLISHED"),
        ("ANONYMOUS", "PRIVATE", "DRAFT"),
    }
    assert private_share
    assert ACCESS_PASSWORD not in private_share
    assert private_hash is None
    assert private_password == ACCESS_PASSWORD
    assert draft_share is None
    with open_session(auth_client) as session:
        total = session.scalar(select(func.count()).select_from(Poll))
    assert int(total or 0) >= 9


def test_new_demo_round_rejects_missing_or_promoted_user(auth_client: TestClient) -> None:
    """没有普通演示用户时不创建场次，也不把管理员降级。"""
    try:
        create_demo_round(
            auth_client.app.state.session_factory,
            auth_client.app.state.clock,
            "http://localhost:5173",
            ACCESS_PASSWORD,
        )
    except SeedConflict as exc:
        assert "demo_user" in str(exc)
    else:
        raise AssertionError("缺少演示用户时应该拒绝")
    with open_session(auth_client) as session:
        assert session.scalar(select(func.count()).select_from(Poll)) == 0

    register_and_login(auth_client, "demo_user")
    with open_session(auth_client) as session:
        user = session.scalar(select(User).where(User.username == "demo_user"))
        assert user is not None
        user.role = UserRole.ADMIN
        session.commit()
    try:
        create_demo_round(
            auth_client.app.state.session_factory,
            auth_client.app.state.clock,
            "http://localhost:5173",
            ACCESS_PASSWORD,
        )
    except SeedConflict as exc:
        assert "ADMIN" in str(exc)
    else:
        raise AssertionError("角色不符时应该拒绝")
    with open_session(auth_client) as session:
        user = session.scalar(select(User).where(User.username == "demo_user"))
        assert user is not None
        assert user.role == UserRole.ADMIN
        assert session.scalar(select(func.count()).select_from(Poll)) == 0
