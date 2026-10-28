"""在一个事务里提交记名或匿名选票。"""

from uuid import uuid4

from sqlalchemy import exists, func, or_, select, true
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql.elements import ColumnElement

from src.main.python.algorithms.audit_module.audit_service import AuditService
from src.main.python.algorithms.poll_module.poll_service import effective_status
from src.main.python.config.logger_config import get_logger, request_id_var
from src.main.python.constants.enums import (
    AuditAction,
    IdentityMode,
    PollLifecycle,
    PollStatus,
    SelectionMode,
    UserRole,
    Visibility,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import (
    Poll,
    PollAccessGrant,
    PollOption,
    User,
    Vote,
    VoteSelection,
)
from src.main.python.fileds.context import PollAccessContext
from src.main.python.fileds.response.response import Page
from src.main.python.fileds.response.vote_response import MyVote, VoteReceipt
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.security_util import anonymous_voter_hash

logger = get_logger("vote")
_ALREADY_VOTED = {"uq_votes_named_poll_voter", "uq_votes_anon_poll_browser"}


class VoteService:
    """提交选票。匿名票不保存账户，也不写逐票审计。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
        _hmac_key: 匿名防重复密钥。
        _audit: 只为记名票写入的审计。
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        clock: Clock,
        hmac_key: str,
    ) -> None:
        """保存会话工厂、时钟和匿名密钥。

        Args:
            session_factory: 数据库会话工厂。
            clock: 服务端 UTC 时钟。
            hmac_key: 至少 32 字节的稳定密钥。
        """
        self._factory = session_factory
        self._clock = clock
        self._hmac_key = hmac_key
        self._audit = AuditService()

    def cast_vote(
        self,
        context: PollAccessContext,
        poll_id: int,
        option_ids: list[int],
    ) -> VoteReceipt:
        """锁定投票后写入一份选票及其全部选项。

        同一身份的重复提交在容量和结束判断之前返回，方便最后一份丢响应后恢复。
        新份数刚好达到上限时，在同一事务里结束本场，不写关闭审计。
        匿名模式会丢掉账户关联，也不写逐票审计。

        Args:
            context: 当前账户和浏览器凭据。
            poll_id: 路径中的投票。
            option_ids: 本次选中的选项，顺序保留到明细。

        Returns:
            不含身份和选项的回执。

        Raises:
            AppError: 不能投票、重复投票、选项或数量不合法、名额已满，或提交结果未能确认。
        """
        with self._factory() as session:
            try:
                poll = session.scalar(select(Poll).where(Poll.id == poll_id).with_for_update())
                if poll is None or poll.lifecycle == PollLifecycle.DRAFT:
                    raise _missing()
                now = self._clock.now()
                _require_access(session, poll, context, now)
                chosen = _require_selection(session, poll, option_ids)
                if _existing_vote(session, poll, context, self._hmac_key) is not None:
                    raise _already_voted()
                ballots = _ballot_count(session, poll.id)
                if poll.vote_limit is not None and ballots >= poll.vote_limit:
                    raise _capacity()
                if effective_status(poll, now) != PollStatus.OPEN:
                    raise _not_open()
                receipt_id = uuid4()
                vote = _insert_vote(session, poll, context, self._hmac_key, receipt_id, now)
                _insert_selections(session, vote, chosen)
                if vote.voter_id is not None:
                    self._audit.record(
                        session,
                        vote.voter_id,
                        AuditAction.VOTE_NAMED,
                        poll.id,
                        receipt_id,
                        _request_id(),
                        created_at=now,
                    )
                if poll.vote_limit is not None and ballots + 1 == poll.vote_limit:
                    poll.lifecycle = PollLifecycle.CLOSED
                    poll.closed_at = now
                    poll.updated_at = now
                    poll.version += 1
                _commit(session)
            except AppError:
                session.rollback()
                raise
            except IntegrityError as exc:
                session.rollback()
                raise _integrity(exc) from None
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
        return VoteReceipt(receipt_id=receipt_id, poll_id=poll_id, submitted_at=now)

    def list_my_votes(
        self,
        context: PollAccessContext,
        page: int,
        page_size: int,
    ) -> Page[MyVote]:
        """列出当前账户有权看到的记名记录。

        匿名票不进入账户历史。没有授权的私密记录不计入总数。

        Args:
            context: 已登录账户，以及可选的访客凭据。
            page: 页码，从 1 开始。
            page_size: 每页条数。

        Returns:
            记名历史页。

        Raises:
            AppError: 没有有效账户，或数据库不可用。
        """
        principal = context.principal
        if principal is None:
            raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
        now = self._clock.now()
        clauses = [
            Vote.voter_id == principal.user_id,
            Vote.identity_mode == IdentityMode.NAMED,
            _history_visible(context, now),
        ]
        with self._factory() as session:
            try:
                total = session.scalar(
                    select(func.count())
                    .select_from(Vote)
                    .join(Poll, Poll.id == Vote.poll_id)
                    .where(*clauses)
                )
                rows = session.execute(
                    select(Vote.receipt_id, Vote.poll_id, Poll.title, Vote.submitted_at)
                    .join(Poll, Poll.id == Vote.poll_id)
                    .where(*clauses)
                    .order_by(Vote.submitted_at.desc(), Vote.id.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                ).all()
            except SQLAlchemyError:
                raise _unavailable() from None
        items = [
            MyVote(
                receipt_id=receipt_id,
                poll_id=poll_id,
                poll_title=title,
                submitted_at=submitted_at,
            )
            for receipt_id, poll_id, title, submitted_at in rows
        ]
        return Page(items=items, page=page, page_size=page_size, total=int(total or 0))


def _history_visible(context: PollAccessContext, now: object) -> ColumnElement[bool]:
    """构造记名历史里私密场次的可见条件。

    Args:
        context: 当前账户和浏览器凭据。
        now: 当前时间。授权必须晚于它。

    Returns:
        可以放进 WHERE 的 SQL 表达式。管理员能看到自己的全部记名记录。
    """
    principal = context.principal
    assert principal is not None
    if principal.role == UserRole.ADMIN:
        return true()
    visible = [Poll.visibility == Visibility.PUBLIC, Poll.creator_id == principal.user_id]
    guest = context.guest
    if guest is not None:
        visible.append(
            exists(
                select(PollAccessGrant.id).where(
                    PollAccessGrant.poll_id == Poll.id,
                    PollAccessGrant.guest_session_id == guest.guest_session_id,
                    PollAccessGrant.expires_at > now,
                )
            )
        )
    return or_(*visible)


def _require_selection(session: Session, poll: Poll, option_ids: list[int]) -> list[PollOption]:
    """确认选项都属于本场，并且数量符合单选或多选。

    任何一个非法选项都会让整份选票失败，不会只保存其余合法选项。

    Args:
        session: 已锁定投票的事务。
        poll: 被锁定的投票。
        option_ids: 请求中的选项编号。

    Returns:
        按请求顺序排列的选项。

    Raises:
        AppError: 选项不属于本场，或数量不符合配置。
    """
    if len(option_ids) < 1 or len(option_ids) != len(set(option_ids)):
        raise _invalid_count()
    rows = session.scalars(select(PollOption).where(PollOption.poll_id == poll.id)).all()
    by_id = {row.id: row for row in rows}
    if any(option_id not in by_id for option_id in option_ids):
        raise _invalid_option()
    chosen = len(option_ids)
    if poll.selection_mode == SelectionMode.SINGLE:
        allowed = chosen == 1
    elif poll.selection_mode == SelectionMode.MULTIPLE:
        allowed = 1 <= chosen <= len(rows)
    else:
        allowed = False
    if not allowed:
        raise _invalid_count()
    return [by_id[option_id] for option_id in option_ids]


def _existing_vote(
    session: Session,
    poll: Poll,
    context: PollAccessContext,
    hmac_key: str,
) -> Vote | None:
    """按记名账户或匿名散列查找本场已有选票。

    Args:
        session: 已锁定投票的事务。
        poll: 被锁定的投票。
        context: 当前身份。
        hmac_key: 匿名防重复密钥。

    Returns:
        已有选票。当前身份还没投时为空。
    """
    if poll.identity_mode == IdentityMode.NAMED:
        principal = context.principal
        if principal is None:
            raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
        return session.scalar(
            select(Vote).where(Vote.poll_id == poll.id, Vote.voter_id == principal.user_id)
        )
    return session.scalar(
        select(Vote).where(
            Vote.poll_id == poll.id,
            Vote.anonymous_voter_hash == _browser_hash(hmac_key, poll.id, context),
        )
    )


def _ballot_count(session: Session, poll_id: int) -> int:
    """统计本场选票份数，不连接明细表。

    Args:
        session: 已锁定投票的事务。
        poll_id: 投票主键。

    Returns:
        votes 行数。
    """
    total = session.scalar(select(func.count()).select_from(Vote).where(Vote.poll_id == poll_id))
    return int(total or 0)


def _insert_vote(
    session: Session,
    poll: Poll,
    context: PollAccessContext,
    hmac_key: str,
    receipt_id: object,
    now: object,
) -> Vote:
    """写入父票并取得主键。明细留到下一次 flush。

    Args:
        session: 已锁定投票的事务。
        poll: 被锁定的投票。
        context: 当前身份。
        hmac_key: 匿名防重复密钥。
        receipt_id: 对外回执。
        now: 取得锁之后的当前时间。

    Returns:
        已取得主键的父票。

    Raises:
        AppError: 记名账户不存在或已停用。
    """
    if poll.identity_mode == IdentityMode.NAMED:
        vote = Vote(
            receipt_id=receipt_id,
            poll_id=poll.id,
            identity_mode=IdentityMode.NAMED,
            voter_id=_lock_active_user(session, context),
            anonymous_voter_hash=None,
            submitted_at=now,
        )
    else:
        vote = Vote(
            receipt_id=receipt_id,
            poll_id=poll.id,
            identity_mode=IdentityMode.ANONYMOUS,
            voter_id=None,
            anonymous_voter_hash=_browser_hash(hmac_key, poll.id, context),
            submitted_at=now,
        )
    session.add(vote)
    session.flush()
    return vote


def _insert_selections(session: Session, vote: Vote, options: list[PollOption]) -> None:
    """写入这份选票的全部选项明细。

    Args:
        session: 已写入父票的事务。
        vote: 已取得主键的父票。
        options: 按请求顺序排列的选项。
    """
    for option in options:
        session.add(VoteSelection(vote_id=vote.id, poll_id=vote.poll_id, option_id=option.id))
    session.flush()


def _require_access(session: Session, poll: Poll, context: PollAccessContext, now: object) -> None:
    """确认这场投票当前可以提交。

    Args:
        session: 已锁定投票的事务。
        poll: 被锁定的投票。
        context: 请求身份。
        now: 取得锁之后的当前时间。

    Raises:
        AppError: 私密场次未授权，或记名投票没有有效账户。
    """
    principal = context.principal
    creator = principal is not None and principal.user_id == poll.creator_id
    admin = principal is not None and principal.role == "ADMIN"
    granted = _grant_ok(session, poll, context, now)
    if poll.visibility == "PRIVATE" and not (creator or admin or granted):
        raise _missing()
    if poll.visibility == "PRIVATE" and not granted:
        raise AppError(
            403,
            ApiCode.POLL_ACCESS_REQUIRED,
            ApiCode.POLL_ACCESS_REQUIRED.default_message,
        )
    if poll.identity_mode == IdentityMode.NAMED and principal is None:
        raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
    if poll.identity_mode == IdentityMode.ANONYMOUS and context.guest is None:
        raise AppError(403, ApiCode.FORBIDDEN, "需要先建立访客上下文")


def _grant_ok(session: Session, poll: Poll, context: PollAccessContext, now: object) -> bool:
    """判断当前浏览器对这场私密投票的授权是否未过期。

    Args:
        session: 当前事务。
        poll: 被锁定的投票。
        context: 请求身份。
        now: 取得锁之后的当前时间。

    Returns:
        授权存在且晚于现在时为真。公开投票也返回真。
    """
    if poll.visibility != "PRIVATE":
        return True
    guest = context.guest
    if guest is None:
        return False
    grant = session.scalar(
        select(PollAccessGrant).where(
            PollAccessGrant.poll_id == poll.id,
            PollAccessGrant.guest_session_id == guest.guest_session_id,
        )
    )
    return grant is not None and grant.expires_at > now


def _lock_active_user(session: Session, context: PollAccessContext) -> int:
    """在投票行之后锁定并确认记名账户仍可用。

    Args:
        session: 已锁定投票的事务。
        context: 含账户身份的上下文。

    Returns:
        账户主键。

    Raises:
        AppError: 账户不存在或已停用。
    """
    principal = context.principal
    if principal is None:
        raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
    user = session.scalar(select(User).where(User.id == principal.user_id).with_for_update())
    if user is None or not user.is_active:
        raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
    return user.id


def _browser_hash(key: str, poll_id: int, context: PollAccessContext) -> str:
    """计算匿名票使用的浏览器散列。

    Args:
        key: 稳定密钥。
        poll_id: 投票主键。
        context: 必须带有访客原令牌。

    Returns:
        64 位十六进制 HMAC。

    Raises:
        AppError: 密钥不可用，或没有访客令牌。
    """
    guest = context.guest
    if guest is None:
        raise AppError(403, ApiCode.FORBIDDEN, "需要先建立访客上下文")
    try:
        return anonymous_voter_hash(key, poll_id, guest.raw_token)
    except ValueError:
        raise _unavailable() from None


def _commit(session: Session) -> None:
    """提交事务。确认丢失时不能宣称这一票没有写入。

    Args:
        session: 已通过 flush 的事务。

    Raises:
        AppError: 数据库没有返回提交确认。
    """
    try:
        session.commit()
    except SQLAlchemyError:
        logger.error("选票提交结果未能确认")
        raise AppError(
            503,
            ApiCode.SUBMISSION_STATUS_UNKNOWN,
            ApiCode.SUBMISSION_STATUS_UNKNOWN.default_message,
        ) from None


def _integrity(exc: IntegrityError) -> AppError:
    """把已知的重复投票约束和其他完整性错误分开。

    Args:
        exc: 数据库完整性异常。

    Returns:
        重复投票或选项不合法的业务异常。
    """
    name = _constraint_name(exc)
    if name in _ALREADY_VOTED:
        return _already_voted()
    if name == "fk_vote_selections_option":
        return _invalid_option()
    logger.error("选票被数据库拒绝")
    return AppError(422, ApiCode.VALIDATION_ERROR, ApiCode.VALIDATION_ERROR.default_message)


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


def _request_id() -> str:
    """读取当前请求标识，供记名审计使用。

    Returns:
        不超过 64 个字符的请求标识。
    """
    value = request_id_var.get().strip()
    if not value:
        return "missing"
    return value[:64]


def _missing() -> AppError:
    """构造投票不存在的错误。

    Returns:
        HTTP 404 的业务异常。
    """
    return AppError(404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message)


def _not_open() -> AppError:
    """构造当前不能投票的错误。

    Returns:
        HTTP 409 的业务异常。
    """
    return AppError(409, ApiCode.POLL_NOT_OPEN, ApiCode.POLL_NOT_OPEN.default_message)


def _already_voted() -> AppError:
    """构造重复投票的错误。

    Returns:
        HTTP 409 的业务异常。
    """
    return AppError(409, ApiCode.ALREADY_VOTED, ApiCode.ALREADY_VOTED.default_message)


def _capacity() -> AppError:
    """构造名额已满的错误。

    Returns:
        HTTP 409 的业务异常。
    """
    return AppError(
        409,
        ApiCode.POLL_CAPACITY_REACHED,
        ApiCode.POLL_CAPACITY_REACHED.default_message,
    )


def _invalid_count() -> AppError:
    """构造选择数量不符合本场规则的错误。

    Returns:
        HTTP 422 的业务异常。data 为空。
    """
    return AppError(
        422,
        ApiCode.INVALID_SELECTION_COUNT,
        ApiCode.INVALID_SELECTION_COUNT.default_message,
    )


def _invalid_option() -> AppError:
    """构造选项不属于这场投票的错误。

    Returns:
        HTTP 422 的业务异常。
    """
    return AppError(422, ApiCode.INVALID_OPTION, ApiCode.INVALID_OPTION.default_message)


def _unavailable() -> AppError:
    """构造提交前就已经确定的数据库不可用错误。

    Returns:
        HTTP 503 的业务异常。结果可以视为尚未提交。
    """
    logger.error("数据库暂时不可用")
    return AppError(503, ApiCode.SERVICE_UNAVAILABLE, ApiCode.SERVICE_UNAVAILABLE.default_message)
