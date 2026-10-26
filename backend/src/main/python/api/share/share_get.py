"""按分享码返回最低限度入口。"""

from fastapi import APIRouter, Request, Response

from src.main.python.api.dependencies import poll_access_service_for
from src.main.python.fileds.response.poll_access_response import ShareEntry
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["shares"])


@router.get(
    "/shares/{share_code}",
    response_model=ResponseModel[ShareEntry],
    responses=error_response_declarations(),
)
def resolve_share(
    share_code: str,
    request: Request,
    response: Response,
) -> ResponseModel[ShareEntry]:
    """解析已发布或已关闭投票的分享码。

    Args:
        share_code: 路径中的分享码。不写入日志正文。
        request: 当前 HTTP 请求。
        response: 禁止缓存，并禁止把分享码带到下一跳。

    Returns:
        不含标题、选项和密码的入口。
    """
    mark_private(response)
    mark_no_referrer(response)
    entry = poll_access_service_for(request).resolve_share(share_code)
    return success_body(request, entry)
