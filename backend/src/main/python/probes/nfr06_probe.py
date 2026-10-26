"""NFR-06 本地并发测量。

只连接 127.0.0.1:5433/voting_test。测完会删除自己写入的 nfr 数据。
"""

from __future__ import annotations

import math
import os
import platform
import subprocess
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from secrets import token_hex, token_urlsafe
from uuid import uuid4

import httpx
from sqlalchemy import delete, insert, select, text
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.config.database_config import create_session_factory, engine_for
from src.main.python.config.logger_config import get_logger
from src.main.python.config.server_config import get_settings
from src.main.python.database.models.access_grant import PollAccessGrant
from src.main.python.database.models.audit import AuditEvent
from src.main.python.database.models.guest import GuestSession
from src.main.python.database.models.poll import Poll, PollOption
from src.main.python.database.models.session import AuthSession
from src.main.python.database.models.user import User
from src.main.python.database.models.vote import Vote
from src.main.python.utils.security_util import AUTH_COOKIE, GUEST_COOKIE, hash_token

logger = get_logger("nfr06")

BASE_URL = "http://127.0.0.1:8000"
ORIGIN = "http://localhost:5173"
WORKERS = 20
WAVES = 5
HISTORICAL_VOTES = 10_000
POLL_COUNT = 100
USER_COUNT = 1_000


@dataclass
class Credential:
    """一次测量请求使用的浏览器或账户凭据。"""

    poll_id: int
    option_id: int
    guest_token: str
    guest_csrf: str
    session_token: str | None = None


@dataclass
class Dataset:
    """测量用的目标场次。"""

    closed_poll_id: int
    named: list[Credential]
    anonymous: list[Credential]
    guest_hashes: list[str]


def assert_safe_url(database_url: str) -> None:
    """拒绝开发库和其他端口。

    Args:
        database_url: 当前进程的数据库连接串。

    Raises:
        RuntimeError: 连接串不是本机 5433 上的 voting_test。
    """
    host = database_url.split("@", 1)[-1]
    if not host.startswith("127.0.0.1:5433/voting_test"):
        raise RuntimeError("NFR-06 只允许连接 127.0.0.1:5433/voting_test")


def assert_database(session: Session) -> None:
    """在写入前确认当前库名。

    Args:
        session: 已连接的会话。

    Raises:
        RuntimeError: 当前库不是 voting_test。
    """
    name = session.scalar(text("SELECT current_database()"))
    if name != "voting_test":
        raise RuntimeError("NFR-06 拒绝在非 voting_test 上写入")


def hardware() -> str:
    """读取本机平台、CPU 和内存。

    Returns:
        一行硬件摘要。
    """
    memory = "unknown"
    try:
        raw = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
        memory = f"{int(raw) / (1024**3):.1f}GiB"
    except (OSError, subprocess.CalledProcessError, ValueError):
        memory = "unknown"
    return f"system={platform.platform()} cpu={os.cpu_count()} mem={memory}"


def percentile(samples: list[float], ratio: float) -> float:
    """计算最近秩百分位。

    Args:
        samples: 毫秒样本。
        ratio: 0 到 1 之间的比例。

    Returns:
        对应样本。没有样本时为 0。
    """
    if not samples:
        return 0.0
    ordered = sorted(samples)
    index = max(0, math.ceil(ratio * len(ordered)) - 1)
    return ordered[index]


