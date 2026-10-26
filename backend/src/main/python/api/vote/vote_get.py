"""读取当前账户的记名历史。GET 不要求 CSRF。"""

from fastapi import APIRouter, Depends, Query, Request, Response

from src.main.python.algorithms.vote_module.vote_service import VoteService
from src.main.python.api.dependencies import guest_service_for, require_user
from src.main.python.fileds.context import PollAccessContext, Principal
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.fileds.response.vote_response import MyVote
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import GUEST_COOKIE, mark_private

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


@router.get(
    "/me/votes",
    response_model=ResponseModel[Page[MyVote]],
    responses=error_response_declarations(),
)
def list_my_votes(
    request: Request,
    response: Response,
    principal: Principal = Depends(require_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
) -> ResponseModel[Page[MyVote]]:
    """列出当前账户可读取的记名记录。

    Args:
        request: 当前 HTTP 请求。
        response: 禁止缓存。
        principal: 已登录账户。
        page: 页码，从 1 开始。
        page_size: 每页条数，最大 50。

    Returns:
        记名历史页。匿名票和无授权的私密记录不在其中。
    """
    mark_private(response)
    guest = guest_service_for(request).authenticate(request.cookies.get(GUEST_COOKIE))
    context = PollAccessContext(principal=principal, guest=guest)
    page_data = _vote_service(request).list_my_votes(context, page, page_size)
    return success_body(request, page_data)
