"""在同一读事务里检查权限并汇总选票。"""

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.poll_module.poll_service import effective_status
from src.main.python.config.logger_config import get_logger
from src.main.python.constants.enums import (
    IdentityMode,
    PollLifecycle,
    PollStatus,
    UserRole,
    Visibility,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollAccessGrant, PollOption, Vote
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
                counts = _counts(session, poll.id)
                return _results(poll.id, list(options), counts, status, now)
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
    if creator or admin or status == PollStatus.CLOSED:
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


def _counts(session: Session, poll_id: int) -> dict[int, int]:
    """按选项统计这场投票的有效票。

    Args:
        session: 当前事务。
        poll_id: 投票主键。

    Returns:
        选项主键到票数的映射。没有票的选项不在映射里。
    """
    rows = session.execute(
        select(Vote.option_id, func.count())
        .where(Vote.poll_id == poll_id)
        .group_by(Vote.option_id)
    ).all()
    return {int(option_id): int(total) for option_id, total in rows}


def _results(
    poll_id: int,
    options: list[PollOption],
    counts: dict[int, int],
    status: PollStatus,
    now: datetime,
) -> PollResults:
    """把同一次聚合收成响应。

    Args:
        poll_id: 投票主键。
        options: 按位置排列的选项。
        counts: 选项票数。
        status: 有效状态。
        now: 服务端时间。

    Returns:
        汇总。零票没有领先项。
    """
    total = sum(counts.values())
    items = [
        OptionResult(
            option_id=option.id,
            label=option.label,
            count=counts.get(option.id, 0),
            percentage=_percentage(counts.get(option.id, 0), total),
        )
        for option in options
    ]
    highest = max((item.count for item in items), default=0)
    leaders = [item.option_id for item in items if highest > 0 and item.count == highest]
    return PollResults(
        poll_id=poll_id,
        total_votes=total,
        options=items,
        winner_option_ids=leaders,
        is_final=status == PollStatus.CLOSED,
        server_time=now,
    )


def _percentage(count: int, total: int) -> float:
    """计算保留两位小数的百分比。

    Args:
        count: 该选项的票数。
        total: 总票数。

    Returns:
        0 到 100 的百分比。总票数为 0 时返回 0。
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
