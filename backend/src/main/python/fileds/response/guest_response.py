"""访客公开响应。不包含数据库编号和浏览器令牌。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class GuestPublic(BaseModel):
    """浏览器可以保存的访客上下文。

    Attributes:
        csrf_token: 后续访客写请求要带回的 CSRF。
        expires_at: 访客凭据到期时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    csrf_token: str
    expires_at: datetime
