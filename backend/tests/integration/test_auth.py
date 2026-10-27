"""注册、登录、注销、过期、停用和演示账户。"""

import logging
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.cli import DemoAccount, SeedConflict, main, seed_demo_accounts
from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, User
from src.main.python.utils.security_util import AUTH_COOKIE
from tests.auth_support import (
    PASSWORD,
    ManualClock,
    envelope,
    error_body,
    fast_password_hash,
    null_data,
    parse_time,
    post_json,
    register_payload,
    set_cookie_value,
)
from tests.conftest import build_settings
from tests.integration.conftest import (
    assert_safe_test_database,
    database_pair,
    truncate_application_tables,
)


def test_register_rejects_unknown_identity_fields(client: TestClient) -> None:
    """外层或 data 内注入角色、账户编号和令牌时返回 422。"""
    secret = "role-secret-value"
    cases = [
        {"data": {**register_payload(), "role": secret}},
        {"data": {**register_payload(), "user_id": 1}},
        {"data": {**register_payload(), "token": secret}},
        {"data": register_payload(), "role": secret},
        {"data": register_payload(), "user_id": 9},
        {"data": register_payload(), "token": secret},
    ]
    for body in cases:
        response = client.post(
            "/api/v1/auth/register",
            json=body,
            headers={"Origin": "http://localhost:5173"},
        )
        error_body(response, 422, int(ApiCode.VALIDATION_ERROR))
        assert secret not in response.text
        assert PASSWORD not in response.text


def test_register_creates_normal_user_and_hides_password(auth_client: TestClient) -> None:
    """普通注册固定为 USER，响应和 Cookie 都不含密码或原令牌。"""
    response = post_json(
        auth_client,
        "/api/v1/auth/register",
        register_payload(username="Ada"),
        csrf="not-required",
    )
    data = envelope(response, 201)
    assert set(data) == {"id", "username", "display_name", "role"}
    assert data["username"] == "ada"
    assert data["role"] == "USER"
    assert "password" not in response.text
    assert "set-cookie" not in {key.lower() for key in response.headers}
    stored = _user(auth_client, "ada")
    assert stored.password_hash.startswith("$argon2")
    assert PASSWORD not in stored.password_hash
    assert auth_client.app.state.passwords.verify(PASSWORD, stored.password_hash)


def test_duplicate_username_is_conflict(auth_client: TestClient) -> None:
    """大小写不同的同一用户名不能注册两次。"""
    first = post_json(auth_client, "/api/v1/auth/register", register_payload())
    envelope(first, 201)
    second = post_json(
        auth_client,
        "/api/v1/auth/register",
        register_payload(username="ADA", display_name="另一位"),
    )
    error_body(second, 409, int(ApiCode.USERNAME_TAKEN))
    assert PASSWORD not in second.text


def test_login_sets_http_only_cookie_and_session_shape(auth_client: TestClient) -> None:
    """登录返回会话资料，原令牌只出现在 HttpOnly Cookie。"""
    post_json(auth_client, "/api/v1/auth/register", register_payload())
    response = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "Ada", "password": PASSWORD},
    )
    data = envelope(response, 200)
    assert set(data) == {"user", "csrf_token", "session_expires_at"}
    user = data["user"]
    assert isinstance(user, dict)
    assert set(user) == {"id", "username", "display_name", "role"}
    assert "password_hash" not in response.text
    token = set_cookie_value(response, AUTH_COOKIE)
    assert token not in response.text
    assert response.headers["cache-control"] == "no-store"
    me = auth_client.get("/api/v1/auth/me")
    me_data = envelope(me, 200)
    assert me_data["csrf_token"] == data["csrf_token"]
    assert me.headers["cache-control"] == "no-store"


def test_login_failure_uses_the_same_message(auth_client: TestClient) -> None:
    """未知用户名和错误密码返回相同的凭据错误。"""
    post_json(auth_client, "/api/v1/auth/register", register_payload())
    missing = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "nobody", "password": PASSWORD},
    )
    wrong = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": "wrong-password-1"},
    )
    missing_body = error_body(missing, 401, int(ApiCode.INVALID_CREDENTIALS))
    wrong_body = error_body(wrong, 401, int(ApiCode.INVALID_CREDENTIALS))
    assert missing_body["msg"] == wrong_body["msg"]
    assert "set-cookie" not in {key.lower() for key in missing.headers}
    short = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": "short"},
    )
    error_body(short, 401, int(ApiCode.INVALID_CREDENTIALS))


