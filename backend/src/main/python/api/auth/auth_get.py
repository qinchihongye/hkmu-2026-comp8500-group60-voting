"""当前账户身份。"""

from fastapi import APIRouter, Request, Response

from src.main.python.api.dependencies import auth_service_for
from src.main.python.fileds.response.auth_response import SessionPublic
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import AUTH_COOKIE, mark_private

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get(
    "/me",
    response_model=ResponseModel[SessionPublic],
    responses=error_response_declarations(),
)
def me(request: Request, response: Response) -> ResponseModel[SessionPublic]:
    """恢复当前账户会话。不返回原令牌，也不要求 CSRF。

    Args:
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。

    Returns:
        与登录相同形状的公开会话资料。

    Raises:
        AppError: 会话缺失、过期或账户已停用。
    """
    mark_private(response)
    context = auth_service_for(request).authenticate(request.cookies.get(AUTH_COOKIE))
    session = SessionPublic(
        user=context.user,
        csrf_token=context.csrf_token,
        session_expires_at=context.expires_at,
    )
    return success_body(request, session)
