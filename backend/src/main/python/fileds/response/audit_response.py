"""管理员可见的审计记录。不含个人选项。"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditEventPublic(BaseModel):
    """一条去敏审计。

    Attributes:
        id: 审计主键。
        actor_id: 执行操作的账户。
        action: 管理或记名动作。
        poll_id: 相关投票。
        receipt_id: 记名回执。管理操作可为空。
        created_at: 记录时间，UTC。
        request_id: 触发这次操作的请求标识。
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    actor_id: int
    action: str
    poll_id: int
    receipt_id: UUID | None
    created_at: datetime
    request_id: str
