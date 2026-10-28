"""查询投票文字识别是否可用。不调用模型。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import require_user
from src.main.python.config.server_config import Settings, poll_text_parse_configured
from src.main.python.fileds.context import Principal
from src.main.python.fileds.response.poll_import_response import PollImportCapabilities
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(prefix="/poll-import", tags=["poll-import"])


@router.get(
    "/capabilities",
    response_model=ResponseModel[PollImportCapabilities],
    responses=error_response_declarations(),
)
def poll_import_capabilities(
    request: Request,
    response: Response,
    principal: Principal = Depends(require_user),
) -> ResponseModel[PollImportCapabilities]:
    """返回识别能力。登录用户和管理员看到同一份结果。

    Args:
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已登录账户。只用于确认身份。

    Returns:
        是否已配置、原文长度上限和时区。
    """
    del principal
    mark_private(response)
    settings: Settings = request.app.state.settings
    data = PollImportCapabilities(enabled=poll_text_parse_configured(settings))
    return success_body(request, data)
