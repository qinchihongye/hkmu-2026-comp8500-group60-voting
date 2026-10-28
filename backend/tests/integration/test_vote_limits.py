"""选票份数上限、多选数量和达额自动结束。"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Vote, VoteSelection
from tests.auth_support import envelope, error_body
from tests.poll_support import (
    ACCESS_PASSWORD,
    audit_actions,
    cast,
    create_poll,
    ensure_guest,
    insert_anonymous_vote,
    open_session,
    poll_row,
    publish_poll,
    register_and_login,
    share_code_of,
    unlock,
)

_THREE = [{"label": "甲"}, {"label": "乙"}, {"label": "丙"}]


def _option_ids(detail: dict[str, object]) -> list[int]:
    """按展示顺序读取选项编号。

    Args:
        detail: 投票详情。

    Returns:
        选项主键列表。
    """
    options = detail["options"]
    assert isinstance(options, list)
    return [int(item["id"]) for item in options]


def _counts(client: TestClient, poll_id: int) -> tuple[int, int]:
    """统计一场投票的选票份数和选择次数。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。

    Returns:
        父票行数和明细行数。
    """
    with open_session(client) as session:
        ballots = session.scalar(
            select(func.count()).select_from(Vote).where(Vote.poll_id == poll_id)
        )
        selections = session.scalar(
            select(func.count())
            .select_from(VoteSelection)
            .where(VoteSelection.poll_id == poll_id)
        )
    return int(ballots or 0), int(selections or 0)


def _publish(
    client: TestClient,
    csrf: str,
    **overrides: object,
) -> tuple[int, list[int]]:
    """创建并发布一场已经开始的投票。

    Args:
        client: 已登录客户端。
        csrf: 账户 CSRF。
        overrides: 覆盖默认投票字段。

    Returns:
        投票主键和按位置排列的选项编号。
    """
    created = create_poll(client, csrf, **overrides)
    poll_id = int(created["id"])
    publish_poll(client, csrf, poll_id, 1)
    detail = envelope(client.get(f"/api/v1/polls/{poll_id}"), 200)
    return poll_id, _option_ids(detail)


def _selection_sizes(client: TestClient, poll_id: int) -> list[int]:
    """读取每份选票的选择数量。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。

    Returns:
        按升序排列的每份选择数。
    """
    with open_session(client) as session:
        votes = session.scalars(select(Vote).where(Vote.poll_id == poll_id)).all()
        sizes = [len(vote.selections) for vote in votes]
    return sorted(sizes)


def test_single_choice_rejects_two_options(auth_client: TestClient) -> None:
    """单选勾选两项时整份拒绝，不留下父票或明细。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, option_ids = _publish(auth_client, csrf)
    guest_csrf = ensure_guest(auth_client)
    rejected = cast(auth_client, guest_csrf, poll_id, option_ids)
    body = error_body(rejected, 422, int(ApiCode.INVALID_SELECTION_COUNT))
    assert body["data"] is None
    assert body["msg"] == ApiCode.INVALID_SELECTION_COUNT.default_message
    assert _counts(auth_client, poll_id) == (0, 0)