def test_expired_and_logged_out_session_cannot_continue(auth_client: TestClient) -> None:
    """到期会话被拒绝；有效注销需要账户 CSRF，重复注销不再要求它。"""
    logged_in = _login(auth_client)
    csrf = str(logged_in["csrf_token"])
    expires_at = parse_time(logged_in["session_expires_at"])
    clock = _clock(auth_client)
    clock.moment = expires_at - timedelta(seconds=1)
    envelope(auth_client.get("/api/v1/auth/me"), 200)
    clock.moment = expires_at
    error_body(auth_client.get("/api/v1/auth/me"), 401, int(ApiCode.UNAUTHENTICATED))
    expired_logout = post_json(auth_client, "/api/v1/auth/logout", {})
    null_data(expired_logout, 200)

    clock.moment = expires_at - timedelta(hours=1)
    logged_in = _login(auth_client)
    csrf = str(logged_in["csrf_token"])
    rejected = post_json(auth_client, "/api/v1/auth/logout", {})
    error_body(rejected, 403, int(ApiCode.CSRF_FAILED))
    envelope(auth_client.get("/api/v1/auth/me"), 200)
    cleared = post_json(auth_client, "/api/v1/auth/logout", {}, csrf=csrf)
    null_data(cleared, 200)
    assert "max-age=0" in cleared.headers["set-cookie"].lower()
    error_body(auth_client.get("/api/v1/auth/me"), 401, int(ApiCode.UNAUTHENTICATED))
    null_data(post_json(auth_client, "/api/v1/auth/logout", {}), 200)


def test_inactive_user_cannot_login_or_resume(auth_client: TestClient) -> None:
    """停用后既有会话和正确密码都不能通过鉴权。"""
    _login(auth_client)
    with auth_client.app.state.session_factory() as session:
        user = session.scalar(select(User).where(User.username == "ada"))
        assert user is not None
        user.is_active = False
        session.commit()
    error_body(auth_client.get("/api/v1/auth/me"), 401, int(ApiCode.UNAUTHENTICATED))
    login = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": PASSWORD},
    )
    error_body(login, 401, int(ApiCode.INVALID_CREDENTIALS))


def test_same_host_origin_can_register(auth_client: TestClient) -> None:
    """浏览器地址与 Host 一致时允许注册，即使该地址不在白名单。"""
    response = post_json(
        auth_client,
        "/api/v1/auth/register",
        register_payload(username="samehost", display_name="同源"),
        origin="http://testserver",
    )
    data = envelope(response, 201)
    assert data["username"] == "samehost"


def test_wrong_origin_is_rejected_before_register(auth_client: TestClient) -> None:
    """来源不在白名单时拒绝写请求，并且不创建账户。"""
    response = post_json(
        auth_client,
        "/api/v1/auth/register",
        register_payload(),
        origin="http://evil.example",
    )
    error_body(response, 403, int(ApiCode.CSRF_FAILED))
    missing = post_json(
        auth_client,
        "/api/v1/auth/register",
        register_payload(),
        origin=None,
    )
    error_body(missing, 403, int(ApiCode.CSRF_FAILED))
    with auth_client.app.state.session_factory() as session:
        count = session.scalar(select(func.count()).select_from(User))
    assert count == 0


def test_auth_logs_do_not_include_password_or_token(
    auth_client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """日志不记录密码和会话原令牌。"""
    caplog.set_level(logging.INFO, logger="voting")
    response = post_json(auth_client, "/api/v1/auth/register", register_payload())
    envelope(response, 201)
    login = post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": PASSWORD},
    )
    token = set_cookie_value(login, AUTH_COOKIE)
    post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": "wrong-password-1"},
    )
    assert "登录失败" in caplog.text
    assert PASSWORD not in caplog.text
    assert "wrong-password-1" not in caplog.text
    assert token not in caplog.text


