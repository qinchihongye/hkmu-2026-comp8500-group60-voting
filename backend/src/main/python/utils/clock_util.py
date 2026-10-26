"""服务端时钟。"""

from datetime import UTC, datetime


class Clock:
    """可注入的 UTC 时钟。"""

    def now(self) -> datetime:
        """返回当前 UTC 时间。

        Returns:
            带 UTC 时区的当前时间。
        """
        return datetime.now(UTC)
