"""分享入口和私密授权的公开响应。不包含密码。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ShareEntry(BaseModel):
    """分享码能暴露的最低限度信息。

    Attributes:
        poll_id: 投票主键。
        identity_mode: NAMED 或 ANONYMOUS。
        visibility: PUBLIC 或 PRIVATE。
        password_required: 是否还要访问密码。
        login_required: 是否必须登录账户。
    """

    model_config = ConfigDict(extra="forbid")

    poll_id: int
    identity_mode: str
    visibility: str
    password_required: bool
    login_required: bool


class AccessGrantPublic(BaseModel):
    """一次成功的私密授权。

    Attributes:
        poll_id: 被授权的投票。
        expires_at: 授权到期时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    poll_id: int
    expires_at: datetime


class ShareLink(BaseModel):
    """创建者复制的分享信息。链接里没有密码。

    Attributes:
        share_url: 对外分享地址。
        requires_password: 参与者是否还要输入访问密码。
        requires_login: 参与者是否必须登录。
        access_password: 创建者可复制的访问密码。旧场次只剩散列时为空。
    """

    model_config = ConfigDict(extra="forbid")

    share_url: str
    requires_password: bool
    requires_login: bool
    access_password: str | None = None
