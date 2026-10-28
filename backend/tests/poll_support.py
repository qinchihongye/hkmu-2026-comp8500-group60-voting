"""投票接口测试的请求组装。"""

from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.main.python.database.models import AuditEvent, Poll, Vote, VoteSelection
from src.main.python.utils.security_util import GUEST_COOKIE, anonymous_voter_hash
from tests.auth_support import (
    PASSWORD,
    ManualClock,
    envelope,
    patch_json,
    post_json,
    register_payload,
)

ACCESS_PASSWORD = "access-pass1"


def clock_of(client: TestClient) -> ManualClock:
    """读取测试应用上的可拨动时钟。

    Args:
        client: 已连接到测试应用的客户端。

    Returns:
        测试时钟。
    """
    clock = client.app.state.clock
    assert isinstance(clock, ManualClock)
    return clock


def login(client: TestClient, username: str) -> str:
    """登录已有账户并返回 CSRF。

    Args:
        client: 会保存 Cookie 的客户端。
        username: 已注册的用户名。

    Returns:
        登录会话的 CSRF。
    """
    response = post_json(
        client,
        "/api/v1/auth/login",
        {"username": username, "password": PASSWORD},
    )
    return str(envelope(response, 200)["csrf_token"])


def register_and_login(
    client: TestClient,
    username: str,
    *,
    display_name: str = "投票用户",
) -> str:
    """注册并登录，返回账户 CSRF。

    Args:
        client: 会保存 Cookie 的客户端。
        username: 用户名。
        display_name: 显示名。

    Returns:
        登录会话的 CSRF。
    """
    post_json(
        client,
        "/api/v1/auth/register",
        register_payload(username, display_name=display_name),
    )
    response = post_json(
        client,
        "/api/v1/auth/login",
        {"username": username, "password": PASSWORD},
    )
    return str(envelope(response, 200)["csrf_token"])


def poll_body(client: TestClient, **overrides: object) -> dict[str, object]:
    """组装一场默认已经开始的投票。

    Args:
        client: 用来读取测试时钟的客户端。
        overrides: 要覆盖的字段。

    Returns:
        创建或更新用的 data 内层。
    """
    now = clock_of(client).now()
    body: dict[str, object] = {
        "title": "课堂投票",
        "description": " 说明 ",
        "starts_at": (now - timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(hours=2)).isoformat(),
        "identity_mode": "NAMED",
        "visibility": "PUBLIC",
        "vote_limit": None,
        "selection_mode": "SINGLE",
        "options": [{"label": "同意"}, {"label": "反对"}],
    }
    body.update(overrides)
    return body


def create_poll(
    client: TestClient,
    csrf: str,
    **overrides: object,
) -> dict[str, object]:
    """创建草稿并返回管理详情。

    Args:
        client: 已登录客户端。
        csrf: 账户 CSRF。
        overrides: 覆盖默认投票字段。

    Returns:
        管理详情。
    """
    response = post_json(client, "/api/v1/polls", poll_body(client, **overrides), csrf=csrf)
    return envelope(response, 201)


def update_poll(
    client: TestClient,
    csrf: str,
    poll_id: int,
    **overrides: object,
) -> dict[str, object]:
    """按当前详情的版本提交一次完整更新。

    Args:
        client: 已登录客户端。
        csrf: 账户 CSRF。
        poll_id: 投票主键。
        overrides: 覆盖字段，可含 expected_version。

    Returns:
        更新后的管理详情。
    """
    current = envelope(client.get(f"/api/v1/me/polls/{poll_id}"), 200)
    body = poll_body(client, **overrides)
    body.setdefault("expected_version", current["version"])
    response = patch_json(client, f"/api/v1/polls/{poll_id}", body, csrf=csrf)
    return envelope(response, 200)


def publish_poll(client: TestClient, csrf: str, poll_id: int, version: int) -> dict[str, object]:
    """发布草稿。

    Args:
        client: 已登录客户端。
        csrf: 账户 CSRF。
        poll_id: 投票主键。
        version: 期望版本。

    Returns:
        发布后的管理详情。
    """
    response = post_json(
        client,
        f"/api/v1/polls/{poll_id}/publish",
        {"expected_version": version},
        csrf=csrf,
    )
    return envelope(response, 200)