def test_multiple_accepts_one_two_and_all_options(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """多选可以选一项、两项或全部，每份请求只占一张父票。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, option_ids = _publish(
        auth_client,
        csrf,
        selection_mode="MULTIPLE",
        options=_THREE,
    )
    ada_guest = ensure_guest(auth_client)
    with TestClient(auth_app) as bob, TestClient(auth_app) as cara:
        register_and_login(bob, "bob")
        register_and_login(cara, "cara")
        one = cast(auth_client, ada_guest, poll_id, [option_ids[0]])
        two = cast(bob, ensure_guest(bob), poll_id, option_ids[:2])
        everything = cast(cara, ensure_guest(cara), poll_id, option_ids)
    envelope(one, 201)
    envelope(two, 201)
    envelope(everything, 201)
    assert _counts(auth_client, poll_id) == (3, 6)
    assert _selection_sizes(auth_client, poll_id) == [1, 2, 3]
    assert poll_row(auth_client, poll_id)[0] == "PUBLISHED"


def test_foreign_option_rejects_the_whole_ballot(auth_client: TestClient) -> None:
    """混入其他场次的选项时，合法选项也不保存。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, option_ids = _publish(
        auth_client,
        csrf,
        identity_mode="ANONYMOUS",
        selection_mode="MULTIPLE",
        options=_THREE,
    )
    _other_id, other_ids = _publish(
        auth_client,
        csrf,
        title="另一场",
        identity_mode="ANONYMOUS",
        selection_mode="MULTIPLE",
        options=_THREE,
    )
    guest_csrf = ensure_guest(auth_client)
    mixed = cast(auth_client, guest_csrf, poll_id, [option_ids[0], other_ids[0]])
    body = error_body(mixed, 422, int(ApiCode.INVALID_OPTION))
    assert body["data"] is None
    assert _counts(auth_client, poll_id) == (0, 0)


def test_repeat_submission_does_not_add_ballots_or_selections(auth_client: TestClient) -> None:
    """同一身份再次提交不增加父票或明细，详情仍返回原回执。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, option_ids = _publish(
        auth_client,
        csrf,
        selection_mode="MULTIPLE",
        options=_THREE,
    )
    guest_csrf = ensure_guest(auth_client)
    first = cast(auth_client, guest_csrf, poll_id, option_ids[:2])
    receipt = envelope(first, 201)
    second = cast(auth_client, guest_csrf, poll_id, [option_ids[0]])
    error_body(second, 409, int(ApiCode.ALREADY_VOTED))
    assert _counts(auth_client, poll_id) == (1, 2)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    assert detail["has_voted"] is True
    receipt_body = detail["receipt"]
    assert isinstance(receipt_body, dict)
    assert receipt_body["receipt_id"] == receipt["receipt_id"]


def test_three_choices_count_as_one_ballot_for_each_limit(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """上限为 1、2 或无限额时，一次勾选三项都只占一份。"""
    csrf = register_and_login(auth_client, "ada")
    ada_guest = ensure_guest(auth_client)
    limited = _publish(
        auth_client,
        csrf,
        title="上限两份",
        selection_mode="MULTIPLE",
        vote_limit=2,
        options=_THREE,
    )
    unlimited = _publish(
        auth_client,
        csrf,
        title="不限份数",
        selection_mode="MULTIPLE",
        vote_limit=None,
        options=_THREE,
    )
    limited_id, limited_options = limited
    unlimited_id, unlimited_options = unlimited
    envelope(cast(auth_client, ada_guest, limited_id, limited_options), 201)
    envelope(cast(auth_client, ada_guest, unlimited_id, unlimited_options), 201)
    assert _counts(auth_client, limited_id) == (1, 3)
    assert _counts(auth_client, unlimited_id) == (1, 3)
    assert poll_row(auth_client, limited_id)[0] == "PUBLISHED"
    assert poll_row(auth_client, unlimited_id)[0] == "PUBLISHED"

    with TestClient(auth_app) as bob:
        register_and_login(bob, "bob")
        bob_guest = ensure_guest(bob)
        envelope(cast(bob, bob_guest, limited_id, [limited_options[0]]), 201)
        envelope(cast(bob, bob_guest, unlimited_id, [unlimited_options[0]]), 201)
    assert _counts(auth_client, limited_id) == (2, 4)
    assert _counts(auth_client, unlimited_id) == (2, 4)
    assert poll_row(auth_client, limited_id)[0] == "CLOSED"
    assert poll_row(auth_client, unlimited_id)[0] == "PUBLISHED"


def test_last_ballot_closes_and_same_identity_recovers_receipt(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """最后一份返回 201 并关闭；下一身份收到容量错误，原身份仍能取回回执。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, option_ids = _publish(
        auth_client,
        csrf,
        selection_mode="MULTIPLE",
        vote_limit=1,
        options=_THREE,
    )
    guest_csrf = ensure_guest(auth_client)
    accepted = cast(auth_client, guest_csrf, poll_id, option_ids)
    receipt = envelope(accepted, 201)
    lifecycle, closed_at, _password_hash = poll_row(auth_client, poll_id)
    assert lifecycle == "CLOSED"
    assert closed_at is not None
    assert _counts(auth_client, poll_id) == (1, 3)
    actions = audit_actions(auth_client, poll_id)
    assert actions.count("VOTE_NAMED") == 1
    assert "CLOSE" not in actions

    replay = cast(auth_client, guest_csrf, poll_id, [option_ids[0]])
    error_body(replay, 409, int(ApiCode.ALREADY_VOTED))
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    receipt_body = detail["receipt"]
    assert isinstance(receipt_body, dict)
    assert receipt_body["receipt_id"] == receipt["receipt_id"]
    assert detail["can_vote"] is False

    with TestClient(auth_app) as bob:
        register_and_login(bob, "bob")
        rejected = cast(bob, ensure_guest(bob), poll_id, [option_ids[1]])
        body = error_body(rejected, 409, int(ApiCode.POLL_CAPACITY_REACHED))
    assert body["data"] is None
    assert body["msg"] == ApiCode.POLL_CAPACITY_REACHED.default_message
    assert _counts(auth_client, poll_id) == (1, 3)


def test_selection_flush_failure_leaves_no_ballot_audit_or_close(
    auth_client: TestClient,
    monkeypatch: object,
) -> None:
    """明细写入失败时，父票、记名审计和自动结束一起回滚。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, option_ids = _publish(
        auth_client,
        csrf,
        vote_limit=1,
    )
    guest_csrf = ensure_guest(auth_client)
    before = envelope(auth_client.get(f"/api/v1/me/polls/{poll_id}"), 200)
    real_flush = Session.flush

    def fail_selections(self: Session, *args: object, **kwargs: object) -> None:
        """在明细进入事务时失败。

        Args:
            self: 当前数据库会话。
            args: 原位置参数。
            kwargs: 原关键字参数。

        Raises:
            SQLAlchemyError: 会话里有待写入的选择明细。
        """
        pending = any(isinstance(item, VoteSelection) for item in self.new)
        if pending:
            raise SQLAlchemyError("selection flush failed")
        real_flush(self, *args, **kwargs)

    monkeypatch.setattr(Session, "flush", fail_selections)
    failed = cast(auth_client, guest_csrf, poll_id, option_ids[0])
    monkeypatch.setattr(Session, "flush", real_flush)
    error_body(failed, 503, int(ApiCode.SERVICE_UNAVAILABLE))
    assert _counts(auth_client, poll_id) == (0, 0)
    assert "VOTE_NAMED" not in audit_actions(auth_client, poll_id)
    assert "CLOSE" not in audit_actions(auth_client, poll_id)
    after = envelope(auth_client.get(f"/api/v1/me/polls/{poll_id}"), 200)
    assert after["lifecycle"] == "PUBLISHED"
    assert after["version"] == before["version"]
    assert after["closed_at"] is None


def test_open_poll_hides_live_totals(auth_app: FastAPI, auth_client: TestClient) -> None:
    """进行中的普通参与者不能读取实时汇总，详情也不返回剩余名额。"""
    csrf = register_and_login(auth_client, "ada")
    poll_id, _option_ids = _publish(auth_client, csrf, title="进行中汇总")
    with TestClient(auth_app) as bob:
        register_and_login(bob, "bob")
        error_body(
            bob.get(f"/api/v1/polls/{poll_id}/results"),
            403,
            int(ApiCode.RESULTS_NOT_AVAILABLE),
        )
        detail = envelope(bob.get(f"/api/v1/polls/{poll_id}"), 200)
    assert detail["can_vote"] is True
    assert "remaining" not in detail
    assert "total_votes" not in detail
    assert "ballot_count" not in detail


def test_can_vote_is_false_when_capacity_is_full_but_still_open(auth_app: FastAPI) -> None:
    """名额已满但尚未关闭时，其他身份不能投票，响应也不带剩余名额。"""
    with (
        TestClient(auth_app) as creator,
        TestClient(auth_app) as filler,
        TestClient(auth_app) as other,
    ):
        csrf = register_and_login(creator, "ada")
        poll_id, option_ids = _publish(
            creator,
            csrf,
            identity_mode="ANONYMOUS",
            vote_limit=1,
        )
        ensure_guest(filler)
        insert_anonymous_vote(filler, poll_id, option_ids[0])
        ensure_guest(other)
        detail = envelope(other.get(f"/api/v1/polls/{poll_id}"), 200)
    assert detail["effective_status"] == "OPEN"
    assert detail["has_voted"] is False
    assert detail["can_vote"] is False
    assert "remaining" not in detail
    assert poll_row(creator, poll_id)[0] == "PUBLISHED"


def test_full_private_poll_still_requires_access(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """已满的私密场次仍先检查授权，未授权者看不到容量错误。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(
        auth_client,
        csrf,
        identity_mode="ANONYMOUS",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
        vote_limit=1,
    )
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    option_id = _option_ids(detail)[0]
    share_code = share_code_of(auth_client, poll_id)

    with TestClient(auth_app) as filler:
        filler_guest = ensure_guest(filler)
        unlock(filler, filler_guest, poll_id, share_code)
        receipt = envelope(cast(filler, filler_guest, poll_id, option_id), 201)
        replay = cast(filler, filler_guest, poll_id, option_id)
        error_body(replay, 409, int(ApiCode.ALREADY_VOTED))
        recovered = envelope(filler.get(f"/api/v1/polls/{poll_id}"), 200)
    assert poll_row(auth_client, poll_id)[0] == "CLOSED"
    recovered_receipt = recovered["receipt"]
    assert isinstance(recovered_receipt, dict)
    assert recovered_receipt["receipt_id"] == receipt["receipt_id"]

    creator_guest = ensure_guest(auth_client)
    denied = cast(auth_client, creator_guest, poll_id, option_id)
    error_body(denied, 403, int(ApiCode.POLL_ACCESS_REQUIRED))

    with TestClient(auth_app) as stranger:
        stranger_guest = ensure_guest(stranger)
        error_body(
            stranger.get(f"/api/v1/polls/{poll_id}"),
            404,
            int(ApiCode.POLL_NOT_FOUND),
        )
        hidden = cast(stranger, stranger_guest, poll_id, option_id)
        error_body(hidden, 404, int(ApiCode.POLL_NOT_FOUND))
        unlock(stranger, stranger_guest, poll_id, share_code)
        full = cast(stranger, stranger_guest, poll_id, option_id)
        body = error_body(full, 409, int(ApiCode.POLL_CAPACITY_REACHED))
    assert body["data"] is None
    assert _counts(auth_client, poll_id) == (1, 1)
