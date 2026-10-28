"""模型适配只发一次结构化请求，并把失败收成固定业务码。"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError

from src.main.python.constants.error_codes import ApiCode
from src.main.python.external_services.openai_service import OpenAIService, open_openai_client
from src.main.python.utils.error_handlers import AppError
from tests.conftest import build_settings

REFERENCE = datetime(2026, 10, 28, 5, 0, tzinfo=UTC)
SECRET = "SECRET-POLL-TEXT"


class _Client:
    """记录 chat.completions.create 参数的客户端。"""

    def __init__(self, handler) -> None:  # type: ignore[no-untyped-def]
        """保存响应函数。

        Args:
            handler: 收到参数后返回响应或抛出异常。
        """
        self.handler = handler
        self.calls: list[dict[str, object]] = []
        self.chat = SimpleNamespace(completions=self)

    async def create(self, **kwargs: object) -> object:
        """记录参数并交给响应函数。

        Args:
            kwargs: 传给 SDK 的参数。

        Returns:
            响应函数的结果。
        """
        self.calls.append(kwargs)
        outcome = self.handler(kwargs)
        if asyncio.iscoroutine(outcome):
            return await outcome
        return outcome


def _payload() -> dict[str, object]:
    """一份结构合法的模型 JSON。

    Returns:
        内部提取对象。
    """
    return {
        "title": "主题",
        "description": None,
        "options": ["甲", "乙"],
        "starts_hint": None,
        "ends_hint": None,
        "selection_mode": None,
        "content_category": "single_poll",
    }


def _completion(
    content: str | None,
    *,
    finish_reason: str = "stop",
    refusal: str | None = None,
    tokens: int | None = 12,
) -> SimpleNamespace:
    """组装同形的完成对象。

    Args:
        content: 消息正文。
        finish_reason: 完成原因。
        refusal: 拒绝说明。
        tokens: 总 token 数。没有用量时为空。

    Returns:
        测试替身响应。
    """
    usage = None if tokens is None else SimpleNamespace(total_tokens=tokens)
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason=finish_reason,
                message=SimpleNamespace(content=content, refusal=refusal),
            )
        ],
        usage=usage,
    )


def _run(  # type: ignore[no-untyped-def]
    handler,
    timeout: float = 1,
    *,
    thinking: str = "",
    reasoning_effort: str = "",
    stream: bool = False,
    response_format: str = "json_schema",
) -> tuple[object, _Client]:
    """用替身客户端调用一次提取。

    Args:
        handler: 响应函数。
        timeout: 总时限秒数。
        thinking: 思考开关。
        reasoning_effort: 思考强度。
        stream: 是否流式。
        response_format: json_schema 或 json_object。

    Returns:
        提取结果或抛出的业务错误，以及客户端。
    """
    client = _Client(handler)
    service = OpenAIService(
        client,
        "secret-model",
        timeout,
        thinking=thinking,
        reasoning_effort=reasoning_effort,
        stream=stream,
        response_format=response_format,
    )

    async def call() -> object:
        """执行提取。

        Returns:
            内部提取结果。
        """
        return await service.extract_poll(SECRET, REFERENCE, request_id="req-1")

    try:
        result = asyncio.run(call())
    except AppError as exc:
        return exc, client
    return result, client


def test_success_sends_one_strict_request_without_sampling(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """成功请求不传 temperature，原文只在 user 消息里。"""
    caplog.set_level(logging.INFO, logger="voting")
    result, client = _run(lambda _kwargs: _completion(json.dumps(_payload())))
    assert getattr(result, "title") == "主题"
    call = client.calls[0]
    assert call["model"] == "secret-model"
    assert call["stream"] is False
    assert "reasoning_effort" not in call
    assert "extra_body" not in call
    assert call["max_completion_tokens"] == 4096
    assert "temperature" not in call
    messages = call["messages"]
    assert isinstance(messages, list)
    assert messages[1]["content"] == SECRET
    response_format = call["response_format"]
    assert isinstance(response_format, dict)
    assert response_format["json_schema"]["strict"] is True
    assert SECRET not in caplog.text
    assert "secret-model" not in caplog.text
    assert "status=ok" in caplog.text


def test_thinking_and_reasoning_effort_come_from_configuration() -> None:
    """思考开关放在额外 JSON，强度和流式开关用调用参数。"""
    _result, client = _run(
        lambda _kwargs: _completion(json.dumps(_payload())),
        thinking="disabled",
        reasoning_effort="low",
        stream=False,
    )
    call = client.calls[0]
    assert call["model"] == "secret-model"
    assert call["stream"] is False
    assert call["reasoning_effort"] == "low"
    assert call["extra_body"] == {"thinking": {"type": "disabled"}}
    assert "temperature" not in call

    _result, object_client = _run(
        lambda _kwargs: _completion(json.dumps(_payload())),
        response_format="json_object",
    )
    object_format = object_client.calls[0]["response_format"]
    assert object_format == {"type": "json_object"}


def test_timeout_refusal_truncation_empty_and_unsupported_schema() -> None:
    """超时、拒绝、截断、空内容和不支持 Schema 都按固定码失败。"""
    async def slow(_kwargs: object) -> object:
        """超过总时限后才返回。

        Args:
            _kwargs: 未使用的请求参数。

        Returns:
            不会被用到的响应。
        """
        await asyncio.sleep(1)
        return _completion("{}")

    timed_out, calls = _run(slow, timeout=0.05)
    assert isinstance(timed_out, AppError)
    assert timed_out.code == ApiCode.POLL_PARSE_TIMEOUT
    assert calls.calls

    cases = [
        (_completion("{}", refusal="no"), ApiCode.POLL_PARSE_INVALID_OUTPUT),
        (_completion("{", finish_reason="length"), ApiCode.POLL_PARSE_INVALID_OUTPUT),
        (_completion(None), ApiCode.POLL_PARSE_INVALID_OUTPUT),
        (_completion("[]"), ApiCode.POLL_PARSE_INVALID_OUTPUT),
    ]
    for response, code in cases:
        outcome, _client = _run(lambda _kwargs, response=response: response)
        assert isinstance(outcome, AppError)
        assert outcome.code == code

    request = httpx.Request("POST", "https://example.invalid/v1/chat/completions")
    response = httpx.Response(400, request=request)
    error = BadRequestError("json_schema unsupported", response=response, body=None)

    def raise_unsupported(_kwargs: object) -> object:
        """抛出模型不支持结构化输出的错误。

        Args:
            _kwargs: 未使用的请求参数。

        Raises:
            BadRequestError: 上游拒绝 Schema。
        """
        raise error

    outcome, _client = _run(raise_unsupported)
    assert isinstance(outcome, AppError)
    assert outcome.code == ApiCode.POLL_PARSE_UNAVAILABLE
    assert "json_schema" not in outcome.msg


def test_disabled_or_incomplete_configuration_does_not_open_a_client() -> None:
    """关闭或缺少模型配置时不创建客户端。"""
    assert open_openai_client(build_settings()) is None
    missing_model = build_settings(poll_text_parse_enabled=True, openai_api_key="test-key")
    assert open_openai_client(missing_model) is None
    ready = build_settings(
        poll_text_parse_enabled=True,
        openai_api_key="test-key",
        poll_text_parse_model="test-model",
    )
    client = open_openai_client(ready)
    assert client is not None
    asyncio.run(client.close())
