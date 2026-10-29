"""校验固定示例目录，并在一个事务里补齐缺失的示例。"""

import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from importlib.resources import files
from uuid import uuid4

from pwdlib import PasswordHash
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.poll_module.poll_service import _assign_share_code
from src.main.python.config.logger_config import get_logger
from src.main.python.constants.enums import (
    IdentityMode,
    PollLifecycle,
    SelectionMode,
    UserRole,
    Visibility,
)
from src.main.python.database.models import (
    DemoFixtureUser,
    DemoPollFixture,
    Poll,
    PollOption,
    User,
    Vote,
    VoteSelection,
)
from src.main.python.fileds.request.poll_request import PollCreate
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.security_util import (
    anonymous_voter_hash,
    check_access_password,
)

logger = get_logger("demo_seed")

DATASET_VERSION = "2026-10-29.1"
DEMO_POLL_LOCK_KEY = 850020261029
_CREATOR_USERNAME = "demo_user"
_CORE_IDENTITIES = (IdentityMode.NAMED, IdentityMode.ANONYMOUS)
_CORE_VISIBILITIES = (Visibility.PUBLIC, Visibility.PRIVATE)
_CORE_LIMITS = (None, 20)
_CORE_MODES = (SelectionMode.SINGLE, SelectionMode.MULTIPLE)
_CORE_LIVE = (False, True)
_POLL_FIELDS = {
    "key",
    "display_order",
    "title",
    "description",
    "identity_mode",
    "visibility",
    "vote_limit",
    "selection_mode",
    "allow_live_results",
    "options",
    "start_offset_hours",
    "end_offset_hours",
    "lifecycle",
    "seed_ballots",
}
_STATE_RULES: dict[str, tuple[object, ...]] = {
    "state-scheduled": (
        33,
        IdentityMode.NAMED,
        Visibility.PUBLIC,
        None,
        SelectionMode.SINGLE,
        False,
        PollLifecycle.PUBLISHED,
        0,
        24,
        168,
    ),
    "state-closed": (
        34,
        IdentityMode.ANONYMOUS,
        Visibility.PUBLIC,
        None,
        SelectionMode.MULTIPLE,
        False,
        PollLifecycle.PUBLISHED,
        3,
        -168,
        -24,
    ),
    "state-manually-closed": (
        35,
        IdentityMode.NAMED,
        Visibility.PRIVATE,
        None,
        SelectionMode.SINGLE,
        True,
        PollLifecycle.CLOSED,
        3,
        -1,
        720,
    ),
    "state-cap-full": (
        36,
        IdentityMode.ANONYMOUS,
        Visibility.PUBLIC,
        3,
        SelectionMode.MULTIPLE,
        True,
        PollLifecycle.CLOSED,
        3,
        -1,
        720,
    ),
    "state-cap-last": (
        37,
        IdentityMode.NAMED,
        Visibility.PUBLIC,
        4,
        SelectionMode.SINGLE,
        True,
        PollLifecycle.PUBLISHED,
        3,
        -1,
        720,
    ),
    "state-empty": (
        38,
        IdentityMode.ANONYMOUS,
        Visibility.PUBLIC,
        None,
        SelectionMode.SINGLE,
        True,
        PollLifecycle.PUBLISHED,
        0,
        -1,
        720,
    ),
}


class DemoCatalogError(Exception):
    """目录内容不满足固定示例约束。"""


class DemoSeedError(Exception):
    """示例初始化不能安全继续。

    Attributes:
        reason: 可以写入日志的原因，不含密码或凭据。
        fixture_key: 失败的目录键。没有具体键时为空。
    """

    def __init__(self, reason: str, fixture_key: str | None = None) -> None:
        """记录失败原因。

        Args:
            reason: 可以写入日志的原因。
            fixture_key: 失败的目录键。
        """
        super().__init__(reason)
        self.reason = reason
        self.fixture_key = fixture_key


@dataclass(frozen=True)
class DemoUserSpec:
    """目录中的种子账户。

    Attributes:
        key: 账户登记键。
        username: 用户名。
        display_name: 显示名。
    """

    key: str
    username: str
    display_name: str


