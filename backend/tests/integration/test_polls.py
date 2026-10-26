"""创建者管理自己的投票，广场不列出草稿和私密场次。"""

from datetime import timedelta

from fastapi.testclient import TestClient

from src.main.python.constants.error_codes import ApiCode
from tests.auth_support import PASSWORD, envelope, error_body, patch_json, post_json
from tests.poll_support import (
    ACCESS_PASSWORD,
    audit_actions,
    clock_of,
    create_poll,
    poll_body,
    poll_row,
    publish_poll,
    register_and_login,
    share_code_of,
    update_poll,
)

MANAGE_FIELDS = {
    "id",
    "title",
    "identity_mode",
    "visibility",
    "starts_at",
    "ends_at",
    "effective_status",
    "created_at",
    "description",
    "options",
    "lifecycle",
    "version",
    "creator_id",
    "closed_at",
    "has_access_password",
    "server_time",
    "can_manage",
    "can_view_results",
}


def test_creator_draft_publish_close_and_version(auth_client: TestClient) -> None:
    """自己的草稿可改、可发布、可关闭；旧版本和已发布内容不能再改。"""
    csrf = register_and_login(auth_client, "ada")
    created_response = post_json(
        auth_client,
        "/api/v1/polls",
        poll_body(auth_client),
        csrf=csrf,
    )
    created = envelope(created_response, 201)
    assert set(created) == MANAGE_FIELDS
    assert created["description"] == "说明"
    assert created["lifecycle"] == "DRAFT"
    assert created["effective_status"] == "DRAFT"
    assert created["version"] == 1
    assert created["can_manage"] is True
    assert "has_voted" not in created
    assert created_response.headers["cache-control"] == "no-store"
    assert ACCESS_PASSWORD not in created_response.text
    assert "$argon2" not in created_response.text
    options = created["options"]
    assert isinstance(options, list)
    assert [item["position"] for item in options] == [0, 1]
    poll_id = int(created["id"])

    hidden = auth_client.get(f"/api/v1/polls/{poll_id}")
    error_body(hidden, 404, int(ApiCode.POLL_NOT_FOUND))
    owned = envelope(auth_client.get(f"/api/v1/me/polls/{poll_id}"), 200)
    assert owned["title"] == "课堂投票"

    changed = update_poll(auth_client, csrf, poll_id, title="改过的标题")
    assert changed["version"] == 2
    assert changed["title"] == "改过的标题"
    stale = patch_json(
        auth_client,
        f"/api/v1/polls/{poll_id}",
        poll_body(auth_client, title="过期", expected_version=1),
        csrf=csrf,
    )
    error_body(stale, 409, int(ApiCode.STALE_POLL_VERSION))

    published = publish_poll(auth_client, csrf, poll_id, 2)
    assert published["lifecycle"] == "PUBLISHED"
    assert published["effective_status"] == "OPEN"
    assert published["version"] == 3
    frozen = patch_json(
        auth_client,
        f"/api/v1/polls/{poll_id}",
        poll_body(auth_client, expected_version=3),
        csrf=csrf,
    )
    error_body(frozen, 409, int(ApiCode.POLL_IMMUTABLE))
    again = post_json(
        auth_client,
        f"/api/v1/polls/{poll_id}/publish",
        {"expected_version": 3},
        csrf=csrf,
    )
    error_body(again, 409, int(ApiCode.POLL_IMMUTABLE))

    link = envelope(auth_client.get(f"/api/v1/me/polls/{poll_id}/share"), 200)
    assert set(link) == {"share_url", "requires_password", "requires_login"}
    assert str(link["share_url"]).startswith("http://localhost:5173/s/")
    assert "password" not in str(link["share_url"])
    assert link["requires_password"] is False
    assert link["requires_login"] is True
    assert auth_client.get(f"/api/v1/me/polls/{poll_id}/share").headers["referrer-policy"] == (
        "no-referrer"
    )

    closed = post_json(
        auth_client,
        f"/api/v1/polls/{poll_id}/close",
        {"expected_version": 3},
        csrf=csrf,
    )
    closed_body = envelope(closed, 200)
    assert closed_body["lifecycle"] == "CLOSED"
    assert closed_body["version"] == 4
    assert closed_body["closed_at"] is not None
    repeated = post_json(
        auth_client,
        f"/api/v1/polls/{poll_id}/close",
        {"expected_version": 1},
        csrf=csrf,
    )
    repeated_body = envelope(repeated, 200)
    assert repeated_body["version"] == 4
    assert audit_actions(auth_client, poll_id).count("CLOSE") == 1
    assert audit_actions(auth_client, poll_id) == ["CREATE", "UPDATE", "PUBLISH", "CLOSE"]


