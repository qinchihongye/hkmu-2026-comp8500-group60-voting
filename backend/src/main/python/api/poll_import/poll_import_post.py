"""识别投票文字。只返回可填表的字段，不创建投票。"""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import poll_text_parse_service_for, require_auth_csrf
from src.main.python.config.server_config import poll_text_parse_configured
from src.main.python.constants.error_codes import ApiCode
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.poll_import_request import PollTextParseRequest
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.poll_import_response import PollTextParseResult
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import AppError, error_response_declarations
from src.main.python.utils.poll_parse_limit_util import call_with_poll_parse_limit
from src.main.python.utils.response_util import request_id_of, success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(prefix="/poll-import", tags=["poll-import"])


@router.post(
    "/parse",
    response_model=ResponseModel[PollTextParseResult],
    responses=error_response_declarations(),
)
async def parse_poll_text(
    payload: RequestModel[PollTextParseRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[PollTextParseResult]:
    """识别当前账户提交的投票文字。

    身份查询在进入这里之前已经结束。等待模型期间不再持有数据库事务。

    Args:
        payload: 统一请求外壳。
        request: 当前 HTTP 请求。
        response: 用于设置不缓存头。
        principal: 已核对 CSRF 的账户。

    Returns:
        HTTP 200 的候选字段。

    Raises:
        AppError: 功能关闭、超过限额、上游不可用、超时或输出无法使用。
    """
    mark_private(response)
    if not poll_text_parse_configured(request.app.state.settings):
        raise AppError(
            503,
            ApiCode.POLL_PARSE_DISABLED,
            ApiCode.POLL_PARSE_DISABLED.default_message,
            headers={"Cache-Control": "no-store"},
        )
    service = poll_text_parse_service_for(request)

    async def recognize() -> PollTextParseResult:
        """调用已经准备好的识别服务。

        Returns:
            候选字段和问题码。
        """
        return await service.parse(payload.data.text, request_id=request_id_of(request))

    result = await call_with_poll_parse_limit(
        request.app.state.poll_parse_limiter,
        principal.user_id,
        request.app.state.clock.now(),
        recognize,
    )
    return success_body(request, result)
