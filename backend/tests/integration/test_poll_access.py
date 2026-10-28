"""四种参与组合、密码授权和分享入口。"""

from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.main.python.constants.error_codes import ApiCode
from src.main.python.utils.security_util import GUEST_COOKIE
from tests.auth_support import envelope, error_body, parse_time, post_json
from tests.poll_support import (
    ACCESS_PASSWORD,
    clock_of,
    create_poll,
    ensure_guest,
    insert_anonymous_vote,
    publish_poll,
    register_and_login,
    share_code_of,
    unlock,
)


def _published(
    client: TestClient,
    csrf: str,
    **overrides: object,
) -> tuple[int, str]:
    """创建并发布一场投票，返回编号和分享码。

    Args:
        client: 创建者客户端。
        csrf: 账户 CSRF。
        overrides: 投票字段。

    Returns:
        投票编号和分享码。
    """
    created = create_poll(client, csrf, **overrides)
    poll_id = int(created["id"])
    publish_poll(client, csrf, poll_id, 1)
    return poll_id, share_code_of(client, poll_id)


def test_four_access_combinations(auth_app: FastAPI, auth_client: TestClient) -> None:
    """记名要登录，私密要授权，匿名只认浏览器，私密不靠登录代替密码。"""
    csrf = register_and_login(auth_client, "ada")
    named_public, _public_code = _published(auth_client, csrf)
    named_private, private_code = _published(
        auth_client,
        csrf,
        title="私密记名",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )
    anon_public, _anon_code = _published(
        auth_client,
        csrf,
        title="公开匿名",
        identity_mode="ANONYMOUS",
    )
    anon_private, anon_private_code = _published(
        auth_client,
        csrf,
        title="私密匿名",
        identity_mode="ANONYMOUS",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )

    creator_response = auth_client.get(f"/api/v1/polls/{named_private}")
    creator_private = envelope(creator_response, 200)
    assert creator_private["can_manage"] is True
    assert creator_private["can_vote"] is False
    assert creator_private["needs_access_password"] is True
    assert creator_private["passcode_entry_path"] == f"/s/{private_code}/access"
    assert creator_private["results_access_reason"] == "creator"
    assert ACCESS_PASSWORD not in creator_response.text
    assert "$argon2" not in creator_response.text
    assert auth_client.get(f"/api/v1/polls/{named_private}").headers["cache-control"] == "no-store"
    assert auth_client.get(f"/api/v1/polls/{named_private}").headers["referrer-policy"] == (
        "no-referrer"
    )

    with TestClient(auth_app) as guest_browser:
        missing_login = guest_browser.get(f"/api/v1/polls/{named_public}")
        error_body(missing_login, 401, int(ApiCode.UNAUTHENTICATED))
        hidden_private = guest_browser.get(f"/api/v1/polls/{named_private}")
        error_body(hidden_private, 404, int(ApiCode.POLL_NOT_FOUND))

        register_and_login(guest_browser, "voter")
        still_hidden = guest_browser.get(f"/api/v1/polls/{named_private}")
        error_body(still_hidden, 404, int(ApiCode.POLL_NOT_FOUND))
        named_open = envelope(guest_browser.get(f"/api/v1/polls/{named_public}"), 200)
        assert named_open["can_vote"] is True
        assert named_open["has_voted"] is False
        assert named_open["needs_access_password"] is False
        assert named_open["passcode_entry_path"] is None
        assert named_open["results_access_reason"] == "unavailable"

        guest_csrf = ensure_guest(guest_browser)
        unlocked = unlock(guest_browser, guest_csrf, named_private, private_code)
        assert set(unlocked) == {"poll_id", "expires_at"}
        assert ACCESS_PASSWORD not in str(unlocked)
        named_ready = envelope(guest_browser.get(f"/api/v1/polls/{named_private}"), 200)
        assert named_ready["can_vote"] is True
        assert named_ready["can_manage"] is False
        assert named_ready["needs_access_password"] is False
        assert named_ready["passcode_entry_path"] is None

    with TestClient(auth_app) as anonymous:
        guest_csrf = ensure_guest(anonymous)
        public_detail = envelope(anonymous.get(f"/api/v1/polls/{anon_public}"), 200)
        assert public_detail["can_vote"] is True
        assert public_detail["identity_mode"] == "ANONYMOUS"
        assert public_detail["needs_access_password"] is False
        assert public_detail["passcode_entry_path"] is None
        error_body(anonymous.get(f"/api/v1/polls/{anon_private}"), 404, int(ApiCode.POLL_NOT_FOUND))
        unlock(anonymous, guest_csrf, anon_private, anon_private_code)
        private_detail = envelope(anonymous.get(f"/api/v1/polls/{anon_private}"), 200)
        assert private_detail["can_vote"] is True
        assert "voting_session" not in anonymous.cookies

        option_id = int(private_detail["options"][0]["id"])
        insert_anonymous_vote(anonymous, anon_private, option_id)
        voted = envelope(anonymous.get(f"/api/v1/polls/{anon_private}"), 200)
        assert voted["has_voted"] is True
        assert voted["can_vote"] is False
        assert isinstance(voted["receipt"], dict)
        with TestClient(auth_app) as other:
            other_guest = ensure_guest(other)
            unlock(other, other_guest, anon_private, anon_private_code)
            other_view = envelope(other.get(f"/api/v1/polls/{anon_private}"), 200)
            assert other_view["has_voted"] is False


