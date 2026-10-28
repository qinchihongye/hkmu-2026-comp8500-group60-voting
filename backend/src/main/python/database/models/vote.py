"""选票表。记名和匿名使用不同的唯一约束。"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from src.main.python.database.models.vote_selection import VoteSelection

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.main.python.database.models.base import Base


class Vote(Base):
    """一张已提交的选票。

    匿名票的 voter_id 必须为空，也不保存访客编号、IP 或 User-Agent。
    选中的选项记在明细里，不记在这张父票上。

    Attributes:
        id: 数据库生成的主键。
        receipt_id: 对外回执。
        poll_id: 所属投票。
        identity_mode: 必须与所属投票的记名方式一致。
        voter_id: 记名投票的账户。匿名投票为空。
        anonymous_voter_hash: 本场浏览器凭据散列。记名投票为空。
        submitted_at: 提交时间，UTC。
        selections: 这次提交选中的选项明细。
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
        UniqueConstraint("poll_id", "id", name="uq_votes_poll_id_id"),
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
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    selections: Mapped[list["VoteSelection"]] = relationship(
        "VoteSelection",
        back_populates="vote",
        cascade="all, delete-orphan",
        foreign_keys="[VoteSelection.poll_id, VoteSelection.vote_id]",
    )