@dataclass(frozen=True)
class DemoPollSpec:
    """一场固定示例。不含密码、分享码或数据库编号。

    Attributes:
        key: 目录键。
        display_order: 展示顺序。
        dataset_version: 目录版本。
        title: 标题。
        description: 说明。
        identity_mode: 记名方式。
        visibility: 公开性。
        vote_limit: 选票份数上限。空表示不限。
        selection_mode: 单选或多选。
        allow_live_results: 进行中是否可看汇总。
        options: 按展示顺序排列的选项。
        start_offset_hours: 相对首次初始化时刻的开始小时数。
        end_offset_hours: 相对首次初始化时刻的结束小时数。
        lifecycle: 写入数据库的生命周期。
        seed_ballots: 以 1 开始的选项序号。
    """

    key: str
    display_order: int
    dataset_version: str
    title: str
    description: str
    identity_mode: str
    visibility: str
    vote_limit: int | None
    selection_mode: str
    allow_live_results: bool
    options: tuple[str, ...]
    start_offset_hours: int
    end_offset_hours: int
    lifecycle: str
    seed_ballots: tuple[tuple[int, ...], ...]


@dataclass(frozen=True)
class DemoCatalog:
    """通过校验的固定目录。

    Attributes:
        dataset_version: 目录版本。
        users: 种子账户。
        polls: 按展示顺序排列的示例。
    """

    dataset_version: str
    users: tuple[DemoUserSpec, ...]
    polls: tuple[DemoPollSpec, ...]


@dataclass(frozen=True)
class DemoSeedReport:
    """一次初始化补了多少场、跳过了多少场。

    Attributes:
        created: 本次新写入的示例数。
        skipped: 已经登记并保持原样的示例数。
    """

    created: int
    skipped: int


def load_demo_catalog() -> DemoCatalog:
    """从包资源读取并校验固定目录。

    Returns:
        通过校验的目录。

    Raises:
        DemoCatalogError: 目录缺失、无法解析或不满足约束。
    """
    try:
        path = files("src.main.python.fixtures").joinpath("demo_polls.json")
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise DemoCatalogError("demo catalog file is missing") from exc
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise DemoCatalogError("demo catalog is not valid JSON") from exc
    return validate_demo_catalog(payload)


def validate_demo_catalog(payload: object) -> DemoCatalog:
    """检查目录的组合、顺序、选项和预置选票。

    Args:
        payload: 已解析的目录对象。

    Returns:
        通过校验的目录。

    Raises:
        DemoCatalogError: 任一约束不满足。
    """
    if not isinstance(payload, dict):
        raise DemoCatalogError("demo catalog must be an object")
    if set(payload) != {"dataset_version", "fixture_users", "polls"}:
        raise DemoCatalogError("demo catalog fields are invalid")
    if payload["dataset_version"] != DATASET_VERSION:
        raise DemoCatalogError("demo catalog version is invalid")
    users = _users(payload["fixture_users"])
    polls = _polls(payload["polls"], DATASET_VERSION, len(users))
    _require_matrix(polls)
    return DemoCatalog(dataset_version=DATASET_VERSION, users=users, polls=polls)


