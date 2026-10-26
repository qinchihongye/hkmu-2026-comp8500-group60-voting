"""账户权限与访客身份互相独立。探针只挂在测试应用上。"""

from fastapi.testclient import TestClient

from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import User
from tests.auth_support import (
    PASSWORD,
    envelope,
    error_body,
    null_data,
    post_json,
    register_payload,
)


def test_permission_probes_are_not_production_routes(client: TestClient) -> None:
    """正式应用没有测试探针。"""
    missing = client.get("/api/v1/_auth/user")
    error_body(missing, 404, int(ApiCode.NOT_FOUND))


def test_guest_context_does_not_authenticate_a_user(auth_client: TestClient) -> None:
    """没有账户会话时，访客 Cookie 也不能通过用户或管理员检查。"""
    null_data(auth_client.get("/api/v1/_auth/optional"), 200)
    error_body(auth_client.get("/api/v1/_auth/user"), 401, int(ApiCode.UNAUTHENTICATED))
    error_body(auth_client.get("/api/v1/_auth/admin"), 401, int(ApiCode.UNAUTHENTICATED))

    post_json(auth_client, "/api/v1/guest/context", {})
    null_data(auth_client.get("/api/v1/_auth/optional"), 200)
    error_body(auth_client.get("/api/v1/_auth/user"), 401, int(ApiCode.UNAUTHENTICATED))
    error_body(auth_client.get("/api/v1/_auth/admin"), 401, int(ApiCode.UNAUTHENTICATED))


def test_registered_user_cannot_pass_admin_check(auth_client: TestClient) -> None:
    """注册账户固定为 USER，可以访问用户探针，不能访问管理员探针。"""
    registered = envelope(post_json(auth_client, "/api/v1/auth/register", register_payload()), 201)
    assert registered["role"] == UserRole.USER
    post_json(
        auth_client,
        "/api/v1/auth/login",
        {"username": "ada", "password": PASSWORD},
    )
    user_id = registered["id"]
    expected = {"user_id": user_id, "role": UserRole.USER}
    assert envelope(auth_client.get("/api/v1/_auth/optional"), 200) == expected
    assert envelope(auth_client.get("/api/v1/_auth/user"), 200) == expected
    error_body(auth_client.get("/api/v1/_auth/admin"), 403, int(ApiCode.FORBIDDEN))


def test_admin_can_read_global_probe(auth_client: TestClient) -> None:
    """直接写入的管理员可以通过全局读取探针。注册接口不能创建该角色。"""
    passwords = auth_client.app.state.passwords
    with auth_client.app.state.session_factory() as session:
        session.add(
            User(
                username="admin",
                display_name="管理员",
                password_hash=passwords.hash(PASSWORD),
                role=UserRole.ADMIN,
            )
        )
        session.commit()
    logged_in = envelope(
        post_json(
            auth_client,
            "/api/v1/auth/login",
            {"username": "admin", "password": PASSWORD},
        ),
        200,
    )
    user = logged_in["user"]
    assert isinstance(user, dict)
    assert user["role"] == UserRole.ADMIN
    assert envelope(auth_client.get("/api/v1/_auth/admin"), 200) == {"role": UserRole.ADMIN}
    assert envelope(auth_client.get("/api/v1/_auth/user"), 200)["role"] == UserRole.ADMIN