def seed(factory: sessionmaker[Session]) -> Dataset:
    """写入 100 场、1000 个账户和 10000 张历史票。

    Args:
        factory: 测试库会话工厂。

    Returns:
        读取和投票测量要用的凭据。

    Raises:
        RuntimeError: 缺少演示管理员，或写入数量不对。
    """
    now = datetime.now(UTC)
    with factory() as session:
        assert_database(session)
        admin_id = session.scalar(select(User.id).where(User.username == "admin"))
        password_hash = session.scalar(select(User.password_hash).where(User.username == "admin"))
        if admin_id is None or password_hash is None:
            raise RuntimeError("缺少演示管理员，无法复制密码散列")
        polls: list[dict[str, object]] = []
        for index in range(POLL_COUNT):
            closed = index < 80
            anonymous = closed or index >= 90
            polls.append(
                {
                    "title": f"nfr-{index:03d}",
                    "description": None,
                    "identity_mode": "ANONYMOUS" if anonymous else "NAMED",
                    "visibility": "PUBLIC",
                    "private_password_hash": None,
                    "share_code": token_urlsafe(32),
                    "lifecycle": "CLOSED" if closed else "PUBLISHED",
                    "starts_at": now - timedelta(hours=3),
                    "ends_at": now - timedelta(minutes=1) if closed else now + timedelta(hours=2),
                    "creator_id": admin_id,
                    "version": 2,
                    "closed_at": now if closed else None,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        session.execute(insert(Poll), polls)
        session.flush()
        poll_rows = list(
            session.execute(
                select(Poll.id, Poll.identity_mode, Poll.lifecycle)
                .where(Poll.title.like("nfr-%"))
                .order_by(Poll.id)
            )
        )
        if len(poll_rows) != POLL_COUNT:
            raise RuntimeError("性能测试场次数量不正确")
        options: list[dict[str, object]] = []
        for poll_id, _mode, _lifecycle in poll_rows:
            options.append({"poll_id": poll_id, "label": "甲", "position": 0})
            options.append({"poll_id": poll_id, "label": "乙", "position": 1})
        session.execute(insert(PollOption), options)
        session.flush()
        option_ids = {
            poll_id: option_id
            for poll_id, option_id in session.execute(
                select(PollOption.poll_id, PollOption.id).where(
                    PollOption.poll_id.in_([row[0] for row in poll_rows]),
                    PollOption.position == 0,
                )
            )
        }
        closed_rows = [row for row in poll_rows if row[2] == "CLOSED"]
        votes: list[dict[str, object]] = []
        per_poll = HISTORICAL_VOTES // len(closed_rows)
        for poll_id, mode, _lifecycle in closed_rows:
            for _ in range(per_poll):
                votes.append(
                    {
                        "receipt_id": uuid4(),
                        "poll_id": poll_id,
                        "identity_mode": mode,
                        "voter_id": None,
                        "anonymous_voter_hash": token_hex(32),
                        "option_id": option_ids[poll_id],
                        "submitted_at": now,
                    }
                )
        for start in range(0, len(votes), 2000):
            session.execute(insert(Vote), votes[start : start + 2000])
        users = [
            {
                "username": f"nfru{index:04d}",
                "display_name": f"nfr{index:04d}",
                "password_hash": password_hash,
                "role": "USER",
                "is_active": True,
                "created_at": now,
            }
            for index in range(USER_COUNT)
        ]
        session.execute(insert(User), users)
        session.flush()
        user_ids = list(
            session.scalars(select(User.id).where(User.username.like("nfru%")).order_by(User.id))
        )
        named_poll = next(row for row in poll_rows if row[1] == "NAMED" and row[2] == "PUBLISHED")
        anon_poll = next(
            row for row in poll_rows if row[1] == "ANONYMOUS" and row[2] == "PUBLISHED"
        )
        named, named_hashes = _sessions(
            session, user_ids[:100], named_poll[0], option_ids[named_poll[0]], now
        )
        anonymous, anon_hashes = _sessions(
            session, [None] * 100, anon_poll[0], option_ids[anon_poll[0]], now
        )
        session.commit()
        return Dataset(
            closed_poll_id=closed_rows[0][0],
            named=named,
            anonymous=anonymous,
            guest_hashes=[*named_hashes, *anon_hashes],
        )


def _sessions(
    session: Session,
    user_ids: list[int | None],
    poll_id: int,
    option_id: int,
    now: datetime,
) -> tuple[list[Credential], list[str]]:
    """为一批测量请求插入会话，返回调用方持有的原令牌。

    Args:
        session: 当前事务。
        user_ids: 记名账户。匿名测量传空。
        poll_id: 目标投票。
        option_id: 目标选项。
        now: 当前 UTC 时间。

    Returns:
        与插入顺序一致的凭据。
    """
    credentials: list[Credential] = []
    guest_hashes: list[str] = []
    auth_rows: list[dict[str, object]] = []
    guest_rows: list[dict[str, object]] = []
    for user_id in user_ids:
        guest_token = token_urlsafe(32)
        guest_csrf = token_urlsafe(32)
        session_token = token_urlsafe(32) if user_id is not None else None
        guest_hash = hash_token(guest_token)
        guest_hashes.append(guest_hash)
        guest_rows.append(
            {
                "token_hash": guest_hash,
                "csrf_token": guest_csrf,
                "created_at": now,
                "expires_at": now + timedelta(days=30),
            }
        )
        if user_id is not None and session_token is not None:
            auth_rows.append(
                {
                    "user_id": user_id,
                    "token_hash": hash_token(session_token),
                    "csrf_token": token_urlsafe(32),
                    "created_at": now,
                    "expires_at": now + timedelta(hours=8),
                }
            )
        credentials.append(
            Credential(poll_id, option_id, guest_token, guest_csrf, session_token)
        )
    session.execute(insert(GuestSession), guest_rows)
    if auth_rows:
        session.execute(insert(AuthSession), auth_rows)
    return credentials, guest_hashes


def cleanup(factory: sessionmaker[Session], guest_hashes: list[str]) -> None:
    """删除本脚本写入的场次、票、审计、授权、会话和账户。

    Args:
        factory: 测试库会话工厂。
        guest_hashes: 本脚本创建的访客令牌散列。
    """
    with factory() as session:
        assert_database(session)
        poll_ids = list(session.scalars(select(Poll.id).where(Poll.title.like("nfr-%"))))
        user_ids = list(session.scalars(select(User.id).where(User.username.like("nfru%"))))
        if poll_ids:
            session.execute(delete(AuditEvent).where(AuditEvent.poll_id.in_(poll_ids)))
            session.execute(delete(PollAccessGrant).where(PollAccessGrant.poll_id.in_(poll_ids)))
            session.execute(delete(Vote).where(Vote.poll_id.in_(poll_ids)))
            session.execute(delete(PollOption).where(PollOption.poll_id.in_(poll_ids)))
            session.execute(delete(Poll).where(Poll.id.in_(poll_ids)))
        if user_ids:
            session.execute(delete(AuditEvent).where(AuditEvent.actor_id.in_(user_ids)))
            session.execute(delete(AuthSession).where(AuthSession.user_id.in_(user_ids)))
            session.execute(delete(User).where(User.id.in_(user_ids)))
        if guest_hashes:
            session.execute(delete(GuestSession).where(GuestSession.token_hash.in_(guest_hashes)))
        session.commit()


def privacy(factory: sessionmaker[Session]) -> str:
    """核对匿名票没有账户，私密标题也不会出现在公开搜索里。

    Args:
        factory: 测试库会话工厂。

    Returns:
        一行核对结果。
    """
    with factory() as session:
        assert_database(session)
        linked = session.scalar(
            text(
                "SELECT COUNT(*) FROM votes "
                "WHERE identity_mode = 'ANONYMOUS' AND voter_id IS NOT NULL"
            )
        )
        audited = session.scalar(
            text(
                "SELECT COUNT(*) FROM audit_events AS event "
                "JOIN votes AS vote ON vote.receipt_id = event.receipt_id "
                "WHERE vote.identity_mode = 'ANONYMOUS'"
            )
        )
        private_title = session.scalar(
            text("SELECT title FROM polls WHERE visibility = 'PRIVATE' ORDER BY id DESC LIMIT 1")
        )
    hits = -1
    if private_title:
        response = httpx.get(
            f"{BASE_URL}/api/v1/polls",
            params={"q": private_title, "page": 1, "page_size": 12},
            timeout=10,
        )
        body = response.json()
        hits = int(body["data"]["total"]) if response.status_code == 200 else -1
    return f"anon_with_voter={linked} anon_audit_links={audited} private_search_hits={hits}"


def _status(call: Callable[[], int]) -> tuple[float, int]:
    """测量一次调用的耗时和状态码。

    Args:
        call: 返回 HTTP 状态码的函数。

    Returns:
        毫秒耗时和状态码。失败时状态码为 0。
    """
    started = time.perf_counter()
    try:
        status = call()
    except httpx.HTTPError:
        status = 0
    return (time.perf_counter() - started) * 1000, status


def burst(calls: list[Callable[[], int]], expected: int) -> tuple[float, float]:
    """以 20 并发分五波执行，返回 p95 和失败率。

    Args:
        calls: 全部请求。数量必须是 20 的倍数。
        expected: 成功状态码。

    Returns:
        p95 毫秒和失败率。
    """
    samples: list[float] = []
    failed = 0
    for wave in range(0, len(calls), WORKERS):
        chunk = calls[wave : wave + WORKERS]
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            results = list(pool.map(_status, chunk))
        for elapsed, status in results:
            samples.append(elapsed)
            if status != expected:
                failed += 1
    rate = failed / len(samples) if samples else 1.0
    return percentile(samples, 0.95), rate


def post_vote(item: Credential) -> int:
    """提交一张测量选票。

    Args:
        item: 本请求的场次和凭据。

    Returns:
        HTTP 状态码。
    """
    cookies = {GUEST_COOKIE: item.guest_token}
    if item.session_token is not None:
        cookies[AUTH_COOKIE] = item.session_token
    response = httpx.post(
        f"{BASE_URL}/api/v1/polls/{item.poll_id}/votes",
        json={"data": {"option_id": item.option_id}},
        headers={"Origin": ORIGIN, "X-CSRF-Token": item.guest_csrf},
        cookies=cookies,
        timeout=10,
    )
    return response.status_code


def get_results(poll_id: int) -> int:
    """读取一场已结束投票的汇总。

    Args:
        poll_id: 目标投票。

    Returns:
        HTTP 状态码。
    """
    response = httpx.get(f"{BASE_URL}/api/v1/polls/{poll_id}/results", timeout=10)
    return response.status_code


def get_polls() -> int:
    """读取公开投票第一页。

    Returns:
        HTTP 状态码。
    """
    response = httpx.get(
        f"{BASE_URL}/api/v1/polls",
        params={"page": 1, "page_size": 12},
        timeout=10,
    )
    return response.status_code


def measure(dataset: Dataset) -> None:
    """执行读取和投票测量并写日志。

    Args:
        dataset: 已提交的测量数据。
    """
    read_results, read_fail = burst(
        [lambda: get_results(dataset.closed_poll_id) for _ in range(WORKERS * WAVES)],
        200,
    )
    read_list, list_fail = burst([get_polls for _ in range(WORKERS * WAVES)], 200)
    named_calls = [lambda item=item: post_vote(item) for item in dataset.named]
    named_p95, named_fail = burst(named_calls, 201)
    anon_p95, anon_fail = burst(
        [lambda item=item: post_vote(item) for item in dataset.anonymous],
        201,
    )
    logger.info(
        "NFR-06 hardware %s polls=%s users=%s historical_votes=%s workers=%s samples=%s",
        hardware(),
        POLL_COUNT,
        USER_COUNT,
        HISTORICAL_VOTES,
        WORKERS,
        WORKERS * WAVES,
    )
    logger.info(
        "NFR-06 read_results_p95_ms=%.1f fail=%.3f list_p95_ms=%.1f fail=%.3f",
        read_results,
        read_fail,
        read_list,
        list_fail,
    )
    logger.info(
        "NFR-06 named_vote_p95_ms=%.1f fail=%.3f anon_vote_p95_ms=%.1f fail=%.3f",
        named_p95,
        named_fail,
        anon_p95,
        anon_fail,
    )
    read_p95 = max(read_results, read_list)
    vote_p95 = max(named_p95, anon_p95)
    logger.info(
        "NFR-06 target_read_ms=500 target_vote_ms=1000 read_ok=%s vote_ok=%s",
        read_p95 < 500,
        vote_p95 < 1000,
    )


def main() -> None:
    """连接测试库，测量后删除本脚本的数据。"""
    settings = get_settings()
    assert_safe_url(settings.database_url)
    factory = create_session_factory(settings.database_url)
    dataset: Dataset | None = None
    try:
        dataset = seed(factory)
        logger.info("NFR-06 privacy %s", privacy(factory))
        measure(dataset)
    finally:
        if dataset is not None:
            cleanup(factory, dataset.guest_hashes)
        engine_for(factory).dispose()


if __name__ == "__main__":
    main()
