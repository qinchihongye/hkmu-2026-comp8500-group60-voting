"""注册、登录和注销。"""

from fastapi import APIRouter, Request, Response

from src.main.python.api.dependencies import auth_service_for
from src.main.python.config.server_config import Settings
from src.main.python.fileds.context import SessionContext
from src.main.python.fileds.request.auth_request import LoginRequest, RegisterRequest
from src.main.python.fileds.request.request import EmptyRequestData, RequestModel
from src.main.python.fileds.response.auth_response import SessionPublic, UserPublic
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import (
    AUTH_COOKIE,
    CsrfSource,
    clear_token_cookie,
    enforce_write_guard,
    mark_private,
    set_token_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=201,
    response_model=ResponseModel[UserPublic],
    responses=error_response_declarations(),
)
def register(
    payload: RequestModel[RegisterRequest],
    request: Request,
    response: Response,
) -> ResponseModel[UserPublic]:
    """注册普通账户。不创建会话，也不接收角色字段。

    Args:
        payload: 统一请求外壳。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。

    Returns:
        HTTP 201 的公开身份。
    """
    mark_private(response)
    settings: Settings = request.app.state.settings
    enforce_write_guard(request, settings, CsrfSource.NONE)
    user = auth_service_for(request).register(payload.data)
    return success_body(request, user)


@router.post(
    "/login",
    response_model=ResponseModel[SessionPublic],
    responses=error_response_declarations(),
)
def login(
    payload: RequestModel[LoginRequest],
    request: Request,
    response: Response,
) -> ResponseModel[SessionPublic]:
    """登录并把原令牌写入账户 Cookie。

    Args:
        payload: 统一请求外壳。
        request: 当前 HTTP 请求。
        response: 用于设置 Cookie 和不缓存头。

    Returns:
        公开会话资料。正文不含原令牌。
    """
    mark_private(response)
    settings: Settings = request.app.state.settings
    enforce_write_guard(request, settings, CsrfSource.NONE)
    result = auth_service_for(request).login(payload.data)
    set_token_cookie(
        response,
        name=AUTH_COOKIE,
        value=result.raw_token,
        max_age=settings.session_ttl_hours * 3600,
        secure=settings.cookie_secure,
    )
    return success_body(request, result.session)


@router.post(
    "/logout",
    response_model=ResponseModel[None],
    responses=error_response_declarations(),
)
def logout(
    payload: RequestModel[EmptyRequestData],
    request: Request,
    response: Response,
) -> ResponseModel[None]:
    """注销账户会话并清除账户 Cookie。有效会话必须携带账户 CSRF。

    会话已失效时不再要求旧 CSRF，避免无法退出。访客 Cookie 保持不变。

    Args:
        payload: 空的统一请求外壳。
        request: 当前 HTTP 请求。
        response: 用于清除 Cookie 和不缓存头。

    Returns:
        HTTP 200，data 为 null。
    """
    mark_private(response)
    settings: Settings = request.app.state.settings
    service = auth_service_for(request)
    raw_token = request.cookies.get(AUTH_COOKIE)
    active: SessionContext | None = service.active_session(raw_token)
    if active is None:
        enforce_write_guard(request, settings, CsrfSource.NONE)
    else:
        enforce_write_guard(request, settings, CsrfSource.AUTH, auth_csrf=active.csrf_token)
    service.logout(raw_token)
    clear_token_cookie(response, name=AUTH_COOKIE, secure=settings.cookie_secure)
    return success_body(request, None)
