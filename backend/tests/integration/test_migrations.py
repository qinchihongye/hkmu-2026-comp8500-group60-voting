"""空库迁移、降级和实际目录核对。"""

from collections.abc import Mapping

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine

from tests.integration.conftest import (
    APPLICATION_TABLES,
    REVISION,
    assert_safe_test_database,
    database_pair,
    downgrade_base,
    upgrade_head,
)


def test_guard_rejects_same_url_and_development_port() -> None:
    """相同连接串和 5432 在删表或降级前被拒绝。"""
    dev_url = "postgresql+psycopg://voting:change-me@127.0.0.1:5432/voting"
    with pytest.raises(RuntimeError, match="相同"):
        assert_safe_test_database(dev_url, dev_url)
    with pytest.raises(RuntimeError, match="5432"):
        assert_safe_test_database(
            "postgresql+psycopg://voting:change-me@127.0.0.1:5432/voting_test",
            dev_url,
        )


def test_guard_rejects_wrong_host_port_or_database_name() -> None:
    """测试库必须是本机 5433 上的 voting_test。"""
    dev_url = "postgresql+psycopg://voting:change-me@127.0.0.1:5432/voting"
    with pytest.raises(RuntimeError, match="主机"):
        assert_safe_test_database(
            "postgresql+psycopg://voting:change-me@10.0.0.8:5433/voting_test",
            dev_url,
        )
    with pytest.raises(RuntimeError, match="5433"):
        assert_safe_test_database(
            "postgresql+psycopg://voting:change-me@127.0.0.1:5434/voting_test",
            dev_url,
        )
    with pytest.raises(RuntimeError, match="voting_test"):
        assert_safe_test_database(
            "postgresql+psycopg://voting:change-me@127.0.0.1:5433/voting",
            dev_url,
        )


def test_configured_urls_stay_on_the_local_test_database(
    database_targets: tuple[str, str],
) -> None:
    """本次进程使用的测试地址与开发地址不同，且落在约定的测试库。"""
    test_url, dev_url = database_targets
    configured_test, configured_dev = database_pair()
    assert (test_url, dev_url) == (configured_test, configured_dev)
    assert_safe_test_database(test_url, dev_url)


def test_empty_database_upgrades_downgrades_and_returns_to_head(
    migrated_engine: Engine,
    database_targets: tuple[str, str],
) -> None:
    """空库可以升到头部，降回初始结构后再升回去。"""
    test_url, dev_url = database_targets
    assert_safe_test_database(test_url, dev_url)
    _assert_schema(migrated_engine)
    try:
        downgrade_base(test_url, dev_url)
        assert APPLICATION_TABLES.isdisjoint(_table_names(migrated_engine))
    finally:
        upgrade_head(test_url, dev_url)
    _assert_schema(migrated_engine)


def _assert_schema(engine: Engine) -> None:
    """核对九张表、外键删除规则、部分唯一索引和票表字段。

    Args:
        engine: 已迁移的测试库引擎。
    """
    assert APPLICATION_TABLES <= _table_names(engine)
    assert _alembic_version(engine) == REVISION

    columns = _columns(engine)
    assert columns["votes"] == {
        "anonymous_voter_hash",
        "id",
        "identity_mode",
        "poll_id",
        "receipt_id",
        "submitted_at",
        "voter_id",
    }
    assert columns["vote_selections"] == {"option_id", "poll_id", "vote_id"}
    assert "vote_limit" in columns["polls"]
    assert "selection_mode" in columns["polls"]
    assert "user_id" not in columns["guest_sessions"]
    assert _nullable(engine, "audit_events", "receipt_id") == "YES"
    assert _nullable(engine, "votes", "receipt_id") == "NO"
    assert _audit_foreign_tables(engine) == {"polls", "users"}

    delete_actions = _foreign_key_actions(engine)
    assert delete_actions["fk_vote_selections_option"] == "r"
    assert delete_actions["fk_vote_selections_vote"] == "r"
    assert delete_actions["fk_votes_poll_mode"] == "r"
    assert set(delete_actions.values()) == {"r"}

    indexes = _index_definitions(engine)
    assert "UNIQUE" in indexes["uq_votes_named_poll_voter"]
    assert "NAMED" in indexes["uq_votes_named_poll_voter"]
    assert "UNIQUE" in indexes["uq_votes_anon_poll_browser"]
    assert "ANONYMOUS" in indexes["uq_votes_anon_poll_browser"]
    assert _constraint_names(engine) >= {
        "ck_audit_events_action",
        "ck_polls_time_window",
        "ck_polls_visibility_password",
        "ck_polls_selection_mode",
        "ck_polls_vote_limit",
        "ck_votes_identity",
        "fk_vote_selections_option",
        "fk_vote_selections_vote",
        "fk_votes_poll_mode",
        "uq_poll_options_poll_id_id",
        "uq_poll_options_poll_id_label",
        "uq_poll_options_poll_id_position",
        "uq_polls_id_identity_mode",
        "uq_votes_poll_id_id",
    }
    assert "ix_votes_option_id" not in indexes
    assert "fk_votes_poll_option" not in delete_actions


def _table_names(engine: Engine) -> set[str]:
    """读取 public 下的基表名。

    Args:
        engine: 测试库引擎。

    Returns:
        表名集合。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
            )
        )
        return set(rows.scalars().all())


def _columns(engine: Engine) -> dict[str, set[str]]:
    """按表读取 public 下的列名。

    Args:
        engine: 测试库引擎。

    Returns:
        表名到列名集合的映射。
    """
    found: dict[str, set[str]] = {}
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                """
            )
        )
        for table_name, column_name in rows:
            found.setdefault(table_name, set()).add(column_name)
    return found


def _nullable(engine: Engine, table_name: str, column_name: str) -> str:
    """读取某一列是否可空。

    Args:
        engine: 测试库引擎。
        table_name: 表名。
        column_name: 列名。

    Returns:
        information_schema 中的 YES 或 NO。
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


def _alembic_version(engine: Engine) -> str:
    """读取当前 Alembic 版本号。

    Args:
        engine: 测试库引擎。

    Returns:
        alembic_version.version_num。
    """
    with engine.connect() as connection:
        return connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()


def _constraint_names(engine: Engine) -> set[str]:
    """读取 public 下的约束名。

    Args:
        engine: 测试库引擎。

    Returns:
        约束名集合。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT conname
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                """
            )
        )
        return set(rows.scalars().all())


def _foreign_key_actions(engine: Engine) -> dict[str, str]:
    """读取外键的 ON DELETE 动作。

    Args:
        engine: 测试库引擎。

    Returns:
        约束名到 confdeltype 的映射。r 表示 RESTRICT。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT conname, confdeltype
                FROM pg_constraint
                WHERE contype = 'f' AND connamespace = 'public'::regnamespace
                """
            )
        )
        return {name: action for name, action in rows}


def _index_definitions(engine: Engine) -> Mapping[str, str]:
    """读取 public 下的索引定义。

    Args:
        engine: 测试库引擎。

    Returns:
        索引名到 indexdef 的映射。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                """
            )
        )
        return {name: definition for name, definition in rows}


def _audit_foreign_tables(engine: Engine) -> set[str]:
    """读取审计表外键指向的表。

    Args:
        engine: 测试库引擎。

    Returns:
        被引用的表名，不包含模式前缀。
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT confrelid::regclass::text
                FROM pg_constraint
                WHERE contype = 'f' AND conrelid = 'audit_events'::regclass
                """
            )
        )
        return {name.split(".", 1)[-1] for name in rows.scalars().all()}
