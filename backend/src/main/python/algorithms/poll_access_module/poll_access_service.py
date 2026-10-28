"""分享入口、私密授权和参与者可见的投票详情。"""

from datetime import timedelta

from pwdlib import PasswordHash
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.poll_module.poll_service import effective_status, results_access
from src.main.python.config.logger_config import get_logger
from src.main.python.config.server_config import Settings
from src.main.python.constants.enums import IdentityMode, PollLifecycle, PollStatus, Visibility
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollAccessGrant, PollOption, Vote
from src.main.python.fileds.context import GuestContext, PollAccessContext, Principal
from src.main.python.fileds.request.poll_access_request import UnlockRequest
from src.main.python.fileds.response.poll_access_response import AccessGrantPublic, ShareEntry
from src.main.python.fileds.response.poll_response import OptionPublic, PollDetail
from src.main.python.fileds.response.vote_response import VoteReceipt
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.rate_limit_util import AttemptLimiter
from src.main.python.utils.security_util import (
    anonymous_voter_hash,
    constant_text_match,
    dummy_password_hash,
    verify_password,
)

logger = get_logger("poll_access")
_GATE_HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}


class PollAccessService:
    """按场次判断谁可以读详情。私密授权不代替投票资格。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
        _passwords: 访问密码散列器。
        _limiter: 按访客和投票计数的失败限制。
        _settings: 授权时长和匿名密钥。
        _dummy_hash: 分享码错误时仍执行的密码核对。
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        clock: Clock,
        passwords: PasswordHash,
        limiter: AttemptLimiter,
        settings: Settings,
    ) -> None:
        """保存会话工厂、时钟、限速器和配置。

        Args:
            session_factory: 数据库会话工厂。
            clock: 服务端 UTC 时钟。
            passwords: Argon2 散列器。
            limiter: 密码失败限速器。
            settings: 含授权时长和匿名密钥的配置。
        """
        self._factory = session_factory
        self._clock = clock
        self._passwords = passwords
        self._limiter = limiter
        self._settings = settings
        self._dummy_hash = dummy_password_hash(passwords)

    def resolve_share(self, share_code: str) -> ShareEntry:
        """用分享码读取最低限度入口。草稿不解析。

        Args:
            share_code: 路径中的分享码。

        Returns:
            不含标题、选项和票数的入口。

        Raises:
            AppError: 分享码不存在，或对应投票还不能分享。
        """
        with self._factory() as session:
            try:
                poll = session.scalar(select(Poll).where(Poll.share_code == share_code))
            except SQLAlchemyError:
                raise _unavailable() from None
            if poll is None or poll.lifecycle not in {
                PollLifecycle.PUBLISHED,
                PollLifecycle.CLOSED,
            }:
                raise _missing()
            return ShareEntry(
                poll_id=poll.id,
                identity_mode=poll.identity_mode,
                visibility=poll.visibility,
                password_required=poll.visibility == Visibility.PRIVATE,
                login_required=poll.identity_mode == IdentityMode.NAMED,
            )

    def unlock(
        self,
        guest: GuestContext,
        poll_id: int,
        payload: UnlockRequest,
    ) -> AccessGrantPublic:
        """核对分享码和访问密码，并续期这个浏览器的授权。

        错误的分享码和错误的密码返回同一说明。锁定期间不再核对密码。

        Args:
            guest: 已通过 CSRF 的访客凭据。
            poll_id: 路径中的投票。
            payload: 分享码和访问密码。

        Returns:
            只含投票编号和到期时间的授权。

        Raises:
            AppError: 投票不可解锁、密码错误、尝试过多或数据库不可用。
        """
        key = (guest.guest_session_id, poll_id)
        blocked = self._limiter.rejection(key, self._clock.now())
        if blocked is not None:
            logger.info("投票密码尝试过多")
            raise _gate(429, ApiCode.TOO_MANY_ATTEMPTS, blocked)
        with self._factory() as session:
            try:
                poll = session.scalar(select(Poll).where(Poll.id == poll_id).with_for_update())
                if not _can_unlock(poll):
                    raise _missing()
                if poll.visibility != Visibility.PRIVATE:
                    raise _gate(409, ApiCode.POLL_NOT_OPEN, None, "这场投票不需要访问密码")
                now = self._clock.now()
                if not self._password_ok(poll, payload):
                    retry = self._limiter.record_failure(key, now)
                    if retry is not None:
                        logger.info("投票密码尝试过多")
                        raise _gate(429, ApiCode.TOO_MANY_ATTEMPTS, retry)
                    logger.info("投票密码错误")
                    raise _gate(
                        403,
                        ApiCode.POLL_PASSWORD_INVALID,
                        None,
                        ApiCode.POLL_PASSWORD_INVALID.default_message,
                    )
                self._limiter.clear(key)
                expires_at = min(
                    now + timedelta(minutes=self._settings.poll_access_ttl_minutes),
                    guest.expires_at,
                )
                _upsert_grant(session, poll.id, guest.guest_session_id, expires_at)
                session.commit()
            except AppError:
                session.rollback()
                raise
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
        return AccessGrantPublic(poll_id=poll_id, expires_at=expires_at)

    def get_visible(self, context: PollAccessContext, poll_id: int) -> PollDetail:
        """在共享锁内读取当前身份能看到的详情。

        草稿和未授权的私密投票都按不存在处理。公开记名投票在确认可见后再要求登录。

        Args:
            context: 当前账户和浏览器凭据，都可以为空。
            poll_id: 投票主键。

        Returns:
            带能力和已投状态的详情。

        Raises:
            AppError: 无权查看、记名投票未登录、匿名密钥不可用或数据库不可用。
        """
        with self._factory() as session:
            try:
                poll = session.scalar(
                    select(Poll).where(Poll.id == poll_id).with_for_update(read=True)
                )
                if poll is None or poll.lifecycle == PollLifecycle.DRAFT:
                    raise _missing()
                now = self._clock.now()
                principal = context.principal
                guest = context.guest
                grant_ok = _grant_ok(session, poll.id, guest, now)
                creator = principal is not None and principal.user_id == poll.creator_id
                admin = principal is not None and principal.role == "ADMIN"
                if poll.visibility == Visibility.PRIVATE and not (creator or admin or grant_ok):
                    raise _missing()
                if poll.identity_mode == IdentityMode.NAMED and principal is None:
                    raise AppError(
                        401,
                        ApiCode.UNAUTHENTICATED,
                        ApiCode.UNAUTHENTICATED.default_message,
                    )
                vote = self._vote_for(session, poll, principal, guest)
                return _detail(session, poll, now, principal, guest, grant_ok, vote)
            except AppError:
                raise
            except SQLAlchemyError:
                raise _unavailable() from None

    def _password_ok(self, poll: Poll, payload: UnlockRequest) -> bool:
        """核对分享码和密码。码不对时仍做一次无效核对。

        Args:
            poll: 已锁定的私密投票。
            payload: 提交的分享码和密码。

        Returns:
            分享码和密码都匹配时为真。
        """
        code_ok = _codes_match(payload.share_code, poll.share_code)
        if not code_ok:
            verify_password(self._passwords, payload.password, self._dummy_hash)
            return False
        if poll.private_password is not None:
            return constant_text_match(poll.private_password, payload.password)
        if poll.private_password_hash:
            return verify_password(self._passwords, payload.password, poll.private_password_hash)
        verify_password(self._passwords, payload.password, self._dummy_hash)
        return False

    def _vote_for(
        self,
        session: Session,
        poll: Poll,
        principal: Principal | None,
        guest: GuestContext | None,
    ) -> Vote | None:
        """查找当前身份在这场的选票。

        Args:
            session: 当前事务。
            poll: 已锁定的投票。
            principal: 账户身份。匿名场次不使用它。
            guest: 浏览器凭据。

        Returns:
            已有选票。当前身份不能对应到一张票时为空。

        Raises:
            AppError: 需要计算匿名散列但密钥不可用。
        """
        if poll.identity_mode == IdentityMode.NAMED and principal is not None:
            return session.scalar(
                select(Vote).where(Vote.poll_id == poll.id, Vote.voter_id == principal.user_id)
            )
        if poll.identity_mode != IdentityMode.ANONYMOUS or guest is None:
            return None
        try:
            digest = anonymous_voter_hash(
                self._settings.anon_voter_hmac_key,
                poll.id,
                guest.raw_token,
            )
        except ValueError:
            raise _unavailable() from None
        return session.scalar(
            select(Vote).where(Vote.poll_id == poll.id, Vote.anonymous_voter_hash == digest)
        )


def _can_unlock(poll: Poll | None) -> bool:
    """判断这场投票是否已经可以尝试验证密码。

    Args:
        poll: 锁定到的投票。不存在时为否。

    Returns:
        已发布或已关闭且有分享码时为真。
    """
    if poll is None or not poll.share_code:
        return False
    return poll.lifecycle in {PollLifecycle.PUBLISHED, PollLifecycle.CLOSED}


def _passcode_entry_path(share_code: str | None, needs_access_password: bool) -> str | None:
    """给出尚未授权时的密码页路径。

    Args:
        share_code: 这场投票的分享码。
        needs_access_password: 当前浏览器是否还没有有效授权。

    Returns:
        以分享码定位的密码页路径。不需要密码或没有分享码时为空。
    """
    if not needs_access_password or not share_code:
        return None
    return f"/s/{share_code}/access"


def _codes_match(provided: str, expected: str | None) -> bool:
    """按 UTF-8 字节固定时间比较分享码。

    Args:
        provided: 请求里的分享码。
        expected: 库存分享码。

    Returns:
        两边字节一致时为真。库存没有分享码时为假。
    """
    if expected is None:
        return False
    return constant_text_match(provided, expected)


def _upsert_grant(
    session: Session,
    poll_id: int,
    guest_session_id: int,
    expires_at: object,
) -> None:
    """插入或续期这一对投票和浏览器的授权。

    Args:
        session: 已锁定投票的事务。
        poll_id: 投票主键。
        guest_session_id: 访客凭据主键。
        expires_at: 新的到期时间。
    """
    grant = session.scalar(
        select(PollAccessGrant)
        .where(
            PollAccessGrant.poll_id == poll_id,
            PollAccessGrant.guest_session_id == guest_session_id,
        )
        .with_for_update()
    )
    if grant is None:
        session.add(
            PollAccessGrant(
                poll_id=poll_id,
                guest_session_id=guest_session_id,
                expires_at=expires_at,
            )
        )
        return
    grant.expires_at = expires_at


def _grant_ok(session: Session, poll_id: int, guest: GuestContext | None, now: object) -> bool:
    """判断浏览器授权是否仍未过期。

    Args:
        session: 当前事务。
        poll_id: 投票主键。
        guest: 浏览器凭据。没有时未授权。
        now: 锁后的当前时间。

    Returns:
        存在且到期时间晚于现在时为真。
    """
    if guest is None:
        return False
    grant = session.scalar(
        select(PollAccessGrant).where(
            PollAccessGrant.poll_id == poll_id,
            PollAccessGrant.guest_session_id == guest.guest_session_id,
        )
    )
    return grant is not None and grant.expires_at > now


def _detail(
    session: Session,
    poll: Poll,
    now: object,
    principal: Principal | None,
    guest: GuestContext | None,
    grant_ok: bool,
    vote: Vote | None,
) -> PollDetail:
    """组装参与详情和能力位。

    Args:
        session: 当前事务。
        poll: 已可见的投票。
        now: 锁后的当前时间。
        principal: 账户身份。
        guest: 浏览器凭据。
        grant_ok: 私密授权是否有效。
        vote: 当前身份的选票。

    Returns:
        参与详情。
    """
    status = effective_status(poll, now)
    creator = principal is not None and principal.user_id == poll.creator_id
    admin = principal is not None and principal.role == "ADMIN"
    can_view, reason = results_access(
        status,
        poll.allow_live_results,
        creator=creator,
        admin=admin,
    )
    needs_access_password = poll.visibility == Visibility.PRIVATE and not grant_ok
    private_ready = not needs_access_password
    named_ready = poll.identity_mode == IdentityMode.NAMED and principal is not None
    anonymous_ready = poll.identity_mode == IdentityMode.ANONYMOUS and guest is not None
    can_vote = status == PollStatus.OPEN and private_ready and (named_ready or anonymous_ready)
    if vote is not None:
        can_vote = False
    elif (
        can_vote
        and poll.vote_limit is not None
        and _ballot_count(session, poll.id) >= poll.vote_limit
    ):
        can_vote = False
    receipt = None
    if vote is not None:
        receipt = VoteReceipt(
            receipt_id=vote.receipt_id,
            poll_id=vote.poll_id,
            submitted_at=vote.submitted_at,
        )
    return PollDetail(
        id=poll.id,
        title=poll.title,
        identity_mode=poll.identity_mode,
        visibility=poll.visibility,
        vote_limit=poll.vote_limit,
        selection_mode=poll.selection_mode,
        allow_live_results=poll.allow_live_results,
        starts_at=poll.starts_at,
        ends_at=poll.ends_at,
        effective_status=status,
        created_at=poll.created_at,
        description=poll.description,
        options=_options(session, poll.id),
        has_voted=vote is not None,
        receipt=receipt,
        server_time=now,
        can_vote=can_vote,
        can_manage=creator,
        can_view_results=can_view,
        results_access_reason=reason,
        needs_access_password=needs_access_password,
        passcode_entry_path=_passcode_entry_path(poll.share_code, needs_access_password),
    )


def _ballot_count(session: Session, poll_id: int) -> int:
    """统计本场选票份数，不连接明细表。

    Args:
        session: 当前事务。
        poll_id: 投票主键。

    Returns:
        votes 行数。
    """
    total = session.scalar(select(func.count()).select_from(Vote).where(Vote.poll_id == poll_id))
    return int(total or 0)


def _options(session: Session, poll_id: int) -> list[OptionPublic]:
    """按位置读取选项。

    Args:
        session: 当前事务。
        poll_id: 投票主键。

    Returns:
        公开选项。
    """
    rows = session.scalars(
        select(PollOption).where(PollOption.poll_id == poll_id).order_by(PollOption.position)
    ).all()
    return [OptionPublic(id=row.id, label=row.label, position=row.position) for row in rows]


def _retry_seconds(retry: timedelta) -> int:
    """把等待时长收成至少 1 秒的整数。

    Args:
        retry: 剩余锁定时间。

    Returns:
        Retry-After 使用的秒数。
    """
    seconds = int(retry.total_seconds())
    if retry.total_seconds() > seconds:
        seconds += 1
    return max(seconds, 1)


def _gate(
    status_code: int,
    code: ApiCode,
    retry: timedelta | None,
    msg: str | None = None,
) -> AppError:
    """构造不缓存的门禁错误。

    Args:
        status_code: HTTP 状态码。
        code: 数值业务码。
        retry: 需要等待时的时长。
        msg: 对外说明。为空时使用业务码默认说明。

    Returns:
        带 Cache-Control 和 Referrer-Policy 的业务异常。
    """
    headers = dict(_GATE_HEADERS)
    if retry is not None:
        headers["Retry-After"] = str(_retry_seconds(retry))
    return AppError(
        status_code,
        code,
        msg if msg is not None else code.default_message,
        headers=headers,
    )


def _missing() -> AppError:
    """构造投票不存在的错误。

    Returns:
        HTTP 404 的业务异常。
    """
    return AppError(404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message)


def _unavailable() -> AppError:
    """构造不包含连接信息的数据库不可用错误。

    Returns:
        HTTP 503 的业务异常。
    """
    logger.error("数据库暂时不可用")
    return AppError(503, ApiCode.SERVICE_UNAVAILABLE, ApiCode.SERVICE_UNAVAILABLE.default_message)
