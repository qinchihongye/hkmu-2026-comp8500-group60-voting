"""用 AsyncOpenAI 做一次非流式结构化提取。

SDK 不再自动重试。一次用户操作最多一次模型请求，总时限由外层超时控制。
"""

import asyncio
import json
import time
from datetime import datetime
from typing import Any

from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)
from pydantic import ValidationError

from src.main.python.algorithms.poll_import_module.poll_text_prompt import (
    EXTRACTION_SCHEMA,
    ModelPollExtraction,
    build_messages,
)
from src.main.python.config.logger_config import get_logger
from src.main.python.config.server_config import Settings, poll_text_parse_configured
from src.main.python.constants.error_codes import ApiCode
from src.main.python.utils.error_handlers import AppError

logger = get_logger("openai_service")
_OUTPUT_TOKEN_BUDGET = 4096


class OpenAIService:
    """复用进程内客户端调用支持 strict JSON Schema 的模型。

    Attributes:
        _client: 已设置 max_retries=0 的异步客户端。
        _model: 部署配置指定的模型名。不写入日志。
        _timeout_seconds: 这一次调用的总时限。
        _thinking: 思考开关。空则不传。
        _reasoning_effort: 思考强度。空则不传。
        _stream: 是否按流式请求。值来自部署配置。
        _response_format: json_schema 或 json_object。
    """

    def __init__(
        self,
        client: Any,
        model: str,
        timeout_seconds: float,
        *,
        thinking: str = "",
        reasoning_effort: str = "",
        stream: bool = False,
        response_format: str = "json_schema",
    ) -> None:
        """保存客户端和这一次调用要带上的模型参数。

        Args:
            client: AsyncOpenAI 或测试用的兼容对象。
            model: 部署配置指定的模型名。
            timeout_seconds: 总时限，单位秒。
            thinking: 思考开关，enabled 或 disabled。空则不传。
            reasoning_effort: 思考强度。空则不传。
            stream: 是否要求流式响应。
            response_format: json_schema 或 json_object。
        """
        self._client = client
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._thinking = thinking.strip()
        self._reasoning_effort = reasoning_effort.strip()
        self._stream = stream
        self._response_format = response_format

    async def extract_poll(
        self,
        text: str,
        reference_time: datetime,
        *,
        request_id: str = "",
    ) -> ModelPollExtraction:
        """请求模型提取投票字段。

        Args:
            text: 已经检查过边界的原文。只作为 user 消息发送。
            reference_time: 写入系统消息的服务端时间。
            request_id: 当前请求标识。只用于日志。

        Returns:
            通过结构校验的提取结果。

        Raises:
            AppError: 超时、上游不可用，或输出拒绝、截断、为空、不是合法结构。
        """
        started = time.perf_counter()
        try:
            response = await self._complete(text, reference_time)
        except TimeoutError:
            self._log("timeout", started, request_id, None)
            raise _failure(504, ApiCode.POLL_PARSE_TIMEOUT) from None
        except AppError:
            raise
        except Exception as exc:
            status, error = _failure_for_exception(exc)
            self._log(status, started, request_id, None)
            raise error from None
        try:
            extraction = _extraction_from_response(response)
        except AppError as exc:
            tokens = _token_count(response)
            self._log("invalid_output", started, request_id, tokens)
            raise exc from None
        self._log("ok", started, request_id, _token_count(response))
        return extraction

    async def _complete(self, text: str, reference_time: datetime) -> Any:
        """在总时限内发起一次非流式请求。

        Args:
            text: 用户原文。
            reference_time: 服务端参考时间。

        Returns:
            SDK 的完成对象，或测试替身返回的同形对象。

        Raises:
            TimeoutError: 总时限耗尽。
        """
        # thinking 不是官方 SDK 字段，DeepSeek 要求放在额外 JSON 里。
        if self._response_format == "json_object":
            response_format: dict[str, Any] = {"type": "json_object"}
        else:
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": "poll_text_extraction",
                    "strict": True,
                    "schema": EXTRACTION_SCHEMA,
                },
            }
        request: dict[str, Any] = {
            "model": self._model,
            "messages": build_messages(text, reference_time),
            "response_format": response_format,
            "max_completion_tokens": _OUTPUT_TOKEN_BUDGET,
            "stream": self._stream,
        }
        if self._reasoning_effort:
            request["reasoning_effort"] = self._reasoning_effort
        if self._thinking:
            request["extra_body"] = {"thinking": {"type": self._thinking}}
        async with asyncio.timeout(self._timeout_seconds):
            return await self._client.chat.completions.create(**request)

    def _log(self, status: str, started: float, request_id: str, tokens: int | None) -> None:
        """记录状态、耗时和可选 token 数。

        Args:
            status: ok、timeout、unavailable 或 invalid_output。
            started: 调用开始时的性能计数。
            request_id: 当前请求标识。
            tokens: 上游返回的总 token 数。没有时为空。
        """
        logger.info(
            "status=%s duration_ms=%s tokens=%s request_id=%s",
            status,
            int((time.perf_counter() - started) * 1000),
            "-" if tokens is None else tokens,
            request_id,
        )