def ensure_demo_polls(
    session_factory: sessionmaker[Session],
    clock: Clock,
    access_password: str,
    *,
    hmac_key: str,
    passwords: PasswordHash | None = None,
) -> DemoSeedReport:
    """在一把事务锁内补齐缺失的固定示例。

    已有目录行只核对版本和关联，不改标题、密码、时间、选票或关闭状态。

    Args:
        session_factory: 数据库会话工厂。
        clock: 服务端时钟。首次成功写入使用同一次读取。
        access_password: 新私密示例的访问密码。已有示例不改用它。
        hmac_key: 匿名防重复密钥，至少 32 字节。
        passwords: 种子账户散列器。为空时使用默认 Argon2。

    Returns:
        新建和跳过的示例数量。

    Raises:
        DemoCatalogError: 目录本身不合法。
        DemoSeedError: 版本、关联或同名账户冲突，或创建者不存在。
        ValueError: 访问密码为空。
    """
    check_access_password(access_password)
    if len(hmac_key.encode("utf-8")) < 32:
        raise DemoSeedError("anonymous credential key is unavailable")
    catalog = load_demo_catalog()
    hasher = passwords if passwords is not None else PasswordHash.recommended()
    try:
        with session_factory() as session:
            with session.begin():
                report = _ensure_locked(
                    session,
                    catalog,
                    clock.now(),
                    access_password,
                    hmac_key,
                    hasher,
                )
    except DemoSeedError as exc:
        logger.error(
            "示例投票初始化失败 fixture_key=%s reason=%s",
            exc.fixture_key or "-",
            exc.reason,
        )
        raise
    except Exception:
        logger.exception("示例投票初始化失败 fixture_key=%s reason=%s", "-", "unexpected")
        raise
    logger.info("示例投票 created=%s skipped=%s", report.created, report.skipped)
    return report


def _users(raw: object) -> tuple[DemoUserSpec, ...]:
    """读取三个固定种子账户。

    Args:
        raw: 目录中的账户列表。

    Returns:
        按目录顺序排列的账户。

    Raises:
        DemoCatalogError: 账户数量、字段或用户名不正确。
    """
    if not isinstance(raw, list) or len(raw) != 3:
        raise DemoCatalogError("fixture users are invalid")
    expected = [
        ("fixture-voter-01", "fixture_voter_01", "Fixture voter 01"),
        ("fixture-voter-02", "fixture_voter_02", "Fixture voter 02"),
        ("fixture-voter-03", "fixture_voter_03", "Fixture voter 03"),
    ]
    loaded: list[DemoUserSpec] = []
    for item, wanted in zip(raw, expected, strict=True):
        if not isinstance(item, dict) or set(item) != {"key", "username", "display_name"}:
            raise DemoCatalogError("fixture users are invalid")
        spec = DemoUserSpec(
            key=str(item["key"]),
            username=str(item["username"]),
            display_name=str(item["display_name"]),
        )
        if (spec.key, spec.username, spec.display_name) != wanted:
            raise DemoCatalogError("fixture users are invalid")
        loaded.append(spec)
    return tuple(loaded)


def _polls(raw: object, version: str, user_count: int) -> tuple[DemoPollSpec, ...]:
    """读取并校验每一场示例。

    Args:
        raw: 目录中的示例列表。
        version: 目录版本。
        user_count: 可用于记名预置票的账户数。

    Returns:
        按展示顺序排列的示例。

    Raises:
        DemoCatalogError: 场次数量、字段或选票不合法。
    """
    if not isinstance(raw, list) or len(raw) != 38:
        raise DemoCatalogError("demo poll count is invalid")
    loaded: list[DemoPollSpec] = []
    for item in raw:
        if not isinstance(item, dict) or set(item) != _POLL_FIELDS:
            raise DemoCatalogError("demo poll fields are invalid")
        loaded.append(_poll(item, version, user_count))
    orders = [item.display_order for item in loaded]
    keys = [item.key for item in loaded]
    titles = [item.title for item in loaded]
    if len(set(keys)) != len(keys) or len(set(titles)) != len(titles):
        raise DemoCatalogError("demo poll keys or titles are duplicated")
    if orders != list(range(1, 39)):
        raise DemoCatalogError("demo poll order is invalid")
    return tuple(loaded)


