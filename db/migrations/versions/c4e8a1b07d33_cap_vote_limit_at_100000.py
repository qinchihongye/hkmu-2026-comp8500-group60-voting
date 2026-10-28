"""cap vote limit at 100000

Revision ID: c4e8a1b07d33
Revises: 6154e827a884
Create Date: 2026-10-28 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c4e8a1b07d33"
down_revision: Union[str, Sequence[str], None] = "6154e827a884"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VOTE_LIMIT_CHECK = "vote_limit IS NULL OR (vote_limit >= 1 AND vote_limit <= 100000)"
_PREVIOUS_VOTE_LIMIT_CHECK = "vote_limit IS NULL OR (vote_limit >= 1 AND vote_limit <= 2147483647)"


def upgrade() -> None:
    """把选票份数上限收紧为 1 到 100000。"""
    op.drop_constraint("ck_polls_vote_limit", "polls", type_="check")
    op.create_check_constraint("ck_polls_vote_limit", "polls", _VOTE_LIMIT_CHECK)


def downgrade() -> None:
    """恢复选票份数上限到 2147483647。"""
    op.drop_constraint("ck_polls_vote_limit", "polls", type_="check")
    op.create_check_constraint("ck_polls_vote_limit", "polls", _PREVIOUS_VOTE_LIMIT_CHECK)
