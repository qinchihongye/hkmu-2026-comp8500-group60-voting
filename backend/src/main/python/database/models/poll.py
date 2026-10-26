"""投票与选项表。"""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class Poll(Base):
    """一场投票。公开性与记名方式分开保存。

    Attributes:
        id: 数据库生成的主键。
        title: 标题。
        description: 说明，可空。
        identity_mode: NAMED 或 ANONYMOUS。
        visibility: PUBLIC 或 PRIVATE。
        private_password_hash: 私密投票的密码散列。公开投票必须为空。
        share_code: 分享定位码。草稿可为空，有值时唯一。
        lifecycle: DRAFT、PUBLISHED 或 CLOSED。
        starts_at: 开始时间，UTC。结束时间必须更晚。
        ends_at: 结束时间，UTC。
        creator_id: 创建者账户。
        version: 草稿乐观锁版本。
        closed_at: 创建者显式关闭的时间。自然结束保持为空。
        created_at: 创建时间，UTC。
        updated_at: 更新时间，UTC。
    """

    __tablename__ = "polls"
    __table_args__ = (
        # 组合外键需要 (id, identity_mode) 这个唯一目标。
        UniqueConstraint("id", "identity_mode", name="uq_polls_id_identity_mode"),
        CheckConstraint("identity_mode IN ('NAMED', 'ANONYMOUS')", name="ck_polls_identity_mode"),
        CheckConstraint("visibility IN ('PUBLIC', 'PRIVATE')", name="ck_polls_visibility"),
        CheckConstraint(
            "lifecycle IN ('DRAFT', 'PUBLISHED', 'CLOSED')",
            name="ck_polls_lifecycle",
        ),
        CheckConstraint(
            "(visibility = 'PRIVATE' AND private_password_hash IS NOT NULL) "
            "OR (visibility = 'PUBLIC' AND private_password_hash IS NULL)",
            name="ck_polls_visibility_password",
        ),
        CheckConstraint("ends_at > starts_at", name="ck_polls_time_window"),
        CheckConstraint("char_length(title) BETWEEN 1 AND 120", name="ck_polls_title"),
        CheckConstraint(
            "description IS NULL OR char_length(description) <= 2000",
            name="ck_polls_description",
        ),
        CheckConstraint("version >= 1", name="ck_polls_version"),
        Index("ix_polls_creator_id", "creator_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    identity_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    visibility: Mapped[str] = mapped_column(String(16), nullable=False)
    private_password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    share_code: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    lifecycle: Mapped[str] = mapped_column(String(16), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", name="fk_polls_creator_id_users", ondelete="RESTRICT"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PollOption(Base):
    """投票选项。同一场内的位置和文本都不能重复。

    Attributes:
        id: 数据库生成的主键。
        poll_id: 所属投票。
        label: 选项文本。
        position: 展示顺序。
    """

    __tablename__ = "poll_options"
    __table_args__ = (
        # (poll_id, id) 供选票组合外键引用，避免只按选项编号跨场引用。
        UniqueConstraint("poll_id", "id", name="uq_poll_options_poll_id_id"),
        UniqueConstraint("poll_id", "position", name="uq_poll_options_poll_id_position"),
        UniqueConstraint("poll_id", "label", name="uq_poll_options_poll_id_label"),
        CheckConstraint("char_length(label) BETWEEN 1 AND 200", name="ck_poll_options_label"),
        CheckConstraint("position >= 0", name="ck_poll_options_position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", name="fk_poll_options_poll_id_polls", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