def _poll(item: dict[str, object], version: str, user_count: int) -> DemoPollSpec:
    """校验一场示例的业务字段和预置选票。

    Args:
        item: 一场示例的原始对象。
        version: 目录版本。
        user_count: 记名账户数量。

    Returns:
        一场示例。

    Raises:
        DemoCatalogError: 字段、时间或选票不合法。
    """
    key = item["key"]
    if not isinstance(key, str) or not key:
        raise DemoCatalogError("demo poll key is invalid")
    options = item["options"]
    ballots = item["seed_ballots"]
    if not isinstance(options, list) or not all(isinstance(label, str) for label in options):
        raise DemoCatalogError(f"{key}: options are invalid")
    if not isinstance(ballots, list):
        raise DemoCatalogError(f"{key}: ballots are invalid")
    start_offset = item["start_offset_hours"]
    end_offset = item["end_offset_hours"]
    if (
        isinstance(start_offset, bool)
        or isinstance(end_offset, bool)
        or not isinstance(start_offset, int)
        or not isinstance(end_offset, int)
        or end_offset <= start_offset
    ):
        raise DemoCatalogError(f"{key}: time window is invalid")
    limit = item["vote_limit"]
    if isinstance(limit, bool) or (limit is not None and not isinstance(limit, int)):
        raise DemoCatalogError(f"{key}: vote limit is invalid")
    order = item["display_order"]
    if isinstance(order, bool) or not isinstance(order, int):
        raise DemoCatalogError(f"{key}: display order is invalid")
    lifecycle = item["lifecycle"]
    if lifecycle not in {PollLifecycle.PUBLISHED, PollLifecycle.CLOSED}:
        raise DemoCatalogError(f"{key}: lifecycle is invalid")
    _accept_poll_shape(key, item, options)
    parsed_ballots = _ballots(key, ballots, len(options), str(item["selection_mode"]))
    if limit is not None and len(parsed_ballots) > limit:
        raise DemoCatalogError(f"{key}: seed ballots exceed the vote limit")
    if item["identity_mode"] == IdentityMode.NAMED and len(parsed_ballots) > user_count:
        raise DemoCatalogError(f"{key}: named seed ballots exceed fixture users")
    spec = DemoPollSpec(
        key=key,
        display_order=order,
        dataset_version=version,
        title=str(item["title"]),
        description=str(item["description"]),
        identity_mode=str(item["identity_mode"]),
        visibility=str(item["visibility"]),
        vote_limit=limit,
        selection_mode=str(item["selection_mode"]),
        allow_live_results=bool(item["allow_live_results"]),
        options=tuple(str(label) for label in options),
        start_offset_hours=start_offset,
        end_offset_hours=end_offset,
        lifecycle=str(lifecycle),
        seed_ballots=parsed_ballots,
    )
    _require_state_rule(spec)
    return spec


def _accept_poll_shape(key: str, item: dict[str, object], options: list[str]) -> None:
    """用创建投票的校验器检查标题、选项和公开性。

    私密示例在这里只用占位密码触发校验，占位值不会进入目录或数据库。

    Args:
        key: 目录键。
        item: 原始示例。
        options: 选项文本。

    Raises:
        DemoCatalogError: 业务字段不合法。
    """
    start = datetime(2026, 1, 1, tzinfo=UTC)
    password = "catalog-check" if item["visibility"] == Visibility.PRIVATE else None
    try:
        PollCreate.model_validate(
            {
                "title": item["title"],
                "description": item["description"],
                "starts_at": start,
                "ends_at": start + timedelta(days=1),
                "identity_mode": item["identity_mode"],
                "visibility": item["visibility"],
                "access_password": password,
                "vote_limit": item["vote_limit"],
                "selection_mode": item["selection_mode"],
                "allow_live_results": item["allow_live_results"],
                "options": [{"label": label} for label in options],
            }
        )
    except ValidationError:
        raise DemoCatalogError(f"{key}: poll fields are invalid") from None


