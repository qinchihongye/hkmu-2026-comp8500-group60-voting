"""账户公开响应。不包含密码散列和原会话令牌。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    """可以返回给浏览器的账户身份。

    Attributes:
        id: 账户主键。
        username: 规范化用户名。
        display_name: 显示名。
        role: USER 或 ADMIN。
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    display_name: str
    role: str


class SessionPublic(BaseModel):
    """登录和当前身份的公开结果。

    Attributes:
        user: 账户身份。
        csrf_token: 后续账户写请求要带回的 CSRF。
        session_expires_at: 会话到期时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    user: UserPublic
    csrf_token: str
    session_expires_at: datetime
