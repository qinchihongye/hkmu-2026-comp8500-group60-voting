"""广场、参与详情和创建者自己的投票。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.algorithms.poll_module.poll_service import PollListFilters
from src.main.python.api.dependencies import (
    get_poll_access_context,
    poll_access_service_for,
    poll_list_filters,
    poll_service_for,
    require_user,
)
from src.main.python.constants.enums import Visibility
from src.main.python.fileds.context import PollAccessContext, Principal
from src.main.python.fileds.response.poll_access_response import ShareLink
from src.main.python.fileds.response.poll_response import (
    ManagePollDetail,
    ManagePollSummary,
    PollDetail,
    PollSummary,
)
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["polls"])


@router.get(
    "/polls",
    response_model=ResponseModel[Page[PollSummary]],
    responses=error_response_declarations(),
)
def list_public_polls(
    request: Request,
    filters: PollListFilters = Depends(poll_list_filters),
) -> ResponseModel[Page[PollSummary]]:
    """列出公开且非草稿的投票。

    Args:
        request: 当前 HTTP 请求。
        filters: 分页、状态和标题搜索。

    Returns:
        广场摘要页。
    """
    return success_body(request, poll_service_for(request).list_public(filters))


@router.get(
    "/polls/{poll_id}",
    response_model=ResponseModel[PollDetail],
    responses=error_response_declarations(),
)
def get_visible_poll(
    poll_id: int,
    request: Request,
    response: Response,
    context: PollAccessContext = Depends(get_poll_access_context),
) -> ResponseModel[PollDetail]:
    """按当前身份读取一场可见投票。

    Args:
        poll_id: 投票主键。
        request: 当前 HTTP 请求。
        response: 私密详情禁止缓存和引荐。
        context: 账户和浏览器凭据。

    Returns:
        参与详情。
    """
    detail = poll_access_service_for(request).get_visible(context, poll_id)
    mark_private(response)
    if detail.visibility == Visibility.PRIVATE:
        mark_no_referrer(response)
    return success_body(request, detail)


@router.get(
    "/me/polls",
    response_model=ResponseModel[Page[ManagePollSummary]],
    responses=error_response_declarations(),
)
def list_my_polls(
    request: Request,
    response: Response,
    filters: PollListFilters = Depends(poll_list_filters),
    principal: Principal = Depends(require_user),
) -> ResponseModel[Page[ManagePollSummary]]:
    """列出当前账户创建的投票，包含草稿和私密场次。

    Args:
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        filters: 分页和筛选。
        principal: 已登录账户。

    Returns:
        管理摘要页。
    """
    mark_private(response)
    page = poll_service_for(request).list_owned(principal, filters)
    return success_body(request, page)


@router.get(
    "/me/polls/{poll_id}",
    response_model=ResponseModel[ManagePollDetail],
    responses=error_response_declarations(),
)
def get_my_poll(
    poll_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_user),
) -> ResponseModel[ManagePollDetail]:
    """读取自己的一场投票。

    Args:
        poll_id: 投票主键。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已登录账户。

    Returns:
        管理详情。
    """
    mark_private(response)
    return success_body(request, poll_service_for(request).get_owned(principal, poll_id))


@router.get(
    "/me/polls/{poll_id}/share",
    response_model=ResponseModel[ShareLink],
    responses=error_response_declarations(),
)
def get_my_share(
    poll_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_user),
) -> ResponseModel[ShareLink]:
    """读取自己已发布投票的分享链接。链接里没有密码，明文只在单独字段返回。

    Args:
        poll_id: 投票主键。
        request: 当前 HTTP 请求。
        response: 禁止缓存，并禁止把分享地址带到下一跳。
        principal: 已登录账户。

    Returns:
        分享信息。
    """
    mark_private(response)
    mark_no_referrer(response)
    return success_body(request, poll_service_for(request).get_share(principal, poll_id))
