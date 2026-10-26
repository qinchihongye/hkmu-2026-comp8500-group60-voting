"""创建、发布和关闭自己的投票。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import poll_service_for, require_auth_csrf
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.poll_request import PollCreate, VersionRequest
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.poll_response import ManagePollDetail
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["polls"])


@router.post(
    "/polls",
    status_code=201,
    response_model=ResponseModel[ManagePollDetail],
    responses=error_response_declarations(),
)
def create_poll(
    payload: RequestModel[PollCreate],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[ManagePollDetail]:
    """创建当前账户的草稿。创建者来自会话。

    Args:
        payload: 统一请求外壳。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已核对 CSRF 的账户。

    Returns:
        HTTP 201 的管理详情。
    """
    mark_private(response)
    detail = poll_service_for(request).create(principal, payload.data)
    return success_body(request, detail)


@router.post(
    "/polls/{poll_id}/publish",
    response_model=ResponseModel[ManagePollDetail],
    responses=error_response_declarations(),
)
def publish_poll(
    poll_id: int,
    payload: RequestModel[VersionRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[ManagePollDetail]:
    """发布自己的草稿。

    Args:
        poll_id: 投票主键。
        payload: 只含期望版本的请求外壳。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已核对 CSRF 的账户。

    Returns:
        发布后的管理详情。
    """
    mark_private(response)
    detail = poll_service_for(request).publish(
        principal, poll_id, payload.data.expected_version
    )
    return success_body(request, detail)


@router.post(
    "/polls/{poll_id}/close",
    response_model=ResponseModel[ManagePollDetail],
    responses=error_response_declarations(),
)
def close_poll(
    poll_id: int,
    payload: RequestModel[VersionRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[ManagePollDetail]:
    """显式关闭自己已发布的投票。

    Args:
        poll_id: 投票主键。
        payload: 只含期望版本的请求外壳。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已核对 CSRF 的账户。

    Returns:
        关闭后的管理详情。重复关闭返回现状。
    """
    mark_private(response)
    detail = poll_service_for(request).close(principal, poll_id, payload.data.expected_version)
    return success_body(request, detail)
