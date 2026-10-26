"""修改自己的草稿。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import poll_service_for, require_auth_csrf
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.poll_request import PollUpdate
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.poll_response import ManagePollDetail
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["polls"])


@router.patch(
    "/polls/{poll_id}",
    response_model=ResponseModel[ManagePollDetail],
    responses=error_response_declarations(),
)
def update_poll(
    poll_id: int,
    payload: RequestModel[PollUpdate],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[ManagePollDetail]:
    """替换自己的草稿。已发布内容不能改。

    Args:
        poll_id: 投票主键。
        payload: 完整草稿字段和期望版本。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已核对 CSRF 的账户。

    Returns:
        更新后的管理详情。
    """
    mark_private(response)
    detail = poll_service_for(request).update(principal, poll_id, payload.data)
    return success_body(request, detail)
