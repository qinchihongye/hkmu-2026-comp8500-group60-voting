"""旧选票升级到明细表，以及不安全降级被拒绝。"""

import os
from collections.abc import Mapping
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from tests.integration.conftest import (
    REVISION,
    alembic_config,
    assert_safe_test_database,
    reset_public_schema,
    upgrade_head,
)

LEGACY_REVISION = "f3b8a1c04e27"


def test_historical_ballots_keep_receipts_and_options(
    database_targets: tuple[str, str],
) -> None:
    """从旧 head 升级后，记名和匿名票的回执、选项与计数都还在。"""
    test_url, dev_url = database_targets
    reset_public_schema(test_url, dev_url)
    try:
        _upgrade(test_url, dev_url, LEGACY_REVISION)
        expected = _seed_legacy_ballots(test_url)
        _upgrade(test_url, dev_url, "head")

        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == REVISION
            assert "option_id" not in _column_names(engine, "votes")
            assert _column_names(engine, "vote_selections") == {
                "vote_id",
                "poll_id",
                "option_id",
            }
            rows = _selection_rows(engine)
            assert len(rows) == len(expected)
            for ballot in expected:
                match = rows[ballot["vote_id"]]
                assert match["receipt_id"] == ballot["receipt_id"]
                assert match["option_id"] == ballot["option_id"]
                assert match["poll_id"] == ballot["poll_id"]
                assert match["voter_id"] == ballot["voter_id"]
                assert match["anonymous_voter_hash"] == ballot["anonymous_voter_hash"]
                assert match["submitted_at"] == ballot["submitted_at"]
            settings = _poll_settings(engine)
            assert settings
            assert set(settings) == {(None, "SINGLE")}
            counts_before = {
                (item["poll_id"], item["option_id"]): 1 for item in expected
            }
            assert _option_counts(engine) == counts_before
        finally:
            engine.dispose()

        _downgrade(test_url, dev_url, LEGACY_REVISION)
        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == LEGACY_REVISION
            assert not _table_exists(engine, "vote_selections")
            assert "vote_limit" not in _column_names(engine, "polls")
            assert "selection_mode" not in _column_names(engine, "polls")
            restored = _legacy_vote_rows(engine)
            assert len(restored) == len(expected)
            for ballot in expected:
                match = restored[ballot["vote_id"]]
                assert match["receipt_id"] == ballot["receipt_id"]
                assert match["option_id"] == ballot["option_id"]
                assert match["voter_id"] == ballot["voter_id"]
                assert match["anonymous_voter_hash"] == ballot["anonymous_voter_hash"]
        finally:
            engine.dispose()

        _upgrade(test_url, dev_url, "head")
        engine = _engine(test_url)
        try:
            again = _selection_rows(engine)
            assert {item["vote_id"]: item["option_id"] for item in again.values()} == {
                item["vote_id"]: item["option_id"] for item in expected
            }
        finally:
            engine.dispose()
    finally:
        _restore_later(test_url, dev_url)


def test_empty_database_upgrade_adds_selection_schema(
    database_targets: tuple[str, str],
) -> None:
    """空库从旧 head 升级后也有明细表，且可以安全降回去。"""
    test_url, dev_url = database_targets
    reset_public_schema(test_url, dev_url)
    try:
        _upgrade(test_url, dev_url, LEGACY_REVISION)
        _upgrade(test_url, dev_url, "head")
        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == REVISION
            assert _table_exists(engine, "vote_selections")
            assert "option_id" not in _column_names(engine, "votes")
            polls = _column_names(engine, "polls")
            assert "vote_limit" in polls
            assert "selection_mode" in polls
            assert _nullable(engine, "polls", "vote_limit") == "YES"
            assert _nullable(engine, "polls", "selection_mode") == "NO"
        finally:
            engine.dispose()
        _downgrade(test_url, dev_url, LEGACY_REVISION)
        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == LEGACY_REVISION
            assert "option_id" in _column_names(engine, "votes")
        finally:
            engine.dispose()
    finally:
        _restore_later(test_url, dev_url)


