"""请求内部的身份对象。这些类型不作为公开响应。"""

from dataclasses import dataclass
from datetime import datetime

from src.main.python.fileds.response.auth_response import SessionPublic, UserPublic
from src.main.python.fileds.response.guest_response import GuestPublic


@dataclass(frozen=True)
class Principal:
    """已通过鉴权的账户身份。不携带数据库会话。

    Attributes:
        user_id: 账户主键。
        role: USER 或 ADMIN。
    """

    user_id: int
    role: str


@dataclass(frozen=True)
class SessionContext:
    """一次有效账户会话。不包含原会话令牌。

    Attributes:
        principal: 供权限判断使用的身份。
        user: 可公开返回的账户资料。
        csrf_token: 本会话的 CSRF。
        expires_at: 会话到期时间，UTC。
    """

    principal: Principal
    user: UserPublic
    csrf_token: str
    expires_at: datetime


@dataclass(frozen=True)
class LoginResult:
    """登录的内部结果。只有路由能看到原令牌并写入 Cookie。

    Attributes:
        raw_token: 原会话令牌。
        session: 公开的会话资料。
    """

    raw_token: str
    session: SessionPublic


@dataclass(frozen=True)
class GuestContext:
    """请求内的访客凭据。没有 user_id，不能拿来识别账户。

    Attributes:
        guest_session_id: 访客凭据主键，只在服务端使用。
        csrf_token: 本凭据的 CSRF。
        expires_at: 到期时间，UTC。
        raw_token: 本次请求带来的原令牌，不写入日志或响应。
    """

    guest_session_id: int
    csrf_token: str
    expires_at: datetime
    raw_token: str


@dataclass(frozen=True)
class PollAccessContext:
    """读取或参与一场投票时的身份。匿名写票必须丢掉账户关联。

    Attributes:
        principal: 有效账户身份。未登录时为空。
        guest: 有效访客凭据。没有浏览器 Cookie 时为空。
    """

    principal: Principal | None
    guest: GuestContext | None


@dataclass(frozen=True)
class GuestInitResult:
    """建立或恢复访客上下文的内部结果。

    Attributes:
        raw_token: 新建凭据时的原令牌。恢复已有凭据时为空，路由不再改写 Cookie。
        guest: 公开的访客资料。
    """

    raw_token: str | None
    guest: GuestPublic
