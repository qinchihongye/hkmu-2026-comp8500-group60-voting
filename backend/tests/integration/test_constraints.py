"""记名、匿名和投票字段约束。"""

import threading
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.main.python.database.models import Poll, PollOption, User, Vote
from tests.integration.conftest import (
    add_option,
    add_poll,
    add_user,
    add_vote,
    truncate_application_tables,
)


def test_named_vote_rejects_same_account(
    db_session: Session,
) -> None:
    """同一场记名投票不能由同一账户投两次。"""
    user = add_user(db_session)
    poll = add_poll(db_session, user.id, identity_mode="NAMED")
    option = add_option(db_session, poll.id)
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=user.id,
        anonymous_voter_hash=None,
    )
    db_session.flush()
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=user.id,
        anonymous_voter_hash=None,
    )
    _expect_rejected(db_session, "uq_votes_named_poll_voter")


def test_anonymous_vote_rejects_same_browser_hash(db_session: Session) -> None:
    """同一场匿名投票不能重复使用同一个浏览器散列。"""
    creator = add_user(db_session)
    poll = add_poll(db_session, creator.id, identity_mode="ANONYMOUS")
    option = add_option(db_session, poll.id)
    browser_hash = "a" * 64
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="ANONYMOUS",
        voter_id=None,
        anonymous_voter_hash=browser_hash,
    )
    db_session.flush()
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="ANONYMOUS",
        voter_id=None,
        anonymous_voter_hash=browser_hash,
    )
    _expect_rejected(db_session, "uq_votes_anon_poll_browser")


def test_anonymous_vote_allows_different_browser_hashes(db_session: Session) -> None:
    """两个不同的匿名散列可以在同一场各投一票。"""
    creator = add_user(db_session)
    poll = add_poll(db_session, creator.id, identity_mode="ANONYMOUS")
    option = add_option(db_session, poll.id)
    for digest in ("a" * 64, "b" * 64):
        add_vote(
            db_session,
            poll_id=poll.id,
            option_id=option.id,
            identity_mode="ANONYMOUS",
            voter_id=None,
            anonymous_voter_hash=digest,
        )
        db_session.flush()
    count = db_session.scalar(select(func.count()).select_from(Vote))
    assert count == 2


def test_anonymous_vote_rejects_voter_id(db_session: Session) -> None:
    """匿名票不能带账户编号。"""
    creator = add_user(db_session)
    voter = add_user(db_session, "voter")
    poll = add_poll(db_session, creator.id, identity_mode="ANONYMOUS")
    option = add_option(db_session, poll.id)
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="ANONYMOUS",
        voter_id=voter.id,
        anonymous_voter_hash="c" * 64,
    )
    _expect_rejected(db_session, "ck_votes_identity")


def test_named_vote_requires_voter_id(db_session: Session) -> None:
    """记名票必须带账户编号，且不能带匿名散列。"""
    creator = add_user(db_session)
    poll = add_poll(db_session, creator.id, identity_mode="NAMED")
    option = add_option(db_session, poll.id)
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=None,
        anonymous_voter_hash=None,
    )
    _expect_rejected(db_session, "ck_votes_identity")


def test_vote_mode_must_match_poll(db_session: Session) -> None:
    """选票的记名方式必须与所属投票一致。"""
    creator = add_user(db_session)
    poll = add_poll(db_session, creator.id, identity_mode="NAMED")
    option = add_option(db_session, poll.id)
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="ANONYMOUS",
        voter_id=None,
        anonymous_voter_hash="d" * 64,
    )
    _expect_rejected(db_session, "fk_votes_poll_mode")


def test_vote_rejects_option_from_another_poll(db_session: Session) -> None:
    """选项必须属于同一场投票。"""
    creator = add_user(db_session)
    first = add_poll(db_session, creator.id, identity_mode="NAMED")
    second = add_poll(db_session, creator.id, identity_mode="NAMED")
    foreign_option = add_option(db_session, first.id)
    add_vote(
        db_session,
        poll_id=second.id,
        option_id=foreign_option.id,
        identity_mode="NAMED",
        voter_id=creator.id,
        anonymous_voter_hash=None,
    )
    _expect_rejected(db_session, "fk_vote_selections_option")


