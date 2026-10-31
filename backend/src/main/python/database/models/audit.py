"""管理操作与记名投票的审计表。匿名逐票不写入。"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class AuditEvent(Base):
    """一条可追踪的管理或记名操作。

    Attributes:
        id: 数据库生成的主键。
        actor_id: 执行操作的账户。
        action: CREATE、UPDATE、PUBLISH、CLOSE 或 VOTE_NAMED。
        poll_id: 相关投票。
        receipt_id: 记名选票回执。管理操作可为空。
        created_at: 记录时间，UTC。
        request_id: 触发这次操作的请求标识。
    """

    __tablename__ = "audit_events"
    __table_args__ = (
        CheckConstraint(
            "action IN ('CREATE', 'UPDATE', 'PUBLISH', 'CLOSE', 'VOTE_NAMED', 'FREEZE_ROSTER')",
            name="ck_audit_events_action",
        ),
        Index("ix_audit_events_actor_id", "actor_id"),
        Index("ix_audit_events_poll_id", "poll_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", name="fk_audit_events_actor_id_users", ondelete="RESTRICT"),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", name="fk_audit_events_poll_id_polls", ondelete="RESTRICT"),
        nullable=False,
    )
    receipt_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