@pytest.mark.parametrize(
    "mutation",
    ["multiple", "limit", "extra", "missing"],
)
def test_downgrade_refuses_unsafe_ballots(
    database_targets: tuple[str, str],
    mutation: str,
) -> None:
    """多选、限额或不是恰好一条明细时，降级在删列前拒绝。"""
    test_url, dev_url = database_targets
    reset_public_schema(test_url, dev_url)
    try:
        _upgrade(test_url, dev_url, LEGACY_REVISION)
        _seed_legacy_ballots(test_url)
        _upgrade(test_url, dev_url, "head")
        _mutate(test_url, mutation)
        with pytest.raises(Exception, match="Refusing downgrade"):
            _downgrade(test_url, dev_url, LEGACY_REVISION)
        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == REVISION
            assert _table_exists(engine, "vote_selections")
            assert "option_id" not in _column_names(engine, "votes")
            assert "vote_limit" in _column_names(engine, "polls")
        finally:
            engine.dispose()
    finally:
        _restore_later(test_url, dev_url)


def _upgrade(test_url: str, dev_url: str, revision: str) -> None:
    """把测试库升到指定版本。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串，只用于守卫。
        revision: Alembic 版本或 head。
    """
    assert_safe_test_database(test_url, dev_url)
    os.environ["VOTING_MIGRATION_URL"] = test_url
    command.upgrade(alembic_config(test_url), revision)


def _downgrade(test_url: str, dev_url: str, revision: str) -> None:
    """把测试库降到指定版本。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串，只用于守卫。
        revision: 目标 Alembic 版本。
    """
    assert_safe_test_database(test_url, dev_url)
    os.environ["VOTING_MIGRATION_URL"] = test_url
    command.downgrade(alembic_config(test_url), revision)


def _restore_later(test_url: str, dev_url: str) -> None:
    """清空测试库并升回当前头部，避免影响同会话的其他用例。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串。
    """
    reset_public_schema(test_url, dev_url)
    upgrade_head(test_url, dev_url)


def _engine(url: str) -> Engine:
    """打开一个不进连接池的测试库引擎。

    Args:
        url: 测试库连接串。

    Returns:
        用完必须 dispose 的引擎。
    """
    return create_engine(url, poolclass=NullPool, hide_parameters=True)


def _seed_legacy_ballots(url: str) -> list[dict[str, object]]:
    """在旧结构里写入记名票和匿名票。

    Args:
        url: 已经停在旧 head 的测试库连接串。

    Returns:
        升级前记录下来的选票字段。
    """
    submitted = datetime(2026, 10, 24, 9, 0, tzinfo=UTC)
    named_receipt = uuid4()
    anon_receipt = uuid4()
    second_receipt = uuid4()
    engine = _engine(url)
    try:
        with engine.begin() as connection:
            creator_id = connection.execute(
                text(
                    """
                    INSERT INTO users (username, display_name, password_hash, role)
                    VALUES ('ada', 'Ada', 'hashed-password', 'USER')
                    RETURNING id
                    """
                )
            ).scalar_one()
            voter_id = connection.execute(
                text(
                    """
                    INSERT INTO users (username, display_name, password_hash, role)
                    VALUES ('voter01', 'Voter', 'hashed-password', 'USER')
                    RETURNING id
                    """
                )
            ).scalar_one()
            named_poll = _insert_poll(connection, creator_id, "NAMED", "Named history")
            anon_poll = _insert_poll(connection, creator_id, "ANONYMOUS", "Anon history")
            named_option = _insert_option(connection, named_poll, "甲", 0)
            anon_option = _insert_option(connection, anon_poll, "乙", 0)
            second_option = _insert_option(connection, anon_poll, "丙", 1)
            named_vote = _insert_legacy_vote(
                connection,
                receipt_id=named_receipt,
                poll_id=named_poll,
                identity_mode="NAMED",
                voter_id=voter_id,
                anonymous_voter_hash=None,
                option_id=named_option,
                submitted_at=submitted,
            )
            anon_vote = _insert_legacy_vote(
                connection,
                receipt_id=anon_receipt,
                poll_id=anon_poll,
                identity_mode="ANONYMOUS",
                voter_id=None,
                anonymous_voter_hash="a" * 64,
                option_id=anon_option,
                submitted_at=submitted,
            )
            second_vote = _insert_legacy_vote(
                connection,
                receipt_id=second_receipt,
                poll_id=anon_poll,
                identity_mode="ANONYMOUS",
                voter_id=None,
                anonymous_voter_hash="b" * 64,
                option_id=second_option,
                submitted_at=submitted,
            )
    finally:
        engine.dispose()
    return [
        {
            "vote_id": named_vote,
            "receipt_id": named_receipt,
            "poll_id": named_poll,
            "option_id": named_option,
            "voter_id": voter_id,
            "anonymous_voter_hash": None,
            "submitted_at": submitted,
        },
        {
            "vote_id": anon_vote,
            "receipt_id": anon_receipt,
            "poll_id": anon_poll,
            "option_id": anon_option,
            "voter_id": None,
            "anonymous_voter_hash": "a" * 64,
            "submitted_at": submitted,
        },
        {
            "vote_id": second_vote,
            "receipt_id": second_receipt,
            "poll_id": anon_poll,
            "option_id": second_option,
            "voter_id": None,
            "anonymous_voter_hash": "b" * 64,
            "submitted_at": submitted,
        },
    ]


