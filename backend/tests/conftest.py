"""测试用的应用和配置。"""

from collections.abc import Iterator

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from src.main.python.api.dependencies import (
    get_optional_principal,
    require_admin,
    require_guest_csrf,
    require_user,
)
from src.main.python.config.database_config import dispose_session_factory
from src.main.python.config.server_config import Settings
from src.main.python.fileds.context import GuestContext, Principal
from src.main.python.main import create_app
from src.main.python.utils.response_util import success_body
from tests.auth_support import ManualClock, fast_password_hash
from tests.integration.conftest import (
    assert_safe_test_database,
    database_pair,
    reset_public_schema,
    truncate_application_tables,
    upgrade_head,
)


def build_settings(**overrides: object) -> Settings:
    """构造一份不连接真实数据库的配置。

    Args:
        overrides: 需要覆盖的字段。

    Returns:
        开发库和测试库都指向关闭端口的配置。两个连接串不相同。
    """
    payload: dict[str, object] = {
        "database_url": "postgresql+psycopg://voting:secret-db-password@127.0.0.1:1/voting",
        "test_database_url": "postgresql+psycopg://voting:secret-test-password@127.0.0.1:1/voting_test",
        "allowed_origins": ["http://localhost:5173"],
        "public_base_url": "http://localhost:5173",
        "cookie_secure": False,
        "anon_voter_hmac_key": "k" * 32,
        "poll_text_parse_enabled": False,
        "openai_api_key": "",
        "openai_base_url": "",
        "poll_text_parse_model": "",
        "poll_text_parse_timeout_seconds": 20,
        "poll_text_parse_thinking": "",
        "poll_text_parse_reasoning_effort": "",
        "poll_text_parse_stream": False,
        "poll_text_parse_response_format": "json_schema",
    }
    payload.update(overrides)
    return Settings(**payload)


@pytest.fixture(scope="session")
def auth_engine() -> Iterator[Engine]:
    """准备只给认证测试使用的已迁移测试库。

    Yields:
        连接到 voting_test 的引擎。
    """
    test_url, dev_url = database_pair()
    assert_safe_test_database(test_url, dev_url)
    reset_public_schema(test_url, dev_url)
    upgrade_head(test_url, dev_url)
    engine = create_engine(test_url, poolclass=NullPool, hide_parameters=True)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def auth_app(auth_engine: Engine) -> Iterator[FastAPI]:
    """创建连接到测试库的应用，并挂上权限探针。

    Args:
        auth_engine: 已迁移的测试库引擎，只用于清空数据。

    Yields:
        使用可拨动时钟和低成本 Argon2 的应用。
    """
    test_url, dev_url = database_pair()
    assert_safe_test_database(test_url, dev_url)
    truncate_application_tables(auth_engine)
    application = create_app(
        build_settings(
            database_url=test_url,
            test_database_url="postgresql+psycopg://voting:unused@127.0.0.1:1/unused",
        )
    )
    application.state.clock = ManualClock()
    application.state.passwords = fast_password_hash()
    _mount_auth_probes(application)
    try:
        yield application
    finally:
        dispose_session_factory(application.state.session_factory)


@pytest.fixture
def auth_client(auth_app: FastAPI) -> Iterator[TestClient]:
    """创建会保存 Cookie 的认证测试客户端。

    Args:
        auth_app: 连接到测试库的应用。

    Yields:
        测试客户端。
    """
    with TestClient(auth_app) as test_client:
        yield test_client


def _mount_auth_probes(application: FastAPI) -> None:
    """挂上只在测试里使用的权限探针。

    Args:
        application: 测试应用。
    """

    @application.get("/api/v1/_auth/optional")
    def optional_principal(
        request: Request,
        principal: Principal | None = Depends(get_optional_principal),
    ) -> object:
        """返回当前账户身份；访客没有账户会话时 data 为 null。

        Args:
            request: 当前 HTTP 请求。
            principal: 可选的账户身份。

        Returns:
            统一成功响应。
        """
        if principal is None:
            data = None
        else:
            data = {"user_id": principal.user_id, "role": principal.role}
        return success_body(request, data)

    @application.get("/api/v1/_auth/user")
    def user_only(
        request: Request,
        principal: Principal = Depends(require_user),
    ) -> object:
        """要求普通用户或管理员。

        Args:
            request: 当前 HTTP 请求。
            principal: 已登录身份。

        Returns:
            统一成功响应。
        """
        return success_body(request, {"user_id": principal.user_id, "role": principal.role})

    @application.get("/api/v1/_auth/admin")
    def admin_only(
        request: Request,
        principal: Principal = Depends(require_admin),
    ) -> object:
        """要求管理员。

        Args:
            request: 当前 HTTP 请求。
            principal: 管理员身份。

        Returns:
            统一成功响应。
        """
        return success_body(request, {"role": principal.role})

    @application.post("/api/v1/_auth/guest-write")
    def guest_write(
        request: Request,
        guest: GuestContext = Depends(require_guest_csrf),
    ) -> object:
        """模拟必须先拿到访客 Cookie 和访客 CSRF 的写请求。

        Args:
            request: 当前 HTTP 请求。
            guest: 已核对的访客上下文。依赖本身会拒绝缺失凭据。

        Returns:
            不含身份字段的成功响应。
        """
        del guest
        return success_body(request, {"ok": True})


@pytest.fixture
def app() -> Iterator[FastAPI]:
    """创建测试应用，结束后关闭连接池。

    Yields:
        使用无效数据库地址的 FastAPI 应用。
    """
    application = create_app(build_settings())
    try:
        yield application
    finally:
        dispose_session_factory(application.state.session_factory)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """创建测试客户端。

    Args:
        app: 测试应用。

    Yields:
        绑定该应用的客户端。
    """
    with TestClient(app) as test_client:
        yield test_client
