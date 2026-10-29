"""固定示例与其账户的登记表。普通创建接口不能写入这两张表。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.main.python.database.models.base import Base


class DemoPollFixture(Base):
    """一条固定示例和真实投票的关联。

    Attributes:
        fixture_key: 目录键，例如 named-public-01。
        poll_id: 对应投票。唯一，删除投票时限制。
        dataset_version: 生成该行时的目录版本。
        display_order: Overview 中的固定顺序。
        initialized_at: 首次写入该行的 UTC 时间。
    """

    __tablename__ = "demo_poll_fixtures"

    fixture_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey(
            "polls.id",
            name="fk_demo_poll_fixtures_poll_id_polls",
            ondelete="RESTRICT",
        ),
        nullable=False,
        unique=True,
    )
    dataset_version: Mapped[str] = mapped_column(String(32), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    initialized_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DemoFixtureUser(Base):
    """一个仅供种子引用的账户登记。

    Attributes:
        fixture_key: 目录中的账户键。
        user_id: 对应账户。唯一，删除账户时限制。
    """

    __tablename__ = "demo_fixture_users"

    fixture_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_demo_fixture_users_user_id_users",
            ondelete="RESTRICT",
        ),
        nullable=False,
        unique=True,
    )
