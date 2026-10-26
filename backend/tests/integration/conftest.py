"""测试库守卫、空库迁移和每个用例的数据清理。

只允许连接 127.0.0.1:5433 的 voting_test。容器里的 PostgreSQL
仍监听 5432，所以不能用 inet_server_port() 判断宿主机端口。
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from src.main.python.database.models import Poll, PollOption, User, Vote

DEFAULT_DEV_URL = "postgresql+psycopg://voting:change-me@127.0.0.1:5432/voting"
DEFAULT_TEST_URL = "postgresql+psycopg://voting:change-me@127.0.0.1:5433/voting_test"
REVISION = "cdc412846524"

APPLICATION_TABLES = frozenset(
    {
        "audit_events",
        "auth_sessions",
        "guest_sessions",
        "poll_access_grants",
        "poll_options",
        "polls",
        "users",
        "votes",
    }
)


def assert_safe_test_database(test_url: str, dev_url: str) -> None:
    """拒绝任何可能打到开发库或 5432 的迁移地址。

    Args:
        test_url: 即将执行 DROP 或 downgrade 的连接串。
        dev_url: 开发库连接串，只参与比对，不会被连接。

    Raises:
        RuntimeError: 地址相同、端口为 5432、库名不是 voting_test，或主机不是本机。
    """
    if test_url == dev_url:
        raise RuntimeError("测试库连接串与开发库相同，已拒绝迁移")
    parsed = make_url(test_url)
    host = parsed.host or ""
    port = parsed.port
    if port == 5432:
        raise RuntimeError("拒绝在 5432 上执行测试库的删表或降级")
    if host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("测试库主机必须是 127.0.0.1 或 localhost")
    if port != 5433:
        raise RuntimeError("测试库端口必须是 5433")
    if parsed.database != "voting_test":
        raise RuntimeError("测试库名称必须是 voting_test")


def database_pair() -> tuple[str, str]:
    """读取测试库和开发库连接串。

    环境变量优先。未设置时使用 Compose 示例地址，不读取仓库根目录 .env，
    也避免为了比对开发库而真正连上 5432。

    Returns:
        测试库连接串和开发库连接串。
    """
    test_url = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_URL)
    dev_url = os.environ.get("DATABASE_URL", DEFAULT_DEV_URL)
    return test_url, dev_url


def alembic_config(url: str) -> Config:
    """构造指向给定连接串的 Alembic 配置。

    Args:
        url: 写入配置的连接串。env.py 仍优先使用 VOTING_MIGRATION_URL。

    Returns:
        已加载 backend/alembic.ini 的配置对象。
    """
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def reset_public_schema(test_url: str, dev_url: str) -> None:
    """清空测试库的 public 模式。守卫失败时不会执行 DROP。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串。

    Raises:
        RuntimeError: 地址守卫失败，或连上的库名不是 voting_test。
    """
    assert_safe_test_database(test_url, dev_url)
    engine = create_engine(test_url, poolclass=NullPool, hide_parameters=True)
    try:
        with engine.begin() as connection:
            current = connection.execute(text("SELECT current_database()")).scalar_one()
            if current != "voting_test":
                raise RuntimeError("当前数据库不是 voting_test，已停止")
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


def upgrade_head(test_url: str, dev_url: str) -> None:
    """把测试库迁移到当前头部。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串，降级或升级前再次核对。
    """
    assert_safe_test_database(test_url, dev_url)
    os.environ["VOTING_MIGRATION_URL"] = test_url
    command.upgrade(alembic_config(test_url), "head")


def downgrade_base(test_url: str, dev_url: str) -> None:
    """把测试库降到初始空结构。

    Args:
        test_url: 测试库连接串。
        dev_url: 开发库连接串，执行前再次核对。
    """
    assert_safe_test_database(test_url, dev_url)
    os.environ["VOTING_MIGRATION_URL"] = test_url
    command.downgrade(alembic_config(test_url), "base")


def truncate_application_tables(engine: Engine) -> None:
    """清空八张业务表并重置自增序号。

    Args:
        engine: 已经过守卫的测试库引擎。
    """
    table_list = ", ".join(sorted(APPLICATION_TABLES))
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE"))


@pytest.fixture(scope="session")
def database_targets() -> tuple[str, str]:
    """提供并核对测试库、开发库连接串。

    Returns:
        测试库连接串和开发库连接串。
    """
    test_url, dev_url = database_pair()
    assert_safe_test_database(test_url, dev_url)
    return test_url, dev_url


@pytest.fixture(scope="session")
def migrated_engine(database_targets: tuple[str, str]) -> Iterator[Engine]:
    """在空的测试库上执行一次 upgrade，并在会话结束前保持头部。

    Args:
        database_targets: 测试库和开发库连接串。

    Yields:
        连接到已迁移测试库的引擎。
    """
    test_url, dev_url = database_targets
    reset_public_schema(test_url, dev_url)
    upgrade_head(test_url, dev_url)
    engine = create_engine(test_url, poolclass=NullPool, hide_parameters=True)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(migrated_engine: Engine) -> Iterator[Session]:
    """提供会在用例结束时回滚的会话。

    外层事务负责清理。会话内部的提交只释放保存点，不会写进测试库。

    Args:
        migrated_engine: 已迁移的测试库引擎。

    Yields:
        绑定到本次用例事务的会话。
    """
    truncate_application_tables(migrated_engine)
    connection = migrated_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def add_user(session: Session, username: str = "ada") -> User:
    """插入一个可用账户。

    Args:
        session: 当前会话。
        username: 规范化用户名。

    Returns:
        已刷新主键的账户。
    """
    user = User(
        username=username,
        display_name="艾达",
        password_hash="hashed-password",
        role="USER",
    )
    session.add(user)
    session.flush()
    return user


def add_poll(
    session: Session,
    creator_id: int,
    *,
    identity_mode: str = "NAMED",
    visibility: str = "PUBLIC",
    private_password_hash: str | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> Poll:
    """插入一场投票。调用方负责给出合法或故意非法的时间与密码。

    Args:
        session: 当前会话。
        creator_id: 创建者主键。
        identity_mode: NAMED 或 ANONYMOUS。
        visibility: PUBLIC 或 PRIVATE。
        private_password_hash: 私密投票的密码散列。
        starts_at: 开始时间。为空时使用固定窗口。
        ends_at: 结束时间。为空时比开始时间晚两小时。

    Returns:
        已刷新主键的投票。
    """
    start = starts_at or datetime(2026, 10, 24, 8, 0, tzinfo=UTC)
    end = ends_at or (start + timedelta(hours=2))
    poll = Poll(
        title="班长选举",
        identity_mode=identity_mode,
        visibility=visibility,
        private_password_hash=private_password_hash,
        lifecycle="PUBLISHED",
        starts_at=start,
        ends_at=end,
        creator_id=creator_id,
    )
    session.add(poll)
    session.flush()
    return poll


def add_option(
    session: Session,
    poll_id: int,
    *,
    label: str = "甲",
    position: int = 0,
) -> PollOption:
    """插入一个选项。

    Args:
        session: 当前会话。
        poll_id: 所属投票。
        label: 选项文本。
        position: 展示顺序。

    Returns:
        已刷新主键的选项。
    """
    option = PollOption(poll_id=poll_id, label=label, position=position)
    session.add(option)
    session.flush()
    return option


def add_vote(
    session: Session,
    *,
    poll_id: int,
    option_id: int,
    identity_mode: str,
    voter_id: int | None,
    anonymous_voter_hash: str | None,
) -> Vote:
    """插入一张选票。是否合法由数据库约束决定。

    Args:
        session: 当前会话。
        poll_id: 所属投票。
        option_id: 被选选项。
        identity_mode: 票上记录的记名方式。
        voter_id: 记名账户。匿名票为空。
        anonymous_voter_hash: 本场浏览器凭据散列。记名票为空。

    Returns:
        尚未判断约束结果的选票对象。
    """
    vote = Vote(
        receipt_id=uuid4(),
        poll_id=poll_id,
        option_id=option_id,
        identity_mode=identity_mode,
        voter_id=voter_id,
        anonymous_voter_hash=anonymous_voter_hash,
    )
    session.add(vote)
    return vote
