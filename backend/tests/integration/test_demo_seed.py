"""固定示例的幂等写入和冲突回滚。"""

from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.main.python.algorithms.demo_module import demo_seed_service
from src.main.python.algorithms.demo_module.demo_seed_service import (
    DemoSeedError,
    ensure_demo_polls,
)
from src.main.python.database.models import (
    DemoPollFixture,
    Poll,
    PollOption,
    User,
    Vote,
    VoteSelection,
)
from src.main.python.utils.security_util import anonymous_voter_hash
from tests.auth_support import PASSWORD
from tests.poll_support import open_session

ACCESS_PASSWORD = "demo-access-pass"


def _account(client: TestClient, username: str, *, active: bool = True) -> User:
    """写入一个可重复登录的测试账户。

    Args:
        client: 测试客户端。
        username: 用户名。
        active: 是否允许登录。

    Returns:
        已提交的账户。
    """
    with open_session(client) as session:
        user = User(
            username=username,
            display_name=username,
            password_hash=client.app.state.passwords.hash(PASSWORD),
            role="USER",
            is_active=active,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user


def _ensure(client: TestClient, password: str = ACCESS_PASSWORD):
    """用测试时钟和低成本散列补齐示例。

    Args:
        client: 已准备 demo_user 的客户端。
        password: 新私密示例的访问密码。

    Returns:
        新建和跳过的数量。
    """
    return ensure_demo_polls(
        client.app.state.session_factory,
        client.app.state.clock,
        password,
        hmac_key=client.app.state.settings.anon_voter_hmac_key,
        passwords=client.app.state.passwords,
    )


def _counts(session: Session, poll_id: int) -> list[int]:
    """按选项位置统计选择次数。

    Args:
        session: 当前会话。
        poll_id: 投票主键。

    Returns:
        四个选项的选择次数。
    """
    options = session.scalars(
        select(PollOption).where(PollOption.poll_id == poll_id).order_by(PollOption.position)
    ).all()
    return [
        int(
            session.scalar(
                select(func.count())
                .select_from(VoteSelection)
                .where(VoteSelection.option_id == option.id)
            )
            or 0
        )
        for option in options
    ]


def test_first_seed_creates_38_and_second_seed_changes_nothing(auth_client: TestClient) -> None:
    """首次写入 38 场和 108 张预置票，再次启动不改时间、密码、标题或回执。"""
    _account(auth_client, "demo_user")
    _account(auth_client, "demo_voter")
    first = _ensure(auth_client)
    assert first.created == 38
    assert first.skipped == 0
    with open_session(auth_client) as session:
        assert session.scalar(select(func.count()).select_from(DemoPollFixture)) == 38
        assert session.scalar(select(func.count()).select_from(Vote)) == 108
        single = session.scalar(select(Poll).where(Poll.title == "Annual Tech Symposium Keynote Speaker"))
        multiple = session.scalar(
            select(Poll).where(Poll.title == "Outdoor Adventure Club Excursion Destinations")
        )
        assert single is not None and multiple is not None
        assert _counts(session, single.id) == [1, 2, 0, 0]
        assert _counts(session, multiple.id) == [1, 3, 1, 1]
        assert (
            session.scalar(
                select(func.count()).select_from(Vote).where(Vote.poll_id == single.id)
            )
            == 3
        )
        named = session.scalars(select(Vote).where(Vote.poll_id == single.id)).all()
        assert all(
            vote.voter_id is not None and vote.anonymous_voter_hash is None for vote in named
        )
        anon = session.scalars(select(Vote).where(Vote.poll_id == multiple.id)).all()
        assert all(vote.voter_id is None and vote.anonymous_voter_hash for vote in anon)
        assert len({vote.anonymous_voter_hash for vote in anon}) == 3
        creator = session.scalar(select(User).where(User.username == "demo_user"))
        assert creator is not None
        assert (
            session.scalar(
                select(func.count()).select_from(Vote).where(Vote.voter_id == creator.id)
            )
            == 0
        )
        fixture_user = session.scalar(select(User).where(User.username == "fixture_voter_01"))
        assert fixture_user is not None and fixture_user.is_active is False
        private = session.scalar(
            select(Poll).where(Poll.title == "Enterprise Cloud Infrastructure Modernization")
        )
        assert private is not None
        snapshot = {
            "title": single.title,
            "starts_at": single.starts_at,
            "ends_at": single.ends_at,
            "share_code": single.share_code,
            "password": private.private_password,
            "receipts": tuple(sorted(str(vote.receipt_id) for vote in named)),
        }
        single.title = "Edited by a person"
        session.commit()
        poll_id = single.id
        private_id = private.id
    auth_client.app.state.clock.advance(__import__("datetime").timedelta(days=2))
    second = _ensure(auth_client, "replacement-password")
    assert second.created == 0
    assert second.skipped == 38
    with open_session(auth_client) as session:
        edited = session.get(Poll, poll_id)
        private = session.get(Poll, private_id)
        assert edited is not None and private is not None
        assert edited.title == "Edited by a person"
        assert edited.starts_at == snapshot["starts_at"]
        assert edited.ends_at == snapshot["ends_at"]
        assert edited.share_code == snapshot["share_code"]
        assert private.private_password == snapshot["password"]
        poll_receipts = select(Vote.receipt_id).where(Vote.poll_id == poll_id)
        receipts = tuple(sorted(str(item) for item in session.scalars(poll_receipts)))
        assert receipts == snapshot["receipts"]
        assert session.scalar(select(func.count()).select_from(Vote)) == 108


def test_concurrent_seeds_still_leave_one_catalog(auth_client: TestClient) -> None:
    """两个进程等待同一把锁后仍然只有 38 场。"""
    _account(auth_client, "demo_user")
    with ThreadPoolExecutor(max_workers=2) as pool:
        reports = list(pool.map(lambda _index: _ensure(auth_client), range(2)))
    assert sorted(report.created for report in reports) == [0, 38]
    with open_session(auth_client) as session:
        assert session.scalar(select(func.count()).select_from(DemoPollFixture)) == 38
        assert session.scalar(select(func.count()).select_from(Vote)) == 108


def test_mid_batch_failure_rolls_back_the_whole_seed(auth_client: TestClient, monkeypatch) -> None:
    """写到一半失败时，示例、选票和种子账户全部回滚。"""
    _account(auth_client, "demo_user")
    calls = {"n": 0}
    original = demo_seed_service._insert_demo_poll

    def fail_on_second(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("injected")
        return original(*args, **kwargs)

    monkeypatch.setattr(demo_seed_service, "_insert_demo_poll", fail_on_second)
    with pytest.raises(RuntimeError, match="injected"):
        _ensure(auth_client)
    with open_session(auth_client) as session:
        assert session.scalar(select(func.count()).select_from(DemoPollFixture)) == 0
        assert session.scalar(select(func.count()).select_from(Vote)) == 0
        assert session.scalar(select(User).where(User.username == "fixture_voter_01")) is None


def test_unregistered_same_name_user_is_left_unchanged(auth_client: TestClient) -> None:
    """同名但未登记的账户不会被停用、改密或拿来投票。"""
    _account(auth_client, "demo_user")
    existing = _account(auth_client, "fixture_voter_01")
    with pytest.raises(DemoSeedError, match="without a fixture link"):
        _ensure(auth_client)
    with open_session(auth_client) as session:
        user = session.get(User, existing.id)
        assert user is not None
        assert user.is_active is True
        assert user.password_hash == existing.password_hash
        assert session.scalar(select(func.count()).select_from(DemoPollFixture)) == 0
        assert session.scalar(select(func.count()).select_from(Vote)) == 0


def test_version_conflict_and_unknown_key_do_not_overwrite(auth_client: TestClient) -> None:
    """版本不符或目录外的键会失败，并且不补写其余示例。"""
    _account(auth_client, "demo_user")
    _ensure(auth_client)
    with open_session(auth_client) as session:
        row = session.get(DemoPollFixture, "named-public-01")
        assert row is not None
        row.dataset_version = "other"
        session.commit()
    with pytest.raises(DemoSeedError, match="version"):
        _ensure(auth_client)
    with open_session(auth_client) as session:
        assert session.scalar(select(func.count()).select_from(DemoPollFixture)) == 38
        row = session.get(DemoPollFixture, "named-public-01")
        assert row is not None and row.dataset_version == "other"
        row.dataset_version = "2026-10-29.1"
        row.fixture_key = "legacy-round"
        session.commit()
    with pytest.raises(DemoSeedError, match="not in the catalog"):
        _ensure(auth_client)
    with open_session(auth_client) as session:
        assert session.scalar(select(func.count()).select_from(DemoPollFixture)) == 38
        assert session.get(DemoPollFixture, "named-public-01") is None


def test_closed_seed_ballots_stay_inside_the_poll_window(auth_client: TestClient) -> None:
    """自然结束和显式关闭的预置票都落在各自窗口内。"""
    _account(auth_client, "demo_user")
    _ensure(auth_client)
    with open_session(auth_client) as session:
        closed = session.scalar(select(Poll).where(Poll.title == "Completed Spring Career Fair Feedback Survey"))
        manual = session.scalar(select(Poll).where(Poll.title == "Executive Release Milestone Scope Decision"))
        assert closed is not None and manual is not None
        assert closed.lifecycle == "PUBLISHED" and closed.closed_at is None
        assert manual.lifecycle == "CLOSED" and manual.closed_at is not None
        for poll in (closed, manual):
            votes = session.scalars(select(Vote).where(Vote.poll_id == poll.id)).all()
            assert len(votes) == 3
            assert all(poll.starts_at <= vote.submitted_at < poll.ends_at for vote in votes)
        full = session.scalar(select(Poll).where(Poll.title == "Cloud Architecture Hands-On Lab (Full)"))
        assert full is not None and full.lifecycle == "CLOSED" and full.vote_limit == 3
        key = auth_client.app.state.settings.anon_voter_hmac_key
        sample = session.scalar(select(Vote).where(Vote.poll_id == closed.id))
        assert sample is not None and sample.anonymous_voter_hash is not None
        assert sample.anonymous_voter_hash != anonymous_voter_hash(key, closed.id, "not-the-token")
