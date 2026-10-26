"""选票表。记名和匿名使用不同的唯一约束。"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class Vote(Base):
    """一张已提交的选票。

    匿名票的 voter_id 必须为空，也不保存访客编号、IP 或 User-Agent。

    Attributes:
        id: 数据库生成的主键。
        receipt_id: 对外回执。
        poll_id: 所属投票。
        identity_mode: 必须与所属投票的记名方式一致。
        voter_id: 记名投票的账户。匿名投票为空。
        anonymous_voter_hash: 本场浏览器凭据散列。记名投票为空。
        option_id: 被选中的选项，必须属于同一场。
        submitted_at: 提交时间，UTC。
    """

    __tablename__ = "votes"
    __table_args__ = (
        CheckConstraint(
            "(identity_mode = 'NAMED' AND voter_id IS NOT NULL "
            "AND anonymous_voter_hash IS NULL) "
            "OR (identity_mode = 'ANONYMOUS' AND voter_id IS NULL "
            "AND anonymous_voter_hash IS NOT NULL)",
            name="ck_votes_identity",
        ),
        ForeignKeyConstraint(
            ["poll_id", "option_id"],
            ["poll_options.poll_id", "poll_options.id"],
            name="fk_votes_poll_option",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["poll_id", "identity_mode"],
            ["polls.id", "polls.identity_mode"],
            name="fk_votes_poll_mode",
            ondelete="RESTRICT",
        ),
        Index(
            "uq_votes_named_poll_voter",
            "poll_id",
            "voter_id",
            unique=True,
            postgresql_where=text("identity_mode = 'NAMED'"),
        ),
        Index(
            "uq_votes_anon_poll_browser",
            "poll_id",
            "anonymous_voter_hash",
            unique=True,
            postgresql_where=text("identity_mode = 'ANONYMOUS'"),
        ),
        Index("ix_votes_poll_id", "poll_id"),
        Index("ix_votes_option_id", "option_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    receipt_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, unique=True)
    poll_id: Mapped[int] = mapped_column(Integer, nullable=False)
    identity_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    voter_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", name="fk_votes_voter_id_users", ondelete="RESTRICT"),
        nullable=True,
    )
    anonymous_voter_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    option_id: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
