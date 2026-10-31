"""add election b2 tables and polls activity_type

Revision ID: b2e1ec710001
Revises: e7c4a91b2d58
Create Date: 2026-10-31 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b2e1ec710001"
down_revision: str | Sequence[str] | None = "e7c4a91b2d58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. polls.activity_type 隔离列与回填
    op.add_column("polls", sa.Column("activity_type", sa.String(length=16), nullable=True))
    op.execute("UPDATE polls SET activity_type = 'POLL' WHERE activity_type IS NULL")
    op.alter_column("polls", "activity_type", nullable=False, server_default="POLL")
    op.create_check_constraint(
        "ck_polls_activity_type", "polls", "activity_type IN ('POLL', 'ELECTION')"
    )
    op.create_index(
        "ix_polls_activity_lifecycle_starts",
        "polls",
        ["activity_type", "lifecycle", "starts_at"],
    )

    # 2. 扩展 audit_events 检查约束，加入 FREEZE_ROSTER
    op.drop_constraint("ck_audit_events_action", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_action",
        "audit_events",
        "action IN ('CREATE', 'UPDATE', 'PUBLISH', 'CLOSE', 'VOTE_NAMED', 'FREEZE_ROSTER')",
    )

    # 3. election_configs
    op.create_table(
        "election_configs",
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("registration_starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("registration_ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("roster_frozen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("eligible_voter_count", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("poll_id", name="pk_election_configs"),
        sa.ForeignKeyConstraint(
            ["poll_id"],
            ["polls.id"],
            name="fk_election_configs_poll_id_polls",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "registration_starts_at < registration_ends_at",
            name="ck_election_configs_reg_window",
        ),
        sa.CheckConstraint(
            "(roster_frozen_at IS NULL AND eligible_voter_count IS NULL) OR "
            "(roster_frozen_at IS NOT NULL AND eligible_voter_count IS NOT NULL AND eligible_voter_count >= 0)",
            name="ck_election_configs_freeze",
        ),
    )

    # 4. election_candidates
    op.create_table(
        "election_candidates",
        sa.Column("poll_option_id", sa.Integer(), nullable=False),
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("candidate_code", sa.String(length=32), nullable=False),
        sa.Column("statement", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("poll_option_id", name="pk_election_candidates"),
        sa.ForeignKeyConstraint(
            ["poll_id", "poll_option_id"],
            ["poll_options.poll_id", "poll_options.id"],
            name="fk_election_candidates_option_poll",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("poll_id", "poll_option_id", name="uq_election_candidates_poll_option"),
        sa.UniqueConstraint("poll_id", "candidate_code", name="uq_election_candidates_poll_code"),
    )

    # 5. voter_identities
    op.create_table(
        "voter_identities",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column("issuer", sa.String(length=120), nullable=False),
        sa.Column("document_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("document_suffix", sa.String(length=8), nullable=False),
        sa.Column("fingerprint_key_version", sa.SmallInteger(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_voter_identities"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_voter_identities_user_id_users",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "document_type", "issuer", "document_fingerprint", name="uq_voter_identities_fingerprint"
        ),
        sa.UniqueConstraint("user_id", "version", name="uq_voter_identities_user_version"),
        sa.UniqueConstraint("user_id", "id", name="uq_voter_identities_user_id"),
        sa.CheckConstraint(
            "document_type IN ('RESIDENT_ID', 'HK_MACAU_PERMIT', 'STUDENT_ID')",
            name="ck_voter_identities_doc_type",
        ),
        sa.CheckConstraint("version >= 1", name="ck_voter_identities_version"),
    )

    # 6. election_registrations
    op.create_table(
        "election_registrations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("identity_id", sa.BigInteger(), nullable=False),
        sa.Column("legal_name_snapshot", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="PENDING", nullable=False),
        sa.Column("model_score", sa.SmallInteger(), nullable=True),
        sa.Column("model_reason_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("model_version", sa.String(length=64), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_election_registrations"),
        sa.ForeignKeyConstraint(
            ["poll_id"],
            ["polls.id"],
            name="fk_election_registrations_poll_id_polls",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_election_registrations_user_id_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "identity_id"],
            ["voter_identities.user_id", "voter_identities.id"],
            name="fk_election_registrations_user_identity",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"],
            ["users.id"],
            name="fk_election_registrations_reviewed_by_users",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("poll_id", "user_id", name="uq_election_registrations_poll_user"),
        sa.UniqueConstraint("poll_id", "id", name="uq_election_registrations_poll_id"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED')",
            name="ck_election_registrations_status",
        ),
        sa.CheckConstraint(
            "(model_score IS NULL) OR (model_score >= 0 AND model_score <= 100)",
            name="ck_election_registrations_score",
        ),
        sa.CheckConstraint(
            "((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))",
            name="ck_election_registrations_review_meta",
        ),
    )
    op.create_index(
        "ix_election_registrations_poll_status_sub",
        "election_registrations",
        ["poll_id", "status", "submitted_at"],
    )

    # 7. eligibility_review_events
    op.create_table(
        "eligibility_review_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("registration_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_type", sa.String(length=16), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("from_status", sa.String(length=24), nullable=True),
        sa.Column("to_status", sa.String(length=24), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=True),
        sa.Column("reason_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=True),
        sa.Column("review_note", sa.String(length=500), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_eligibility_review_events"),
        sa.ForeignKeyConstraint(
            ["registration_id"],
            ["election_registrations.id"],
            name="fk_eligibility_review_events_reg_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name="fk_eligibility_review_events_actor_id_users",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "actor_type IN ('MODEL', 'ADMIN', 'SYSTEM')",
            name="ck_eligibility_review_events_actor_type",
        ),
        sa.CheckConstraint(
            "to_status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED')",
            name="ck_eligibility_review_events_to_status",
        ),
        sa.CheckConstraint(
            "((actor_type = 'ADMIN' AND actor_id IS NOT NULL) OR (actor_type IN ('MODEL', 'SYSTEM') AND actor_id IS NULL))",
            name="ck_eligibility_review_events_actor",
        ),
        sa.CheckConstraint(
            "(score IS NULL) OR (score >= 0 AND score <= 100)",
            name="ck_eligibility_review_events_score",
        ),
    )
    op.create_index(
        "ix_eligibility_review_events_reg_created",
        "eligibility_review_events",
        ["registration_id", "created_at"],
    )

    # 8. election_voter_credentials
    op.create_table(
        "election_voter_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("registration_id", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="ISSUED", nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_election_voter_credentials"),
        sa.ForeignKeyConstraint(
            ["poll_id", "registration_id"],
            ["election_registrations.poll_id", "election_registrations.id"],
            name="fk_election_voter_credentials_reg",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "poll_id", "registration_id", name="uq_election_voter_credentials_poll_reg"
        ),
        sa.CheckConstraint(
            "status IN ('ISSUED', 'CONSUMED')", name="ck_election_credentials_status_val"
        ),
        sa.CheckConstraint(
            "(status = 'ISSUED' AND consumed_at IS NULL) OR (status = 'CONSUMED' AND consumed_at IS NOT NULL)",
            name="ck_election_credentials_status",
        ),
    )
    op.create_index(
        "ix_election_voter_credentials_poll_status",
        "election_voter_credentials",
        ["poll_id", "status"],
    )

    # 9. election_ballots
    op.create_table(
        "election_ballots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("poll_id", sa.Integer(), nullable=False),
        sa.Column("candidate_option_id", sa.Integer(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_election_ballots"),
        sa.UniqueConstraint("receipt_id", name="uq_election_ballots_receipt_id"),
        sa.ForeignKeyConstraint(
            ["poll_id", "candidate_option_id"],
            ["election_candidates.poll_id", "election_candidates.poll_option_id"],
            name="fk_election_ballots_candidate",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_election_ballots_poll_submitted",
        "election_ballots",
        ["poll_id", "submitted_at"],
    )
    op.create_index(
        "ix_election_ballots_poll_candidate",
        "election_ballots",
        ["poll_id", "candidate_option_id"],
    )


def downgrade() -> None:
    # 逆序删除表和修改
    op.drop_table("election_ballots")
    op.drop_table("election_voter_credentials")
    op.drop_table("eligibility_review_events")
    op.drop_table("election_registrations")
    op.drop_table("voter_identities")
    op.drop_table("election_candidates")
    op.drop_table("election_configs")

    op.drop_constraint("ck_audit_events_action", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_action",
        "audit_events",
        "action IN ('CREATE', 'UPDATE', 'PUBLISH', 'CLOSE', 'VOTE_NAMED')",
    )

    op.drop_index("ix_polls_activity_lifecycle_starts", table_name="polls")
    op.drop_constraint("ck_polls_activity_type", "polls", type_="check")
    op.drop_column("polls", "activity_type")
