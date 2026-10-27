"""密码、令牌、来源和 CSRF。

账户写请求与访客写请求使用不同的 CSRF，不能互相替代。
注册、登录和首次建立访客上下文只检查 Origin 与 JSON。
"""

import hashlib
import hmac
import re
import secrets
from enum import StrEnum
from urllib.parse import urlsplit

from fastapi import Request
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from starlette.responses import Response

from src.main.python.config.server_config import Settings
from src.main.python.constants.error_codes import ApiCode
from src.main.python.utils.error_handlers import AppError

AUTH_COOKIE = "voting_session"
GUEST_COOKIE = "voting_guest"
CSRF_HEADER = "X-CSRF-Token"
_USERNAME = re.compile(r"^[a-z0-9_]{3,32}$")
_DUMMY_HASHES: dict[int, str] = {}


class CsrfSource(StrEnum):
    """写请求使用的 CSRF 来源。"""

    NONE = "none"
    AUTH = "auth"
    GUEST = "guest"


def normalize_username(value: str) -> str:
    """把用户名规范成小写，并检查字符范围。

    Args:
        value: 调用方提交的用户名。

    Returns:
        去掉首尾空白并转为小写后的用户名。

    Raises:
        ValueError: 规范化后不是 3 到 32 位小写字母、数字或下划线。
    """
    normalized = value.strip().lower()
    if _USERNAME.fullmatch(normalized) is None:
        raise ValueError("用户名需为 3 到 32 位小写字母、数字或下划线")
    return normalized


def normalize_display_name(value: str) -> str:
    """去掉显示名首尾空白并检查长度。

    Args:
        value: 调用方提交的显示名。

    Returns:
        去掉首尾空白后的显示名。

    Raises:
        ValueError: 长度不在 1 到 50 个字符之间。
    """
    stripped = value.strip()
    if not 1 <= len(stripped) <= 50:
        raise ValueError("显示名长度需为 1 到 50 个字符")
    return stripped


def check_access_password(value: str) -> str:
    """检查私密投票密码长度。不裁剪、不改写内容。

    Args:
        value: 调用方提交的访问密码。

    Returns:
        原密码。

    Raises:
        ValueError: 长度不在 8 到 128 个字符之间。
    """
    if not 8 <= len(value) <= 128:
        raise ValueError("访问密码长度需为 8 到 128 个字符")
    return value


