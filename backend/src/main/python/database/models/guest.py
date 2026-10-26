"""访客凭据表。不关联账户。"""

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class GuestSession(Base):
    """浏览器参与凭据。没有 user_id，不能用来识别账户。

    Attributes:
        id: 数据库生成的主键。
        token_hash: 访客 token 的散列。
        csrf_token: 本访客凭据的写请求校验值。
        created_at: 创建时间，UTC。
        expires_at: 到期时间，UTC。
    """

    __tablename__ = "guest_sessions"
    __table_args__ = (Index("ix_guest_sessions_expires_at", "expires_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    csrf_token: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