def _insert_poll(connection, creator_id: int, identity_mode: str, title: str) -> int:
    """插入一场旧结构的公开投票。

    Args:
        connection: 已打开的数据库连接。
        creator_id: 创建者主键。
        identity_mode: NAMED 或 ANONYMOUS。
        title: 标题。

    Returns:
        新投票主键。
    """
    return connection.execute(
        text(
            """
            INSERT INTO polls (
                title, identity_mode, visibility, lifecycle, starts_at, ends_at, creator_id
            ) VALUES (
                :title, :identity_mode, 'PUBLIC', 'PUBLISHED',
                '2026-10-24 08:00:00+00', '2026-10-24 12:00:00+00', :creator_id
            )
            RETURNING id
            """
        ),
        {"title": title, "identity_mode": identity_mode, "creator_id": creator_id},
    ).scalar_one()


def _insert_option(connection, poll_id: int, label: str, position: int) -> int:
    """插入一个旧结构选项。

    Args:
        connection: 已打开的数据库连接。
        poll_id: 所属投票。
        label: 选项文本。
        position: 展示顺序。

    Returns:
        新选项主键。
    """
    return connection.execute(
        text(
            """
            INSERT INTO poll_options (poll_id, label, position)
            VALUES (:poll_id, :label, :position)
            RETURNING id
            """
        ),
        {"poll_id": poll_id, "label": label, "position": position},
    ).scalar_one()


def _insert_legacy_vote(
    connection,
    *,
    receipt_id: object,
    poll_id: int,
    identity_mode: str,
    voter_id: int | None,
    anonymous_voter_hash: str | None,
    option_id: int,
    submitted_at: datetime,
) -> int:
    """按旧 votes.option_id 结构插入一张票。

    Args:
        connection: 已打开的数据库连接。
        receipt_id: 回执。
        poll_id: 所属投票。
        identity_mode: 记名方式。
        voter_id: 记名账户。匿名票为空。
        anonymous_voter_hash: 匿名散列。记名票为空。
        option_id: 旧列上的选项。
        submitted_at: 提交时间。

    Returns:
        新选票主键。
    """
    return connection.execute(
        text(
            """
            INSERT INTO votes (
                receipt_id, poll_id, identity_mode, voter_id,
                anonymous_voter_hash, option_id, submitted_at
            ) VALUES (
                :receipt_id, :poll_id, :identity_mode, :voter_id,
                :anonymous_voter_hash, :option_id, :submitted_at
            )
            RETURNING id
            """
        ),
        {
            "receipt_id": receipt_id,
            "poll_id": poll_id,
            "identity_mode": identity_mode,
            "voter_id": voter_id,
            "anonymous_voter_hash": anonymous_voter_hash,
            "option_id": option_id,
            "submitted_at": submitted_at,
        },
    ).scalar_one()


