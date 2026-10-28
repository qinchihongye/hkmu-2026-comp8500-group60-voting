"""识别限额在开始前计数，并在完成、异常和取消后释放并发名额。"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from src.main.python.constants.error_codes import ApiCode
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.poll_parse_limit_util import (
    PollParseLimiter,
    call_with_poll_parse_limit,
)

NOW = datetime(2026, 10, 28, 5, 0, tzinfo=UTC)


async def _ok() -> str:
    """返回一个固定结果。

    Returns:
        成功标记。
    """
    return "ok"


def test_fifth_call_is_allowed_and_the_sixth_waits_for_the_window() -> None:
    """同一账户 60 秒内第五次可以开始，第六次返回等待时间。"""
    limiter = PollParseLimiter()
    for _index in range(5):
        assert limiter.acquire(1, NOW) is None
        limiter.release(1)
    wait = limiter.acquire(1, NOW)
    assert wait is not None
    assert wait.total_seconds() == 60

    later = limiter.acquire(1, NOW + timedelta(seconds=60))
    assert later is None
    limiter.release(1)


def test_concurrency_is_released_after_success_error_and_cancel() -> None:
    """同一账户同时只有一个名额，结束后可以再次开始。"""
    limiter = PollParseLimiter()

    async def scenario() -> None:
        """占用、取消、抛错后再占用。

        Raises:
            AppError: 名额仍被占用时。
        """
        assert await call_with_poll_parse_limit(limiter, 7, NOW, _ok) == "ok"

        async def hold() -> None:
            """占住名额后取消。"""
            await call_with_poll_parse_limit(limiter, 7, NOW, _hang)

        task = asyncio.create_task(hold())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert await call_with_poll_parse_limit(limiter, 7, NOW, _ok) == "ok"

        async def explode() -> str:
            """占住名额后失败。

            Raises:
                RuntimeError: 模拟上游失败。
            """
            raise RuntimeError("upstream")

        with pytest.raises(RuntimeError):
            await call_with_poll_parse_limit(limiter, 7, NOW, explode)
        assert await call_with_poll_parse_limit(limiter, 7, NOW, _ok) == "ok"

        entered = False

        async def mark() -> str:
            """标记第二次请求已经开始。

            Returns:
                成功标记。
            """
            nonlocal entered
            entered = True
            return "ok"

        # 账户 7 的五次窗口已经用完。并发拒绝改用账户 8，避免被频率窗口盖住。
        first = asyncio.create_task(call_with_poll_parse_limit(limiter, 8, NOW, _hang))
        await asyncio.sleep(0)
        with pytest.raises(AppError) as caught:
            await call_with_poll_parse_limit(limiter, 8, NOW, mark)
        assert caught.value.code == ApiCode.TOO_MANY_ATTEMPTS
        assert caught.value.headers is not None
        assert caught.value.headers["Retry-After"] == "1"
        assert entered is False
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first

    asyncio.run(scenario())


def test_global_limit_releases_one_slot() -> None:
    """全进程同时最多四个请求，释放后其他账户可以开始。"""
    limiter = PollParseLimiter()
    for user_id in range(4):
        assert limiter.acquire(user_id, NOW) is None
    assert limiter.acquire(99, NOW) is not None
    limiter.release(0)
    assert limiter.acquire(99, NOW) is None
    limiter.release(99)


async def _hang() -> str:
    """一直等待，直到调用方取消。

    Returns:
        不会返回的标记。
    """
    await asyncio.sleep(30)
    return "late"
