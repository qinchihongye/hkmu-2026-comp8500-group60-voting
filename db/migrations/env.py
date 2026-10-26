"""Alembic 迁移环境。连接串来自应用配置，不写个人绝对路径。"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.main.python.database.models import Base

config = context.config

if config.config_file_name is not None:
    # 默认会关闭进程里已有的日志器。测试先配置应用日志再跑迁移，不能把它们关掉。
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    """取得迁移使用的数据库连接串。

    正常运行读取应用配置。测试设置 VOTING_MIGRATION_URL，避免把降级打到开发库。

    Returns:
        SQLAlchemy 连接串。
    """
    override = os.environ.get("VOTING_MIGRATION_URL")
    if override:
        return override
    from src.main.python.config.server_config import get_settings

    return get_settings().database_url


def run_migrations_offline() -> None:
    """在不建立数据库连接时生成 SQL。"""
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """连接数据库并执行迁移。"""
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