def open_openai_client(settings: Settings) -> AsyncOpenAI | None:
    """在配置齐全时创建可复用的客户端。关闭功能时不创建，也不访问网络。

    Args:
        settings: 当前进程配置。

    Returns:
        max_retries 为 0 的客户端。功能关闭或配置不足时为空。
    """
    if not poll_text_parse_configured(settings):
        return None
    # SDK 保持 0 次重试，避免和外层总时限叠成多次付费请求。
    base_url = settings.openai_base_url.strip()
    if base_url:
        return AsyncOpenAI(
            api_key=settings.openai_api_key,
            max_retries=0,
            timeout=settings.poll_text_parse_timeout_seconds,
            base_url=base_url,
        )
    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        max_retries=0,
        timeout=settings.poll_text_parse_timeout_seconds,
    )


def _extraction_from_response(response: Any) -> ModelPollExtraction:
    """检查完成原因和 JSON 结构。不修补 Markdown 或推理标记。

    Args:
        response: SDK 响应或同形测试对象。

    Returns:
        内部提取结果。

    Raises:
        AppError: 拒绝、截断、缺少内容或结构不合法。
    """
    choices = getattr(response, "choices", None)
    if not choices:
        raise _failure(502, ApiCode.POLL_PARSE_INVALID_OUTPUT)
    choice = choices[0]
    if getattr(choice, "finish_reason", None) != "stop":
        raise _failure(502, ApiCode.POLL_PARSE_INVALID_OUTPUT)
    message = getattr(choice, "message", None)
    if message is None or getattr(message, "refusal", None):
        raise _failure(502, ApiCode.POLL_PARSE_INVALID_OUTPUT)
    content = getattr(message, "content", None)
    if not isinstance(content, str) or not content.strip():
        raise _failure(502, ApiCode.POLL_PARSE_INVALID_OUTPUT)
    try:
        payload = json.loads(content)
        return ModelPollExtraction.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
        raise _failure(502, ApiCode.POLL_PARSE_INVALID_OUTPUT) from None


def _failure_for_exception(exc: Exception) -> tuple[str, AppError]:
    """把 SDK 异常收成固定状态。不保留上游正文。

    Args:
        exc: 客户端抛出的异常。

    Returns:
        日志状态和业务错误。未归类的异常原样抛出。

    Raises:
        Exception: 不是模型调用失败的程序错误。
    """
    if isinstance(exc, APITimeoutError):
        return "timeout", _failure(504, ApiCode.POLL_PARSE_TIMEOUT)
    unavailable = (
        APIConnectionError,
        AuthenticationError,
        PermissionDeniedError,
        RateLimitError,
        BadRequestError,
        APIStatusError,
        APIError,
    )
    if isinstance(exc, unavailable):
        return "unavailable", _failure(503, ApiCode.POLL_PARSE_UNAVAILABLE)
    raise exc


def _token_count(response: Any) -> int | None:
    """读取总 token 数。没有用量时为空。

    Args:
        response: SDK 响应或同形测试对象。

    Returns:
        总 token 数。
    """
    usage = getattr(response, "usage", None)
    total = getattr(usage, "total_tokens", None)
    if isinstance(total, int):
        return total
    return None


def _failure(status_code: int, code: ApiCode) -> AppError:
    """构造不缓存的模型调用失败。

    Args:
        status_code: HTTP 状态码。
        code: 数值业务码。

    Returns:
        固定英文说明的业务错误。
    """
    return AppError(
        status_code,
        code,
        code.default_message,
        headers={"Cache-Control": "no-store"},
    )
