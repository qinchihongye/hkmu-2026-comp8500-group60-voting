"""在调用方的事务里记录管理和记名事件，并供管理员分页读取。"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.config.logger_config import get_logger
from src.main.python.constants.enums import AuditAction, UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import AuditEvent
from src.main.python.fileds.context import Principal
from src.main.python.fileds.response.audit_response import AuditEventPublic
from src.main.python.fileds.response.response import Page
from src.main.python.utils.error_handlers import AppError

logger = get_logger("audit")
@dataclass(frozen=True)
class AuditListFilters:
    """管理员审计列表的分页和筛选。

    Attributes:
        page: 页码，从 1 开始。
        page_size: 每页条数。
        poll_id: 只看这场投票。为空则不限。
        action: 只看这个动作。为空则不限。
    """

    page: int
    page_size: int
    poll_id: int | None = None
    action: str | None = None


class AuditService:
    """审计写入和只读查询。写入不提交事务，也不记录匿名逐票。"""

    def record(
        self,
        session: Session,
        actor_id: int,
        action: AuditAction,
        poll_id: int,
        receipt_id: UUID | None,
        request_id: str,
        *,
        created_at: datetime | None = None,
    ) -> None:
        """向当前事务追加一条审计。

        Args:
            session: 调用方的数据库会话。
            actor_id: 执行操作的账户。
            action: 管理或记名动作。
            poll_id: 相关投票。
            receipt_id: 记名回执。管理操作传空。
            request_id: 触发这次操作的请求标识。
            created_at: 记录时间。为空时使用数据库默认时间。
        """
        event = AuditEvent(
            actor_id=actor_id,
            action=action.value,
            poll_id=poll_id,
            receipt_id=receipt_id,
            request_id=request_id[:64],
        )
        if created_at is not None:
            event.created_at = created_at
        session.add(event)

    def list_events(
        self,
        session_factory: sessionmaker[Session],
        principal: Principal,
        filters: AuditListFilters,
    ) -> Page[AuditEventPublic]:
        """分页读取审计。不返回选项或匿名散列。

        Args:
            session_factory: 数据库会话工厂。
            principal: 管理员身份。
            filters: 分页、投票和动作筛选。

        Returns:
            去敏审计页。

        Raises:
            AppError: 不是管理员，或数据库不可用。
        """
        if principal.role != UserRole.ADMIN:
            raise AppError(403, ApiCode.FORBIDDEN, ApiCode.FORBIDDEN.default_message)
        clauses = []
        if filters.poll_id is not None:
            clauses.append(AuditEvent.poll_id == filters.poll_id)
        if filters.action is not None:
            clauses.append(AuditEvent.action == filters.action)
        with session_factory() as session:
            try:
                total = session.scalar(
                    select(func.count()).select_from(AuditEvent).where(*clauses)
                )
                rows = session.scalars(
                    select(AuditEvent)
                    .where(*clauses)
                    .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
                    .offset((filters.page - 1) * filters.page_size)
                    .limit(filters.page_size)
                ).all()
                items = [_public(row) for row in rows]
            except SQLAlchemyError:
                logger.error("数据库暂时不可用")
                raise AppError(
                    503,
                    ApiCode.SERVICE_UNAVAILABLE,
                    ApiCode.SERVICE_UNAVAILABLE.default_message,
                ) from None
        return Page(
            items=items,
            page=filters.page,
            page_size=filters.page_size,
            total=int(total or 0),
        )


def _public(row: AuditEvent) -> AuditEventPublic:
    """复制一条可返回的审计。

    Args:
        row: 已加载的审计行。

    Returns:
        不含选项的公开模型。
    """
    return AuditEventPublic(
        id=row.id,
        actor_id=row.actor_id,
        action=row.action,
        poll_id=row.poll_id,
        receipt_id=row.receipt_id,
        created_at=row.created_at,
        request_id=row.request_id,
    )
