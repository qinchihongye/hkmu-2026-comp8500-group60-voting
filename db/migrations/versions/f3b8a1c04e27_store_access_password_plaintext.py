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
    """把仅有明文的私密场次写成旧版可识别的散列，再恢复旧约束。

    已经有散列的场次保持原散列。明文和散列都空的私密场次会拒绝降级，不删除投票。
    """
    _hash_plaintext_passwords()
    op.drop_constraint("ck_polls_visibility_password", "polls", type_="check")
    op.create_check_constraint(
        "ck_polls_visibility_password",
        "polls",
        _LEGACY_PASSWORD_CHECK,
    )
    op.drop_column("polls", "private_password")


def _hash_plaintext_passwords() -> None:
    """把只有明文的私密场次写成 Argon2 散列。

    Raises:
        RuntimeError: 私密场次既没有明文，也没有散列。
    """
    from pwdlib import PasswordHash

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, private_password, private_password_hash "
            "FROM polls WHERE visibility = 'PRIVATE'"
        )
    ).mappings()
    hasher = PasswordHash.recommended()
    for row in rows:
        if row["private_password_hash"]:
            continue
        plaintext = row["private_password"]
        if not isinstance(plaintext, str) or plaintext == "":
            raise RuntimeError(
                "Refusing downgrade: a private poll has neither an access password nor a hash"
            )
        connection.execute(
            sa.text(
                "UPDATE polls SET private_password_hash = :password_hash WHERE id = :poll_id"
            ),
            {"password_hash": hasher.hash(plaintext), "poll_id": row["id"]},
        )
