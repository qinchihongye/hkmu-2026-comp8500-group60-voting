"""本地初始化命令。演示账户与演示场次分开创建。"""

import getpass
import os
import secrets
import sys
from dataclasses import dataclass
from datetime import timedelta

from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.poll_module.poll_service import PollService
from src.main.python.config.database_config import create_session_factory, dispose_session_factory
from src.main.python.config.logger_config import get_logger, setup_logging
from src.main.python.config.server_config import get_settings
from src.main.python.constants.enums import IdentityMode, UserRole, Visibility
from src.main.python.database.models import User
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.poll_request import OptionInput, PollCreate
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.security_util import check_access_password, check_password_length

logger = get_logger("cli")


class SeedConflict(Exception):
    """同名演示账户的角色与预期不一致。"""


@dataclass(frozen=True)
class DemoAccount:
    """一个待创建的演示账户。

    Attributes:
        username: 规范化用户名。
        display_name: 显示名。
        role: 预期角色。
        password: 本次命令读到的密码。已存在的账户不会改用它。
        password_env: 提供该密码的环境变量名。命令不会把值写入日志。
    """

    username: str
    display_name: str
    role: str
    password: str
    password_env: str


DEMO_ACCOUNTS: tuple[tuple[str, str, str, str], ...] = (
    ("admin", "管理员", UserRole.ADMIN, "DEMO_ADMIN_PASSWORD"),
    ("demo_user", "演示用户", UserRole.USER, "DEMO_USER_PASSWORD"),
    ("demo_voter", "演示参与者", UserRole.USER, "DEMO_VOTER_PASSWORD"),
)


def seed_demo_accounts(
    session_factory: sessionmaker[Session],
    accounts: tuple[DemoAccount, ...] | list[DemoAccount],
    passwords: PasswordHash,
) -> None:
    """幂等创建演示账户。

    已有同名且角色相符的账户保持原密码。角色不符时整批回滚并报错。

    Args:
        session_factory: 数据库会话工厂。
        accounts: 要确保存在的账户。
        passwords: 密码散列器。

    Raises:
        SeedConflict: 同名账户已经存在但角色不同。
        ValueError: 新密码长度不合法。
    """
    for account in accounts:
        check_password_length(account.password)
    with session_factory() as session:
        for account in accounts:
            existing = session.scalar(select(User).where(User.username == account.username))
            if existing is None:
                session.add(
                    User(
                        username=account.username,
                        display_name=account.display_name,
                        password_hash=passwords.hash(account.password),
                        role=account.role,
                    )
                )
                logger.info("已创建演示账户 username=%s role=%s", account.username, account.role)
                continue
            if existing.role != account.role:
                session.rollback()
                raise SeedConflict(
                    f"账户 {account.username} 已存在，角色是 {existing.role}，"
                    f"不能改为 {account.role}"
                )
            logger.info("演示账户已存在，保持原密码 username=%s", account.username)
        session.commit()


def main(argv: list[str] | None = None) -> int:
    """执行命令行入口。

    Args:
        argv: 参数列表。为空时读取进程参数。

    Returns:
        进程退出码。成功为 0，账户冲突或密码不合格为 1，未知命令为 2。
    """
    setup_logging()
    args = list(sys.argv[1:] if argv is None else argv)
    if args == ["seed-demo"]:
        return _run_seed_demo()
    if args == ["new-demo-round"]:
        return _run_new_demo_round()
    logger.error("未知命令")
    return 2


def _run_seed_demo() -> int:
    """创建或确认三个演示账户。

    Returns:
        进程退出码。成功为 0，密码或角色冲突为 1。
    """
    try:
        accounts = _accounts_from_env()
    except ValueError:
        logger.error("演示账户密码长度需为 12 到 128 个字符")
        return 1
    settings = get_settings()
    factory = create_session_factory(settings.database_url)
    try:
        seed_demo_accounts(factory, accounts, PasswordHash.recommended())
    except SeedConflict as exc:
        logger.error("%s", exc)
        return 1
    finally:
        dispose_session_factory(factory)
    return 0


def _run_new_demo_round() -> int:
    """用演示用户新建一轮四种组合的场次。

    Returns:
        进程退出码。成功为 0，密码、缺账户或角色冲突为 1。
    """
    try:
        password = _poll_password_from_env()
    except ValueError:
        logger.error("演示场次访问密码长度需为 8 到 128 个字符")
        return 1
    settings = get_settings()
    factory = create_session_factory(settings.database_url)
    try:
        create_demo_round(
            factory,
            Clock(),
            settings.public_base_url,
            password,
        )
    except SeedConflict as exc:
        logger.error("%s", exc)
        return 1
    finally:
        dispose_session_factory(factory)
    return 0


