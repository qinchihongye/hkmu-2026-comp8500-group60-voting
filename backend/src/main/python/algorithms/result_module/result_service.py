"""在同一读事务里检查权限并汇总选票。"""

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.poll_module.poll_service import effective_status, results_access
from src.main.python.config.logger_config import get_logger
from src.main.python.constants.enums import (
    IdentityMode,
    PollLifecycle,
    PollStatus,
    UserRole,
    Visibility,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollAccessGrant, PollOption, Vote, VoteSelection
from src.main.python.fileds.context import PollAccessContext
from src.main.python.fileds.response.vote_response import OptionResult, PollResults
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError

logger = get_logger("result")


class ResultService:
    """读取汇总。不修改生命周期，也不保存第二份计数器。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
    """

    def __init__(self, session_factory: sessionmaker[Session], clock: Clock) -> None:
        """保存会话工厂和时钟。

        Args:
            session_factory: 数据库会话工厂。
            clock: 服务端 UTC 时钟。
        """
        self._factory = session_factory
        self._clock = clock

    def get_results(self, context: PollAccessContext, poll_id: int) -> PollResults:
        """锁定投票后按身份返回汇总。

        创建者和管理员可以看进行中快照。其他已经能看这场的人必须等到结束。

        Args:
            context: 当前账户和浏览器凭据。
            poll_id: 投票主键。

        Returns:
            含零票项的汇总。进行中 `is_final` 为假。

        Raises:
            AppError: 投票不可见、结果未公布，或数据库不可用。
        """
        with self._factory() as session:
            try:
                poll = session.scalar(
                    select(Poll).where(Poll.id == poll_id).with_for_update(read=True)
                )
                if poll is None or poll.lifecycle == PollLifecycle.DRAFT:
                    raise _missing()
                now = self._clock.now()
                status = _authorize(session, poll, context, now)
                options = session.scalars(
                    select(PollOption)
                    .where(PollOption.poll_id == poll.id)
                    .order_by(PollOption.position, PollOption.id)
                ).all()
                ballots = _ballot_total(session, poll.id)
                counts = _selection_counts(session, poll.id)
                return _results(poll, list(options), ballots, counts, status, now)
            except AppError:
                raise
            except SQLAlchemyError:
                raise _unavailable() from None


def _authorize(
    session: Session,
    poll: Poll,
    context: PollAccessContext,
    now: datetime,
) -> PollStatus:
    """确认当前身份可以读这场汇总。

    Args:
        session: 已共享锁定投票的事务。
        poll: 被锁定的投票。
        context: 请求身份。
        now: 取得锁之后的当前时间。

    Returns:
        有效状态。调用方用它决定是不是最终结果。

    Raises:
        AppError: 不可见、未登录记名场次，或结果尚未公布。
    """
    principal = context.principal
    creator = principal is not None and principal.user_id == poll.creator_id
    admin = principal is not None and principal.role == UserRole.ADMIN
    granted = _grant_ok(session, poll, context, now)
    if poll.visibility == Visibility.PRIVATE and not (creator or admin or granted):
        raise _missing()
    if poll.identity_mode == IdentityMode.NAMED and principal is None:
        raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
    status = effective_status(poll, now)
    allowed, _reason = results_access(
        status,
        poll.allow_live_results,
        creator=creator,
        admin=admin,
    )
    if allowed:
        return status
    raise AppError(
        403,
        ApiCode.RESULTS_NOT_AVAILABLE,
        ApiCode.RESULTS_NOT_AVAILABLE.default_message,
    )


def _grant_ok(
    session: Session,
    poll: Poll,
    context: PollAccessContext,
    now: datetime,
) -> bool:
    """判断当前浏览器对这场私密投票是否仍有授权。

    Args:
        session: 当前事务。
        poll: 被锁定的投票。
        context: 请求身份。
        now: 取得锁之后的当前时间。

    Returns:
        公开投票，或授权晚于现在时为真。
    """
    if poll.visibility != Visibility.PRIVATE:
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


def _ballot_total(session: Session, poll_id: int) -> int:
    """统计本场选票份数，不连接明细表。

    Args:
        session: 已共享锁定投票的事务。
        poll_id: 投票主键。

    Returns:
        votes 行数。
    """
    total = session.scalar(select(func.count()).select_from(Vote).where(Vote.poll_id == poll_id))
    return int(total or 0)


def _selection_counts(session: Session, poll_id: int) -> dict[int, int]:
    """按选项统计选择次数。

    Args:
        session: 已共享锁定投票的事务。
        poll_id: 投票主键。

    Returns:
        选项主键到选择次数的映射。没有被选中的选项不在映射里。
    """
    rows = session.execute(
        select(VoteSelection.option_id, func.count())
        .where(VoteSelection.poll_id == poll_id)
        .group_by(VoteSelection.option_id)
    ).all()
    return {int(option_id): int(total) for option_id, total in rows}


def _results(
    poll: Poll,
    options: list[PollOption],
    ballots: int,
    counts: dict[int, int],
    status: PollStatus,
    now: datetime,
) -> PollResults:
    """把同一次读取的份数和选择次数收成响应。

    百分比的分母是选择次数。单选时两种总数相等。

    Args:
        poll: 已锁定的投票。
        options: 按位置排列的选项。
        ballots: 父票行数。
        counts: 选项选择次数。
        status: 有效状态。
        now: 服务端时间。

    Returns:
        汇总。没有选择时没有领先项。
    """
    total_selections = sum(counts.values())
    items = [
        OptionResult(
            option_id=option.id,
            label=option.label,
            count=counts.get(option.id, 0),
            percentage=_percentage(counts.get(option.id, 0), total_selections),
        )
        for option in options
    ]
    highest = max((item.count for item in items), default=0)
    leaders = [item.option_id for item in items if highest > 0 and item.count == highest]
    return PollResults(
        poll_id=poll.id,
        total_votes=ballots,
        total_selections=total_selections,
        selection_mode=poll.selection_mode,
        vote_limit=poll.vote_limit,
        options=items,
        winner_option_ids=leaders,
        is_final=status == PollStatus.CLOSED,
        server_time=now,
    )


def _percentage(count: int, total: int) -> float:
    """计算保留两位小数的选择次数占比。

    Args:
        count: 该选项被选中的次数。
        total: 全部选择次数。

    Returns:
        0 到 100 的百分比。没有选择时返回 0。
    """
    if total == 0:
        return 0.0
    value = (Decimal(count) * Decimal(100) / Decimal(total)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    return float(value)


def _missing() -> AppError:
    """构造投票不存在的错误。

    Returns:
        HTTP 404 的业务异常。
    """
    return AppError(404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message)


def _unavailable() -> AppError:
    """构造读取时的数据库不可用错误。

    Returns:
        HTTP 503 的业务异常。
    """
    logger.error("数据库暂时不可用")
    return AppError(503, ApiCode.SERVICE_UNAVAILABLE, ApiCode.SERVICE_UNAVAILABLE.default_message)
