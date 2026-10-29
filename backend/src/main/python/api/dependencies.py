"""账户、访客和投票访问依赖。"""

from fastapi import Query, Request

from src.main.python.algorithms.auth_module.auth_service import AuthService
from src.main.python.algorithms.demo_module.demo_catalog_service import (
    DemoCatalogService,
    DemoListFilters,
)
from src.main.python.algorithms.guest_module.guest_service import GuestService
from src.main.python.algorithms.poll_access_module.poll_access_service import PollAccessService
from src.main.python.algorithms.poll_import_module.poll_text_parse_service import (
    PollTextParseService,
)
from src.main.python.algorithms.poll_module.poll_service import PollListFilters, PollService
from src.main.python.config.server_config import Settings, poll_text_parse_configured
from src.main.python.constants.enums import PollStatus, UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.external_services.openai_service import OpenAIService
from src.main.python.fileds.context import GuestContext, PollAccessContext, Principal
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.security_util import (
    AUTH_COOKIE,
    GUEST_COOKIE,
    CsrfSource,
    enforce_write_guard,
    password_hash_for,
)


def auth_service_for(request: Request) -> AuthService:
    """按当前应用状态构造账户服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程会话工厂和时钟的账户服务。
    """
    settings: Settings = request.app.state.settings
    return AuthService(
        request.app.state.session_factory,
        request.app.state.clock,
        password_hash_for(request),
        settings.session_ttl_hours,
    )


def guest_service_for(request: Request) -> GuestService:
    """按当前应用状态构造访客服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程会话工厂和时钟的访客服务。
    """
    settings: Settings = request.app.state.settings
    return GuestService(
        request.app.state.session_factory,
        request.app.state.clock,
        settings.guest_ttl_days,
    )


def get_optional_principal(request: Request) -> Principal | None:
    """读取已登录身份。没有账户会话时返回空，不拒绝访客。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        有效账户身份；未登录、过期或停用时为空。
    """
    context = auth_service_for(request).active_session(request.cookies.get(AUTH_COOKIE))
    if context is None:
        return None
    return context.principal


def require_user(request: Request) -> Principal:
    """要求 USER 或 ADMIN 的有效账户会话。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        已登录身份。

    Raises:
        AppError: 没有有效账户会话。
    """
    principal = get_optional_principal(request)
    if principal is None:
        raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
    return principal


def require_admin(request: Request) -> Principal:
    """要求管理员身份。这里只表达全局读取资格，不授予他人投票的写权限。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        管理员身份。

    Raises:
        AppError: 未登录，或当前账户不是管理员。
    """
    principal = require_user(request)
    if principal.role != UserRole.ADMIN:
        raise AppError(403, ApiCode.FORBIDDEN, ApiCode.FORBIDDEN.default_message)
    return principal


def require_guest_csrf(request: Request) -> GuestContext:
    """要求已落盘的访客 Cookie，以及与该凭据匹配的 CSRF。

    投票等访客写请求应使用本依赖。没有凭据时不能用账户 CSRF 代替。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        本次请求的访客上下文。

    Raises:
        AppError: 来源不允许、还没有访客凭据，或 CSRF 不匹配。
    """
    settings: Settings = request.app.state.settings
    guest = guest_service_for(request).authenticate(request.cookies.get(GUEST_COOKIE))
    if guest is None:
        enforce_write_guard(request, settings, CsrfSource.NONE)
        raise AppError(403, ApiCode.FORBIDDEN, "需要先建立访客上下文")
    enforce_write_guard(request, settings, CsrfSource.GUEST, guest_csrf=guest.csrf_token)
    return guest


def require_auth_csrf(request: Request) -> Principal:
    """要求有效账户会话，并核对账户 CSRF。

    没有会话时仍先检查 Origin，避免用 401 掩盖来源错误。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        已登录身份。

    Raises:
        AppError: 来源不允许、CSRF 不匹配，或没有有效账户会话。
    """
    settings: Settings = request.app.state.settings
    raw_token = request.cookies.get(AUTH_COOKIE)
    active = auth_service_for(request).active_session(raw_token)
    if active is None:
        enforce_write_guard(request, settings, CsrfSource.NONE)
        raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
    enforce_write_guard(request, settings, CsrfSource.AUTH, auth_csrf=active.csrf_token)
    return active.principal


def poll_text_parse_service_for(request: Request) -> PollTextParseService:
    """按当前应用状态构造文字识别服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程时钟和共享模型客户端的服务。未配置时不调用模型。
    """
    settings: Settings = request.app.state.settings
    enabled = poll_text_parse_configured(settings)
    client = getattr(request.app.state, "openai_client", None)
    extractor = None
    if enabled and client is not None:
        extractor = OpenAIService(
            client,
            settings.poll_text_parse_model,
            settings.poll_text_parse_timeout_seconds,
            thinking=settings.poll_text_parse_thinking,
            reasoning_effort=settings.poll_text_parse_reasoning_effort,
            stream=settings.poll_text_parse_stream,
            response_format=settings.poll_text_parse_response_format,
        )
    return PollTextParseService(request.app.state.clock, extractor, enabled=enabled)


def poll_service_for(request: Request) -> PollService:
    """按当前应用状态构造投票管理服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程会话工厂和时钟的服务。
    """
    settings: Settings = request.app.state.settings
    return PollService(
        request.app.state.session_factory,
        request.app.state.clock,
        settings.public_base_url,
    )


def poll_access_service_for(request: Request) -> PollAccessService:
    """按当前应用状态构造投票访问服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        带失败限速和授权时长的访问服务。
    """
    settings: Settings = request.app.state.settings
    return PollAccessService(
        request.app.state.session_factory,
        request.app.state.clock,
        password_hash_for(request),
        request.app.state.attempt_limiter,
        settings,
    )


def get_poll_access_context(request: Request) -> PollAccessContext:
    """组装当前账户和浏览器凭据。两者都可以为空。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        这场请求的访问上下文。
    """
    guest = guest_service_for(request).authenticate(request.cookies.get(GUEST_COOKIE))
    return PollAccessContext(principal=get_optional_principal(request), guest=guest)


def poll_list_filters(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    status: PollStatus | None = None,
    q: str | None = Query(default=None, max_length=120),
) -> PollListFilters:
    """读取列表的分页、状态和标题搜索。

    Args:
        page: 页码，从 1 开始。
        page_size: 每页条数，最大 50。
        status: 有效状态。不传则不过滤。
        q: 标题搜索。最长 120 个字符。

    Returns:
        交给投票服务的筛选条件。
    """
    return PollListFilters(page=page, page_size=page_size, status=status, text=q)


def demo_list_filters(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=8, ge=1, le=50),
    q: str | None = Query(default=None, max_length=120),
) -> DemoListFilters:
    """读取示例目录的分页和搜索。

    Args:
        page: 页码，从 1 开始。
        page_size: 每页条数，最大 50。
        q: 标题或目录键。最长 120 个字符。

    Returns:
        交给目录服务的筛选条件。
    """
    return DemoListFilters(page=page, page_size=page_size, text=q)


def demo_catalog_service_for(request: Request) -> DemoCatalogService:
    """按当前配置构造示例目录服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程会话工厂、时钟和开关的服务。
    """
    settings: Settings = request.app.state.settings
    return DemoCatalogService(
        request.app.state.session_factory,
        request.app.state.clock,
        settings.demo_polls_enabled,
    )
