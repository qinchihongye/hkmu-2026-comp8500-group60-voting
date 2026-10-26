"""访客凭据先于投票类写请求，且不随账户操作更换。"""

import logging
from datetime import datetime, timedelta
from typing import NamedTuple

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select

from src.main.python.config.database_config import engine_for
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import GuestSession
from src.main.python.utils.security_util import AUTH_COOKIE, GUEST_COOKIE, hash_token
from tests.auth_support import (
    PASSWORD,
    ManualClock,
    envelope,
    error_body,
    parse_time,
    post_json,
    register_payload,
    set_cookie_names,
    set_cookie_value,
)


class _GuestRow(NamedTuple):
    """从数据库复制出的访客凭据。"""

    token_hash: str
    csrf_token: str
    expires_at: datetime


def test_guest_cookie_is_required_before_a_vote_like_write(auth_client: TestClient) -> None:
    """没有访客 Cookie 不能写；账户 CSRF 不能代替访客 CSRF。"""
    injected = post_json(auth_client, "/api/v1/guest/context", {"user_id": "guest-user-secret"})
    error_body(injected, 422, int(ApiCode.VALIDATION_ERROR))
    assert "guest-user-secret" not in injected.text

    denied = post_json(auth_client, "/api/v1/_auth/guest-write", {})
    denied_body = error_body(denied, 403, int(ApiCode.FORBIDDEN))
    assert denied_body["msg"] == "需要先建立访客上下文"
    evil = post_json(
        auth_client,
        "/api/v1/_auth/guest-write",
        {},
        origin="http://evil.example",
    )
    error_body(evil, 403, int(ApiCode.CSRF_FAILED))

    created = post_json(auth_client, "/api/v1/guest/context", {})
    guest = envelope(created, 200)
    assert set(guest) == {"csrf_token", "expires_at"}
    assert "user_id" not in created.text
    token = set_cookie_value(created, GUEST_COOKIE)
    assert token not in created.text
    assert created.headers["cache-control"] == "no-store"
    stored = _guest_rows(auth_client)
    assert len(stored) == 1
    assert stored[0].token_hash == hash_token(token)
    assert "user_id" not in _guest_columns(auth_client)

    missing_csrf = post_json(auth_client, "/api/v1/_auth/guest-write", {})
    error_body(missing_csrf, 403, int(ApiCode.CSRF_FAILED))
    post_json(auth_client, "/api/v1/auth/register", register_payload())
    login = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": PASSWORD},
    )
    session = envelope(login, 200)
    assert session["csrf_token"] != guest["csrf_token"]
    rejected = post_json(
        auth_client,
        "/api/v1/_auth/guest-write",
        {},
        csrf=str(session["csrf_token"]),
    )
    error_body(rejected, 403, int(ApiCode.CSRF_FAILED))
    assert auth_client.cookies.get(GUEST_COOKIE) == token
    allowed = post_json(
        auth_client,
        "/api/v1/_auth/guest-write",
        {},
        csrf=str(guest["csrf_token"]),
    )
    assert envelope(allowed, 200) == {"ok": True}
    assert "user_id" not in allowed.text


def test_refresh_login_and_logout_keep_the_same_guest(auth_client: TestClient) -> None:
    """有效访客在刷新、登录和注销后保持原令牌和原到期时间。"""
    created = post_json(auth_client, "/api/v1/guest/context", {})
    guest = envelope(created, 200)
    token = set_cookie_value(created, GUEST_COOKIE)
    expires_at = parse_time(guest["expires_at"])
    guest_ttl = timedelta(days=auth_client.app.state.settings.guest_ttl_days)
    assert expires_at == _clock(auth_client).now() + guest_ttl

    _clock(auth_client).advance(timedelta(days=1))
    refreshed = post_json(auth_client, "/api/v1/guest/context", {})
    again = envelope(refreshed, 200)
    assert again["csrf_token"] == guest["csrf_token"]
    assert parse_time(again["expires_at"]) == expires_at
    assert set_cookie_names(refreshed) == []
    assert auth_client.cookies.get(GUEST_COOKIE) == token

    post_json(auth_client, "/api/v1/auth/register", register_payload())
    login = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": PASSWORD},
    )
    session = envelope(login, 200)
    assert set_cookie_names(login) == [AUTH_COOKIE]
    assert auth_client.cookies.get(GUEST_COOKIE) == token
    logout = post_json(
        auth_client,
        "/api/v1/auth/logout",
        {},
        csrf=str(session["csrf_token"]),
    )
    assert set_cookie_names(logout) == [AUTH_COOKIE]
    assert auth_client.cookies.get(GUEST_COOKIE) == token
    rows = _guest_rows(auth_client)
    assert len(rows) == 1
    assert rows[0].token_hash == hash_token(token)
    assert rows[0].csrf_token == guest["csrf_token"]
    assert rows[0].expires_at == expires_at


def test_expired_guest_is_replaced(auth_client: TestClient) -> None:
    """到期的访客 Cookie 会换成新凭据，旧记录仍不关联账户。"""
    created = post_json(auth_client, "/api/v1/guest/context", {})
    guest = envelope(created, 200)
    token = set_cookie_value(created, GUEST_COOKIE)
    expires_at = parse_time(guest["expires_at"])
    _clock(auth_client).moment = expires_at
    replaced = post_json(auth_client, "/api/v1/guest/context", {})
    fresh = envelope(replaced, 200)
    new_token = set_cookie_value(replaced, GUEST_COOKIE)
    assert new_token != token
    assert fresh["csrf_token"] != guest["csrf_token"]
    guest_ttl = timedelta(days=auth_client.app.state.settings.guest_ttl_days)
    assert parse_time(fresh["expires_at"]) == expires_at + guest_ttl
    rows = _guest_rows(auth_client)
    assert len(rows) == 2
    assert {row.token_hash for row in rows} == {hash_token(token), hash_token(new_token)}


def test_guest_logs_omit_token_and_csrf(
    auth_client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """日志不记录访客原令牌和 CSRF。"""
    caplog.set_level(logging.INFO, logger="voting")
    created = post_json(auth_client, "/api/v1/guest/context", {})
    guest = envelope(created, 200)
    token = set_cookie_value(created, GUEST_COOKIE)
    assert "route=/api/v1/guest/context" in caplog.text
    assert token not in caplog.text
    assert str(guest["csrf_token"]) not in caplog.text


def _clock(client: TestClient) -> ManualClock:
    """读取测试应用上的可拨动时钟。

    Args:
        client: 认证测试客户端。

    Returns:
        应用正在使用的时钟。
    """
    clock = client.app.state.clock
    assert isinstance(clock, ManualClock)
    return clock


def _guest_rows(client: TestClient) -> list[_GuestRow]:
    """复制当前访客凭据。

    Args:
        client: 认证测试客户端。

    Returns:
        令牌散列、CSRF 和到期时间。
    """
    with client.app.state.session_factory() as session:
        rows = session.scalars(select(GuestSession)).all()
        return [
            _GuestRow(row.token_hash, row.csrf_token, row.expires_at)
            for row in rows
        ]


def _guest_columns(client: TestClient) -> set[str]:
    """读取访客表的列名。

    Args:
        client: 认证测试客户端。

    Returns:
        guest_sessions 的列名。
    """
    columns = inspect(engine_for(client.app.state.session_factory)).get_columns("guest_sessions")
    return {str(column["name"]) for column in columns}
