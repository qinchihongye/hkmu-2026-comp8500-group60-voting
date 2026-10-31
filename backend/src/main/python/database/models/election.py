"""选举领域数据模型（B2 架构：身份与选票彻底分离）。

选民身份认证与凭据链条在 election_voter_credentials 处终止；
匿名选票从 election_ballots 独立开始，绝对禁止保存 user_id, registration_id,
credential_id, IP 或 User-Agent 等任何可回溯到具体选民的字段。
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class ElectionConfig(Base):
    """选举场次配置。包含登记起止时间、名册冻结时间与合资格人数。

    Attributes:
        poll_id: 关联 polls.id 主键。
        registration_starts_at: 登记开始时间（UTC）。
        registration_ends_at: 登记截止时间（UTC）。
        roster_frozen_at: 管理员显式冻结名册时间（UTC）。冻结前为空。
        eligible_voter_count: 冻结时写入的合资格选民总数。冻结后不可变。
        created_at: 创建时间。
        updated_at: 更新时间。
    """

    __tablename__ = "election_configs"
    __table_args__ = (
        CheckConstraint(
            "registration_starts_at < registration_ends_at",
            name="ck_election_configs_reg_window",
        ),
        CheckConstraint(
            "(roster_frozen_at IS NULL AND eligible_voter_count IS NULL) OR "
            "(roster_frozen_at IS NOT NULL AND eligible_voter_count IS NOT NULL "
            "AND eligible_voter_count >= 0)",
            name="ck_election_configs_freeze",
        ),
    )

    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", name="fk_election_configs_poll_id_polls", ondelete="RESTRICT"),
        primary_key=True,
    )
    registration_starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    registration_ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    roster_frozen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    eligible_voter_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ElectionCandidate(Base):
    """选举候选人拓展表。一对一扩展 poll_options。

    Attributes:
        poll_option_id: 对应 poll_options.id 主键。
        poll_id: 所在选举 ID，供组合外键与防越界引用。
        candidate_code: 同一选举内唯一的候选人代号/编号。
        statement: 候选人竞选宣言或简要介绍。
        created_at: 创建时间。
    """

    __tablename__ = "election_candidates"
    __table_args__ = (
        ForeignKeyConstraint(
            ["poll_id", "poll_option_id"],
            ["poll_options.poll_id", "poll_options.id"],
            name="fk_election_candidates_option_poll",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("poll_id", "poll_option_id", name="uq_election_candidates_poll_option"),
        UniqueConstraint("poll_id", "candidate_code", name="uq_election_candidates_poll_code"),
    )

    poll_option_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(Integer, nullable=False)
    candidate_code: Mapped[str] = mapped_column(String(32), nullable=False)
    statement: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class VoterIdentity(Base):
    """选民证件不可变历史版本。

    Attributes:
        id: 自增主键。
        user_id: 归属账户。
        version: 该账户内版本号（从 1 递增）。
        document_type: RESIDENT_ID, HK_MACAU_PERMIT, STUDENT_ID。
        issuer: 签发机构/学校名。
        document_fingerprint: HMAC-SHA-256 十六进制摘要，不存明文证件号。
        document_suffix: 仅供前端脱敏显示（如尾号 4 位）。
        fingerprint_key_version: 密钥版本。
        created_at: 创建时间。
        updated_at: 更新时间。
    """

    __tablename__ = "voter_identities"
    __table_args__ = (
        UniqueConstraint(
            "document_type",
            "issuer",
            "document_fingerprint",
            name="uq_voter_identities_fingerprint",
        ),
        UniqueConstraint("user_id", "version", name="uq_voter_identities_user_version"),
        UniqueConstraint("user_id", "id", name="uq_voter_identities_user_id"),
        CheckConstraint(
            "document_type IN ('RESIDENT_ID', 'HK_MACAU_PERMIT', 'STUDENT_ID')",
            name="ck_voter_identities_doc_type",
        ),
        CheckConstraint("version >= 1", name="ck_voter_identities_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", name="fk_voter_identities_user_id_users", ondelete="RESTRICT"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    document_type: Mapped[str] = mapped_column(String(32), nullable=False)
    issuer: Mapped[str] = mapped_column(String(120), nullable=False)
    document_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    document_suffix: Mapped[str] = mapped_column(String(8), nullable=False)
    fingerprint_key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ElectionRegistration(Base):
    """选民选举登记记录。

    Attributes:
        id: 自增主键。
        poll_id: 选举 ID。
        user_id: 账户 ID。
        identity_id: 支撑该登记的身份快照 ID。
        legal_name_snapshot: 本次登记法定姓名快照。
        status: PENDING, NEEDS_REVIEW, APPROVED, REJECTED。
        model_score: 伪模型打分（0-100）。
        model_reason_codes: 伪模型受控原因码。
        model_version: 模型版本标识。
        reviewed_by: 人工复核管理员账户。
        reviewed_at: 人工复核时间。
        submitted_at: 登记提交时间。
        updated_at: 状态更新时间。
    """

    __tablename__ = "election_registrations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "identity_id"],
            ["voter_identities.user_id", "voter_identities.id"],
            name="fk_election_registrations_user_identity",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("poll_id", "user_id", name="uq_election_registrations_poll_user"),
        UniqueConstraint("poll_id", "id", name="uq_election_registrations_poll_id"),
        CheckConstraint(
            "status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED')",
            name="ck_election_registrations_status",
        ),
        CheckConstraint(
            "(model_score IS NULL) OR (model_score >= 0 AND model_score <= 100)",
            name="ck_election_registrations_score",
        ),
        CheckConstraint(
            "((reviewed_by IS NULL AND reviewed_at IS NULL) OR "
            "(reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))",
            name="ck_election_registrations_review_meta",
        ),
        Index("ix_election_registrations_poll_status_sub", "poll_id", "status", "submitted_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", name="fk_election_registrations_poll_id_polls", ondelete="RESTRICT"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", name="fk_election_registrations_user_id_users", ondelete="RESTRICT"),
        nullable=False,
    )
    identity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    legal_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="PENDING", server_default="PENDING"
    )
    model_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    model_reason_codes: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_election_registrations_reviewed_by_users",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EligibilityReviewEvent(Base):
    """资格审核历史事件表（只追加不更新）。

    Attributes:
        id: 自增主键。
        registration_id: 关联登记 ID。
        actor_type: MODEL, ADMIN, SYSTEM。
        actor_id: 管理员账户 ID（ADMIN 时必填，其余为空）。
        from_status: 原状态。
        to_status: 新状态。
        score: 打分。
        reason_codes: 原因码数组。
        model_version: 模型版本。
        review_note: 审核短备注（严禁记录完整证件号）。
        request_id: 跟踪请求 ID。
        created_at: 记录时间。
    """

    __tablename__ = "eligibility_review_events"
    __table_args__ = (
        CheckConstraint(
            "actor_type IN ('MODEL', 'ADMIN', 'SYSTEM')",
            name="ck_eligibility_review_events_actor_type",
        ),
        CheckConstraint(
            "to_status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED')",
            name="ck_eligibility_review_events_to_status",
        ),
        CheckConstraint(
            "((actor_type = 'ADMIN' AND actor_id IS NOT NULL) OR "
            "(actor_type IN ('MODEL', 'SYSTEM') AND actor_id IS NULL))",
            name="ck_eligibility_review_events_actor",
        ),
        CheckConstraint(
            "(score IS NULL) OR (score >= 0 AND score <= 100)",
            name="ck_eligibility_review_events_score",
        ),
        Index("ix_eligibility_review_events_reg_created", "registration_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registration_id: Mapped[int] = mapped_column(
        ForeignKey(
            "election_registrations.id",
            name="fk_eligibility_review_events_reg_id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    actor_type: Mapped[str] = mapped_column(String(16), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_eligibility_review_events_actor_id_users",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )
    from_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    reason_codes: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ElectionVoterCredential(Base):
    """一次性内部投票资格凭证。

    在名册冻结时批量为 APPROVED 选民签发。
    状态仅支持 ISSUED -> CONSUMED 单向流转。

    Attributes:
        id: 一次性凭证 UUID（不返回给选民，不写入 election_ballots）。
        poll_id: 选举 ID。
        registration_id: 登记记录 ID。
        status: ISSUED 或 CONSUMED。
        issued_at: 签发时间。
        consumed_at: 消费时间。
    """

    __tablename__ = "election_voter_credentials"
    __table_args__ = (
        ForeignKeyConstraint(
            ["poll_id", "registration_id"],
            ["election_registrations.poll_id", "election_registrations.id"],
            name="fk_election_voter_credentials_reg",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "poll_id", "registration_id", name="uq_election_voter_credentials_poll_reg"
        ),
        CheckConstraint(
            "status IN ('ISSUED', 'CONSUMED')", name="ck_election_credentials_status_val"
        ),
        CheckConstraint(
            "(status = 'ISSUED' AND consumed_at IS NULL) OR "
            "(status = 'CONSUMED' AND consumed_at IS NOT NULL)",
            name="ck_election_credentials_status",
        ),
        Index("ix_election_voter_credentials_poll_status", "poll_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    poll_id: Mapped[int] = mapped_column(Integer, nullable=False)
    registration_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="ISSUED", server_default="ISSUED"
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ElectionBallot(Base):
    """匿名选举票主表（B2 架构：严禁记录选民身份、登记、凭证或网络追踪特征）。

    直接保存 candidate_option_id，保证每票恰好选择一名合法候选人。

    Attributes:
        id: 自增选票流水主键。
        receipt_id: 交付选民的防篡改 UUID 回执。
        poll_id: 选举 ID。
        candidate_option_id: 所选候选人选项 ID。
        submitted_at: 投票提交时间。
    """

    __tablename__ = "election_ballots"
    __table_args__ = (
        ForeignKeyConstraint(
            ["poll_id", "candidate_option_id"],
            ["election_candidates.poll_id", "election_candidates.poll_option_id"],
            name="fk_election_ballots_candidate",
            ondelete="RESTRICT",
        ),
        Index("ix_election_ballots_poll_submitted", "poll_id", "submitted_at"),
        Index("ix_election_ballots_poll_candidate", "poll_id", "candidate_option_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    receipt_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, unique=True)
    poll_id: Mapped[int] = mapped_column(Integer, nullable=False)
    candidate_option_id: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