def anonymous_voter_hash(key: str, poll_id: int, raw_token: str) -> str:
    """计算一场投票内的浏览器防重复散列。

    密钥、版本域、场次编号和原访客令牌一起参与 HMAC。不同场次的散列不能直接比较。

    Args:
        key: 至少 32 字节的稳定密钥。
        poll_id: 投票主键。
        raw_token: 浏览器持有的原访客令牌。

    Returns:
        64 位十六进制 HMAC-SHA256。

    Raises:
        ValueError: 密钥不足 32 字节。
    """
    if len(key.encode("utf-8")) < 32:
        raise ValueError("匿名密钥不可用")
    message = f"voting-anon-v1:{poll_id}:{raw_token}".encode()
    return hmac.new(key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def check_password_length(value: str) -> str:
    """检查密码长度。不裁剪、不改写密码内容。

    Args:
        value: 调用方提交的密码。

    Returns:
        原密码。

    Raises:
        ValueError: 长度不在 12 到 128 个字符之间。
    """
    if not 12 <= len(value) <= 128:
        raise ValueError("密码长度需为 12 到 128 个字符")
    return value


def password_hash_for(request: Request) -> PasswordHash:
    """取得进程使用的密码散列器。测试可以提前放在应用状态上。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        Argon2 密码散列器。
    """
    hasher = getattr(request.app.state, "passwords", None)
    if hasher is None:
        hasher = PasswordHash.recommended()
        request.app.state.passwords = hasher
    return hasher


def dummy_password_hash(passwords: PasswordHash) -> str:
    """返回与真实散列算法相同的占位散列，避免按用户是否存在改变耗时。

    Args:
        passwords: 当前密码散列器。

    Returns:
        不可用于登录的占位散列。
    """
    key = id(passwords)
    found = _DUMMY_HASHES.get(key)
    if found is None:
        found = passwords.hash("not-a-real-password")
        _DUMMY_HASHES[key] = found
    return found


def verify_password(passwords: PasswordHash, password: str, password_hash: str) -> bool:
    """核对明文和散列。

    pwdlib 的参数顺序是明文在前、散列在后。

    Args:
        passwords: 密码散列器。
        password: 用户提交的密码。
        password_hash: 库存的散列。

    Returns:
        匹配时为 True。无法识别的散列视为不匹配。
    """
    try:
        return passwords.verify(password, password_hash)
    except UnknownHashError:
        return False


def new_secret() -> str:
    """生成高熵随机串，用于 Cookie 或 CSRF。

    Returns:
        URL 安全的随机文本。
    """
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    """计算令牌的 SHA-256 十六进制摘要。

    Args:
        raw_token: 只放在 Cookie 里的原令牌。

    Returns:
        64 位十六进制摘要。
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def tokens_match(provided: str | None, expected: str) -> bool:
    """用固定时间比较两段令牌。

    Args:
        provided: 请求里带来的值。
        expected: 服务端保存的值。

    Returns:
        两者都非空且内容一致时为 True。
    """
    if not provided or len(provided) != len(expected):
        return False
    return secrets.compare_digest(provided, expected)


def enforce_write_guard(
    request: Request,
    settings: Settings,
    source: CsrfSource,
    *,
    auth_csrf: str | None = None,
    guest_csrf: str | None = None,
) -> None:
    """检查写请求的 Origin，并按来源核对 CSRF。

    Args:
        request: 当前 HTTP 请求。
        settings: 应用配置，提供来源白名单。
        source: 本次请求要求的 CSRF 来源。
        auth_csrf: 当前账户会话的 CSRF。来源为账户时必填。
        guest_csrf: 当前访客凭据的 CSRF。来源为访客时必填。

    Raises:
        AppError: 来源不在白名单，或 CSRF 缺失、不匹配。
    """
    origin = request.headers.get("origin")
    if not _origin_allowed(origin, request.headers.get("host"), settings.allowed_origins):
        raise AppError(403, ApiCode.CSRF_FAILED, ApiCode.CSRF_FAILED.default_message)
    if source is CsrfSource.NONE:
        return
    expected = auth_csrf if source is CsrfSource.AUTH else guest_csrf
    provided = request.headers.get(CSRF_HEADER)
    if expected is None or not tokens_match(provided, expected):
        raise AppError(403, ApiCode.CSRF_FAILED, ApiCode.CSRF_FAILED.default_message)


def _origin_allowed(origin: str | None, host: str | None, allowed_origins: list[str]) -> bool:
    """判断写请求来源是否可接受。

    白名单仍接受开发服务器等跨端口来源。浏览器直接打开本服务的 IP 或域名时，
    Origin 的主机和端口与 Host 相同，也视为本站请求。

    Args:
        origin: 浏览器 Origin 头。没有该头时拒绝。
        host: 请求的 Host 头，可带端口。
        allowed_origins: 配置中的来源白名单。

    Returns:
        来源在白名单中，或与当前 Host 为同一主机和端口时为 True。
    """
    if origin is None:
        return False
    if origin in allowed_origins:
        return True
    if host is None:
        return False
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return False
    if parsed.path not in {"", "/"}:
        return False
    origin_host = parsed.netloc.lower()
    request_host = host.split(",")[0].strip().lower()
    return origin_host == request_host


def mark_private(response: Response) -> None:
    """禁止缓存会话、密码和门禁响应。

    Args:
        response: 即将返回的响应。
    """
    response.headers["Cache-Control"] = "no-store"


def mark_no_referrer(response: Response) -> None:
    """禁止浏览器把分享码或私密入口带到下一跳。

    Args:
        response: 即将返回的响应。
    """
    response.headers["Referrer-Policy"] = "no-referrer"


def set_token_cookie(
    response: Response,
    *,
    name: str,
    value: str,
    max_age: int,
    secure: bool,
) -> None:
    """写入 HttpOnly Cookie。原令牌不进入响应正文。

    Args:
        response: 即将返回的响应。
        name: Cookie 名。
        value: 原令牌。
        max_age: 浏览器保存秒数。
        secure: 是否加上 Secure。
    """
    response.set_cookie(
        key=name,
        value=value,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def clear_token_cookie(response: Response, *, name: str, secure: bool) -> None:
    """清除指定 Cookie，不影响另一个身份 Cookie。

    Args:
        response: 即将返回的响应。
        name: Cookie 名。
        secure: 与设置时一致，浏览器才会删除。
    """
    response.delete_cookie(key=name, path="/", samesite="lax", secure=secure, httponly=True)
