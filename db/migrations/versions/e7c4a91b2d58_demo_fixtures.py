"""demo fixtures

Revision ID: e7c4a91b2d58
Revises: d5a9c3e17b42
Create Date: 2026-10-29 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e7c4a91b2d58"
down_revision: Union[str, Sequence[str], None] = "d5a9c3e17b42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """创建固定示例和种子账户的登记表。不写入演示数据。"""
    op.create_table(
        "demo_poll_fixtures",
        sa.Column("fixture_key", sa.String(length=64), nullable=False),
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("dataset_version", sa.String(length=32), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column(
            "initialized_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["poll_id"],
            ["polls.id"],
            name="fk_demo_poll_fixtures_poll_id_polls",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("fixture_key", name="demo_poll_fixtures_pkey"),
        sa.UniqueConstraint("poll_id", name="uq_demo_poll_fixtures_poll_id"),
        sa.UniqueConstraint("display_order", name="uq_demo_poll_fixtures_display_order"),
    )
    op.create_table(
        "demo_fixture_users",
        sa.Column("fixture_key", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_demo_fixture_users_user_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("fixture_key", name="demo_fixture_users_pkey"),
        sa.UniqueConstraint("user_id", name="uq_demo_fixture_users_user_id"),
    )


def downgrade() -> None:
    """删除固定示例登记表。"""
    op.drop_table("demo_fixture_users")
    op.drop_table("demo_poll_fixtures")