def test_private_poll_requires_password_hash(db_session: Session) -> None:
    """私密投票缺少密码散列时被拒绝。"""
    creator = add_user(db_session)
    with pytest.raises(IntegrityError) as caught:
        add_poll(db_session, creator.id, visibility="PRIVATE", private_password_hash=None)
    assert _constraint_name(caught.value) == "ck_polls_visibility_password"
    db_session.rollback()


def test_public_poll_rejects_password_hash(db_session: Session) -> None:
    """公开投票不能保存密码散列。"""
    creator = add_user(db_session)
    with pytest.raises(IntegrityError) as caught:
        add_poll(
            db_session,
            creator.id,
            visibility="PUBLIC",
            private_password_hash="hashed-password",
        )
    assert _constraint_name(caught.value) == "ck_polls_visibility_password"
    db_session.rollback()


def test_poll_end_must_be_after_start(db_session: Session) -> None:
    """结束时间不晚于开始时间时被拒绝。"""
    creator = add_user(db_session)
    start = datetime(2026, 10, 24, 8, 0, tzinfo=UTC)
    with pytest.raises(IntegrityError) as caught:
        add_poll(db_session, creator.id, starts_at=start, ends_at=start)
    assert _constraint_name(caught.value) == "ck_polls_time_window"
    db_session.rollback()


def test_same_ballot_rejects_duplicate_option(db_session: Session) -> None:
    """同一张选票不能两次选择同一个选项。"""
    creator = add_user(db_session)
    poll = add_poll(db_session, creator.id, identity_mode="NAMED")
    option = add_option(db_session, poll.id)
    vote = add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=creator.id,
        anonymous_voter_hash=None,
    )
    db_session.flush()
    with pytest.raises(IntegrityError) as caught:
        db_session.execute(
            text(
                """
                INSERT INTO vote_selections (vote_id, poll_id, option_id)
                VALUES (:vote_id, :poll_id, :option_id)
                """
            ),
            {"vote_id": vote.id, "poll_id": poll.id, "option_id": option.id},
        )
    assert _constraint_name(caught.value) == "vote_selections_pkey"
    db_session.rollback()


def test_selection_rejects_option_from_another_poll(db_session: Session) -> None:
    """明细里的选项必须和父票属于同一场。"""
    creator = add_user(db_session)
    first = add_poll(db_session, creator.id, identity_mode="NAMED")
    second = add_poll(db_session, creator.id, identity_mode="NAMED")
    own_option = add_option(db_session, second.id, label="乙")
    foreign_option = add_option(db_session, first.id)
    vote = add_vote(
        db_session,
        poll_id=second.id,
        option_id=own_option.id,
        identity_mode="NAMED",
        voter_id=creator.id,
        anonymous_voter_hash=None,
    )
    db_session.flush()
    with pytest.raises(IntegrityError) as caught:
        db_session.execute(
            text(
                """
                INSERT INTO vote_selections (vote_id, poll_id, option_id)
                VALUES (:vote_id, :poll_id, :option_id)
                """
            ),
            {"vote_id": vote.id, "poll_id": second.id, "option_id": foreign_option.id},
        )
    assert _constraint_name(caught.value) == "fk_vote_selections_option"
    db_session.rollback()


def test_selection_rejects_vote_from_another_poll(db_session: Session) -> None:
    """明细不能把一场的父票挂到另一场。"""
    creator = add_user(db_session)
    first = add_poll(db_session, creator.id, identity_mode="NAMED")
    second = add_poll(db_session, creator.id, identity_mode="NAMED")
    first_option = add_option(db_session, first.id)
    second_option = add_option(db_session, second.id, label="乙")
    vote = add_vote(
        db_session,
        poll_id=first.id,
        option_id=first_option.id,
        identity_mode="NAMED",
        voter_id=creator.id,
        anonymous_voter_hash=None,
    )
    db_session.flush()
    with pytest.raises(IntegrityError) as caught:
        db_session.execute(
            text(
                """
                INSERT INTO vote_selections (vote_id, poll_id, option_id)
                VALUES (:vote_id, :poll_id, :option_id)
                """
            ),
            {"vote_id": vote.id, "poll_id": second.id, "option_id": second_option.id},
        )
    assert _constraint_name(caught.value) == "fk_vote_selections_vote"
    db_session.rollback()


