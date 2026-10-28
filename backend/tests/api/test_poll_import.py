"""投票文字识别的身份、限额和数据库隔离。"""

import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, User, Vote
from tests.auth_support import PASSWORD, envelope, error_body, post_json
from tests.poll_support import login, register_and_login

PARSE = "/api/v1/poll-import/parse"
CAPABILITIES = "/api/v1/poll-import/capabilities"


class _CountingFactory:
    """统计会话工厂被调用的次数。"""

    def __init__(self, inner: sessionmaker) -> None:  # type: ignore[type-arg]
        """保存原来的会话工厂。

        Args:
            inner: 应用当前的会话工厂。
        """
        self.inner = inner
        self.calls = 0

    def __call__(self) -> object:
        """打开一次会话并计数。

        Returns:
            原工厂打开的会话。
        """
        self.calls += 1
        return self.inner()


class _Client:
    """记录模型调用次数的客户端。"""

    def __init__(self) -> None:
        """准备空的调用记录。"""
        self.calls = 0
        self.during_session_calls: list[int] = []
        self.factory: _CountingFactory | None = None
        self.chat = SimpleNamespace(completions=self)

    async def create(self, **_kwargs: object) -> SimpleNamespace:
        """返回一场固定投票，并记录当时的会话打开次数。

        Args:
            _kwargs: 未使用的请求参数。

        Returns:
            同形的完成对象。
        """
        self.calls += 1
        if self.factory is not None:
            self.during_session_calls.append(self.factory.calls)
        await asyncio.sleep(0)
        if self.factory is not None:
            self.during_session_calls.append(self.factory.calls)
        payload = {
            "title": "主题",
            "description": None,
            "options": ["甲", "乙"],
            "starts_hint": None,
            "ends_hint": None,
            "selection_mode": None,
            "content_category": "single_poll",
        }
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(content=json.dumps(payload), refusal=None),
                )
            ],
            usage=SimpleNamespace(total_tokens=4),
        )


def _enable(client: TestClient, model: _Client | None = None) -> _Client:
    """打开识别配置并装上测试客户端。

    Args:
        client: 已登录或未登录的测试客户端。
        model: 要装上的模型客户端。为空时新建。

    Returns:
        装上的模型客户端。
    """
    model = _Client() if model is None else model
    settings = client.app.state.settings
    settings.poll_text_parse_enabled = True
    settings.openai_api_key = "test-key"
    settings.poll_text_parse_model = "test-model"
    client.app.state.openai_client = model
    return model


def _counts(client: TestClient) -> tuple[int, int]:
    """读取投票和选票数量。

    Args:
        client: 连接到测试库的客户端。

    Returns:
        投票数和选票数。
    """
    with client.app.state.session_factory() as session:
        polls = session.scalar(select(func.count()).select_from(Poll))
        votes = session.scalar(select(func.count()).select_from(Vote))
    return int(polls or 0), int(votes or 0)


def test_capabilities_hide_configuration_details(
    client: TestClient,
    auth_client: TestClient,
) -> None:
    """未登录不能查询。登录后只看到开关、长度和时区。"""
    error_body(client.get(CAPABILITIES), 401, int(ApiCode.UNAUTHENTICATED))

    register_and_login(auth_client, "ada")
    body = envelope(auth_client.get(CAPABILITIES), 200)
    assert body == {
        "enabled": False,
        "max_text_length": 10000,
        "timezone": "Asia/Hong_Kong",
    }
    assert auth_client.get(CAPABILITIES).headers["cache-control"] == "no-store"

    _enable(auth_client)
    assert envelope(auth_client.get(CAPABILITIES), 200)["enabled"] is True


def test_admin_and_user_can_parse_without_writing_polls(auth_client: TestClient) -> None:
    """普通用户和管理员都能识别，识别前后投票和选票数量不变。"""
    model = _enable(auth_client)
    factory = _CountingFactory(auth_client.app.state.session_factory)
    model.factory = factory
    auth_client.app.state.session_factory = factory
    csrf = register_and_login(auth_client, "ada")
    before = _counts(auth_client)

    response = post_json(auth_client, PARSE, {"text": "请选择甲或乙"}, csrf=csrf)
    data = envelope(response, 200)
    assert response.headers["cache-control"] == "no-store"
    assert data["fields"] == {
        "title": "主题",
        "options": [{"label": "甲"}, {"label": "乙"}],
    }
    assert data["timezone"] == "Asia/Hong_Kong"
    assert _counts(auth_client) == before
    assert model.calls == 1
    assert model.during_session_calls[0] == model.during_session_calls[1]

    auth_client.app.state.session_factory = factory.inner
    passwords = auth_client.app.state.passwords
    with auth_client.app.state.session_factory() as session:
        session.add(
            User(
                username="admin",
                display_name="管理员",
                password_hash=passwords.hash(PASSWORD),
                role=UserRole.ADMIN,
            )
        )
        session.commit()
    admin_csrf = login(auth_client, "admin")
    envelope(post_json(auth_client, PARSE, {"text": "请选择甲或乙"}, csrf=admin_csrf), 200)
    assert model.calls == 2
    assert _counts(auth_client) == before


def test_guest_csrf_and_disabled_do_not_call_the_model(auth_client: TestClient) -> None:
    """未登录、CSRF 错误和功能关闭都不调用模型。"""
    model = _enable(auth_client)
    error_body(post_json(auth_client, PARSE, {"text": "主题"}), 401, int(ApiCode.UNAUTHENTICATED))
    csrf = register_and_login(auth_client, "ada")
    error_body(
        post_json(auth_client, PARSE, {"text": "主题"}, csrf="wrong-token"),
        403,
        int(ApiCode.CSRF_FAILED),
    )
    auth_client.app.state.settings.poll_text_parse_enabled = False
    error_body(
        post_json(auth_client, PARSE, {"text": "主题"}, csrf=csrf),
        503,
        int(ApiCode.POLL_PARSE_DISABLED),
    )
    assert model.calls == 0


def test_sixth_parse_is_limited_until_the_window_moves(auth_client: TestClient) -> None:
    """第五次允许，第六次 429，窗口过去后可以再识别。"""
    _enable(auth_client)
    csrf = register_and_login(auth_client, "ada")
    for _index in range(5):
        envelope(post_json(auth_client, PARSE, {"text": "请选择甲或乙"}, csrf=csrf), 200)
    limited = post_json(auth_client, PARSE, {"text": "请选择甲或乙"}, csrf=csrf)
    error_body(limited, 429, int(ApiCode.TOO_MANY_ATTEMPTS))
    assert int(limited.headers["retry-after"]) >= 1

    auth_client.app.state.clock.advance(timedelta(seconds=60))
    envelope(post_json(auth_client, PARSE, {"text": "请选择甲或乙"}, csrf=csrf), 200)


def test_openapi_declares_parse_failures(client: TestClient) -> None:
    """OpenAPI 包含识别路径，并声明 502 和 504。"""
    schema = client.get("/openapi.json").json()
    parse = schema["paths"]["/api/v1/poll-import/parse"]["post"]
    assert "502" in parse["responses"]
    assert "504" in parse["responses"]
    assert "/api/v1/poll-import/capabilities" in schema["paths"]