def share_code_of(client: TestClient, poll_id: int) -> str:
    """从创建者分享接口取出分享码。

    Args:
        client: 创建者的客户端。
        poll_id: 投票主键。

    Returns:
        分享码本身。
    """
    link = envelope(client.get(f"/api/v1/me/polls/{poll_id}/share"), 200)
    url = str(link["share_url"])
    return url.rsplit("/", 1)[-1]


def cast(
    client: TestClient,
    guest_csrf: str,
    poll_id: int,
    option_ids: int | list[int],
) -> object:
    """提交一票，返回原始响应，方便断言成功和失败。

    单个选项会包成数组。一次提交里的多项只占一份选票。

    Args:
        client: 持有访客 Cookie 的客户端。
        guest_csrf: 访客 CSRF。
        poll_id: 投票主键。
        option_ids: 一个选项，或按提交顺序排列的多个选项。

    Returns:
        HTTP 响应。
    """
    selected = [option_ids] if isinstance(option_ids, int) else list(option_ids)
    return post_json(
        client,
        f"/api/v1/polls/{poll_id}/votes",
        {"option_ids": selected},
        csrf=guest_csrf,
    )


def ensure_guest(client: TestClient) -> str:
    """建立访客上下文并返回访客 CSRF。

    Args:
        client: 浏览器客户端。

    Returns:
        访客 CSRF。
    """
    response = post_json(client, "/api/v1/guest/context", {})
    return str(envelope(response, 200)["csrf_token"])


def unlock(
    client: TestClient,
    guest_csrf: str,
    poll_id: int,
    share_code: str,
    password: str = ACCESS_PASSWORD,
) -> dict[str, object]:
    """用分享码和访问密码解锁。

    Args:
        client: 持有访客 Cookie 的客户端。
        guest_csrf: 访客 CSRF。
        poll_id: 投票主键。
        share_code: 这场投票的分享码。
        password: 访问密码。

    Returns:
        授权结果。
    """
    response = post_json(
        client,
        f"/api/v1/polls/{poll_id}/unlock",
        {"share_code": share_code, "password": password},
        csrf=guest_csrf,
    )
    return envelope(response, 200)


def open_session(client: TestClient) -> Session:
    """打开应用自己的数据库会话。

    Args:
        client: 测试客户端。

    Returns:
        可读写测试库的会话。调用方负责关闭。
    """
    return client.app.state.session_factory()


def poll_row(client: TestClient, poll_id: int) -> tuple[str, str | None, str | None]:
    """读取生命周期、关闭时间和密码散列。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。

    Returns:
        生命周期、关闭时间和密码散列。
    """
    with open_session(client) as session:
        poll = session.get(Poll, poll_id)
        assert poll is not None
        return poll.lifecycle, None if poll.closed_at is None else poll.closed_at.isoformat(), (
            poll.private_password_hash
        )


def audit_actions(client: TestClient, poll_id: int) -> list[str]:
    """按写入顺序读取审计动作。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。

    Returns:
        动作名称列表。
    """
    with open_session(client) as session:
        rows = session.scalars(
            select(AuditEvent.action)
            .where(AuditEvent.poll_id == poll_id)
            .order_by(AuditEvent.id)
        ).all()
    return list(rows)


def insert_anonymous_vote(client: TestClient, poll_id: int, option_id: int) -> None:
    """按当前访客 Cookie 写入一张匿名票，用来检查详情恢复。

    Args:
        client: 已有访客 Cookie 的客户端。
        poll_id: 投票主键。
        option_id: 属于这场的选项。
    """
    raw_token = client.cookies.get(GUEST_COOKIE)
    assert isinstance(raw_token, str) and raw_token
    digest = anonymous_voter_hash("k" * 32, poll_id, raw_token)
    with open_session(client) as session:
        poll = session.get(Poll, poll_id)
        assert poll is not None
        session.add(
            Vote(
                receipt_id=uuid4(),
                poll_id=poll_id,
                identity_mode=poll.identity_mode,
                voter_id=None,
                anonymous_voter_hash=digest,
                submitted_at=clock_of(client).now(),
                selections=[VoteSelection(poll_id=poll_id, option_id=option_id)],
            )
        )
        session.commit()