def test_wrong_password_rate_limit_and_renewal(auth_app: FastAPI, auth_client: TestClient) -> None:
    """密码错误、锁定期、过期后续期和跨场分享码都按门禁处理。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, code = _published(
        auth_client,
        csrf,
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
        identity_mode="ANONYMOUS",
    )
    other_id, other_code = _published(
        auth_client,
        csrf,
        title="另一场",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
        identity_mode="ANONYMOUS",
    )
    with TestClient(auth_app) as browser:
        guest_csrf = ensure_guest(browser)
        for _ in range(4):
            failed = post_json(
                browser,
                f"/api/v1/polls/{poll_id}/unlock",
                {"share_code": code, "password": "wrong-pass1"},
                csrf=guest_csrf,
            )
            error_body(failed, 403, int(ApiCode.POLL_PASSWORD_INVALID))
            assert "wrong-pass1" not in failed.text
            assert failed.headers["cache-control"] == "no-store"
        limited = post_json(
            browser,
            f"/api/v1/polls/{poll_id}/unlock",
            {"share_code": code, "password": "wrong-pass1"},
            csrf=guest_csrf,
        )
        error_body(limited, 429, int(ApiCode.TOO_MANY_ATTEMPTS))
        assert int(limited.headers["retry-after"]) >= 1
        during_lock = post_json(
            browser,
            f"/api/v1/polls/{poll_id}/unlock",
            {"share_code": code, "password": ACCESS_PASSWORD},
            csrf=guest_csrf,
        )
        error_body(during_lock, 429, int(ApiCode.TOO_MANY_ATTEMPTS))
        mismatch = post_json(
            browser,
            f"/api/v1/polls/{poll_id}/unlock",
            {"share_code": other_code, "password": ACCESS_PASSWORD},
            csrf=guest_csrf,
        )
        error_body(mismatch, 429, int(ApiCode.TOO_MANY_ATTEMPTS))

        clock_of(browser).advance(timedelta(minutes=5))
        wrong_poll = post_json(
            browser,
            f"/api/v1/polls/{poll_id}/unlock",
            {"share_code": other_code, "password": ACCESS_PASSWORD},
            csrf=guest_csrf,
        )
        error_body(wrong_poll, 403, int(ApiCode.POLL_PASSWORD_INVALID))
        granted = unlock(browser, guest_csrf, poll_id, code)
        first_expiry = parse_time(granted["expires_at"])
        visible = envelope(browser.get(f"/api/v1/polls/{poll_id}"), 200)
        assert visible["can_vote"] is True

        clock_of(browser).advance(timedelta(minutes=61))
        error_body(browser.get(f"/api/v1/polls/{poll_id}"), 404, int(ApiCode.POLL_NOT_FOUND))
        renewed = unlock(browser, guest_csrf, poll_id, code)
        assert parse_time(renewed["expires_at"]) > first_expiry
        assert envelope(browser.get(f"/api/v1/polls/{poll_id}"), 200)["can_vote"] is True

        with TestClient(auth_app) as other_browser:
            ensure_guest(other_browser)
            error_body(
                other_browser.get(f"/api/v1/polls/{poll_id}"),
                404,
                int(ApiCode.POLL_NOT_FOUND),
            )
            assert GUEST_COOKIE not in {""}
        assert other_id != poll_id


def test_closed_share_still_opens_final_result(auth_app: FastAPI, auth_client: TestClient) -> None:
    """提前关闭后，旧分享链接仍能进入最终结果。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, code = _published(auth_client, csrf, identity_mode="ANONYMOUS")
    post_json(
        auth_client,
        f"/api/v1/polls/{poll_id}/close",
        {"expected_version": 2},
        csrf=csrf,
    )
    with TestClient(auth_app) as browser:
        entry = envelope(browser.get(f"/api/v1/shares/{code}"), 200)
        assert entry["poll_id"] == poll_id
        assert entry["password_required"] is False
        detail = envelope(browser.get(f"/api/v1/polls/{poll_id}"), 200)
        assert detail["effective_status"] == "CLOSED"
        assert detail["can_view_results"] is True
        assert detail["results_access_reason"] == "closed"
        assert detail["can_vote"] is False


def test_missing_anonymous_key_does_not_pretend_unvoted(auth_client: TestClient) -> None:
    """有访客 Cookie 但没有匿名密钥时，不能把已投状态说成未投。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf, identity_mode="ANONYMOUS")
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    ensure_guest(auth_client)
    auth_client.app.state.settings.anon_voter_hmac_key = ""
    failed = auth_client.get(f"/api/v1/polls/{poll_id}")
    error_body(failed, 503, int(ApiCode.SERVICE_UNAVAILABLE))
    auth_client.app.state.settings.anon_voter_hmac_key = "k" * 32
