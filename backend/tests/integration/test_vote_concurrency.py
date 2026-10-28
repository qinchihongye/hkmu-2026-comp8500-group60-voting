"""同一 poll 行锁下的并发投票与关闭。顺序由数据库锁确认，不用固定等待猜测先后。"""

import threading
from collections.abc import Callable
from datetime import timedelta
from uuid import uuid4

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select, text
from sqlalchemy.engine import Connection, Transaction
from sqlalchemy.exc import IntegrityError

from src.main.python.config.database_config import engine_for
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Vote, VoteSelection
from tests.auth_support import envelope, error_body
from tests.poll_support import (
    cast,
    clock_of,
    create_poll,
    ensure_guest,
    open_session,
    poll_row,
    publish_poll,
    register_and_login,
)

_JOIN_SECONDS = 5.0


def _option(detail: dict[str, object]) -> int:
    """读取详情中的第一个选项。

    Args:
        detail: 投票详情。

    Returns:
        选项主键。
    """
    options = detail["options"]
    assert isinstance(options, list)
    return int(options[0]["id"])


def _vote_count(client: TestClient, poll_id: int) -> int:
    """统计一场投票已经提交的选票。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。

    Returns:
        选票行数。
    """
    with open_session(client) as session:
        total = session.scalar(
            select(func.count()).select_from(Vote).where(Vote.poll_id == poll_id)
        )
    return int(total or 0)


def _engine(client: TestClient) -> Engine:
    """取得测试应用正在使用的数据库引擎。

    Args:
        client: 测试客户端。

    Returns:
        与应用会话工厂绑定的引擎。
    """
    return engine_for(client.app.state.session_factory)


def _clone(app: FastAPI, source: TestClient) -> TestClient:
    """复制 Cookie，模拟同一浏览器的另一个连接。

    Args:
        app: 测试应用。
        source: 已经登录并建立访客上下文的客户端。

    Returns:
        持有相同 Cookie 的新客户端。调用方负责关闭。
    """
    clone = TestClient(app)
    clone.__enter__()
    for name, value in source.cookies.items():
        clone.cookies.set(name, value)
    return clone


def _lock_poll(engine: Engine, poll_id: int) -> tuple[Connection, Transaction]:
    """在独立连接上取得这场投票的写锁，并保持到调用方结束事务。

    Args:
        engine: 测试库引擎。
        poll_id: 投票主键。

    Returns:
        持有锁的连接，以及尚未提交的事务。
    """
    connection = engine.connect()
    transaction = connection.begin()
    connection.execute(
        text("SELECT id FROM polls WHERE id = :poll_id FOR UPDATE"),
        {"poll_id": poll_id},
    ).scalar_one()
    return connection, transaction


def _release(connection: Connection, transaction: Transaction) -> None:
    """回滚尚未结束的持锁事务并归还连接。

    Args:
        connection: 持锁连接。
        transaction: 该连接上的事务。
    """
    if transaction.is_active:
        transaction.rollback()
    connection.close()


def _finish(
    connection: Connection,
    transaction: Transaction,
    worker: threading.Thread | None,
) -> None:
    """先放开行锁，再等待后台请求结束，避免测试失败时留下阻塞事务。

    Args:
        connection: 持锁连接。
        transaction: 该连接上的事务。
        worker: 正在等待这把锁的请求线程。还没启动时为空。
    """
    _release(connection, transaction)
    if worker is not None:
        worker.join(_JOIN_SECONDS)


