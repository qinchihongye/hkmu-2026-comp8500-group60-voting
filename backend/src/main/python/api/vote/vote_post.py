"""提交一票。访客 CSRF 对两种模式都必填。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.algorithms.vote_module.vote_service import VoteService
from src.main.python.api.dependencies import get_optional_principal, require_guest_csrf
from src.main.python.fileds.context import GuestContext, PollAccessContext
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.request.vote_request import VoteRequest
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.fileds.response.vote_response import VoteReceipt
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["votes"])


def _vote_service(request: Request) -> VoteService:
    """按当前应用状态构造投票服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程时钟和匿名密钥的服务。
    """
    return VoteService(
        request.app.state.session_factory,
        request.app.state.clock,
        request.app.state.settings.anon_voter_hmac_key,
    )


@router.post(
    "/polls/{poll_id}/votes",
    status_code=201,
    response_model=ResponseModel[VoteReceipt],
    responses=error_response_declarations(),
)
def cast_vote(
    poll_id: int,
    payload: RequestModel[VoteRequest],
    request: Request,
    response: Response,
    guest: GuestContext = Depends(require_guest_csrf),
) -> ResponseModel[VoteReceipt]:
    """提交当前浏览器的一份选票。记名还要有有效账户。

    Args:
        poll_id: 投票主键。
        payload: 含选项编号数组的请求外壳。
        request: 当前 HTTP 请求。
        response: 用于禁止缓存回执。
        guest: 已核对 CSRF 的访客凭据。

    Returns:
        HTTP 201 的回执。
    """
    mark_private(response)
    context = PollAccessContext(principal=get_optional_principal(request), guest=guest)
    receipt = _vote_service(request).cast_vote(context, poll_id, payload.data.option_ids)
    return success_body(request, receipt)
