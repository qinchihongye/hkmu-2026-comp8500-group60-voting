"""用访客 CSRF 解锁私密投票。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import poll_access_service_for, require_guest_csrf
from src.main.python.fileds.context import GuestContext
from src.main.python.fileds.request.poll_access_request import UnlockRequest
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.poll_access_response import AccessGrantPublic
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["poll-access"])


@router.post(
    "/polls/{poll_id}/unlock",
    response_model=ResponseModel[AccessGrantPublic],
    responses=error_response_declarations(),
)
def unlock_poll(
    poll_id: int,
    payload: RequestModel[UnlockRequest],
    request: Request,
    response: Response,
    guest: GuestContext = Depends(require_guest_csrf),
) -> ResponseModel[AccessGrantPublic]:
    """核对分享码和访问密码，给当前浏览器短期授权。

    Args:
        poll_id: 投票主键。
        payload: 分享码和访问密码。
        request: 当前 HTTP 请求。
        response: 禁止缓存，并禁止引荐。
        guest: 已核对 CSRF 的访客凭据。

    Returns:
        不含密码的授权结果。
    """
    mark_private(response)
    mark_no_referrer(response)
    granted = poll_access_service_for(request).unlock(guest, poll_id, payload.data)
    return success_body(request, granted)