def _wait_for_poll_waiter(engine: Engine) -> None:
    """等到确实有事务在等待 polls 行锁。

    Args:
        engine: 测试库引擎。

    Raises:
        AssertionError: 截止时间内没有观察到等待者。
    """
    deadline = threading.Event()

    def _stop() -> None:
        """到时后结束轮询。"""
        deadline.set()

    timer = threading.Timer(_JOIN_SECONDS, _stop)
    timer.start()
    try:
        while not deadline.is_set():
            with engine.connect() as probe:
                # PostgreSQL 把行锁等待记在对方事务上，relation 为空。
                # 因此要求：未授予的事务锁，正被一个已经锁住 polls 行的事务持有。
                waiting = probe.execute(
                    text(
                        "SELECT COUNT(*) FROM pg_locks AS blocked "
                        "JOIN pg_locks AS blocking "
                        "ON blocking.locktype = blocked.locktype "
                        "AND blocking.transactionid = blocked.transactionid "
                        "AND blocking.pid <> blocked.pid "
                        "AND blocking.granted "
                        "AND NOT blocked.granted "
                        "JOIN pg_locks AS rowlock "
                        "ON rowlock.pid = blocking.pid "
                        "AND rowlock.granted "
                        "AND rowlock.relation = 'polls'::regclass"
                    )
                ).scalar_one()
            if int(waiting) >= 1:
                return
            threading.Event().wait(0.02)
    finally:
        timer.cancel()
    raise AssertionError("没有观察到等待 polls 行锁的事务")


def _run_waiting(action: Callable[[], httpx.Response]) -> tuple[threading.Thread, list[object]]:
    """在后台发起会去锁 polls 的请求。

    Args:
        action: 发起请求的函数。

    Returns:
        后台线程，以及只放入一个响应或异常的列表。
    """
    box: list[object] = []

    def _target() -> None:
        """执行请求并把结果放进共享列表。"""
        try:
            box.append(action())
        except Exception as exc:  # noqa: BLE001
            box.append(exc)

    worker = threading.Thread(target=_target)
    worker.start()
    return worker, box


def _join(worker: threading.Thread, box: list[object]) -> httpx.Response:
    """等待后台请求结束。

    Args:
        worker: 请求线程。
        box: 线程写入的结果。

    Returns:
        HTTP 响应。

    Raises:
        AssertionError: 线程超时或请求抛出异常。
    """
    worker.join(_JOIN_SECONDS)
    assert not worker.is_alive()
    assert box
    result = box[0]
    assert isinstance(result, httpx.Response)
    return result


