"""汇总权限、零票项和在途选票。"""

import threading
from datetime import timedelta
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import User, Vote
from tests.auth_support import envelope, error_body, post_json
from tests.integration.test_vote_concurrency import (
    _engine,
    _finish,
    _join,
    _lock_poll,
    _run_waiting,
    _wait_for_poll_waiter,
)
from tests.poll_support import (
    ACCESS_PASSWORD,
    cast,
    clock_of,
    create_poll,
    ensure_guest,
    login,
    open_session,
    poll_row,
    publish_poll,
    register_and_login,
    share_code_of,
    unlock,
)


def _options(detail: dict[str, object]) -> list[int]:
    """按位置读取选项编号。

    Args:
        detail: 投票详情。

    Returns:
        选项主键列表。
    """
    options = detail["options"]
    assert isinstance(options, list)
    return [int(item["id"]) for item in options]


def _promote(client: TestClient, username: str) -> None:
    """把已注册账户改成管理员。

    Args:
        client: 连接到测试库的客户端。
        username: 要提升的用户名。
    """
    with open_session(client) as session:
        user = session.scalar(select(User).where(User.username == username))
        assert user is not None
        user.role = UserRole.ADMIN
        session.commit()


def _insert_votes(client: TestClient, poll_id: int, option_id: int, count: int) -> None:
    """直接写入若干张匿名票，用来固定汇总数字。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。
        option_id: 属于这场的选项。
        count: 要写入的票数。
    """
    with open_session(client) as session:
        for index in range(count):
            session.add(
                Vote(
                    receipt_id=uuid4(),
                    poll_id=poll_id,
                    identity_mode="ANONYMOUS",
                    voter_id=None,
                    anonymous_voter_hash=f"{poll_id:08x}{option_id:08x}{index:048x}",
                    option_id=option_id,
                    submitted_at=clock_of(client).now(),
                )
            )
        session.commit()


def _published_detail(
    client: TestClient,
    csrf: str,
    **overrides: object,
) -> tuple[int, dict[str, object]]:
    """创建并发布一场投票，返回详情。

    Args:
        client: 已登录客户端。
        csrf: 账户 CSRF。
        overrides: 覆盖创建字段。

    Returns:
        投票主键和参与详情。
    """
    created = create_poll(client, csrf, **overrides)
    poll_id = int(created["id"])
    publish_poll(client, csrf, poll_id, 1)
    return poll_id, envelope(client.get(f"/api/v1/polls/{poll_id}"), 200)


def test_counts_keep_zeros_ties_and_percentages(auth_client: TestClient) -> None:
    """零票项保留，全零没有领先项，并列项全部列出。"""
    csrf = register_and_login(auth_client, "ada")
    mixed_id, mixed = _published_detail(
        auth_client,
        csrf,
        title="三选项",
        identity_mode="ANONYMOUS",
        options=[{"label": "甲"}, {"label": "乙"}, {"label": "丙"}],
    )
    tie_id, tie = _published_detail(
        auth_client,
        csrf,
        title="并列",
        identity_mode="ANONYMOUS",
    )
    empty_id, _empty = _published_detail(
        auth_client,
        csrf,
        title="零票",
        identity_mode="ANONYMOUS",
    )
    mixed_options = _options(mixed)
    tie_options = _options(tie)
    _insert_votes(auth_client, mixed_id, mixed_options[0], 2)
    _insert_votes(auth_client, mixed_id, mixed_options[1], 1)
    _insert_votes(auth_client, tie_id, tie_options[0], 2)
    _insert_votes(auth_client, tie_id, tie_options[1], 2)

    mixed_result = envelope(auth_client.get(f"/api/v1/polls/{mixed_id}/results"), 200)
    assert mixed_result["total_votes"] == 3
    assert [item["count"] for item in mixed_result["options"]] == [2, 1, 0]
    assert [item["percentage"] for item in mixed_result["options"]] == [66.67, 33.33, 0.0]
    assert mixed_result["winner_option_ids"] == [mixed_options[0]]
    assert mixed_result["is_final"] is False

    tie_result = envelope(auth_client.get(f"/api/v1/polls/{tie_id}/results"), 200)
    assert tie_result["winner_option_ids"] == tie_options
    assert [item["percentage"] for item in tie_result["options"]] == [50.0, 50.0]

    empty_result = envelope(auth_client.get(f"/api/v1/polls/{empty_id}/results"), 200)
    assert empty_result["total_votes"] == 0
    assert empty_result["winner_option_ids"] == []
    assert [item["count"] for item in empty_result["options"]] == [0, 0]
    assert auth_client.get(f"/api/v1/polls/{mixed_id}/results").headers["cache-control"] == (
        "no-store"
    )


