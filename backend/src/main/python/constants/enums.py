"""投票领域枚举。

取值与编码基线一致，供后续数据表和接口复用。
"""

from enum import StrEnum


class UserRole(StrEnum):
    """账户角色。"""

    USER = "USER"
    ADMIN = "ADMIN"


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