def _mutate(url: str, mutation: str) -> None:
    """把已升级的数据改成不允许降级的状态。

    Args:
        url: 已升到新头部的测试库连接串。
        mutation: multiple、limit、extra 或 missing。
    """
    engine = _engine(url)
    try:
        with engine.begin() as connection:
            if mutation == "multiple":
                connection.execute(text("UPDATE polls SET selection_mode = 'MULTIPLE'"))
                return
            if mutation == "limit":
                connection.execute(text("UPDATE polls SET vote_limit = 5"))
                return
            if mutation == "extra":
                vote_id, poll_id = connection.execute(
                    text("SELECT id, poll_id FROM votes ORDER BY id LIMIT 1")
                ).one()
                option_id = connection.execute(
                    text(
                        """
                        INSERT INTO poll_options (poll_id, label, position)
                        VALUES (:poll_id, '额外', 9)
                        RETURNING id
                        """
                    ),
                    {"poll_id": poll_id},
                ).scalar_one()
                connection.execute(
                    text(
                        """
                        INSERT INTO vote_selections (vote_id, poll_id, option_id)
                        VALUES (:vote_id, :poll_id, :option_id)
                        """
                    ),
                    {"vote_id": vote_id, "poll_id": poll_id, "option_id": option_id},
                )
                return
            if mutation == "missing":
                connection.execute(
                    text(
                        """
                        DELETE FROM vote_selections
                        WHERE vote_id IN (SELECT id FROM votes ORDER BY id LIMIT 1)
                        """
                    )
                )
                return
            raise AssertionError(mutation)
    finally:
        engine.dispose()


def _selection_rows(engine: Engine) -> dict[int, Mapping[str, object]]:
    """读取升级后的父票和唯一明细。

    Args:
        engine: 测试库引擎。

    Returns:
        以选票主键为键的字段映射。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT
                    votes.id AS vote_id,
                    votes.receipt_id,
                    votes.poll_id,
                    votes.voter_id,
                    votes.anonymous_voter_hash,
                    votes.submitted_at,
                    vote_selections.option_id
                FROM votes
                JOIN vote_selections ON vote_selections.vote_id = votes.id
                """
            )
        ).mappings()
        return {int(row["vote_id"]): row for row in rows}


def _legacy_vote_rows(engine: Engine) -> dict[int, Mapping[str, object]]:
    """读取降级后带回 option_id 的选票。

    Args:
        engine: 测试库引擎。

    Returns:
        以选票主键为键的字段映射。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT id AS vote_id, receipt_id, option_id, voter_id, anonymous_voter_hash
                FROM votes
                """
            )
        ).mappings()
        return {int(row["vote_id"]): row for row in rows}


def _poll_settings(engine: Engine) -> set[tuple[object, object]]:
    """读取每场的上限和选择模式。

    Args:
        engine: 测试库引擎。

    Returns:
        (vote_limit, selection_mode) 的集合。
    """
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT vote_limit, selection_mode FROM polls"))
        return {(row[0], row[1]) for row in rows}


def _option_counts(engine: Engine) -> dict[tuple[int, int], int]:
    """按场次和选项统计明细数。

    Args:
        engine: 测试库引擎。

    Returns:
        (poll_id, option_id) 到条数的映射。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT poll_id, option_id, COUNT(*)
                FROM vote_selections
                GROUP BY poll_id, option_id
                """
            )
        )
        return {(int(poll_id), int(option_id)): int(total) for poll_id, option_id, total in rows}


def _column_names(engine: Engine, table_name: str) -> set[str]:
    """读取一张表的列名。

    Args:
        engine: 测试库引擎。
        table_name: 表名。

    Returns:
        列名集合。表不存在时为空。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :table_name
                """
            ),
            {"table_name": table_name},
        )
        return set(rows.scalars().all())


def _nullable(engine: Engine, table_name: str, column_name: str) -> str:
    """读取列是否可空。

    Args:
        engine: 测试库引擎。
        table_name: 表名。
        column_name: 列名。

    Returns:
        YES 或 NO。
    """
    with engine.connect() as connection:
        return connection.execute(
            text(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).scalar_one()


def _table_exists(engine: Engine, table_name: str) -> bool:
    """判断 public 下有没有这张表。

    Args:
        engine: 测试库引擎。
        table_name: 表名。

    Returns:
        表存在时为 True。
    """
    with engine.connect() as connection:
        found = connection.execute(
            text("SELECT to_regclass(:name)"),
            {"name": f"public.{table_name}"},
        ).scalar_one()
        return found is not None


def _alembic_version(engine: Engine) -> str:
    """读取当前 Alembic 版本。

    Args:
        engine: 测试库引擎。

    Returns:
        version_num。
    """
    with engine.connect() as connection:
        return connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