def _ballots(
    key: str,
    raw: list[object],
    option_count: int,
    selection_mode: str,
) -> tuple[tuple[int, ...], ...]:
    """检查预置选票的选项序号。

    Args:
        key: 目录键。
        raw: 原始选票。
        option_count: 选项数量。
        selection_mode: 单选或多选。

    Returns:
        规范化后的选票。

    Raises:
        DemoCatalogError: 序号越界、重复或数量不符合选择方式。
    """
    parsed: list[tuple[int, ...]] = []
    for ballot in raw:
        if not isinstance(ballot, list) or not ballot:
            raise DemoCatalogError(f"{key}: ballots are invalid")
        numbers: list[int] = []
        for number in ballot:
            if isinstance(number, bool) or not isinstance(number, int):
                raise DemoCatalogError(f"{key}: ballots are invalid")
            if number < 1 or number > option_count:
                raise DemoCatalogError(f"{key}: ballots are invalid")
            numbers.append(number)
        if len(numbers) != len(set(numbers)):
            raise DemoCatalogError(f"{key}: ballots are invalid")
        if selection_mode == SelectionMode.SINGLE and len(numbers) != 1:
            raise DemoCatalogError(f"{key}: single ballots must choose one option")
        if selection_mode == SelectionMode.MULTIPLE and not 1 <= len(numbers) <= option_count:
            raise DemoCatalogError(f"{key}: multiple ballots are invalid")
        parsed.append(tuple(numbers))
    return tuple(parsed)


def _require_matrix(polls: tuple[DemoPollSpec, ...]) -> None:
    """确认 32 场核心示例恰好覆盖五个维度的全部组合。

    Args:
        polls: 已按顺序读取的示例。

    Raises:
        DemoCatalogError: 组合缺失、重复，或状态示例不符合约定。
    """
    core = tuple(item for item in polls if not item.key.startswith("state-"))
    states = tuple(item for item in polls if item.key.startswith("state-"))
    expected = {
        (identity, visibility, limit, mode, live)
        for identity in _CORE_IDENTITIES
        for visibility in _CORE_VISIBILITIES
        for limit in _CORE_LIMITS
        for mode in _CORE_MODES
        for live in _CORE_LIVE
    }
    actual = {
        (
            item.identity_mode,
            item.visibility,
            item.vote_limit,
            item.selection_mode,
            item.allow_live_results,
        )
        for item in core
    }
    if len(core) != 32 or actual != expected:
        raise DemoCatalogError("core demo matrix is incomplete")
    for item in core:
        if len(item.options) != 4 or len(item.seed_ballots) != 3:
            raise DemoCatalogError(f"{item.key}: core poll shape is invalid")
        if item.lifecycle != PollLifecycle.PUBLISHED:
            raise DemoCatalogError(f"{item.key}: core poll must be published")
        if (item.start_offset_hours, item.end_offset_hours) != (-1, 720):
            raise DemoCatalogError(f"{item.key}: core poll window is invalid")
    if len(states) != len(_STATE_RULES):
        raise DemoCatalogError("state demos are invalid")


def _require_state_rule(spec: DemoPollSpec) -> None:
    """核对状态示例的固定设置。

    Args:
        spec: 一场示例。核心组合在矩阵检查里处理。

    Raises:
        DemoCatalogError: 状态示例和约定不一致。
    """
    if not spec.key.startswith("state-"):
        return
    rule = _STATE_RULES.get(spec.key)
    if rule is None:
        raise DemoCatalogError(f"{spec.key}: unknown state demo")
    actual = (
        spec.display_order,
        spec.identity_mode,
        spec.visibility,
        spec.vote_limit,
        spec.selection_mode,
        spec.allow_live_results,
        spec.lifecycle,
        len(spec.seed_ballots),
        spec.start_offset_hours,
        spec.end_offset_hours,
    )
    if actual != rule or len(spec.options) != 4:
        raise DemoCatalogError(f"{spec.key}: state demo does not match the catalog rule")


