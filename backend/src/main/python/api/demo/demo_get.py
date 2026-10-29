"""登录后的固定示例目录。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.algorithms.demo_module.demo_catalog_service import DemoListFilters
from src.main.python.api.dependencies import (
    demo_catalog_service_for,
    demo_list_filters,
    require_user,
)
from src.main.python.fileds.context import Principal
from src.main.python.fileds.response.demo_response import DemoPollSummary
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["demo-polls"])


@router.get(
    "/demo-polls",
    response_model=ResponseModel[Page[DemoPollSummary]],
    responses=error_response_declarations(),
)
def list_demo_polls(
    request: Request,
    response: Response,
    filters: DemoListFilters = Depends(demo_list_filters),
    _principal: Principal = Depends(require_user),
) -> ResponseModel[Page[DemoPollSummary]]:
    """列出登记过的固定示例。

    Args:
        request: 当前 HTTP 请求。
        response: 目录响应禁止缓存。
        filters: 分页和搜索。
        _principal: 已登录身份。参数只用于要求登录。

    Returns:
        示例摘要页。开关关闭时为空页。
    """
    mark_private(response)
    return success_body(request, demo_catalog_service_for(request).list_registered(filters))
