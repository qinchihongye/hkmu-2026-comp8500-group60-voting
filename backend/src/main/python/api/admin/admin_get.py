"""管理员对全部投票的只读列表和详情。"""

from fastapi import APIRouter, Depends, Query, Request, Response

from src.main.python.algorithms.audit_module.audit_service import AuditListFilters, AuditService
from src.main.python.algorithms.poll_module.poll_service import PollListFilters
from src.main.python.api.dependencies import poll_list_filters, poll_service_for, require_admin
from src.main.python.constants.enums import AuditAction
from src.main.python.fileds.context import Principal
from src.main.python.fileds.response.audit_response import AuditEventPublic
from src.main.python.fileds.response.poll_response import ManagePollDetail, ManagePollSummary
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["admin"])


@router.get(
    "/admin/polls",
    response_model=ResponseModel[Page[ManagePollSummary]],
    responses=error_response_declarations(),
)
def list_admin_polls(
    request: Request,
    response: Response,
    filters: PollListFilters = Depends(poll_list_filters),
    principal: Principal = Depends(require_admin),
) -> ResponseModel[Page[ManagePollSummary]]:
    """列出全部模式、公开性和生命周期的投票。

    Args:
        request: 当前 HTTP 请求。
        response: 禁止缓存和引荐。
        filters: 分页和筛选。
        principal: 管理员身份。

    Returns:
        管理摘要页。
    """
    mark_private(response)
    mark_no_referrer(response)
    return success_body(request, poll_service_for(request).list_admin(principal, filters))


@router.get(
    "/admin/polls/{poll_id}",
    response_model=ResponseModel[ManagePollDetail],
    responses=error_response_declarations(),
)
def get_admin_poll(
    poll_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin),
) -> ResponseModel[ManagePollDetail]:
    """读取任意投票的管理详情。不能据此修改别人的投票。

    Args:
        poll_id: 投票主键。
        request: 当前 HTTP 请求。
        response: 禁止缓存和引荐。
        principal: 管理员身份。

    Returns:
        不含密码散列的管理详情。
    """
    mark_private(response)
    mark_no_referrer(response)
    return success_body(request, poll_service_for(request).get_admin(principal, poll_id))


@router.get(
    "/admin/audit-events",
    response_model=ResponseModel[Page[AuditEventPublic]],
    responses=error_response_declarations(),
)
def list_audit_events(
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    poll_id: int | None = None,
    action: AuditAction | None = None,
) -> ResponseModel[Page[AuditEventPublic]]:
    """分页读取去敏审计。普通用户不能调用。

    Args:
        request: 当前 HTTP 请求。
        response: 禁止缓存和引荐。
        principal: 管理员身份。
        page: 页码，从 1 开始。
        page_size: 每页条数，最大 50。
        poll_id: 只看这场投票。
        action: 只看这个动作。

    Returns:
        审计页。不含个人选项。
    """
    mark_private(response)
    mark_no_referrer(response)
    filters = AuditListFilters(
        page=page,
        page_size=page_size,
        poll_id=poll_id,
        action=None if action is None else action.value,
    )
    events = AuditService().list_events(request.app.state.session_factory, principal, filters)
    return success_body(request, events)
