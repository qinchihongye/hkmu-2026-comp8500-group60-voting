"""写权限只看创建者。管理员可以读全局，不能改别人的投票。"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import User
from tests.auth_support import envelope, error_body, patch_json, post_json
from tests.poll_support import (
    ACCESS_PASSWORD,
    create_poll,
    login,
    poll_body,
    register_and_login,
)


def _promote(client: TestClient, username: str) -> None:
    """把已注册账户改成管理员。

    Args:
        client: 连接到测试库的客户端。
        username: 要提升的用户名。
    """
    factory = client.app.state.session_factory
    with factory() as session:
        user = session.scalar(select(User).where(User.username == username))
        assert user is not None
        user.role = UserRole.ADMIN
        session.commit()


def test_non_creator_user_and_admin_cannot_write(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """其他用户和非创建者管理员的修改、发布、关闭都是 403。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(
        auth_client,
        csrf,
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )
    poll_id = int(created["id"])
    body = poll_body(
        auth_client,
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
        expected_version=1,
    )

    with TestClient(auth_app) as other:
        other_csrf = register_and_login(other, "bob")
        denied = patch_json(other, f"/api/v1/polls/{poll_id}", body, csrf=other_csrf)
        error_body(denied, 403, int(ApiCode.FORBIDDEN))
        publish = post_json(
            other,
            f"/api/v1/polls/{poll_id}/publish",
            {"expected_version": 1},
            csrf=other_csrf,
        )
        error_body(publish, 403, int(ApiCode.FORBIDDEN))
        close = post_json(
            other,
            f"/api/v1/polls/{poll_id}/close",
            {"expected_version": 1},
            csrf=other_csrf,
        )
        error_body(close, 403, int(ApiCode.FORBIDDEN))
        missing = other.get(f"/api/v1/me/polls/{poll_id}")
        error_body(missing, 404, int(ApiCode.POLL_NOT_FOUND))
        share = other.get(f"/api/v1/me/polls/{poll_id}/share")
        error_body(share, 404, int(ApiCode.POLL_NOT_FOUND))
        admin_denied = other.get("/api/v1/admin/polls")
        error_body(admin_denied, 403, int(ApiCode.FORBIDDEN))
        assert ACCESS_PASSWORD not in denied.text
        assert "$argon2" not in denied.text

    _promote(auth_client, "bob")
    with TestClient(auth_app) as admin:
        admin_csrf = login(admin, "bob")
        still_denied = patch_json(admin, f"/api/v1/polls/{poll_id}", body, csrf=admin_csrf)
        error_body(still_denied, 403, int(ApiCode.FORBIDDEN))
        publish_denied = post_json(
            admin,
            f"/api/v1/polls/{poll_id}/publish",
            {"expected_version": 1},
            csrf=admin_csrf,
        )
        error_body(publish_denied, 403, int(ApiCode.FORBIDDEN))
        close_denied = post_json(
            admin,
            f"/api/v1/polls/{poll_id}/close",
            {"expected_version": 1},
            csrf=admin_csrf,
        )
        error_body(close_denied, 403, int(ApiCode.FORBIDDEN))
        listed = envelope(admin.get("/api/v1/admin/polls"), 200)
        assert listed["total"] == 1
        assert listed["items"][0]["creator_id"] == created["creator_id"]
        detail = envelope(admin.get(f"/api/v1/admin/polls/{poll_id}"), 200)
        assert detail["can_manage"] is False
        assert detail["can_view_results"] is True
        assert detail["has_access_password"] is True
        assert ACCESS_PASSWORD not in str(detail)
        assert "$argon2" not in admin.get(f"/api/v1/admin/polls/{poll_id}").text


def test_create_requires_account_csrf(auth_client: TestClient) -> None:
    """创建投票使用账户 CSRF。错误来源不是 401。"""
    csrf = register_and_login(auth_client, "ada")
    missing_origin = post_json(
        auth_client,
        "/api/v1/polls",
        poll_body(auth_client),
        csrf="not-the-token",
        origin=None,
    )
    error_body(missing_origin, 403, int(ApiCode.CSRF_FAILED))
    wrong_csrf = post_json(
        auth_client,
        "/api/v1/polls",
        poll_body(auth_client),
        csrf="not-the-token",
    )
    error_body(wrong_csrf, 403, int(ApiCode.CSRF_FAILED))
    created = create_poll(auth_client, csrf)
    assert created["lifecycle"] == "DRAFT"
