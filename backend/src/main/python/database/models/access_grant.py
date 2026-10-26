"""私密投票的短期访问授权。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class PollAccessGrant(Base):
    """授权一个浏览器访问一场私密投票。

    Attributes:
        id: 数据库生成的主键。
        poll_id: 被授权的投票。
        guest_session_id: 被授权的浏览器凭据。
        expires_at: 授权到期时间，UTC。
    """

    __tablename__ = "poll_access_grants"
    __table_args__ = (
        UniqueConstraint("poll_id", "guest_session_id", name="uq_poll_access_grants_poll_guest"),
        Index("ix_poll_access_grants_guest_session_id", "guest_session_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", name="fk_poll_access_grants_poll_id_polls", ondelete="RESTRICT"),
        nullable=False,
    )
    guest_session_id: Mapped[int] = mapped_column(
        ForeignKey(
            "guest_sessions.id",
            name="fk_poll_access_grants_guest_session_id_guest_sessions",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
