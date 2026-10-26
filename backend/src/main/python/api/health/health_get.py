"""存活与就绪检查。"""

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.config.logger_config import get_logger
from src.main.python.constants.error_codes import ApiCode
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import AppError, error_response_declarations
from src.main.python.utils.response_util import success_body

logger = get_logger("health")
router = APIRouter(prefix="/health", tags=["health"])


class HealthStatus(BaseModel):
    """健康检查的业务数据。

    Attributes:
        status: live 表示进程存活，ready 表示数据库可查询。
    """

    model_config = ConfigDict(extra="forbid")

    status: Literal["live", "ready"]


def database_is_ready(session_factory: sessionmaker[Session]) -> bool:
    """用一条只读查询确认数据库可以连接。

    失败时只记固定说明，不把异常文本写入日志，避免连接串进入日志。

    Args:
        session_factory: 当前进程的会话工厂。

    Returns:
        数据库可执行查询时为 True。
    """
    try:
        with session_factory() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        logger.error("数据库健康检查失败")
        return False
    return True


@router.get(
    "/live",
    response_model=ResponseModel[HealthStatus],
    responses=error_response_declarations(),
)
def live(request: Request) -> ResponseModel[HealthStatus]:
    """报告进程存活。不访问数据库。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        HTTP 200 的存活结果。
    """
    return success_body(request, HealthStatus(status="live"))


@router.get(
    "/ready",
    response_model=ResponseModel[HealthStatus],
    responses=error_response_declarations(),
)
def ready(request: Request) -> ResponseModel[HealthStatus]:
    """报告数据库是否可查询。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        数据库可用时的就绪结果。

    Raises:
        AppError: 数据库不可用时抛出，HTTP 状态为 503。
    """
    session_factory = request.app.state.session_factory
    if not database_is_ready(session_factory):
        raise AppError(
            503,
            ApiCode.SERVICE_UNAVAILABLE,
            ApiCode.SERVICE_UNAVAILABLE.default_message,
            headers={"Retry-After": "5"},
        )
    return success_body(request, HealthStatus(status="ready"))
