"""私密投票密码的失败次数限制。

计数只留在本进程内存里，键是访客凭据和投票，不记录 IP。
"""

import threading
from datetime import datetime, timedelta


class AttemptLimiter:
    """固定窗口的失败计数。

    达到上限后锁定一段时间。锁定期间的新失败不会把窗口往后推。

    Attributes:
        _limit: 窗口内允许的失败次数。
        _lockout: 达到上限后的锁定时长。
        _guard: 保护计数表的锁。
        _failures: 仍落在窗口内的失败时刻。
    """

    def __init__(
        self,
        limit: int = 5,
        lockout: timedelta = timedelta(minutes=5),
    ) -> None:
        """保存次数上限和锁定时长。

        Args:
            limit: 窗口内允许的失败次数。
            lockout: 达到上限后的锁定时长。
        """
        self._limit = limit
        self._lockout = lockout
        self._guard = threading.Lock()
        self._failures: dict[tuple[int, int], list[datetime]] = {}

    def rejection(self, key: tuple[int, int], now: datetime) -> timedelta | None:
        """查看当前是否仍在锁定期。不增加失败次数。

        Args:
            key: 访客凭据编号和投票编号。
            now: 调用方时钟的当前时间。

        Returns:
            仍需等待的时长。未锁定时为空。
        """
        with self._guard:
            stamps = self._fresh(key, now)
            if len(stamps) < self._limit:
                return None
            return self._remaining(stamps, now)

    def record_failure(self, key: tuple[int, int], now: datetime) -> timedelta | None:
        """记下一次失败。达到上限时返回需要等待的时长。

        Args:
            key: 访客凭据编号和投票编号。
            now: 这次失败的时刻，使用调用方时钟。

        Returns:
            刚刚达到或仍处于上限时的等待时长。未锁定时为空。
        """
        with self._guard:
            stamps = self._fresh(key, now)
            stamps.append(now)
            self._failures[key] = stamps
            if len(stamps) < self._limit:
                return None
            return self._remaining(stamps, now)

    def clear(self, key: tuple[int, int]) -> None:
        """清除该键的失败记录。密码正确时调用。

        Args:
            key: 访客凭据编号和投票编号。
        """
        with self._guard:
            self._failures.pop(key, None)

    def _fresh(self, key: tuple[int, int], now: datetime) -> list[datetime]:
        """丢掉窗口外的失败时刻。

        Args:
            key: 访客凭据编号和投票编号。
            now: 当前时刻。

        Returns:
            仍落在锁定时长内的失败时刻。调用方可以继续修改这份列表。
        """
        stamps = self._failures.get(key, [])
        fresh = [item for item in stamps if now - item < self._lockout]
        if fresh:
            self._failures[key] = fresh
        else:
            self._failures.pop(key, None)
        return fresh

    def _remaining(self, stamps: list[datetime], now: datetime) -> timedelta:
        """按最早一次仍有效的失败计算剩余锁定时间。

        Args:
            stamps: 窗口内的失败时刻，至少有一次。
            now: 当前时刻。

        Returns:
            至少 1 秒的等待时长。
        """
        retry = self._lockout - (now - stamps[0])
        if retry.total_seconds() < 1:
            return timedelta(seconds=1)
        return retry
