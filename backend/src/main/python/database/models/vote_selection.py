"""选票选择明细。一份选票可以包含多个选项。"""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKeyConstraint, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.main.python.database.models.base import Base

if TYPE_CHECKING:
    from src.main.python.database.models.vote import Vote


class VoteSelection(Base):
    """一份选票里的一个选项。

    同一张选票不能重复选择同一个选项。选项和父票必须属于同一场。

    Attributes:
        vote_id: 所属选票。
        option_id: 被选中的选项。
        poll_id: 所属投票，必须与父票和选项一致。
    """

    __tablename__ = "vote_selections"
    __table_args__ = (
        ForeignKeyConstraint(
            ["poll_id", "vote_id"],
            ["votes.poll_id", "votes.id"],
            name="fk_vote_selections_vote",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["poll_id", "option_id"],
            ["poll_options.poll_id", "poll_options.id"],
            name="fk_vote_selections_option",
            ondelete="RESTRICT",
        ),
        Index("ix_vote_selections_poll_option", "poll_id", "option_id"),
    )

    vote_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    option_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(Integer, nullable=False)
    vote: Mapped["Vote"] = relationship(
        "Vote",
        back_populates="selections",
        foreign_keys="[VoteSelection.poll_id, VoteSelection.vote_id]",
    )