def _ensure_locked(
    session: Session,
    catalog: DemoCatalog,
    anchor: datetime,
    access_password: str,
    hmac_key: str,
    passwords: PasswordHash,
) -> DemoSeedReport:
    """在当前事务中核对登记并补齐缺失示例。

    Args:
        session: 已经开始的事务。
        catalog: 通过校验的目录。
        anchor: 本次新示例共用的 UTC 时刻。
        access_password: 新私密示例的访问密码。
        hmac_key: 匿名防重复密钥。
        passwords: 种子账户散列器。

    Returns:
        新建和跳过的数量。

    Raises:
        DemoSeedError: 关联、版本、创建者或同名账户不能安全继续。
    """
    session.execute(
        text("SELECT pg_advisory_xact_lock(:key)"),
        {"key": DEMO_POLL_LOCK_KEY},
    )
    existing = list(session.scalars(select(DemoPollFixture)).all())
    known = {item.key: item for item in catalog.polls}
    for row in existing:
        if row.fixture_key not in known:
            raise DemoSeedError("fixture key is not in the catalog", row.fixture_key)
        if row.dataset_version != catalog.dataset_version:
            raise DemoSeedError("dataset version does not match", row.fixture_key)
        if session.get(Poll, row.poll_id) is None:
            raise DemoSeedError("linked poll is missing", row.fixture_key)
    creator_id = _creator_id(session)
    user_ids = _ensure_users(session, catalog.users, passwords)
    present = {row.fixture_key for row in existing}
    created = 0
    for spec in catalog.polls:
        if spec.key in present:
            continue
        _insert_demo_poll(session, spec, anchor, creator_id, access_password, hmac_key, user_ids)
        created += 1
    return DemoSeedReport(created=created, skipped=len(catalog.polls) - created)


def _creator_id(session: Session) -> int:
    """读取普通演示用户的主键。

    Args:
        session: 当前事务。

    Returns:
        demo_user 的主键。

    Raises:
        DemoSeedError: 账户不存在，或角色不是 USER。
    """
    creator = session.scalar(select(User).where(User.username == _CREATOR_USERNAME))
    if creator is None or creator.role != UserRole.USER:
        raise DemoSeedError("demo_user is missing or is not a USER")
    return creator.id


def _ensure_users(
    session: Session,
    specs: tuple[DemoUserSpec, ...],
    passwords: PasswordHash,
) -> dict[str, int]:
    """确认种子账户属于本目录，并补齐缺失账户。

    已登记账户不改密码，也不重新启用。同名但未登记的账户会让整批回滚。

    Args:
        session: 当前事务。
        specs: 目录中的账户。
        passwords: 密码散列器。

    Returns:
        目录键到账户主键的映射。

    Raises:
        DemoSeedError: 同名账户未登记，或已有关联损坏。
    """
    links = {row.fixture_key: row for row in session.scalars(select(DemoFixtureUser)).all()}
    resolved: dict[str, int] = {}
    pending: list[DemoUserSpec] = []
    for spec in specs:
        account = session.scalar(select(User).where(User.username == spec.username))
        link = links.get(spec.key)
        if link is None and account is not None:
            raise DemoSeedError("username exists without a fixture link", spec.key)
        if link is None:
            pending.append(spec)
            continue
        owner = session.get(User, link.user_id)
        if owner is None or owner.username != spec.username or account is None:
            raise DemoSeedError("fixture user link is invalid", spec.key)
        resolved[spec.key] = owner.id
    for spec in pending:
        raw_password = secrets.token_urlsafe(32)
        user = User(
            username=spec.username,
            display_name=spec.display_name,
            password_hash=passwords.hash(raw_password),
            role=UserRole.USER,
            is_active=False,
        )
        session.add(user)
        session.flush()
        session.add(DemoFixtureUser(fixture_key=spec.key, user_id=user.id))
        resolved[spec.key] = user.id
    return resolved


