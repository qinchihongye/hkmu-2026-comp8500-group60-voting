"""账户和访客测试的时钟与请求辅助。"""

from datetime import UTC, datetime, timedelta

import httpx
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from src.main.python.utils.clock_util import Clock

ORIGIN = "http://localhost:5173"
PASSWORD = "password-ada-1"


class ManualClock(Clock):
    """测试中可拨动的 UTC 时钟。"""

    def __init__(self) -> None:
        """从固定时刻开始。"""
        self.moment = datetime(2026, 10, 24, 8, 0, tzinfo=UTC)

    def now(self) -> datetime:
        """返回当前拨定的时刻。

        Returns:
            带 UTC 时区的测试时间。
        """
        return self.moment

    def advance(self, delta: timedelta) -> None:
        """把时钟向前拨。

        Args:
            delta: 要增加的时间。
        """
        self.moment += delta


def fast_password_hash() -> PasswordHash:
    """构造参数较低的 Argon2，避免测试把时间花在默认内存参数上。

    Returns:
        仍使用 Argon2 的散列器。
    """
    return PasswordHash((Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),))


def register_payload(
    username: str = "ada",
    *,
    display_name: str = "艾达",
    password: str = PASSWORD,
) -> dict[str, str]:
    """组装注册参数。

    Args:
        username: 用户名。
        display_name: 显示名。
        password: 密码。

    Returns:
        data 内层对象。
    """
    return {"username": username, "display_name": display_name, "password": password}


def post_json(
    client: TestClient,
    path: str,
    data: dict[str, object],
    *,
    csrf: str | None = None,
    origin: str | None = ORIGIN,
) -> httpx.Response:
    """发送带统一外壳的 JSON 写请求。

    Args:
        client: 测试客户端。
        path: 请求路径。
        data: data 内层对象。
        csrf: 要放入 X-CSRF-Token 的值。为空则不发送该头。
        origin: Origin 头。为空则不发送。

    Returns:
        HTTP 响应。
    """
    headers: dict[str, str] = {}
    if origin is not None:
        headers["Origin"] = origin
    if csrf is not None:
        headers["X-CSRF-Token"] = csrf
    return client.post(path, json={"data": data}, headers=headers)


def patch_json(
    client: TestClient,
    path: str,
    data: dict[str, object],
    *,
    csrf: str | None = None,
    origin: str | None = ORIGIN,
) -> httpx.Response:
    """发送带统一外壳的 JSON 修改请求。

    Args:
        client: 测试客户端。
        path: 请求路径。
        data: data 内层对象。
        csrf: 要放入 X-CSRF-Token 的值。为空则不发送该头。
        origin: Origin 头。为空则不发送。

    Returns:
        HTTP 响应。
    """
    headers: dict[str, str] = {}
    if origin is not None:
        headers["Origin"] = origin
    if csrf is not None:
        headers["X-CSRF-Token"] = csrf
    return client.patch(path, json={"data": data}, headers=headers)


def envelope(response: httpx.Response, status: int) -> dict[str, object]:
    """读取成功响应的 data，并确认外壳。

    Args:
        response: HTTP 响应。
        status: 期望的 HTTP 状态。

    Returns:
        data 对象。data 为 null 时改用 null_data。
    """
    body = _body(response, status)
    assert body["code"] == 0
    assert isinstance(body["request_id"], str) and body["request_id"]
    data = body["data"]
    assert isinstance(data, dict)
    return data


def null_data(response: httpx.Response, status: int) -> None:
    """确认成功响应的 data 为 null。

    Args:
        response: HTTP 响应。
        status: 期望的 HTTP 状态。
    """
    body = _body(response, status)
    assert body["code"] == 0
    assert isinstance(body["request_id"], str) and body["request_id"]
    assert body["data"] is None


def error_body(response: httpx.Response, status: int, code: int) -> dict[str, object]:
    """读取失败响应并确认业务码。

    Args:
        response: HTTP 响应。
        status: 期望的 HTTP 状态。
        code: 期望的数值业务码。

    Returns:
        完整响应对象。
    """
    body = _body(response, status)
    assert body["code"] == code
    return body


def parse_time(value: object) -> datetime:
    """解析接口返回的 UTC 时间。

    Args:
        value: ISO 8601 字符串。

    Returns:
        带时区的时间。
    """
    assert isinstance(value, str)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def set_cookie_names(response: httpx.Response) -> list[str]:
    """列出本次响应设置的 Cookie 名。

    Args:
        response: HTTP 响应。

    Returns:
        Set-Cookie 中的名称，顺序与响应头一致。
    """
    names: list[str] = []
    for header in response.headers.get_list("set-cookie"):
        pair, _, _rest = header.partition(";")
        cookie_name, separator, _value = pair.partition("=")
        if separator == "=":
            names.append(cookie_name)
    return names


def set_cookie_value(response: httpx.Response, name: str) -> str:
    """读取指定 Set-Cookie 的值，并确认 HttpOnly 与 SameSite。

    Args:
        response: HTTP 响应。
        name: Cookie 名。

    Returns:
        Cookie 值。
    """
    found: list[str] = []
    for header in response.headers.get_list("set-cookie"):
        pair, _, _rest = header.partition(";")
        cookie_name, separator, value = pair.partition("=")
        if separator != "=" or cookie_name != name:
            continue
        lowered = header.lower()
        assert "httponly" in lowered
        assert "samesite=lax" in lowered
        assert "path=/" in lowered
        found.append(value)
    assert len(found) == 1
    return found[0]


def _body(response: httpx.Response, status: int) -> dict[str, object]:
    """确认 JSON 只有四个顶层字段。

    Args:
        response: HTTP 响应。
        status: 期望的 HTTP 状态。

    Returns:
        响应对象。
    """
    assert response.status_code == status
    body = response.json()
    assert isinstance(body, dict)
    assert set(body) == {"code", "msg", "data", "request_id"}
    return body