def test_private_password_is_hashed_and_replaced_only_when_sent(auth_client: TestClient) -> None:
    """未提交新密码时保留原散列；改成公开后散列消失。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(
        auth_client,
        csrf,
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )
    poll_id = int(created["id"])
    assert created["has_access_password"] is True
    original = poll_row(auth_client, poll_id)[2]
    assert isinstance(original, str) and original.startswith("$argon2")
    assert ACCESS_PASSWORD not in original

    kept = update_poll(auth_client, csrf, poll_id, title="仍是私密", visibility="PRIVATE")
    assert kept["has_access_password"] is True
    assert poll_row(auth_client, poll_id)[2] == original
    assert ACCESS_PASSWORD not in auth_client.get(f"/api/v1/me/polls/{poll_id}").text

    replacement = "replacement-pass"
    changed = update_poll(
        auth_client,
        csrf,
        poll_id,
        visibility="PRIVATE",
        access_password=replacement,
    )
    updated_hash = poll_row(auth_client, poll_id)[2]
    assert isinstance(updated_hash, str)
    assert updated_hash != original
    assert auth_client.app.state.passwords.verify(replacement, updated_hash)
    assert not auth_client.app.state.passwords.verify(ACCESS_PASSWORD, updated_hash)
    assert replacement not in str(changed)

    public = update_poll(auth_client, csrf, poll_id, visibility="PUBLIC")
    assert public["has_access_password"] is False
    assert poll_row(auth_client, poll_id)[2] is None

    private_again = patch_json(
        auth_client,
        f"/api/v1/polls/{poll_id}",
        poll_body(auth_client, visibility="PRIVATE", expected_version=public["version"]),
        csrf=csrf,
    )
    error_body(private_again, 422, int(ApiCode.VALIDATION_ERROR))
    assert ACCESS_PASSWORD not in private_again.text


def test_publish_rejects_stale_version_ended_window_and_draft_share(
    auth_client: TestClient,
) -> None:
    """结束时间已到不能发布；草稿分享码不可用。"""
    csrf = register_and_login(auth_client, "ada")
    now = clock_of(auth_client).now()
    ended = create_poll(
        auth_client,
        csrf,
        starts_at=(now - timedelta(hours=2)).isoformat(),
        ends_at=(now - timedelta(hours=1)).isoformat(),
    )
    ended_id = int(ended["id"])
    too_late = post_json(
        auth_client,
        f"/api/v1/polls/{ended_id}/publish",
        {"expected_version": 1},
        csrf=csrf,
    )
    error_body(too_late, 409, int(ApiCode.POLL_NOT_OPEN))
    stale = post_json(
        auth_client,
        f"/api/v1/polls/{ended_id}/publish",
        {"expected_version": 9},
        csrf=csrf,
    )
    error_body(stale, 409, int(ApiCode.STALE_POLL_VERSION))
    draft_share = auth_client.get(f"/api/v1/me/polls/{ended_id}/share")
    error_body(draft_share, 409, int(ApiCode.POLL_NOT_OPEN))
    draft_close = post_json(
        auth_client,
        f"/api/v1/polls/{ended_id}/close",
        {"expected_version": 1},
        csrf=csrf,
    )
    error_body(draft_close, 409, int(ApiCode.POLL_NOT_OPEN))


def test_natural_end_does_not_rewrite_lifecycle(auth_client: TestClient) -> None:
    """时间到了只改变对外状态，不写 closed_at。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf, identity_mode="ANONYMOUS")
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    clock_of(auth_client).advance(timedelta(hours=3))
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    assert detail["effective_status"] == "CLOSED"
    assert detail["can_vote"] is False
    assert detail["can_view_results"] is True
    lifecycle, closed_at, _hash = poll_row(auth_client, poll_id)
    assert lifecycle == "PUBLISHED"
    assert closed_at is None


def test_public_list_excludes_drafts_and_private_from_rows_and_total(
    auth_client: TestClient,
) -> None:
    """广场的行、总数和搜索都不含草稿或私密投票。"""
    csrf = register_and_login(auth_client, "ada")
    create_poll(auth_client, csrf, title="草稿公开")
    private = create_poll(
        auth_client,
        csrf,
        title="私密场次",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )
    publish_poll(auth_client, csrf, int(private["id"]), 1)
    visible = create_poll(auth_client, csrf, title="100% 完成")
    publish_poll(auth_client, csrf, int(visible["id"]), 1)
    clock_of(auth_client).advance(timedelta(seconds=1))
    later = create_poll(auth_client, csrf, title="后一场")
    publish_poll(auth_client, csrf, int(later["id"]), 1)

    page = envelope(auth_client.get("/api/v1/polls"), 200)
    assert page["total"] == 2
    titles = [item["title"] for item in page["items"]]
    assert titles == ["后一场", "100% 完成"]
    assert "私密场次" not in titles
    draft_filter = envelope(auth_client.get("/api/v1/polls?status=DRAFT"), 200)
    assert draft_filter["total"] == 0
    open_filter = envelope(auth_client.get("/api/v1/polls?status=OPEN"), 200)
    assert open_filter["total"] == 2
    missed = envelope(auth_client.get("/api/v1/polls", params={"q": "私密"}), 200)
    assert missed["total"] == 0
    found = envelope(auth_client.get("/api/v1/polls", params={"q": "%"}), 200)
    assert [item["title"] for item in found["items"]] == ["100% 完成"]
    assert PASSWORD not in auth_client.get("/api/v1/polls").text

    code = share_code_of(auth_client, int(visible["id"]))
    entry = envelope(auth_client.get(f"/api/v1/shares/{code}"), 200)
    assert set(entry) == {
        "poll_id",
        "identity_mode",
        "visibility",
        "password_required",
        "login_required",
    }
    assert entry["poll_id"] == visible["id"]
    assert "title" not in entry
