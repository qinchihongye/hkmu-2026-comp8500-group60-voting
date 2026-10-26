"""读取一场投票的汇总。GET 不要求 CSRF。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.algorithms.result_module.result_service import ResultService
from src.main.python.api.dependencies import get_poll_access_context
from src.main.python.fileds.context import PollAccessContext
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.fileds.response.vote_response import PollResults
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["results"])


def _result_service(request: Request) -> ResultService:
    """按当前应用状态构造汇总服务。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        使用本进程时钟的服务。
    """
    return ResultService(request.app.state.session_factory, request.app.state.clock)


@router.get(
    "/polls/{poll_id}/results",
    response_model=ResponseModel[PollResults],
    responses=error_response_declarations(),
)
def get_results(
    poll_id: int,
    request: Request,
    response: Response,
    context: PollAccessContext = Depends(get_poll_access_context),
) -> ResponseModel[PollResults]:
    """按身份返回汇总。进行中的最高项不是最终胜出者。

    Args:
        poll_id: 投票主键。
        request: 当前 HTTP 请求。
        response: 禁止缓存和引荐。
        context: 当前账户和浏览器凭据。

    Returns:
        含零票项的汇总。
    """
    mark_private(response)
    mark_no_referrer(response)
    return success_body(request, _result_service(request).get_results(context, poll_id))
