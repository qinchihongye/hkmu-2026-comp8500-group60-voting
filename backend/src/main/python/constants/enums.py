"""投票领域枚举。

取值与编码基线一致，供后续数据表和接口复用。
"""

from enum import StrEnum


class UserRole(StrEnum):
    """账户角色。"""

    USER = "USER"
    ADMIN = "ADMIN"


class ActivityType(StrEnum):
    """活动类型：普通投票或选举。"""

    POLL = "POLL"
    ELECTION = "ELECTION"


class ElectionPhase(StrEnum):
    """选举对外展示的细分有效阶段。"""

    DRAFT = "DRAFT"
    REGISTRATION_SCHEDULED = "REGISTRATION_SCHEDULED"
    REGISTRATION_OPEN = "REGISTRATION_OPEN"
    REVIEWING = "REVIEWING"
    VOTING_SCHEDULED = "VOTING_SCHEDULED"
    VOTING_OPEN = "VOTING_OPEN"
    CLOSED = "CLOSED"


class DocumentType(StrEnum):
    """选民证件类型。"""

    RESIDENT_ID = "RESIDENT_ID"
    HK_MACAU_PERMIT = "HK_MACAU_PERMIT"
    STUDENT_ID = "STUDENT_ID"


class RegistrationStatus(StrEnum):
    """选民登记审核状态。"""

    PENDING = "PENDING"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CredentialStatus(StrEnum):
    """内部一次性凭证状态。"""

    ISSUED = "ISSUED"
    CONSUMED = "CONSUMED"


class ReviewActorType(StrEnum):
    """审核主体。"""

    MODEL = "MODEL"
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


class IdentityMode(StrEnum):
    """记名方式。"""

    NAMED = "NAMED"
    ANONYMOUS = "ANONYMOUS"


class Visibility(StrEnum):
    """投票公开性。"""

    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"


class SelectionMode(StrEnum):
    """一份选票的选择方式。"""

    SINGLE = "SINGLE"
    MULTIPLE = "MULTIPLE"


class PollLifecycle(StrEnum):
    """数据库中保存的投票生命周期。"""

    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class PollStatus(StrEnum):
    """接口返回的有效状态。"""

    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class AuditAction(StrEnum):
    """管理与记名操作的审计动作。"""

    CREATE = "CREATE"
    UPDATE = "UPDATE"
    PUBLISH = "PUBLISH"
    CLOSE = "CLOSE"
    VOTE_NAMED = "VOTE_NAMED"
    FREEZE_ROSTER = "FREEZE_ROSTER"
