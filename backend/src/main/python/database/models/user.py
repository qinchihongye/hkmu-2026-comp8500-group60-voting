"""账户表。"""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class User(Base):
    """注册账户。只保存密码散列，不保存明文。

    Attributes:
        id: 数据库生成的主键。
        username: 小写规范化后的唯一用户名。
        display_name: 显示名。
        password_hash: 密码散列。
        role: USER 或 ADMIN。
        is_active: 停用后不能继续通过鉴权。
        created_at: 创建时间，UTC。
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('USER', 'ADMIN')", name="ck_users_role"),
        CheckConstraint("username ~ '^[a-z0-9_]{3,32}$'", name="ck_users_username"),
        CheckConstraint("char_length(display_name) BETWEEN 1 AND 50", name="ck_users_display_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
