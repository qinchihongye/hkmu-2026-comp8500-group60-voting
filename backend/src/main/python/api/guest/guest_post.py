"""建立或恢复访客上下文。"""

from fastapi import APIRouter, Request, Response

from src.main.python.api.dependencies import guest_service_for
from src.main.python.config.server_config import Settings
from src.main.python.fileds.request.request import EmptyRequestData, RequestModel
from src.main.python.fileds.response.guest_response import GuestPublic
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import (
    GUEST_COOKIE,
    CsrfSource,
    enforce_write_guard,
    mark_private,
    set_token_cookie,
)

router = APIRouter(prefix="/guest", tags=["guest"])


@router.post(
    "/context",
    response_model=ResponseModel[GuestPublic],
    responses=error_response_declarations(),
)
def guest_context(
    payload: RequestModel[EmptyRequestData],
    request: Request,
    response: Response,
) -> ResponseModel[GuestPublic]:
    """初始化或恢复浏览器凭据。已有有效 Cookie 时不更换令牌。

    Args:
        payload: 空的统一请求外壳。
        request: 当前 HTTP 请求。
        response: 仅在新建凭据时写入 Cookie。

    Returns:
        访客 CSRF 和到期时间。
    """
    mark_private(response)
    settings: Settings = request.app.state.settings
    enforce_write_guard(request, settings, CsrfSource.NONE)
    result = guest_service_for(request).ensure_context(request.cookies.get(GUEST_COOKIE))
    if result.raw_token is not None:
        set_token_cookie(
            response,
            name=GUEST_COOKIE,
            value=result.raw_token,
            max_age=settings.guest_ttl_days * 86400,
            secure=settings.cookie_secure,
        )
    return success_body(request, result.guest)
