"""add winning_threshold to election_configs

Revision ID: f4a9b2c80003
Revises: e3f8a1c90002
Create Date: 2026-11-01 18:25:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f4a9b2c80003"
down_revision: str | Sequence[str] | None = "e3f8a1c90002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "election_configs",
        sa.Column("winning_threshold", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_election_configs_winning_threshold",
        "election_configs",
        "winning_threshold IS NULL OR winning_threshold > 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_election_configs_winning_threshold", "election_configs", type_="check")
    op.drop_column("election_configs", "winning_threshold")

