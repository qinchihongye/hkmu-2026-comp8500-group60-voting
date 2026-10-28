"""add vote limit and multi selection

Revision ID: 6154e827a884
Revises: f3b8a1c04e27
Create Date: 2026-10-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6154e827a884"
down_revision: Union[str, Sequence[str], None] = "f3b8a1c04e27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VOTE_LIMIT_CHECK = "vote_limit IS NULL OR (vote_limit >= 1 AND vote_limit <= 2147483647)"
_SELECTION_MODE_CHECK = "selection_mode IN ('SINGLE', 'MULTIPLE')"


def upgrade() -> None:
    """增加选票上限、选择模式和选择明细，并搬移旧的单选结果。"""
    op.add_column("polls", sa.Column("vote_limit", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_polls_vote_limit", "polls", _VOTE_LIMIT_CHECK)
    op.add_column(
        "polls",
        sa.Column("selection_mode", sa.String(length=16), nullable=False, server_default="SINGLE"),
    )
    op.create_check_constraint("ck_polls_selection_mode", "polls", _SELECTION_MODE_CHECK)
    op.create_unique_constraint("uq_votes_poll_id_id", "votes", ["poll_id", "id"])
    op.create_table(
        "vote_selections",
        sa.Column("vote_id", sa.Integer(), nullable=False),
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("option_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["poll_id", "vote_id"],
            ["votes.poll_id", "votes.id"],
            name="fk_vote_selections_vote",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["poll_id", "option_id"],
            ["poll_options.poll_id", "poll_options.id"],
            name="fk_vote_selections_option",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("vote_id", "option_id", name="vote_selections_pkey"),
    )
    op.create_index(
        "ix_vote_selections_poll_option",
        "vote_selections",
        ["poll_id", "option_id"],
        unique=False,
    )
    op.execute(
        """
        INSERT INTO vote_selections (vote_id, poll_id, option_id)
        SELECT id, poll_id, option_id FROM votes
        """
    )
    if _backfill_mismatch():
        raise RuntimeError("Vote selection backfill does not match existing ballots.")
    op.drop_constraint("fk_votes_poll_option", "votes", type_="foreignkey")
    op.drop_index("ix_votes_option_id", table_name="votes")
    op.drop_column("votes", "option_id")


def downgrade() -> None:
    """在数据仍是单选且没有上限时，把明细搬回旧列。"""
    if _downgrade_unsafe():
        raise RuntimeError(
            "Refusing downgrade: every poll must be SINGLE with no vote limit, "
            "and every ballot must have exactly one selection."
        )
    op.add_column("votes", sa.Column("option_id", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE votes
        SET option_id = (
            SELECT option_id FROM vote_selections WHERE vote_selections.vote_id = votes.id
        )
        """
    )
    op.alter_column("votes", "option_id", nullable=False)
    op.create_foreign_key(
        "fk_votes_poll_option",
        "votes",
        "poll_options",
        ["poll_id", "option_id"],
        ["poll_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_votes_option_id", "votes", ["option_id"], unique=False)
    op.drop_index("ix_vote_selections_poll_option", table_name="vote_selections")
    op.drop_table("vote_selections")
    op.drop_constraint("uq_votes_poll_id_id", "votes", type_="unique")
    op.drop_constraint("ck_polls_vote_limit", "polls", type_="check")
    op.drop_constraint("ck_polls_selection_mode", "polls", type_="check")
    op.drop_column("polls", "vote_limit")
    op.drop_column("polls", "selection_mode")


def _backfill_mismatch() -> bool:
    """核对回填后的明细是否和旧票一一对应。

    Returns:
        明细数、每票条数或每场每选项计数有任一不一致时为 True。
    """
    row = op.get_bind().execute(
        sa.text(
            """
            SELECT
              (SELECT COUNT(*) FROM votes) <> (SELECT COUNT(*) FROM vote_selections)
              OR EXISTS (
                SELECT 1
                FROM votes AS ballot
                LEFT JOIN vote_selections AS selection ON selection.vote_id = ballot.id
                GROUP BY ballot.id
                HAVING COUNT(selection.option_id) <> 1
              )
              OR EXISTS (
                SELECT poll_id, option_id, COUNT(*)
                FROM votes
                GROUP BY poll_id, option_id
                EXCEPT
                SELECT poll_id, option_id, COUNT(*)
                FROM vote_selections
                GROUP BY poll_id, option_id
              )
              OR EXISTS (
                SELECT poll_id, option_id, COUNT(*)
                FROM vote_selections
                GROUP BY poll_id, option_id
                EXCEPT
                SELECT poll_id, option_id, COUNT(*)
                FROM votes
                GROUP BY poll_id, option_id
              )
            """
        )
    ).scalar_one()
    return bool(row)


def _downgrade_unsafe() -> bool:
    """判断当前数据能不能无损回到旧的单选列。

    Returns:
        存在多选、上限或不是恰好一条明细时为 True。
    """
    row = op.get_bind().execute(
        sa.text(
            """
            SELECT
              EXISTS (
                SELECT 1
                FROM polls
                WHERE selection_mode <> 'SINGLE' OR vote_limit IS NOT NULL
              )
              OR EXISTS (
                SELECT 1
                FROM votes AS ballot
                LEFT JOIN (
                  SELECT vote_id, COUNT(*) AS selection_count
                  FROM vote_selections
                  GROUP BY vote_id
                ) AS selection ON selection.vote_id = ballot.id
                WHERE COALESCE(selection.selection_count, 0) <> 1
              )
            """
        )
    ).scalar_one()
    return bool(row)
