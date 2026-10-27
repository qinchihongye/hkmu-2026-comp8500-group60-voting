"""store poll access passwords as plaintext

Revision ID: f3b8a1c04e27
Revises: cdc412846524
Create Date: 2026-10-27 23:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3b8a1c04e27"
down_revision: Union[str, Sequence[str], None] = "cdc412846524"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PASSWORD_CHECK = (
    "(visibility = 'PUBLIC' AND private_password_hash IS NULL "
    "AND private_password IS NULL) OR "
    "(visibility = 'PRIVATE' AND (private_password IS NOT NULL "
    "OR private_password_hash IS NOT NULL))"
)
_LEGACY_PASSWORD_CHECK = (
    "(visibility = 'PRIVATE' AND private_password_hash IS NOT NULL) "
    "OR (visibility = 'PUBLIC' AND private_password_hash IS NULL)"
)


def upgrade() -> None:
    """增加访问密码明文列，并允许旧场次暂时只保留散列。"""
    op.add_column("polls", sa.Column("private_password", sa.Text(), nullable=True))
    op.drop_constraint("ck_polls_visibility_password", "polls", type_="check")
    op.create_check_constraint(
        "ck_polls_visibility_password",
        "polls",
        _PASSWORD_CHECK,
    )


def downgrade() -> None:
    """恢复只允许散列的约束，并去掉明文列。"""
    op.drop_constraint("ck_polls_visibility_password", "polls", type_="check")
    op.create_check_constraint(
        "ck_polls_visibility_password",
        "polls",
        _LEGACY_PASSWORD_CHECK,
    )
    op.drop_column("polls", "private_password")
