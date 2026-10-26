"""ORM 声明基类。"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """所有表模型的公共基类。

    导入具体模型后，Base.metadata 汇总全部数据表。
    """
