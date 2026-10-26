"""有效状态只由生命周期和当前时间决定。"""

from datetime import UTC, datetime, timedelta

from src.main.python.algorithms.poll_module.poll_service import effective_status
from src.main.python.constants.enums import PollStatus
from src.main.python.database.models import Poll

START = datetime(2026, 10, 24, 9, tzinfo=UTC)
END = START + timedelta(hours=2)


def _poll(lifecycle: str) -> Poll:
    """构造一场不落库的投票。

    Args:
        lifecycle: 库存生命周期。

    Returns:
        只填了状态计算所需字段的投票。
    """
    return Poll(
        title="状态",
        identity_mode="NAMED",
        visibility="PUBLIC",
        lifecycle=lifecycle,
        starts_at=START,
        ends_at=END,
        creator_id=1,
        version=1,
    )


def test_effective_status_boundaries() -> None:
    """草稿、未开始、开始时刻、结束时刻和显式关闭各取一词。"""
    draft = _poll("DRAFT")
    published = _poll("PUBLISHED")
    closed = _poll("CLOSED")

    assert effective_status(draft, START + timedelta(minutes=30)) == PollStatus.DRAFT
    assert effective_status(published, START - timedelta(seconds=1)) == PollStatus.SCHEDULED
    assert effective_status(published, START) == PollStatus.OPEN
    assert effective_status(published, END - timedelta(seconds=1)) == PollStatus.OPEN
    assert effective_status(published, END) == PollStatus.CLOSED
    assert effective_status(closed, START) == PollStatus.CLOSED
    assert published.lifecycle == "PUBLISHED"
    assert closed.closed_at is None