def test_open_results_follow_role(auth_app: FastAPI, auth_client: TestClient) -> None:
    """开放期只有创建者和管理员能看汇总，管理员仍然不能关闭别人的投票。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, _detail = _published_detail(auth_client, csrf, title="开放汇总")
    draft = create_poll(auth_client, csrf, title="草稿")
    error_body(
        auth_client.get(f"/api/v1/polls/{int(draft['id'])}/results"),
        404,
        int(ApiCode.POLL_NOT_FOUND),
    )
    creator = envelope(auth_client.get(f"/api/v1/polls/{poll_id}/results"), 200)
    assert creator["is_final"] is False

    with TestClient(auth_app) as voter:
        voter_csrf = register_and_login(voter, "bob")
        error_body(
            voter.get(f"/api/v1/polls/{poll_id}/results"),
            403,
            int(ApiCode.RESULTS_NOT_AVAILABLE),
        )
        denied = post_json(
            voter,
            f"/api/v1/polls/{poll_id}/close",
            {"expected_version": 2},
            csrf=voter_csrf,
        )
        error_body(denied, 403, int(ApiCode.FORBIDDEN))

    with TestClient(auth_app) as admin:
        register_and_login(admin, "cara")
        _promote(auth_client, "cara")
        login(admin, "cara")
        snapshot = envelope(admin.get(f"/api/v1/polls/{poll_id}/results"), 200)
        assert snapshot["is_final"] is False
        assert envelope(admin.get("/api/v1/admin/polls"), 200)["total"] >= 1
        detail = envelope(admin.get(f"/api/v1/admin/polls/{poll_id}"), 200)
        assert detail["can_manage"] is False
        close = post_json(
            admin,
            f"/api/v1/polls/{poll_id}/close",
            {"expected_version": 2},
            csrf=login(admin, "cara"),
        )
        error_body(close, 403, int(ApiCode.FORBIDDEN))


def test_private_history_hides_expired_grant(auth_app: FastAPI, auth_client: TestClient) -> None:
    """私密授权到期后，结果和记名历史的总数都不泄露；重新解锁后恢复。"""
    csrf = register_and_login(auth_client, "ada")
    private_id, _private = _published_detail(
        auth_client,
        csrf,
        title="私密记名",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )
    public_id, public = _published_detail(auth_client, csrf, title="公开记名")
    anonymous_id, anonymous = _published_detail(
        auth_client,
        csrf,
        title="公开匿名",
        identity_mode="ANONYMOUS",
    )
    with TestClient(auth_app) as voter:
        register_and_login(voter, "bob")
        guest_csrf = ensure_guest(voter)
        unlock(voter, guest_csrf, private_id, share_code_of(auth_client, private_id))
        private_detail = envelope(voter.get(f"/api/v1/polls/{private_id}"), 200)
        named_receipt = envelope(
            cast(voter, guest_csrf, private_id, _options(private_detail)[0]),
            201,
        )
        public_receipt = envelope(cast(voter, guest_csrf, public_id, _options(public)[0]), 201)
        envelope(cast(voter, guest_csrf, anonymous_id, _options(anonymous)[0]), 201)
        post_json(
            auth_client,
            f"/api/v1/polls/{private_id}/close",
            {"expected_version": 2},
            csrf=csrf,
        )
        post_json(
            auth_client,
            f"/api/v1/polls/{public_id}/close",
            {"expected_version": 2},
            csrf=csrf,
        )
        visible = envelope(voter.get("/api/v1/me/votes"), 200)
        assert visible["total"] == 2
        assert "公开匿名" not in voter.get("/api/v1/me/votes").text
        assert envelope(voter.get(f"/api/v1/polls/{private_id}/results"), 200)["total_votes"] == 1

        clock_of(auth_client).advance(timedelta(minutes=61))
        error_body(
            voter.get(f"/api/v1/polls/{private_id}/results"),
            404,
            int(ApiCode.POLL_NOT_FOUND),
        )
        hidden = envelope(voter.get("/api/v1/me/votes"), 200)
        assert hidden["total"] == 1
        assert hidden["items"][0]["poll_title"] == "公开记名"
        assert hidden["items"][0]["receipt_id"] == public_receipt["receipt_id"]
        assert "私密记名" not in voter.get("/api/v1/me/votes").text

        unlock(voter, guest_csrf, private_id, share_code_of(auth_client, private_id))
        restored = envelope(voter.get("/api/v1/me/votes"), 200)
        assert restored["total"] == 2
        titles = {item["poll_title"] for item in restored["items"]}
        assert titles == {"私密记名", "公开记名"}
        receipts = {item["receipt_id"] for item in restored["items"]}
        assert named_receipt["receipt_id"] in receipts


def test_results_wait_for_inflight_valid_vote(auth_client: TestClient) -> None:
    """截止前已经持锁的合法票提交后，最终汇总会等待并计入。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, detail = _published_detail(auth_client, csrf, identity_mode="ANONYMOUS")
    option_id = _options(detail)[0]
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        connection.execute(
            text(
                "INSERT INTO votes "
                "(receipt_id, poll_id, identity_mode, voter_id, anonymous_voter_hash, "
                "option_id, submitted_at) "
                "VALUES (:receipt_id, :poll_id, 'ANONYMOUS', NULL, :digest, :option_id, NOW())"
            ),
            {
                "receipt_id": uuid4(),
                "poll_id": poll_id,
                "digest": "ef" * 32,
                "option_id": option_id,
            },
        )
        worker, box = _run_waiting(lambda: auth_client.get(f"/api/v1/polls/{poll_id}/results"))
        _wait_for_poll_waiter(engine)
        clock_of(auth_client).advance(timedelta(hours=3))
        transaction.commit()
        response = _join(worker, box)
        result = envelope(response, 200)
        assert result["total_votes"] == 1
        assert result["is_final"] is True
        assert result["options"][0]["count"] == 1
        lifecycle, closed_at, _password = poll_row(auth_client, poll_id)
        assert lifecycle == "PUBLISHED"
        assert closed_at is None
    finally:
        _finish(connection, transaction, worker)
