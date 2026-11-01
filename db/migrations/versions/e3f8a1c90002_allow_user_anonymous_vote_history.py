"""allow user anonymous vote history and index

Revision ID: e3f8a1c90002
Revises: b2e1ec710001
Create Date: 2026-11-01 13:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e3f8a1c90002"
down_revision: str | Sequence[str] | None = "b2e1ec710001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_CHECK = (
    "(identity_mode = 'NAMED' AND voter_id IS NOT NULL AND anonymous_voter_hash IS NULL) "
    "OR (identity_mode = 'ANONYMOUS' AND voter_id IS NULL AND anonymous_voter_hash IS NOT NULL)"
)
_NEW_CHECK = (
    "(identity_mode = 'NAMED' AND voter_id IS NOT NULL AND anonymous_voter_hash IS NULL) "
    "OR (identity_mode = 'ANONYMOUS' AND anonymous_voter_hash IS NOT NULL)"
)


def upgrade() -> None:
    op.drop_constraint("ck_votes_identity", "votes", type_="check")
    op.create_check_constraint("ck_votes_identity", "votes", _NEW_CHECK)
    op.create_index(
        "uq_votes_anon_poll_voter",
        "votes",
        ["poll_id", "voter_id"],
        unique=True,
        postgresql_where=sa.text("identity_mode = 'ANONYMOUS' AND voter_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_votes_anon_poll_voter",
        table_name="votes",
        postgresql_where=sa.text("identity_mode = 'ANONYMOUS' AND voter_id IS NOT NULL"),
    )
    op.drop_constraint("ck_votes_identity", "votes", type_="check")
    op.create_check_constraint("ck_votes_identity", "votes", _OLD_CHECK)

