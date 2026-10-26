"""账户会话表。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class AuthSession(Base):
    """登录会话。数据库只保存 token 散列，CSRF 值不是登录凭据。

    Attributes:
        id: 数据库生成的主键。
        user_id: 所属账户。
        token_hash: 会话 token 的 SHA-256 散列。
        csrf_token: 本会话的写请求校验值。
        created_at: 创建时间，UTC。
        expires_at: 到期时间，UTC。
    """

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_expires_at", "expires_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", name="fk_auth_sessions_user_id_users", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    csrf_token: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