def _accounts_from_env() -> tuple[DemoAccount, ...]:
    """从环境变量或交互输入读取三个演示账户的密码。

    Returns:
        带密码的演示账户。密码为空时由长度检查拒绝。

    Raises:
        ValueError: 任一密码长度不合法。
    """
    loaded: list[DemoAccount] = []
    for username, display_name, role, env_name in DEMO_ACCOUNTS:
        password = os.environ.get(env_name, "")
        if password == "":
            password = getpass.getpass(f"请输入 {username} 的密码：")
        check_password_length(password)
        loaded.append(
            DemoAccount(
                username=username,
                display_name=display_name,
                role=role,
                password=password,
                password_env=env_name,
            )
        )
    return tuple(loaded)


def _poll_password_from_env() -> str:
    """读取演示场次的访问密码。

    Returns:
        访问密码。为空时由长度检查拒绝。

    Raises:
        ValueError: 长度不在 8 到 128 个字符之间。
    """
    password = os.environ.get("DEMO_POLL_PASSWORD", "")
    if password == "":
        password = getpass.getpass("请输入演示场次的访问密码：")
    return check_access_password(password)


def create_demo_round(
    session_factory: sessionmaker[Session],
    clock: Clock,
    public_base_url: str,
    access_password: str,
) -> tuple[int, ...]:
    """用 demo_user 新建四场投票，不修改已有场次。

    组合是记名公开、匿名公开、记名私密、匿名私密。生命周期分别是开放、关闭、
    已排期和草稿。私密访问密码写入明文，不写入散列。

    Args:
        session_factory: 数据库会话工厂。
        clock: 服务端时钟。
        public_base_url: 分享链接基址。命令不打印链接或密码。
        access_password: 两场私密样例共用的访问密码。

    Returns:
        新建投票的主键，顺序与四种组合一致。

    Raises:
        SeedConflict: 演示用户不存在，或角色不是 USER。
        ValueError: 访问密码长度不合法。
    """
    check_access_password(access_password)
    principal = _demo_creator(session_factory)
    service = PollService(session_factory, clock, public_base_url)
    batch = secrets.token_hex(3)
    created: list[int] = []
    for title, identity, visibility, scheduled, action in _ROUND_SPECS:
        payload = _round_payload(
            clock,
            f"演示{batch}{title}",
            identity,
            visibility,
            scheduled,
            access_password if visibility == Visibility.PRIVATE else None,
        )
        detail = service.create(principal, payload)
        if action == "draft":
            created.append(detail.id)
            continue
        published = service.publish(principal, detail.id, detail.version)
        if action == "close":
            service.close(principal, detail.id, published.version)
        created.append(detail.id)
    logger.info("已新建演示场次 batch=%s poll_ids=%s", batch, created)
    return tuple(created)


_ROUND_SPECS: tuple[tuple[str, IdentityMode, Visibility, bool, str], ...] = (
    ("记名公开", IdentityMode.NAMED, Visibility.PUBLIC, False, "publish"),
    ("匿名公开", IdentityMode.ANONYMOUS, Visibility.PUBLIC, False, "close"),
    ("记名私密", IdentityMode.NAMED, Visibility.PRIVATE, True, "publish"),
    ("匿名私密", IdentityMode.ANONYMOUS, Visibility.PRIVATE, False, "draft"),
)


def _demo_creator(session_factory: sessionmaker[Session]) -> Principal:
    """读取普通演示用户。

    Args:
        session_factory: 数据库会话工厂。

    Returns:
        demo_user 的身份。

    Raises:
        SeedConflict: 账户不存在，或角色不是 USER。
    """
    with session_factory() as session:
        user = session.scalar(select(User).where(User.username == "demo_user"))
        if user is None:
            raise SeedConflict("缺少演示用户 demo_user，请先执行 seed-demo")
        if user.role != UserRole.USER:
            raise SeedConflict(
                f"账户 demo_user 已存在，角色是 {user.role}，不能用它创建演示场次"
            )
        return Principal(user_id=user.id, role=user.role)


def _round_payload(
    clock: Clock,
    title: str,
    identity: IdentityMode,
    visibility: Visibility,
    scheduled: bool,
    access_password: str | None,
) -> PollCreate:
    """组装一场演示投票。

    Args:
        clock: 服务端时钟。
        title: 带批次标识的标题。
        identity: 记名方式。
        visibility: 公开性。
        scheduled: 为真时开始时间在未来。
        access_password: 私密场次的访问密码。公开场次为空。

    Returns:
        可交给 PollService 的创建参数。
    """
    now = clock.now()
    if scheduled:
        starts_at = now + timedelta(days=1)
        ends_at = now + timedelta(days=2)
    else:
        starts_at = now - timedelta(hours=1)
        ends_at = now + timedelta(hours=2)
    return PollCreate(
        title=title,
        description=None,
        starts_at=starts_at,
        ends_at=ends_at,
        identity_mode=identity,
        visibility=visibility,
        access_password=access_password,
        options=[OptionInput(label="同意"), OptionInput(label="反对")],
    )


if __name__ == "__main__":
    raise SystemExit(main())
