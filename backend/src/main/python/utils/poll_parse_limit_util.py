"""投票文字识别的进程内限额。

计数在真正调用模型前增加。上游失败不会把这一次从窗口里去掉。
多进程部署时这里的上限不跨进程生效。
"""

import threading
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from src.main.python.constants.error_codes import ApiCode
from src.main.python.utils.error_handlers import AppError

_WINDOW = timedelta(seconds=60)


class PollParseLimiter:
    """每账户一分钟最多 5 次，同时 1 次；全进程同时最多 4 个模型请求。

    Attributes:
        _per_account: 窗口内每个账户允许开始的次数。
        _global_limit: 全进程同时进行的模型请求数。
        _guard: 保护计数的锁。
        _stamps: 每个账户仍落在窗口内的开始时刻。
        _account_inflight: 每个账户尚未释放的请求数。
        _global_inflight: 全进程尚未释放的请求数。
    """

    def __init__(self, per_account: int = 5, global_limit: int = 4) -> None:
        """保存次数上限。

        Args:
            per_account: 60 秒内每个账户允许开始的次数。
            global_limit: 全进程同时进行的模型请求数。
        """
        self._per_account = per_account
        self._global_limit = global_limit
        self._guard = threading.Lock()
        self._stamps: dict[int, list[datetime]] = {}
        self._account_inflight: dict[int, int] = {}
        self._global_inflight = 0

    def acquire(self, user_id: int, now: datetime) -> timedelta | None:
        """尝试开始一次识别。超限时不占用名额。

        Args:
            user_id: 账户主键。
            now: 调用方时钟的当前时间。

        Returns:
            需要等待的时长。可以开始时为空。
        """
        with self._guard:
            account_busy = self._account_inflight.get(user_id, 0) >= 1
            if account_busy or self._global_inflight >= self._global_limit:
                return timedelta(seconds=1)
            stamps = self._fresh(user_id, now)
            if len(stamps) >= self._per_account:
                return self._remaining(stamps, now)
            stamps.append(now)
            self._stamps[user_id] = stamps
            self._account_inflight[user_id] = self._account_inflight.get(user_id, 0) + 1
            self._global_inflight += 1
            return None

    def release(self, user_id: int) -> None:
        """释放一次正在进行的识别名额。不撤销窗口计数。

        Args:
            user_id: 账户主键。
        """
        with self._guard:
            current = self._account_inflight.get(user_id, 0)
            if current <= 1:
                self._account_inflight.pop(user_id, None)
            else:
                self._account_inflight[user_id] = current - 1
            if self._global_inflight > 0:
                self._global_inflight -= 1

    def _fresh(self, user_id: int, now: datetime) -> list[datetime]:
        """丢掉窗口外的开始时刻。

        Args:
            user_id: 账户主键。
            now: 当前时刻。

        Returns:
            仍落在 60 秒内的时刻。调用方可以继续修改这份列表。
        """
        stamps = self._stamps.get(user_id, [])
        fresh = [item for item in stamps if now - item < _WINDOW]
        if fresh:
            self._stamps[user_id] = fresh
        else:
            self._stamps.pop(user_id, None)
        return fresh

    def _remaining(self, stamps: list[datetime], now: datetime) -> timedelta:
        """按最早一次仍有效的开始时刻计算剩余窗口。

        Args:
            stamps: 窗口内的开始时刻，至少有一次。
            now: 当前时刻。

        Returns:
            至少 1 秒的等待时长。
        """
        retry = _WINDOW - (now - stamps[0])
        if retry.total_seconds() < 1:
            return timedelta(seconds=1)
        return retry


def retry_after_header(wait: timedelta) -> dict[str, str]:
    """把等待时长收成不缓存的 Retry-After 头。

    Args:
        wait: 仍需等待的时长。

    Returns:
        Retry-After 和 Cache-Control。
    """
    seconds = int(wait.total_seconds())
    if wait.total_seconds() > seconds:
        seconds += 1
    return {"Retry-After": str(max(seconds, 1)), "Cache-Control": "no-store"}


async def call_with_poll_parse_limit[T](
    limiter: PollParseLimiter,
    user_id: int,
    now: datetime,
    action: Callable[[], Awaitable[T]],
) -> T:
    """占用额度后执行动作，并在完成、失败或取消时释放并发名额。

    Args:
        limiter: 识别限流器。
        user_id: 账户主键。
        now: 调用方时钟的当前时间。
        action: 无参数的异步动作。

    Returns:
        动作的结果。

    Raises:
        AppError: 超过频率或并发上限。
    """
    wait = limiter.acquire(user_id, now)
    if wait is not None:
        raise AppError(
            429,
            ApiCode.TOO_MANY_ATTEMPTS,
            ApiCode.TOO_MANY_ATTEMPTS.default_message,
            headers=retry_after_header(wait),
        )
    try:
        return await action()
    finally:
        limiter.release(user_id)
