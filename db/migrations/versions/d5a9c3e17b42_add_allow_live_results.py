"""add allow live results

Revision ID: d5a9c3e17b42
Revises: c4e8a1b07d33
Create Date: 2026-10-28 22:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d5a9c3e17b42"
down_revision: Union[str, Sequence[str], None] = "c4e8a1b07d33"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """给已有投票补上关闭的实时票况开关。"""
    op.add_column(
        "polls",
        sa.Column(
            "allow_live_results",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    """去掉实时票况开关。"""
    op.drop_column("polls", "allow_live_results")