def test_same_option_allowed_on_different_ballots(db_session: Session) -> None:
    """不同选票可以选择同一个选项。"""
    creator = add_user(db_session)
    other = add_user(db_session, "voter")
    poll = add_poll(db_session, creator.id, identity_mode="NAMED")
    option = add_option(db_session, poll.id)
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=creator.id,
        anonymous_voter_hash=None,
    )
    db_session.flush()
    add_vote(
        db_session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=other.id,
        anonymous_voter_hash=None,
    )
    db_session.flush()
    count = db_session.scalar(
        text("SELECT count(*) FROM vote_selections WHERE option_id = :option_id"),
        {"option_id": option.id},
    )
    assert count == 2


def test_existing_vote_restricts_option_delete(db_session: Session) -> None:
    """已有选票时不能删除被选中的选项。"""
    _creator, _poll, option = _named_ballot(db_session)
    with pytest.raises(IntegrityError) as caught:
        db_session.execute(text("DELETE FROM poll_options WHERE id = :id"), {"id": option.id})
    assert _constraint_name(caught.value) == "fk_vote_selections_option"
    db_session.rollback()


def test_existing_vote_restricts_poll_delete(db_session: Session) -> None:
    """已有选票时不能删除那场投票。"""
    _creator, poll, _option = _named_ballot(db_session)
    with pytest.raises(IntegrityError) as caught:
        db_session.execute(text("DELETE FROM polls WHERE id = :id"), {"id": poll.id})
    assert _constraint_name(caught.value) in {
        "fk_poll_options_poll_id_polls",
        "fk_votes_poll_mode",
    }
    db_session.rollback()


def test_concurrent_named_votes_allow_one_commit(migrated_engine: Engine) -> None:
    """两个独立连接同时提交同一记名票时，只保留一条。"""
    truncate_application_tables(migrated_engine)
    try:
        with Session(migrated_engine) as session:
            user = add_user(session)
            poll = add_poll(session, user.id, identity_mode="NAMED")
            option = add_option(session, poll.id)
            poll_id = poll.id
            option_id = option.id
            voter_id = user.id
            session.commit()

        started = threading.Barrier(2)
        outcomes: list[str] = []
        errors: list[BaseException] = []

        def cast_once() -> None:
            """用独立连接提交一张与对方相同的记名票。"""
            try:
                with Session(migrated_engine) as session:
                    started.wait(timeout=5)
                    add_vote(
                        session,
                        poll_id=poll_id,
                        option_id=option_id,
                        identity_mode="NAMED",
                        voter_id=voter_id,
                        anonymous_voter_hash=None,
                    )
                    try:
                        session.commit()
                    except IntegrityError as exc:
                        session.rollback()
                        if _constraint_name(exc) != "uq_votes_named_poll_voter":
                            raise
                        outcomes.append("conflict")
                        return
                outcomes.append("ok")
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=cast_once) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
            assert not thread.is_alive()

        assert errors == []
        assert sorted(outcomes) == ["conflict", "ok"]
        with migrated_engine.connect() as connection:
            count = connection.execute(text("SELECT count(*) FROM votes")).scalar_one()
        assert count == 1
    finally:
        truncate_application_tables(migrated_engine)


def _named_ballot(session: Session) -> tuple[User, Poll, PollOption]:
    """准备一场已有记名票的投票。

    Args:
        session: 当前会话。

    Returns:
        创建者、投票和被选中的选项。
    """
    creator = add_user(session)
    poll = add_poll(session, creator.id, identity_mode="NAMED")
    option = add_option(session, poll.id)
    add_vote(
        session,
        poll_id=poll.id,
        option_id=option.id,
        identity_mode="NAMED",
        voter_id=creator.id,
        anonymous_voter_hash=None,
    )
    session.flush()
    return creator, poll, option


def _expect_rejected(session: Session, name: str) -> None:
    """刷新会话并确认命中指定约束。

    Args:
        session: 已经加入非法对象的会话。
        name: 期望命中的约束或唯一索引名。
    """
    with pytest.raises(IntegrityError) as caught:
        session.flush()
    assert _constraint_name(caught.value) == name
    session.rollback()


def _constraint_name(exc: IntegrityError) -> str | None:
    """从数据库异常中取出约束名。

    Args:
        exc: SQLAlchemy 完整性异常。

    Returns:
        PostgreSQL 报告的约束名或索引名；没有时为空。
    """
    diag = getattr(exc.orig, "diag", None)
    if diag is None:
        return None
    return diag.constraint_name
