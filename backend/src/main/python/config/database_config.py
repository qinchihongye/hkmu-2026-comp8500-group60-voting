"""数据库引擎与会话工厂。导入本模块时不建立连接。"""

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

_ENGINES: dict[int, Engine] = {}


def create_session_factory(database_url: str) -> sessionmaker[Session]:
    """创建同步会话工厂。

    事务隔离级别为 READ COMMITTED，并隐藏引擎日志中的 SQL 参数。

    Args:
        database_url: SQLAlchemy 数据库连接串。

    Returns:
        绑定到新引擎的会话工厂。调用前不会连接数据库。
    """
    connect_args: dict[str, object] = {}
    if database_url.startswith("postgresql"):
        connect_args["connect_timeout"] = 3
    engine = create_engine(
        database_url,
        hide_parameters=True,
        isolation_level="READ COMMITTED",
        pool_pre_ping=True,
        connect_args=connect_args,
    )
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    _ENGINES[id(factory)] = engine
    return factory


def engine_for(factory: sessionmaker[Session]) -> Engine:
    """取得会话工厂对应的引擎。

    Args:
        factory: create_session_factory 返回的工厂。

    Returns:
        该工厂绑定的引擎。

    Raises:
        KeyError: 工厂不是由 create_session_factory 创建的。
    """
    return _ENGINES[id(factory)]


def dispose_session_factory(factory: sessionmaker[Session]) -> None:
    """关闭工厂绑定的连接池。

    Args:
        factory: 需要释放的会话工厂。
    """
    engine = _ENGINES.pop(id(factory), None)
    if engine is not None:
        engine.dispose()