def _published(
    client: TestClient,
    *,
    identity_mode: str,
    title: str = "并发投票",
) -> tuple[str, int, int, str]:
    """创建并发布一场已经开始的投票。

    Args:
        client: 已登录客户端。
        identity_mode: NAMED 或 ANONYMOUS。
        title: 标题。

    Returns:
        账户 CSRF、投票主键、第一个选项和发布后的版本。
    """
    csrf = register_and_login(client, "ada")
    created = create_poll(client, csrf, title=title, identity_mode=identity_mode)
    poll_id = int(created["id"])
    published = publish_poll(client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(client)
    detail = envelope(client.get(f"/api/v1/polls/{poll_id}"), 200)
    return guest_csrf, poll_id, _option(detail), int(published["version"])


def test_named_same_account_allows_one_vote(auth_app: FastAPI, auth_client: TestClient) -> None:
    """同一记名账户的两个连接最多成功一票。"""
    guest_csrf, poll_id, option_id, _version = _published(auth_client, identity_mode="NAMED")
    other = _clone(auth_app, auth_client)
    try:
        barrier = threading.Barrier(2)
        responses: list[httpx.Response] = []
        lock = threading.Lock()

        def _vote(client: TestClient) -> None:
            """越过屏障后提交同一选项。"""
            barrier.wait(_JOIN_SECONDS)
            response = cast(client, guest_csrf, poll_id, option_id)
            assert isinstance(response, httpx.Response)
            with lock:
                responses.append(response)

        workers = [
            threading.Thread(target=_vote, args=(auth_client,)),
            threading.Thread(target=_vote, args=(other,)),
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(_JOIN_SECONDS)
            assert not worker.is_alive()
        statuses = sorted(response.status_code for response in responses)
        assert statuses == [201, 409]
        conflict = next(response for response in responses if response.status_code == 409)
        error_body(conflict, 409, int(ApiCode.ALREADY_VOTED))
        assert _vote_count(auth_client, poll_id) == 1
    finally:
        other.__exit__(None, None, None)


def test_anonymous_same_cookie_allows_one_vote(auth_app: FastAPI, auth_client: TestClient) -> None:
    """同一匿名浏览器凭据在一场里最多一票。"""
    guest_csrf, poll_id, option_id, _version = _published(auth_client, identity_mode="ANONYMOUS")
    other = _clone(auth_app, auth_client)
    try:
        barrier = threading.Barrier(2)
        responses: list[httpx.Response] = []
        lock = threading.Lock()

        def _vote(client: TestClient) -> None:
            """越过屏障后用相同访客凭据投票。"""
            barrier.wait(_JOIN_SECONDS)
            response = cast(client, guest_csrf, poll_id, option_id)
            assert isinstance(response, httpx.Response)
            with lock:
                responses.append(response)

        workers = [
            threading.Thread(target=_vote, args=(auth_client,)),
            threading.Thread(target=_vote, args=(other,)),
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(_JOIN_SECONDS)
            assert not worker.is_alive()
        assert sorted(response.status_code for response in responses) == [201, 409]
        assert _vote_count(auth_client, poll_id) == 1
    finally:
        other.__exit__(None, None, None)


def test_independent_anonymous_browsers_can_each_vote(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """两个独立浏览器可以各投一票。这是已声明的浏览器限制，不是一人一票。"""
    _guest_csrf, poll_id, option_id, _version = _published(auth_client, identity_mode="ANONYMOUS")
    other = TestClient(auth_app)
    other.__enter__()
    try:
        other_guest = ensure_guest(other)
        first = cast(auth_client, ensure_guest(auth_client), poll_id, option_id)
        second = cast(other, other_guest, poll_id, option_id)
        envelope(first, 201)
        envelope(second, 201)
        assert _vote_count(auth_client, poll_id) == 2
    finally:
        other.__exit__(None, None, None)


def test_close_under_lock_rejects_waiting_vote(auth_client: TestClient) -> None:
    """创建者持有 poll 锁并关闭后，正在等待的投票看到关闭状态且不入库。"""
    guest_csrf, poll_id, option_id, _version = _published(auth_client, identity_mode="ANONYMOUS")
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        worker, box = _run_waiting(lambda: cast(auth_client, guest_csrf, poll_id, option_id))
        _wait_for_poll_waiter(engine)
        connection.execute(
            text(
                "UPDATE polls SET lifecycle = 'CLOSED', closed_at = NOW(), "
                "version = version + 1, updated_at = NOW() WHERE id = :poll_id"
            ),
            {"poll_id": poll_id},
        )
        transaction.commit()
        response = _join(worker, box)
        error_body(response, 409, int(ApiCode.POLL_NOT_OPEN))
        assert _vote_count(auth_client, poll_id) == 0
    finally:
        _finish(connection, transaction, worker)


def test_inflight_vote_commits_before_close(auth_client: TestClient) -> None:
    """投票先持有锁并提交后，随后的关闭成功，这张票仍然保留。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf, identity_mode="ANONYMOUS")
    poll_id = int(created["id"])
    published = publish_poll(auth_client, csrf, poll_id, 1)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    option_id = _option(detail)
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        vote_id = connection.execute(
            text(
                "INSERT INTO votes "
                "(receipt_id, poll_id, identity_mode, voter_id, anonymous_voter_hash, "
                "submitted_at) "
                "VALUES (:receipt_id, :poll_id, 'ANONYMOUS', NULL, :digest, NOW()) "
                "RETURNING id"
            ),
            {
                "receipt_id": uuid4(),
                "poll_id": poll_id,
                "digest": "ab" * 32,
            },
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO vote_selections (vote_id, poll_id, option_id) "
                "VALUES (:vote_id, :poll_id, :option_id)"
            ),
            {"vote_id": vote_id, "poll_id": poll_id, "option_id": option_id},
        )
        worker, box = _run_waiting(
            lambda: auth_client.post(
                f"/api/v1/polls/{poll_id}/close",
                json={"data": {"expected_version": int(published["version"])}},
                headers={"Origin": "http://localhost:5173", "X-CSRF-Token": csrf},
            )
        )
        _wait_for_poll_waiter(engine)
        transaction.commit()
        response = _join(worker, box)
        envelope(response, 200)
        assert _vote_count(auth_client, poll_id) == 1
        assert poll_row(auth_client, poll_id)[0] == "CLOSED"
    finally:
        _finish(connection, transaction, worker)


def test_deadline_checked_after_lock(auth_client: TestClient) -> None:
    """请求在截止前到达，但取得锁时已经截止，则拒绝并且不入库。"""
    guest_csrf, poll_id, option_id, _version = _published(auth_client, identity_mode="ANONYMOUS")
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        worker, box = _run_waiting(lambda: cast(auth_client, guest_csrf, poll_id, option_id))
        _wait_for_poll_waiter(engine)
        clock_of(auth_client).advance(timedelta(hours=3))
        transaction.rollback()
        response = _join(worker, box)
        error_body(response, 409, int(ApiCode.POLL_NOT_OPEN))
        assert _vote_count(auth_client, poll_id) == 0
    finally:
        _finish(connection, transaction, worker)


def test_foreign_option_and_mode_rejected_by_database(auth_client: TestClient) -> None:
    """绕过服务直接插入时，跨场选项和票种仍被组合外键拒绝。"""
    csrf = register_and_login(auth_client, "ada")
    first = create_poll(auth_client, csrf, identity_mode="ANONYMOUS")
    second = create_poll(auth_client, csrf, title="另一场", identity_mode="ANONYMOUS")
    first_id = int(first["id"])
    second_id = int(second["id"])
    publish_poll(auth_client, csrf, first_id, 1)
    publish_poll(auth_client, csrf, second_id, 1)
    second_detail = envelope(auth_client.get(f"/api/v1/polls/{second_id}"), 200)
    foreign_option = _option(second_detail)

    with open_session(auth_client) as session:
        vote = Vote(
            receipt_id=uuid4(),
            poll_id=first_id,
            identity_mode="ANONYMOUS",
            voter_id=None,
            anonymous_voter_hash="cd" * 32,
            submitted_at=clock_of(auth_client).now(),
        )
        session.add(vote)
        session.flush()
        session.add(
            VoteSelection(vote_id=vote.id, poll_id=first_id, option_id=foreign_option)
        )
        with _raises_constraint("fk_vote_selections_option"):
            session.flush()
        session.rollback()
        session.add(
            Vote(
                receipt_id=uuid4(),
                poll_id=first_id,
                identity_mode="NAMED",
                voter_id=int(first["creator_id"]),
                anonymous_voter_hash=None,
                submitted_at=clock_of(auth_client).now(),
            )
        )
        with _raises_constraint("fk_votes_poll_mode"):
            session.flush()
        session.rollback()
    assert _vote_count(auth_client, first_id) == 0


def _race(actions: list[Callable[[], httpx.Response]]) -> list[httpx.Response]:
    """同时发起多份请求，并等它们全部结束。

    Args:
        actions: 各自独立的请求函数。

    Returns:
        与 actions 顺序一致的响应。
    """
    started = [_run_waiting(action) for action in actions]
    return [_join(worker, box) for worker, box in started]


def _limited(
    client: TestClient,
    *,
    identity_mode: str,
    vote_limit: int,
    title: str,
) -> tuple[str, str, int, int]:
    """创建并发布一场带上限的单选投票。

    Args:
        client: 已登录客户端。
        identity_mode: NAMED 或 ANONYMOUS。
        vote_limit: 整场最多接收的选票份数。
        title: 标题。

    Returns:
        账户 CSRF、访客 CSRF、投票主键和第一个选项。
    """
    csrf = register_and_login(client, "ada")
    created = create_poll(
        client,
        csrf,
        title=title,
        identity_mode=identity_mode,
        vote_limit=vote_limit,
        selection_mode="SINGLE",
    )
    poll_id = int(created["id"])
    publish_poll(client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(client)
    detail = envelope(client.get(f"/api/v1/polls/{poll_id}"), 200)
    return csrf, guest_csrf, poll_id, _option(detail)


def test_named_capacity_one_accepts_a_single_ballot(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """两个记名身份同时抢最后一份时，只成功一份并关闭。"""
    _csrf, ada_guest, poll_id, option_id = _limited(
        auth_client,
        identity_mode="NAMED",
        vote_limit=1,
        title="记名最后一份",
    )
    bob = TestClient(auth_app)
    bob.__enter__()
    try:
        register_and_login(bob, "bob")
        bob_guest = ensure_guest(bob)
        responses = _race(
            [
                lambda: cast(auth_client, ada_guest, poll_id, option_id),
                lambda: cast(bob, bob_guest, poll_id, option_id),
            ]
        )
    finally:
        bob.__exit__(None, None, None)
    _assert_capacity(auth_client, poll_id, responses, successes=1)


def test_anonymous_capacity_one_accepts_a_single_ballot(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """两个匿名浏览器同时抢最后一份时，只成功一份并关闭。"""
    _csrf, _guest, poll_id, option_id = _limited(
        auth_client,
        identity_mode="ANONYMOUS",
        vote_limit=1,
        title="匿名最后一份",
    )
    first = TestClient(auth_app)
    second = TestClient(auth_app)
    first.__enter__()
    second.__enter__()
    try:
        responses = _race(
            [
                lambda: cast(first, ensure_guest(first), poll_id, option_id),
                lambda: cast(second, ensure_guest(second), poll_id, option_id),
            ]
        )
    finally:
        second.__exit__(None, None, None)
        first.__exit__(None, None, None)
    _assert_capacity(auth_client, poll_id, responses, successes=1)


def test_anonymous_capacity_keeps_exactly_n_ballots(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """超过上限的匿名浏览器同时提交时，最终份数恰好等于上限。"""
    _csrf, _guest, poll_id, option_id = _limited(
        auth_client,
        identity_mode="ANONYMOUS",
        vote_limit=3,
        title="匿名三份",
    )
    browsers = [TestClient(auth_app) for _index in range(5)]
    try:
        for browser in browsers:
            browser.__enter__()
        responses = _race(
            [
                lambda browser=browser: cast(browser, ensure_guest(browser), poll_id, option_id)
                for browser in browsers
            ]
        )
    finally:
        for browser in browsers:
            browser.__exit__(None, None, None)
    _assert_capacity(auth_client, poll_id, responses, successes=3)


def test_named_capacity_keeps_exactly_n_ballots(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """超过上限的记名账户同时提交时，最终份数恰好等于上限。"""
    _csrf, ada_guest, poll_id, option_id = _limited(
        auth_client,
        identity_mode="NAMED",
        vote_limit=2,
        title="记名两份",
    )
    bob = TestClient(auth_app)
    cara = TestClient(auth_app)
    bob.__enter__()
    cara.__enter__()
    try:
        register_and_login(bob, "bob")
        register_and_login(cara, "cara")
        responses = _race(
            [
                lambda: cast(auth_client, ada_guest, poll_id, option_id),
                lambda: cast(bob, ensure_guest(bob), poll_id, option_id),
                lambda: cast(cara, ensure_guest(cara), poll_id, option_id),
            ]
        )
    finally:
        cara.__exit__(None, None, None)
        bob.__exit__(None, None, None)
    _assert_capacity(auth_client, poll_id, responses, successes=2)


def test_manual_close_beats_a_waiting_limited_vote(auth_client: TestClient) -> None:
    """上限尚未用完时，持锁关闭优先于等待中的投票。"""
    _csrf, guest_csrf, poll_id, option_id = _limited(
        auth_client,
        identity_mode="ANONYMOUS",
        vote_limit=5,
        title="关闭竞争",
    )
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        worker, box = _run_waiting(lambda: cast(auth_client, guest_csrf, poll_id, option_id))
        _wait_for_poll_waiter(engine)
        connection.execute(
            text(
                "UPDATE polls SET lifecycle = 'CLOSED', closed_at = NOW(), "
                "version = version + 1, updated_at = NOW() WHERE id = :poll_id"
            ),
            {"poll_id": poll_id},
        )
        transaction.commit()
        response = _join(worker, box)
        error_body(response, 409, int(ApiCode.POLL_NOT_OPEN))
        assert response.json()["code"] != int(ApiCode.POLL_CAPACITY_REACHED)
        assert _vote_count(auth_client, poll_id) == 0
    finally:
        _finish(connection, transaction, worker)


def test_deadline_beats_a_waiting_limited_vote(auth_client: TestClient) -> None:
    """上限尚未用完时，取得锁后的截止时间优先于容量。"""
    _csrf, guest_csrf, poll_id, option_id = _limited(
        auth_client,
        identity_mode="ANONYMOUS",
        vote_limit=5,
        title="截止竞争",
    )
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        worker, box = _run_waiting(lambda: cast(auth_client, guest_csrf, poll_id, option_id))
        _wait_for_poll_waiter(engine)
        clock_of(auth_client).advance(timedelta(hours=3))
        transaction.rollback()
        response = _join(worker, box)
        error_body(response, 409, int(ApiCode.POLL_NOT_OPEN))
        assert response.json()["code"] != int(ApiCode.POLL_CAPACITY_REACHED)
        assert _vote_count(auth_client, poll_id) == 0
    finally:
        _finish(connection, transaction, worker)


def test_waiting_vote_sees_capacity_filled_under_the_lock(auth_client: TestClient) -> None:
    """其他事务在锁内写满名额后，等待中的新身份收到容量错误。"""
    _csrf, guest_csrf, poll_id, option_id = _limited(
        auth_client,
        identity_mode="ANONYMOUS",
        vote_limit=1,
        title="锁内容量",
    )
    engine = _engine(auth_client)
    connection, transaction = _lock_poll(engine, poll_id)
    worker: threading.Thread | None = None
    try:
        worker, box = _run_waiting(lambda: cast(auth_client, guest_csrf, poll_id, option_id))
        _wait_for_poll_waiter(engine)
        vote_id = connection.execute(
            text(
                "INSERT INTO votes "
                "(receipt_id, poll_id, identity_mode, voter_id, anonymous_voter_hash, "
                "submitted_at) "
                "VALUES (:receipt_id, :poll_id, 'ANONYMOUS', NULL, :digest, NOW()) "
                "RETURNING id"
            ),
            {
                "receipt_id": uuid4(),
                "poll_id": poll_id,
                "digest": "ef" * 32,
            },
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO vote_selections (vote_id, poll_id, option_id) "
                "VALUES (:vote_id, :poll_id, :option_id)"
            ),
            {"vote_id": vote_id, "poll_id": poll_id, "option_id": option_id},
        )
        transaction.commit()
        response = _join(worker, box)
        error_body(response, 409, int(ApiCode.POLL_CAPACITY_REACHED))
        assert _vote_count(auth_client, poll_id) == 1
        assert poll_row(auth_client, poll_id)[0] == "PUBLISHED"
    finally:
        _finish(connection, transaction, worker)


def _assert_capacity(
    client: TestClient,
    poll_id: int,
    responses: list[httpx.Response],
    *,
    successes: int,
) -> None:
    """确认成功份数、容量拒绝和关闭状态。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。
        responses: 并发响应。
        successes: 期望成功的份数。
    """
    accepted = [item for item in responses if item.status_code == 201]
    rejected = [item for item in responses if item.status_code != 201]
    assert len(accepted) == successes
    assert len(rejected) == len(responses) - successes
    for item in accepted:
        envelope(item, 201)
    for item in rejected:
        error_body(item, 409, int(ApiCode.POLL_CAPACITY_REACHED))
    assert _vote_count(client, poll_id) == successes
    assert poll_row(client, poll_id)[0] == "CLOSED"


class _raises_constraint:
    """断言完整性错误来自指定约束。"""

    def __init__(self, name: str) -> None:
        """记录期望的约束名。

        Args:
            name: PostgreSQL 约束名。
        """
        self._name = name

    def __enter__(self) -> None:
        """开始捕获。"""

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        _tb: object,
    ) -> bool:
        """确认异常的约束名。

        Args:
            exc_type: 异常类型。
            exc: 异常实例。
            _tb: 追溯信息。

        Returns:
            约束名匹配时吞掉异常。
        """
        assert exc_type is IntegrityError
        assert isinstance(exc, IntegrityError)
        diag = getattr(exc.orig, "diag", None)
        assert diag is not None
        assert diag.constraint_name == self._name
        return True
