"""FastAPI 应用工厂。"""

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.main.python.api.routes import api_router
from src.main.python.config.database_config import create_session_factory
from src.main.python.config.logger_config import (
    anonymous_observation_var,
    classify_path,
    get_logger,
    request_id_var,
    setup_logging,
)
from src.main.python.config.server_config import Settings, get_settings
from src.main.python.constants.error_codes import ApiCode
from src.main.python.external_services.openai_service import open_openai_client
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import log_unexpected_error, register_exception_handlers
from src.main.python.utils.poll_parse_limit_util import PollParseLimiter
from src.main.python.utils.rate_limit_util import AttemptLimiter
from src.main.python.utils.response_util import error_body, json_from_model

logger = get_logger("app")
_WRITE_METHODS = {"POST", "PUT", "PATCH"}


class RequestContextMiddleware:
    """生成请求标识，拒绝非 JSON 写请求，并按路径决定日志能否记录该标识。"""

    def __init__(self, app: ASGIApp) -> None:
        """保存下游 ASGI 应用。

        Args:
            app: 下游应用。
        """
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """处理一次 HTTP 请求。非 HTTP 流量直接下传。

        Args:
            scope: ASGI 作用域。
            receive: ASGI 接收通道。
            send: ASGI 发送通道。
        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        request_id = uuid4().hex
        request.state.request_id = request_id
        anonymous, route = classify_path(request.url.path)
        request.state.anonymous_observation = anonymous
        request_token = request_id_var.set(request_id)
        anonymous_token = anonymous_observation_var.set(anonymous)
        started = time.perf_counter()
        status_code = 500
        response_started = False

        async def send_wrapper(message: Message) -> None:
            """记录响应状态后继续发送。

            Args:
                message: ASGI 消息。
            """
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = int(message["status"])
            await send(message)

        try:
            if _unsupported_media(request):
                response = _media_type_response(request)
                status_code = response.status_code
                await response(scope, receive, send)
                return
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            # 在外层服务器错误中间件再次抛出前收口，避免原始异常被原样写入服务器日志。
            if response_started:
                raise
            log_unexpected_error(request, exc)
            response = json_from_model(
                error_body(request, ApiCode.INTERNAL_ERROR, ApiCode.INTERNAL_ERROR.default_message),
                500,
            )
            status_code = response.status_code
            await response(scope, receive, send)
        finally:
            duration_ms = int((time.perf_counter() - started) * 1000)
            _log_access(request.method, route, status_code, duration_ms, request_id, anonymous)
            request_id_var.reset(request_token)
            anonymous_observation_var.reset(anonymous_token)


def _unsupported_media(request: Request) -> bool:
    """判断写请求是否使用了 JSON 以外的内容类型。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        已声明内容类型且不是 JSON 时为 True。未声明类型时留给路由处理。
    """
    if request.method not in _WRITE_METHODS:
        return False
    content_type = request.headers.get("content-type", "")
    if not content_type:
        return False
    media_type = content_type.split(";", 1)[0].strip().lower()
    return media_type != "application/json" and not media_type.endswith("+json")


def _media_type_response(request: Request) -> JSONResponse:
    """构造不支持的内容类型响应。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        HTTP 415 的统一 JSON。
    """
    body = error_body(
        request,
        ApiCode.UNSUPPORTED_MEDIA_TYPE,
        ApiCode.UNSUPPORTED_MEDIA_TYPE.default_message,
    )
    return json_from_model(body, 415)


def _log_access(
    method: str,
    route: str,
    status_code: int,
    duration_ms: int,
    request_id: str,
    anonymous: bool,
) -> None:
    """记录一次访问。匿名参与路径不写请求标识。

    Args:
        method: HTTP 方法。
        route: 路由模板或普通路径。
        status_code: HTTP 状态码。
        duration_ms: 处理耗时，单位毫秒。
        request_id: 本次请求标识。
        anonymous: 是否按匿名链路记录。
    """
    if anonymous:
        logger.info(
            "method=%s route=%s status=%s duration_ms=%s",
            method,
            route,
            status_code,
            duration_ms,
        )
        return
    logger.info(
        "method=%s route=%s status=%s duration_ms=%s request_id=%s",
        method,
        route,
        status_code,
        duration_ms,
        request_id,
    )


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """配置齐全时创建模型客户端，退出时关闭。功能关闭则不创建。

    Args:
        app: 当前应用。

    Yields:
        应用开始接收请求。
    """
    client = open_openai_client(app.state.settings)
    app.state.openai_client = client
    try:
        yield
    finally:
        if client is not None:
            await client.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    """创建 FastAPI 应用。

    不在导入时读取配置或连接数据库。未传入配置时，从环境和仓库根目录 .env 读取。

    Args:
        settings: 可注入的配置。测试传入独立配置，避免依赖本机环境。

    Returns:
        已挂上路由、异常处理和跨域白名单的应用。
    """
    resolved = settings if settings is not None else get_settings()
    setup_logging()
    if not resolved.anon_voter_hmac_key:
        logger.warning("ANON_VOTER_HMAC_KEY 未配置，匿名防重复尚不可用")

    app = FastAPI(title="COMP8500 Voting API", version="0.1.0", lifespan=_lifespan)
    app.state.settings = resolved
    app.state.clock = Clock()
    app.state.attempt_limiter = AttemptLimiter()
    app.state.poll_parse_limiter = PollParseLimiter()
    app.state.openai_client = None
    app.state.session_factory = create_session_factory(resolved.database_url)
    register_exception_handlers(app)
    app.include_router(api_router)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    return app
