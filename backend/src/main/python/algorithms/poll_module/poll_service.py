"""创建者对自己投票的管理和列表。"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.audit_module.audit_service import AuditService
from src.main.python.config.logger_config import get_logger, request_id_var
from src.main.python.constants.enums import (
    AuditAction,
    IdentityMode,
    PollLifecycle,
    PollStatus,
    SelectionMode,
    Visibility,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollOption, Vote
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.poll_request import PollCreate, PollUpdate
from src.main.python.fileds.response.poll_access_response import ShareLink
from src.main.python.fileds.response.poll_response import (
    ManagePollDetail,
    ManagePollSummary,
    OptionPublic,
    PollSummary,
)
from src.main.python.fileds.response.response import Page
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.security_util import new_secret

logger = get_logger("poll")


@dataclass(frozen=True)
class PollListFilters:
    """投票列表的分页和筛选。

    Attributes:
        page: 页码，从 1 开始。
        page_size: 每页条数。
        status: 有效状态。为空表示不过滤。
        text: 标题搜索原文。空白视为不搜索。
        sort_by: 排序方式：created_at、starts_at、ends_at、popularity。
    """

    page: int
    page_size: int
    status: PollStatus | None = None
    text: str | None = None
    sort_by: str | None = None


def effective_status(poll: Poll, now: datetime) -> PollStatus:
    """按生命周期和当前时间计算对外状态。

    自然结束不改写 lifecycle。closed_at 只在创建者显式关闭时才有值。

    Args:
        poll: 已加载的投票。
        now: 服务端当前时间。

    Returns:
        DRAFT、SCHEDULED、OPEN 或 CLOSED。
    """
    if poll.lifecycle == PollLifecycle.DRAFT:
        return PollStatus.DRAFT
    if poll.lifecycle == PollLifecycle.CLOSED or now >= poll.ends_at:
        return PollStatus.CLOSED
    if now < poll.starts_at:
        return PollStatus.SCHEDULED
    return PollStatus.OPEN


def results_access(
    status: PollStatus,
    allow_live_results: bool,
    *,
    creator: bool,
    admin: bool,
) -> tuple[bool, str]:
    """决定当前身份能否看汇总。

    创建者和管理员始终可以看。普通参与者在结束后可以看。
    进行中只有创建者打开实时票况时可以看。未开始不能看。

    Args:
        status: 有效状态。
        allow_live_results: 是否允许进行中查看汇总。
        creator: 当前账户是不是创建者。
        admin: 当前账户是不是管理员。

    Returns:
        能否查看，以及原因。原因是 creator、admin、closed、live 或 unavailable。
    """
    if creator:
        return True, "creator"
    if admin:
        return True, "admin"
    if status == PollStatus.CLOSED:
        return True, "closed"
    if status == PollStatus.OPEN and allow_live_results:
        return True, "live"
    return False, "unavailable"


class PollService:
    """投票管理。写操作只允许创建者，管理员不能改别人的投票。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
        _public_base_url: 分享链接的基址。
        _audit: 与本事务一起提交的审计。
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        clock: Clock,
        public_base_url: str,
    ) -> None:
        """保存会话工厂、时钟和分享基址。

        Args:
            session_factory: 数据库会话工厂。
            clock: 服务端 UTC 时钟。
            public_base_url: 对外站点基址。
        """
        self._factory = session_factory
        self._clock = clock
        self._public_base_url = public_base_url
        self._audit = AuditService()

    def create(self, principal: Principal, payload: PollCreate) -> ManagePollDetail:
        """创建属于当前账户的草稿。

        Args:
            principal: 已登录账户。
            payload: 已校验的草稿内容。

        Returns:
            不含密码的管理详情。

        Raises:
            AppError: 数据库拒绝写入或暂时不可用。
        """
        now = self._clock.now()
        with self._factory() as session:
            try:
                poll = Poll(
                    title=payload.title,
                    description=payload.description,
                    identity_mode=payload.identity_mode.value,
                    visibility=payload.visibility.value,
                    private_password_hash=None,
                    private_password=_password_text(payload),
                    vote_limit=payload.vote_limit,
                    selection_mode=payload.selection_mode.value,
                    allow_live_results=payload.allow_live_results,
                    share_code=None,
                    lifecycle=PollLifecycle.DRAFT,
                    starts_at=payload.starts_at,
                    ends_at=payload.ends_at,
                    creator_id=principal.user_id,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
                session.add(poll)
                session.flush()
                _replace_options(session, poll.id, payload)
                self._audit.record(
                    session,
                    principal.user_id,
                    AuditAction.CREATE,
                    poll.id,
                    None,
                    _request_id(),
                    created_at=now,
                )
                detail = _manage_detail(session, poll, now, principal)
                session.commit()
            except AppError:
                session.rollback()
                raise
            except IntegrityError:
                session.rollback()
                logger.error("创建投票被数据库拒绝")
                raise _validation() from None
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
        logger.info("已创建投票 poll_id=%s", detail.id)
        return detail

    def update(
        self,
        principal: Principal,
        poll_id: int,
        payload: PollUpdate,
    ) -> ManagePollDetail:
        """替换自己的草稿。已发布的投票不能改。

        Args:
            principal: 已登录账户。
            poll_id: 投票主键。
            payload: 完整草稿字段和期望版本。

        Returns:
            更新后的管理详情。

        Raises:
            AppError: 投票不存在、不是创建者、版本过期、已发布或数据库不可用。
        """
        with self._factory() as session:
            try:
                poll = _lock_owned(session, principal, poll_id)
                _require_version(poll, payload.expected_version)
                if poll.lifecycle != PollLifecycle.DRAFT:
                    raise _immutable()
                now = self._clock.now()
                poll.title = payload.title
                poll.description = payload.description
                poll.identity_mode = payload.identity_mode.value
                poll.visibility = payload.visibility.value
                poll.private_password_hash, poll.private_password = _next_password(
                    poll.private_password_hash,
                    poll.private_password,
                    payload,
                )
                poll.vote_limit = payload.vote_limit
                poll.selection_mode = payload.selection_mode.value
                poll.allow_live_results = payload.allow_live_results
                poll.starts_at = payload.starts_at
                poll.ends_at = payload.ends_at
                poll.version += 1
                poll.updated_at = now
                _replace_options(session, poll.id, payload)
                self._audit.record(
                    session,
                    principal.user_id,
                    AuditAction.UPDATE,
                    poll.id,
                    None,
                    _request_id(),
                    created_at=now,
                )
                detail = _manage_detail(session, poll, now, principal)
                session.commit()
            except AppError:
                session.rollback()
                raise
            except IntegrityError:
                session.rollback()
                logger.error("更新投票被数据库拒绝")
                raise _validation() from None
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
        logger.info("已更新投票 poll_id=%s", poll_id)
        return detail

    def publish(
        self,
        principal: Principal,
        poll_id: int,
        expected_version: int,
    ) -> ManagePollDetail:
        """发布自己的草稿并生成分享码。

        开始时间可以已经过去。结束时间必须仍在当前时间之后。

        Args:
            principal: 已登录账户。
            poll_id: 投票主键。
            expected_version: 客户端看到的版本。

        Returns:
            发布后的管理详情。

        Raises:
            AppError: 不是草稿、已经结束、版本过期或数据库不可用。
        """
        with self._factory() as session:
            try:
                poll = _lock_owned(session, principal, poll_id)
                _require_version(poll, expected_version)
                if poll.lifecycle != PollLifecycle.DRAFT:
                    raise _immutable()
                now = self._clock.now()
                if poll.ends_at <= now:
                    raise _not_open()
                _require_multiple_options(session, poll)
                poll.lifecycle = PollLifecycle.PUBLISHED
                poll.version += 1
                poll.updated_at = now
                session.flush()
                _assign_share_code(session, poll)
                self._audit.record(
                    session,
                    principal.user_id,
                    AuditAction.PUBLISH,
                    poll.id,
                    None,
                    _request_id(),
                    created_at=now,
                )
                detail = _manage_detail(session, poll, now, principal)
                session.commit()
            except AppError:
                session.rollback()
                raise
            except IntegrityError:
                session.rollback()
                logger.error("发布投票被数据库拒绝")
                raise _validation() from None
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
        logger.info("已发布投票 poll_id=%s", poll_id)
        return detail

    def close(
        self,
        principal: Principal,
        poll_id: int,
        expected_version: int,
    ) -> ManagePollDetail:
        """显式关闭自己已发布的投票。

        已经关闭时返回现状，不再写第二条审计，也不检查版本。

        Args:
            principal: 已登录账户。
            poll_id: 投票主键。
            expected_version: 首次关闭时必须匹配的版本。

        Returns:
            关闭后或本来就已关闭的管理详情。

        Raises:
            AppError: 仍是草稿、版本过期或数据库不可用。
        """
        with self._factory() as session:
            try:
                poll = _lock_owned(session, principal, poll_id)
                now = self._clock.now()
                if poll.lifecycle == PollLifecycle.CLOSED:
                    return _manage_detail(session, poll, now, principal)
                _require_version(poll, expected_version)
                if poll.lifecycle != PollLifecycle.PUBLISHED:
                    raise _not_open()
                poll.lifecycle = PollLifecycle.CLOSED
                poll.closed_at = now
                poll.version += 1
                poll.updated_at = now
                self._audit.record(
                    session,
                    principal.user_id,
                    AuditAction.CLOSE,
                    poll.id,
                    None,
                    _request_id(),
                    created_at=now,
                )
                detail = _manage_detail(session, poll, now, principal)
                session.commit()
            except AppError:
                session.rollback()
                raise
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
        logger.info("已关闭投票 poll_id=%s", poll_id)
        return detail

    def list_public(self, filters: PollListFilters) -> Page[PollSummary]:
        """列出广场上的公开且非草稿投票。

        Args:
            filters: 分页、有效状态和标题搜索。

        Returns:
            摘要页。私密投票和草稿不计入总数。

        Raises:
            AppError: 搜索过长或数据库不可用。
        """
        clauses = [
            Poll.visibility == Visibility.PUBLIC,
            Poll.lifecycle != PollLifecycle.DRAFT,
        ]
        return self._page(clauses, filters, _summary)

    def list_owned(
        self,
        principal: Principal,
        filters: PollListFilters,
    ) -> Page[ManagePollSummary]:
        """列出当前账户自己创建的投票。

        Args:
            principal: 已登录账户。
            filters: 分页和筛选。

        Returns:
            管理摘要页。

        Raises:
            AppError: 搜索过长或数据库不可用。
        """
        return self._page([Poll.creator_id == principal.user_id], filters, _manage_summary)

    def get_owned(self, principal: Principal, poll_id: int) -> ManagePollDetail:
        """读取自己的一场投票。别人的投票按不存在处理。

        Args:
            principal: 已登录账户。
            poll_id: 投票主键。

        Returns:
            管理详情。

        Raises:
            AppError: 投票不存在或不属于当前账户。
        """
        with self._factory() as session:
            try:
                poll = session.get(Poll, poll_id)
            except SQLAlchemyError:
                raise _unavailable() from None
            if poll is None or poll.creator_id != principal.user_id:
                raise _missing()
            return _manage_detail(session, poll, self._clock.now(), principal)

    def list_admin(
        self,
        principal: Principal,
        filters: PollListFilters,
    ) -> Page[ManagePollSummary]:
        """列出全部投票。调用方必须已经是管理员。

        Args:
            principal: 管理员身份。
            filters: 分页和筛选。

        Returns:
            全部投票的管理摘要。

        Raises:
            AppError: 不是管理员，或数据库不可用。
        """
        _require_admin(principal)
        return self._page([], filters, _manage_summary)

    def get_admin(self, principal: Principal, poll_id: int) -> ManagePollDetail:
        """读取任意一场投票的管理详情。写权限仍然只看创建者。

        Args:
            principal: 管理员身份。
            poll_id: 投票主键。

        Returns:
            管理详情。can_manage 只在调用者本人创建时为真。

        Raises:
            AppError: 不是管理员或投票不存在。
        """
        _require_admin(principal)
        with self._factory() as session:
            try:
                poll = session.get(Poll, poll_id)
            except SQLAlchemyError:
                raise _unavailable() from None
            if poll is None:
                raise _missing()
            return _manage_detail(session, poll, self._clock.now(), principal)

    def get_share(self, principal: Principal, poll_id: int) -> ShareLink:
        """返回自己已发布或已关闭投票的分享链接。

        Args:
            principal: 已登录账户。
            poll_id: 投票主键。

        Returns:
            分享信息。链接不含密码。已保存明文时附带创建者可复制的访问密码。

        Raises:
            AppError: 不是创建者，或投票还不能分享。
        """
        with self._factory() as session:
            try:
                poll = session.get(Poll, poll_id)
            except SQLAlchemyError:
                raise _unavailable() from None
            if poll is None or poll.creator_id != principal.user_id:
                raise _missing()
            _require_shareable(poll)
            return _share_link(self._public_base_url, poll)

    def _page[T](
        self,
        extra: list[object],
        filters: PollListFilters,
        build: object,
    ) -> Page[T]:
        """按统一顺序分页。

        Args:
            extra: 这份列表固定要加上的条件。
            filters: 分页和可选筛选。
            build: 把一行投票收成响应模型的函数。

        Returns:
            当前页和同一条件下的总数。

        Raises:
            AppError: 搜索过长或数据库不可用。
        """
        clauses = [*extra, *_filter_clauses(filters, self._clock.now())]
        with self._factory() as session:
            try:
                total = session.scalar(_count(clauses)) or 0
                rows = session.scalars(_ordered(clauses, filters)).all()
            except SQLAlchemyError:
                raise _unavailable() from None
            now = self._clock.now()
            items = [build(row, now) for row in rows]
        return Page(items=items, page=filters.page, page_size=filters.page_size, total=total)


def _share_link(public_base_url: str, poll: Poll) -> ShareLink:
    """组装创建者的分享信息。

    Args:
        public_base_url: 对外站点基址。
        poll: 已发布或已关闭、且带分享码的投票。

    Returns:
        链接不含密码的分享信息。明文为空时表示还不能复制。
    """
    base = public_base_url.rstrip("/")
    return ShareLink(
        share_url=f"{base}/s/{poll.share_code}",
        requires_password=poll.visibility == Visibility.PRIVATE,
        requires_login=poll.identity_mode == IdentityMode.NAMED,
        access_password=poll.private_password,
    )


def _require_shareable(poll: Poll) -> None:
    """确认这场投票已经可以分享。

    Args:
        poll: 已加载的投票。

    Raises:
        AppError: 还是草稿，或没有分享码。
    """
    if poll.lifecycle not in {PollLifecycle.PUBLISHED, PollLifecycle.CLOSED} or not poll.share_code:
        raise _not_open()


def _password_text(payload: PollCreate) -> str | None:
    """读取新建私密投票要保存的明文。

    Args:
        payload: 已确认私密场次带有密码的创建参数。

    Returns:
        访问密码。公开投票为空。
    """
    if payload.visibility != Visibility.PRIVATE or payload.access_password is None:
        return None
    return payload.access_password


def _next_password(
    current_hash: str | None,
    current_password: str | None,
    payload: PollUpdate,
) -> tuple[str | None, str | None]:
    """决定草稿保存后的散列和明文。

    新密码只写明文。未提交新密码时保留原值。改成公开时两者都清空。

    Args:
        current_hash: 更新前的旧散列。
        current_password: 更新前的明文。
        payload: 草稿更新参数。

    Returns:
        散列和明文。

    Raises:
        AppError: 改成私密但没有可用密码。
    """
    if payload.visibility == Visibility.PUBLIC:
        return None, None
    if payload.access_password is not None:
        return None, payload.access_password
    if current_hash is not None or current_password is not None:
        return current_hash, current_password
    raise AppError(422, ApiCode.VALIDATION_ERROR, "私密投票需要访问密码")


def _replace_options(session: Session, poll_id: int, payload: PollCreate | PollUpdate) -> None:
    """按提交顺序重写选项。草稿上还没有选票。

    Args:
        session: 当前事务。
        poll_id: 投票主键。
        payload: 带选项的草稿参数。
    """
    existing = session.scalars(select(PollOption).where(PollOption.poll_id == poll_id)).all()
    for row in existing:
        session.delete(row)
    session.flush()
    for position, item in enumerate(payload.options):
        session.add(PollOption(poll_id=poll_id, label=item.label, position=position))
    session.flush()


def _assign_share_code(session: Session, poll: Poll) -> None:
    """写入一个尚未占用的分享码。

    Args:
        session: 当前事务。
        poll: 已经刷入数据库的投票。

    Raises:
        AppError: 多次尝试后仍然冲突，或冲突来自其他约束。
    """
    for _ in range(5):
        poll.share_code = new_secret()
        try:
            with session.begin_nested():
                session.flush()
            return
        except IntegrityError as exc:
            if _constraint_name(exc) != "polls_share_code_key":
                raise
    raise _unavailable()


def _lock_owned(session: Session, principal: Principal, poll_id: int) -> Poll:
    """锁定并确认这是调用者自己的投票。

    Args:
        session: 当前事务。
        principal: 已登录账户。
        poll_id: 投票主键。

    Returns:
        已加写锁的投票。

    Raises:
        AppError: 投票不存在，或调用者不是创建者。
    """
    poll = session.scalar(select(Poll).where(Poll.id == poll_id).with_for_update())
    if poll is None:
        raise _missing()
    if poll.creator_id != principal.user_id:
        raise AppError(403, ApiCode.FORBIDDEN, ApiCode.FORBIDDEN.default_message)
    return poll


def _require_version(poll: Poll, expected_version: int) -> None:
    """拒绝过期的草稿版本。

    Args:
        poll: 已锁定的投票。
        expected_version: 客户端提交的版本。

    Raises:
        AppError: 版本不一致。
    """
    if poll.version != expected_version:
        raise AppError(
            409,
            ApiCode.STALE_POLL_VERSION,
            ApiCode.STALE_POLL_VERSION.default_message,
        )


def _require_admin(principal: Principal) -> None:
    """确认全局只读身份。

    Args:
        principal: 已登录账户。

    Raises:
        AppError: 不是管理员。
    """
    if principal.role != "ADMIN":
        raise AppError(403, ApiCode.FORBIDDEN, ApiCode.FORBIDDEN.default_message)


def _filter_clauses(filters: PollListFilters, now: datetime) -> list[object]:
    """把可选的状态和标题搜索收成条件。

    Args:
        filters: 列表筛选。
        now: 计算有效状态用的当前时间。

    Returns:
        需要追加的条件。没有筛选时为空列表。

    Raises:
        AppError: 搜索文本超过 120 个字符。
    """
    clauses: list[object] = []
    if filters.status is not None:
        clauses.append(_status_clause(filters.status, now))
    search = _title_search(filters.text)
    if search is not None:
        clauses.append(search)
    return clauses


def _status_clause(status: PollStatus, now: datetime) -> object:
    """用 SQL 表达有效状态，不依赖库存列。

    Args:
        status: 要筛选的有效状态。
        now: 当前时间。

    Returns:
        可放进 WHERE 的条件。
    """
    draft = Poll.lifecycle == PollLifecycle.DRAFT
    published = Poll.lifecycle == PollLifecycle.PUBLISHED
    closed = Poll.lifecycle == PollLifecycle.CLOSED
    if status == PollStatus.DRAFT:
        return draft
    if status == PollStatus.CLOSED:
        return or_(closed, and_(published, Poll.ends_at <= now))
    running = and_(published, Poll.ends_at > now)
    if status == PollStatus.SCHEDULED:
        return and_(running, Poll.starts_at > now)
    return and_(running, Poll.starts_at <= now)


def _title_search(text: str | None) -> object | None:
    """把标题搜索转成转义后的 ILIKE。

    Args:
        text: 原始搜索词。

    Returns:
        标题条件。空白搜索为空。

    Raises:
        AppError: 去掉空白后仍超过 120 个字符。
    """
    if text is None:
        return None
    cleaned = text.strip()
    if not cleaned:
        return None
    if len(cleaned) > 120:
        raise _validation()
    escaped = cleaned.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return Poll.title.ilike(f"%{escaped}%", escape="\\")


def _count(clauses: list[object]) -> Select[tuple[int]]:
    """统计同一组条件的行数。

    Args:
        clauses: WHERE 条件。

    Returns:
        计数语句。
    """
    statement = select(func.count()).select_from(Poll)
    if clauses:
        statement = statement.where(*clauses)
    return statement


def _ordered(clauses: list[object], filters: PollListFilters) -> Select[tuple[Poll]]:
    """按指定排序方式和主键倒序取一页。

    Args:
        clauses: WHERE 条件。
        filters: 分页和排序参数。

    Returns:
        当前页的查询。
    """
    sort = filters.sort_by or "created_at"
    if sort == "popularity":
        vote_subq = (
            select(Vote.poll_id, func.count(Vote.id).label("vote_count"))
            .group_by(Vote.poll_id)
            .subquery()
        )
        statement = (
            select(Poll)
            .outerjoin(vote_subq, Poll.id == vote_subq.c.poll_id)
            .order_by(
                func.coalesce(vote_subq.c.vote_count, 0).desc(),
                Poll.created_at.desc(),
                Poll.id.desc(),
            )
        )
    elif sort == "ends_at":
        statement = select(Poll).order_by(Poll.ends_at.asc(), Poll.id.desc())
    elif sort == "starts_at":
        statement = select(Poll).order_by(Poll.starts_at.desc(), Poll.id.desc())
    else:
        statement = select(Poll).order_by(Poll.created_at.desc(), Poll.id.desc())

    if clauses:
        statement = statement.where(*clauses)
    offset = (filters.page - 1) * filters.page_size
    return statement.offset(offset).limit(filters.page_size)


def _summary(poll: Poll, now: datetime) -> PollSummary:
    """复制广场摘要。

    Args:
        poll: 投票行。
        now: 当前时间。

    Returns:
        不含管理字段的摘要。
    """
    return PollSummary(
        id=poll.id,
        title=poll.title,
        identity_mode=poll.identity_mode,
        visibility=poll.visibility,
        vote_limit=poll.vote_limit,
        selection_mode=poll.selection_mode,
        allow_live_results=poll.allow_live_results,
        starts_at=poll.starts_at,
        ends_at=poll.ends_at,
        effective_status=effective_status(poll, now),
        created_at=poll.created_at,
    )


def _manage_summary(poll: Poll, now: datetime) -> ManagePollSummary:
    """复制管理列表摘要。

    Args:
        poll: 投票行。
        now: 当前时间。

    Returns:
        带生命周期和版本的摘要。
    """
    base = _summary(poll, now)
    return ManagePollSummary(
        **base.model_dump(),
        lifecycle=poll.lifecycle,
        version=poll.version,
        creator_id=poll.creator_id,
    )


def _manage_detail(
    session: Session,
    poll: Poll,
    now: datetime,
    principal: Principal,
) -> ManagePollDetail:
    """在当前会话里组装管理详情。

    Args:
        session: 仍打开的会话，用于读取选项。
        poll: 投票行。
        now: 当前时间。
        principal: 调用者。用来判断能否管理。

    Returns:
        不含密码和参与状态的管理详情。
    """
    base = _summary(poll, now)
    return ManagePollDetail(
        **base.model_dump(),
        description=poll.description,
        options=_option_public(session, poll.id),
        lifecycle=poll.lifecycle,
        version=poll.version,
        creator_id=poll.creator_id,
        closed_at=poll.closed_at,
        has_access_password=(
            poll.private_password is not None or poll.private_password_hash is not None
        ),
        server_time=now,
        can_manage=poll.creator_id == principal.user_id,
        can_view_results=True,
    )


def _option_public(session: Session, poll_id: int) -> list[OptionPublic]:
    """按展示顺序读取选项。

    Args:
        session: 当前会话。
        poll_id: 投票主键。

    Returns:
        公开选项列表。
    """
    rows = session.scalars(
        select(PollOption).where(PollOption.poll_id == poll_id).order_by(PollOption.position)
    ).all()
    return [OptionPublic(id=row.id, label=row.label, position=row.position) for row in rows]


def _request_id() -> str:
    """读取当前请求标识。没有请求上下文时使用固定占位。

    Returns:
        不超过 64 个字符的请求标识。
    """
    value = request_id_var.get().strip()
    if not value:
        return "missing"
    return value[:64]


def _constraint_name(exc: IntegrityError) -> str | None:
    """读取数据库报告的约束名。

    Args:
        exc: 完整性异常。

    Returns:
        约束名。驱动没有提供时为空。
    """
    diag = getattr(exc.orig, "diag", None)
    if diag is None:
        return None
    return diag.constraint_name


def _require_multiple_options(session: Session, poll: Poll) -> None:
    """发布前再次确认多选至少有三个选项。

    Args:
        session: 当前事务。
        poll: 即将发布的草稿。

    Raises:
        AppError: 选择模式是多选，但当前选项不足三个。
    """
    if poll.selection_mode != SelectionMode.MULTIPLE.value:
        return
    count = session.scalar(
        select(func.count()).select_from(PollOption).where(PollOption.poll_id == poll.id)
    )
    if count is None or int(count) < 3:
        raise AppError(
            422,
            ApiCode.VALIDATION_ERROR,
            "Multiple choices need at least three options.",
        )


def _missing() -> AppError:
    """构造投票不存在的错误。

    Returns:
        HTTP 404 的业务异常。
    """
    return AppError(404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message)


def _immutable() -> AppError:
    """构造已发布不能修改的错误。

    Returns:
        HTTP 409 的业务异常。
    """
    return AppError(409, ApiCode.POLL_IMMUTABLE, ApiCode.POLL_IMMUTABLE.default_message)


def _not_open() -> AppError:
    """构造当前不能发布、关闭或分享的错误。

    Returns:
        HTTP 409 的业务异常。
    """
    return AppError(409, ApiCode.POLL_NOT_OPEN, ApiCode.POLL_NOT_OPEN.default_message)


def _validation() -> AppError:
    """构造不回显提交值的参数错误。

    Returns:
        HTTP 422 的业务异常。
    """
    return AppError(422, ApiCode.VALIDATION_ERROR, ApiCode.VALIDATION_ERROR.default_message)


def _unavailable() -> AppError:
    """构造不包含连接信息的数据库不可用错误。

    Returns:
        HTTP 503 的业务异常。
    """
    logger.error("数据库暂时不可用")
    return AppError(503, ApiCode.SERVICE_UNAVAILABLE, ApiCode.SERVICE_UNAVAILABLE.default_message)