def _insert_demo_poll(
    session: Session,
    spec: DemoPollSpec,
    anchor: datetime,
    creator_id: int,
    access_password: str,
    hmac_key: str,
    user_ids: dict[str, int],
) -> None:
    """写入一场新示例、选项、预置票和登记行。

    Args:
        session: 当前事务。
        spec: 目录中的一场示例。
        anchor: 本次初始化时刻。
        creator_id: 创建者主键。
        access_password: 私密示例的访问密码。
        hmac_key: 匿名防重复密钥。
        user_ids: 记名种子账户。

    Raises:
        DemoSeedError: 分享码或匿名散列无法安全生成。
    """
    start = anchor + timedelta(hours=spec.start_offset_hours)
    end = anchor + timedelta(hours=spec.end_offset_hours)
    poll = Poll(
        title=spec.title,
        description=spec.description,
        identity_mode=spec.identity_mode,
        visibility=spec.visibility,
        private_password=access_password if spec.visibility == Visibility.PRIVATE else None,
        private_password_hash=None,
        vote_limit=spec.vote_limit,
        selection_mode=spec.selection_mode,
        allow_live_results=spec.allow_live_results,
        lifecycle=spec.lifecycle,
        starts_at=start,
        ends_at=end,
        creator_id=creator_id,
        version=1,
        closed_at=anchor if spec.lifecycle == PollLifecycle.CLOSED else None,
        created_at=anchor,
        updated_at=anchor,
    )
    session.add(poll)
    session.flush()
    option_ids: list[int] = []
    for position, label in enumerate(spec.options):
        option = PollOption(poll_id=poll.id, label=label, position=position)
        session.add(option)
        session.flush()
        option_ids.append(option.id)
    try:
        _assign_share_code(session, poll)
    except AppError as exc:
        raise DemoSeedError("share code was not assigned", spec.key) from exc
    _insert_ballots(session, spec, poll, option_ids, start, end, anchor, hmac_key, user_ids)
    session.add(
        DemoPollFixture(
            fixture_key=spec.key,
            poll_id=poll.id,
            dataset_version=spec.dataset_version,
            display_order=spec.display_order,
            initialized_at=anchor,
        )
    )


def _insert_ballots(
    session: Session,
    spec: DemoPollSpec,
    poll: Poll,
    option_ids: list[int],
    start: datetime,
    end: datetime,
    anchor: datetime,
    hmac_key: str,
    user_ids: dict[str, int],
) -> None:
    """写入一场示例的预置选票。

    Args:
        session: 当前事务。
        spec: 目录中的一场示例。
        poll: 已写入的投票。
        option_ids: 按位置排列的选项主键。
        start: 投票开始时间。
        end: 投票结束时间。
        anchor: 本次初始化时刻。
        hmac_key: 匿名防重复密钥。
        user_ids: 记名种子账户。

    Raises:
        DemoSeedError: 提交时间不在窗口内，或匿名密钥不可用。
    """
    if not spec.seed_ballots:
        return
    submitted_at = _submitted_at(spec.key, anchor, start, end)
    named_ids = [user_ids[f"fixture-voter-0{index}"] for index in (1, 2, 3)]
    for index, ballot in enumerate(spec.seed_ballots):
        voter_id = None
        token_hash = None
        if spec.identity_mode == IdentityMode.NAMED:
            voter_id = named_ids[index]
        else:
            try:
                token_hash = anonymous_voter_hash(hmac_key, poll.id, secrets.token_urlsafe(32))
            except ValueError as exc:
                raise DemoSeedError("anonymous credential hash is unavailable", spec.key) from exc
        vote = Vote(
            receipt_id=uuid4(),
            poll_id=poll.id,
            identity_mode=spec.identity_mode,
            voter_id=voter_id,
            anonymous_voter_hash=token_hash,
            submitted_at=submitted_at,
        )
        session.add(vote)
        session.flush()
        for number in ballot:
            session.add(
                VoteSelection(
                    vote_id=vote.id,
                    option_id=option_ids[number - 1],
                    poll_id=poll.id,
                )
            )


def _submitted_at(key: str, anchor: datetime, start: datetime, end: datetime) -> datetime:
    """选择一个落在投票窗口内的预置提交时间。

    Args:
        key: 目录键。
        anchor: 本次初始化时刻。
        start: 投票开始时间。
        end: 投票结束时间。

    Returns:
        严格位于窗口内的提交时间。

    Raises:
        DemoSeedError: 找不到窗口内的时间。
    """
    preferred = anchor - timedelta(minutes=30)
    if start <= preferred < end:
        return preferred
    midpoint = start + (end - start) / 2
    if start <= midpoint < end:
        return midpoint
    raise DemoSeedError("seed ballot time is outside the poll window", key)
