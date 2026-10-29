"""固定示例目录接口的权限、分页、搜索和隔离。"""

from fastapi.testclient import TestClient

from src.main.python.algorithms.demo_module.demo_seed_service import ensure_demo_polls
from src.main.python.constants.enums import UserRole, Visibility
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import User
from tests.auth_support import envelope, error_body, post_json
from tests.poll_support import (
    clock_of,
    create_poll,
    ensure_guest,
    open_session,
    register_and_login,
    unlock,
)

DEMO_PASSWORD = "comp8500sefgroup60"


def _seed_demo_polls(client: TestClient) -> None:
    """按测试配置写入固定示例。"""
    client.app.state.settings.demo_polls_enabled = True
    clock = clock_of(client)
    with open_session(client) as session:
        session.add(
            User(
                username="demo_user",
                display_name="演示用户",
                password_hash=client.app.state.passwords.hash(DEMO_PASSWORD),
                role=UserRole.USER,
                is_active=True,
            )
        )
        session.commit()
    ensure_demo_polls(
        client.app.state.session_factory,
        clock,
        DEMO_PASSWORD,
        hmac_key=client.app.state.settings.anon_voter_hmac_key,
    )


def test_guest_cannot_read_demo_polls(auth_client: TestClient) -> None:
    """未登录访客访问示例目录返回 401。"""
    response = auth_client.get("/api/v1/demo-polls")
    error_body(response, 401, int(ApiCode.UNAUTHENTICATED))


def test_disabled_catalog_returns_empty_page_to_logged_in_user(auth_client: TestClient) -> None:
    """开关关闭时，登录用户读取目录得到空页。"""
    register_and_login(auth_client, "ada")
    body = envelope(auth_client.get("/api/v1/demo-polls"), 200)
    assert body["items"] == []
    assert body["total"] == 0
    assert body["page"] == 1
    assert body["page_size"] == 8


def test_logged_in_user_reads_demo_polls_in_fixed_order(auth_client: TestClient) -> None:
    """开启后登录用户可按固定顺序分页查 38 场，不泄露敏感字段。"""
    _seed_demo_polls(auth_client)
    register_and_login(auth_client, "ada")

    # 第一页 8 条
    page1 = envelope(auth_client.get("/api/v1/demo-polls?page=1&page_size=8"), 200)
    assert page1["total"] == 38
    assert len(page1["items"]) == 8
    orders = [item["display_order"] for item in page1["items"]]
    assert orders == list(range(1, 9))

    # 摘要字段白名单核对
    allowed_keys = {
        "id",
        "title",
        "identity_mode",
        "visibility",
        "vote_limit",
        "selection_mode",
        "allow_live_results",
        "starts_at",
        "ends_at",
        "effective_status",
        "created_at",
        "fixture_key",
        "display_order",
    }
    first = page1["items"][0]
    assert set(first.keys()) == allowed_keys
    assert first["fixture_key"] == "named-public-01"
    assert "access_password" not in first
    assert "access_password_hash" not in first
    assert "share_code" not in first
    assert "options" not in first

    # 最后一页（第 5 页）：33..38 恰好 6 条
    page5 = envelope(auth_client.get("/api/v1/demo-polls?page=5&page_size=8"), 200)
    assert page5["total"] == 38
    assert len(page5["items"]) == 6
    assert [item["display_order"] for item in page5["items"]] == list(range(33, 39))


def test_search_matches_title_and_fixture_key_and_reflects_in_total(
    auth_client: TestClient,
) -> None:
    """搜索词支持匹配标题和目录键，total 与过滤结果一致。"""
    _seed_demo_polls(auth_client)
    register_and_login(auth_client, "ada")

    # 按标题精确搜 1 场
    by_title = envelope(auth_client.get("/api/v1/demo-polls?q=Technical sharing topics · A01"), 200)
    assert by_title["total"] == 1
    assert len(by_title["items"]) == 1
    assert by_title["items"][0]["fixture_key"] == "named-public-01"

    # 按目录键前缀搜 8 场
    by_key = envelope(auth_client.get("/api/v1/demo-polls?q=named-public"), 200)
    assert by_key["total"] == 8
    assert len(by_key["items"]) == 8

    # 无匹配
    none_matched = envelope(auth_client.get("/api/v1/demo-polls?q=no-such-demo-poll-exists"), 200)
    assert none_matched["total"] == 0
    assert none_matched["items"] == []


def test_real_private_poll_never_appears_in_demo_polls(auth_client: TestClient) -> None:
    """真实创建的私密投票绝不会出现在示例目录中。"""
    _seed_demo_polls(auth_client)
    csrf = register_and_login(auth_client, "ada")

    # 创建真实私密投票
    real_private = create_poll(
        auth_client,
        csrf,
        visibility=Visibility.PRIVATE,
        access_password="real-private-password-1",
        title="Real user private poll",
    )
    assert real_private["visibility"] == Visibility.PRIVATE

    # 查示例目录，总数仍为 38，不包含该真实投票
    catalog = envelope(auth_client.get("/api/v1/demo-polls?page=1&page_size=50"), 200)
    assert catalog["total"] == 38
    poll_ids = {item["id"] for item in catalog["items"]}
    assert real_private["id"] not in poll_ids


def test_ordinary_polls_endpoint_only_lists_public_polls(auth_client: TestClient) -> None:
    """普通公开列表 /polls 仍只返回公开投票，私密示例不泄露。"""
    _seed_demo_polls(auth_client)

    # 查普通公开列表（共 19 场公开：16 场主矩阵公开 + 3 场补充状态公开）
    public_polls = envelope(auth_client.get("/api/v1/polls?page=1&page_size=50"), 200)
    for poll in public_polls["items"]:
        assert poll["visibility"] == Visibility.PUBLIC


def test_private_demo_poll_requires_passcode_for_details_and_results(
    auth_client: TestClient,
) -> None:
    """示例目录中的私密场次详情和结果仍需正确输入密码，不绕过权限。"""
    _seed_demo_polls(auth_client)
    register_and_login(auth_client, "ada")
    guest_csrf = ensure_guest(auth_client)

    # 取一个私密示例（如 C01: named-private-01）
    res = envelope(auth_client.get("/api/v1/demo-polls?q=named-private-01"), 200)
    assert res["total"] == 1
    poll_id = res["items"][0]["id"]

    # 未解锁前访问私密详情：返回受限信息，选项为空，需密码
    locked_detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    assert locked_detail["options"] == []
    assert locked_detail["needs_access_password"] is True
    assert locked_detail["can_vote"] is False
    assert locked_detail["can_view_results"] is False
    assert locked_detail["passcode_entry_path"] is not None
    share_code = locked_detail["passcode_entry_path"].removeprefix("/s/").removesuffix("/access")

    # 错误密码解锁 -> 403
    wrong_pass = post_json(
        auth_client,
        f"/api/v1/polls/{poll_id}/unlock",
        {"share_code": share_code, "password": "wrong-password"},
        csrf=guest_csrf,
    )
    error_body(wrong_pass, 403, int(ApiCode.POLL_PASSWORD_INVALID))

    # 正确密码解锁 -> 200
    unlocked = unlock(auth_client, guest_csrf, poll_id, share_code, DEMO_PASSWORD)
    assert unlocked["poll_id"] == poll_id

    # 解锁后再获取详情 -> 选项和权限正常返回
    unlocked_detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    assert unlocked_detail["needs_access_password"] is False
    assert len(unlocked_detail["options"]) == 4
    assert unlocked_detail["can_vote"] is True