def test_seed_demo_keeps_password_and_rejects_role_change(auth_engine: Engine) -> None:
    """重复执行不重置密码；同名账户角色不符时拒绝提权。"""
    truncate_application_tables(auth_engine)
    passwords = fast_password_hash()
    accounts = _demo_accounts()
    factory = sessionmaker(bind=auth_engine, expire_on_commit=False, autoflush=False)
    seed_demo_accounts(factory, accounts, passwords)
    hashes = _password_hashes(factory)
    seed_demo_accounts(factory, accounts, passwords)
    assert _password_hashes(factory) == hashes
    with factory() as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        assert admin is not None
        assert admin.role == UserRole.ADMIN
        admin.role = UserRole.USER
        poll_count = session.scalar(select(func.count()).select_from(Poll))
        session.commit()
    assert poll_count == 0
    with pytest.raises(SeedConflict, match="admin"):
        seed_demo_accounts(factory, accounts, passwords)
    with factory() as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        assert admin is not None
        assert admin.role == UserRole.USER
        assert admin.password_hash == hashes["admin"]


def test_seed_cli_does_not_print_passwords(
    auth_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """命令行只把演示账户写入测试库，输出里没有密码。"""
    truncate_application_tables(auth_engine)
    test_url, dev_url = database_pair()
    assert_safe_test_database(test_url, dev_url)
    settings = build_settings(
        database_url=test_url,
        test_database_url="postgresql+psycopg://voting:unused@127.0.0.1:1/unused",
    )
    passwords = _demo_accounts()
    monkeypatch.setattr("src.main.python.cli.get_settings", lambda: settings)
    monkeypatch.setattr(
        PasswordHash,
        "recommended",
        classmethod(lambda cls: fast_password_hash()),
    )
    for account in passwords:
        monkeypatch.setenv(account.password_env, account.password)
    caplog.set_level(logging.INFO, logger="voting")
    assert main(["seed-demo"]) == 0
    assert "已创建演示账户" in caplog.text
    captured = capsys.readouterr()
    for account in passwords:
        assert account.password not in captured.out
        assert account.password not in captured.err
        assert account.password not in caplog.text
    with sessionmaker(bind=auth_engine)() as session:
        roles = dict(session.execute(select(User.username, User.role)).all())
    assert roles == {"admin": "ADMIN", "demo_user": "USER", "demo_voter": "USER"}


def _login(client: TestClient) -> dict[str, object]:
    """注册并登录 ada。

    Args:
        client: 已连接测试库的客户端。

    Returns:
        登录响应的 data。
    """
    post_json(client, "/api/v1/auth/register", register_payload())
    response = post_json(
        client,
        "/api/v1/auth/login",
        {"username": "ada", "password": PASSWORD},
    )
    return envelope(response, 200)


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


def _user(client: TestClient, username: str) -> User:
    """按用户名读取账户。

    Args:
        client: 认证测试客户端。
        username: 规范化用户名。

    Returns:
        数据库中的账户。
    """
    with client.app.state.session_factory() as session:
        user = session.scalar(select(User).where(User.username == username))
    assert user is not None
    return user


def _demo_accounts() -> tuple[DemoAccount, ...]:
    """构造三个演示账户。密码只存在于测试进程。

    Returns:
        管理员和两个普通用户。
    """
    return (
        DemoAccount("admin", "管理员", UserRole.ADMIN, "admin-password-1", "DEMO_ADMIN_PASSWORD"),
        DemoAccount(
            "demo_user",
            "演示用户",
            UserRole.USER,
            "user-password-12",
            "DEMO_USER_PASSWORD",
        ),
        DemoAccount(
            "demo_voter",
            "演示参与者",
            UserRole.USER,
            "voter-password-1",
            "DEMO_VOTER_PASSWORD",
        ),
    )


def _password_hashes(factory: sessionmaker[Session]) -> dict[str, str]:
    """读取当前密码散列。

    Args:
        factory: 绑定测试库的会话工厂。

    Returns:
        用户名到密码散列的映射。
    """
    with factory() as session:
        rows = session.execute(select(User.username, User.password_hash)).all()
    return {username: password_hash for username, password_hash in rows}
