"""明文访问密码迁移可以带着已有投票降回旧约束。"""

import os

import pytest
from alembic import command
from pwdlib import PasswordHash
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.pool import NullPool

from src.main.python.utils.security_util import verify_password
from tests.auth_support import fast_password_hash
from tests.integration.conftest import (
    alembic_config,
    assert_safe_test_database,
    reset_public_schema,
    upgrade_head,
)

PLAINTEXT_REVISION = "f3b8a1c04e27"
LEGACY_REVISION = "cdc412846524"
PLAINTEXT_PASSWORD = "中文密码"
LEGACY_PASSWORD = "legacy-secret"


def test_downgrade_hashes_plaintext_and_keeps_existing_rows(
    database_targets: tuple[str, str],
) -> None:
    """新私密、旧散列和公开场次都能降级，投票行不会被删掉。"""
    test_url, dev_url = database_targets
    reset_public_schema(test_url, dev_url)
    legacy_hash = fast_password_hash().hash(LEGACY_PASSWORD)
    try:
        _upgrade(test_url, dev_url, PLAINTEXT_REVISION)
        inserted = _insert_polls(test_url, legacy_hash)
        _downgrade(test_url, dev_url, LEGACY_REVISION)

        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == LEGACY_REVISION
            assert "private_password" not in _column_names(engine, "polls")
            rows = _password_rows(engine)
            assert set(rows) == set(inserted.values())
            assert rows[inserted["public"]] is None
            assert rows[inserted["legacy"]] == legacy_hash
            plaintext_hash = rows[inserted["plaintext"]]
            assert isinstance(plaintext_hash, str)
            assert plaintext_hash != legacy_hash
            assert verify_password(PasswordHash.recommended(), PLAINTEXT_PASSWORD, plaintext_hash)
        finally:
            engine.dispose()
    finally:
        reset_public_schema(test_url, dev_url)
        upgrade_head(test_url, dev_url)


def test_downgrade_refuses_private_poll_without_secret(
    database_targets: tuple[str, str],
) -> None:
    """私密场次既没有明文也没有散列时拒绝降级，原行仍在。"""
    test_url, dev_url = database_targets
    reset_public_schema(test_url, dev_url)
    try:
        _upgrade(test_url, dev_url, PLAINTEXT_REVISION)
        poll_id = _insert_private_without_secret(test_url)
        with pytest.raises(Exception, match="Refusing downgrade"):
            _downgrade(test_url, dev_url, LEGACY_REVISION)
        engine = _engine(test_url)
        try:
            assert _alembic_version(engine) == PLAINTEXT_REVISION
            assert _poll_count(engine) == 1
            assert _poll_exists(engine, poll_id)
        finally:
            engine.dispose()
    finally:
        reset_public_schema(test_url, dev_url)
        upgrade_head(test_url, dev_url)


def _upgrade(test_url: str, dev_url: str, revision: str) -> None:
    """把测试库升到指定版本。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串，只用于守卫。
        revision: Alembic 版本。
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


def _engine(url: str) -> Engine:
    """打开一个不进连接池的测试库引擎。

    Args:
        url: 测试库连接串。

    Returns:
        用完必须 dispose 的引擎。
    """
    return create_engine(url, poolclass=NullPool, hide_parameters=True)


def _insert_polls(url: str, legacy_hash: str) -> dict[str, int]:
    """写入公开、仅散列和仅明文三场投票。

    Args:
        url: 已停在明文迁移版本的测试库连接串。
        legacy_hash: 旧私密场次已有的散列。

    Returns:
        三类场次的主键。
    """
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
            public_id = _insert_poll(connection, creator_id, "PUBLIC", None, None, "public-poll")
            legacy_id = _insert_poll(
                connection, creator_id, "PRIVATE", None, legacy_hash, "legacy-poll"
            )
            plaintext_id = _insert_poll(
                connection,
                creator_id,
                "PRIVATE",
                PLAINTEXT_PASSWORD,
                None,
                "plaintext-poll",
            )
    finally:
        engine.dispose()
    return {"public": public_id, "legacy": legacy_id, "plaintext": plaintext_id}


def _insert_private_without_secret(url: str) -> int:
    """临时去掉约束后写入一场没有密码的私密投票。

    Args:
        url: 已停在明文迁移版本的测试库连接串。

    Returns:
        新投票主键。
    """
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
            connection.execute(
                text("ALTER TABLE polls DROP CONSTRAINT ck_polls_visibility_password")
            )
            return _insert_poll(connection, creator_id, "PRIVATE", None, None, "empty-secret")
    finally:
        engine.dispose()


def _insert_poll(
    connection: Connection,
    creator_id: int,
    visibility: str,
    private_password: str | None,
    private_password_hash: str | None,
    title: str,
) -> int:
    """插入一场用于迁移的投票。

    Args:
        connection: 已打开的数据库连接。
        creator_id: 创建者主键。
        visibility: PUBLIC 或 PRIVATE。
        private_password: 明文访问密码。
        private_password_hash: 旧散列。
        title: 标题。

    Returns:
        新投票主键。
    """
    return connection.execute(
        text(
            """
            INSERT INTO polls (
                title, identity_mode, visibility, lifecycle, starts_at, ends_at,
                creator_id, private_password, private_password_hash, share_code
            ) VALUES (
                :title, 'ANONYMOUS', :visibility, 'PUBLISHED',
                '2026-10-24 08:00:00+00', '2026-10-24 12:00:00+00',
                :creator_id, :private_password, :private_password_hash, :share_code
            )
            RETURNING id
            """
        ),
        {
            "title": title,
            "visibility": visibility,
            "creator_id": creator_id,
            "private_password": private_password,
            "private_password_hash": private_password_hash,
            "share_code": title,
        },
    ).scalar_one()


def _password_rows(engine: Engine) -> dict[int, str | None]:
    """读取降级后每场投票的散列。

    Args:
        engine: 已降级的测试库引擎。

    Returns:
        投票主键到散列的映射。公开场次的散列为空。
    """
    with engine.connect() as connection:
        result = connection.execute(text("SELECT id, private_password_hash FROM polls"))
        return {int(row.id): row.private_password_hash for row in result}


def _column_names(engine: Engine, table_name: str) -> set[str]:
    """读取一张表的列名。

    Args:
        engine: 测试库引擎。
        table_name: 表名。

    Returns:
        列名集合。
    """
    with engine.connect() as connection:
        result = connection.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :table_name
                """
            ),
            {"table_name": table_name},
        )
        return {str(row.column_name) for row in result}


def _alembic_version(engine: Engine) -> str:
    """读取当前 Alembic 版本。

    Args:
        engine: 测试库引擎。

    Returns:
        version_num。
    """
    with engine.connect() as connection:
        return str(connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one())


def _poll_count(engine: Engine) -> int:
    """统计投票行数。

    Args:
        engine: 测试库引擎。

    Returns:
        polls 表行数。
    """
    with engine.connect() as connection:
        return int(connection.execute(text("SELECT count(*) FROM polls")).scalar_one())


def _poll_exists(engine: Engine, poll_id: int) -> bool:
    """确认指定投票还在。

    Args:
        engine: 测试库引擎。
        poll_id: 投票主键。

    Returns:
        行还在时为 True。
    """
    with engine.connect() as connection:
        found = connection.execute(
            text("SELECT id FROM polls WHERE id = :poll_id"),
            {"poll_id": poll_id},
        ).scalar_one_or_none()
    return found is not None
