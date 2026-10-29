"""按登记表分页查询固定示例。"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.poll_module.poll_service import effective_status
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import DemoPollFixture, Poll, Vote
from src.main.python.fileds.response.demo_response import DemoPollSummary
from src.main.python.fileds.response.response import Page
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError


@dataclass(frozen=True)
class DemoListFilters:
    """示例目录的分页和搜索。

    Attributes:
        page: 页码，从 1 开始。
        page_size: 每页条数。
        text: 标题或目录键搜索。空白视为不搜索。
    """

    page: int
    page_size: int
    text: str | None = None


class DemoCatalogService:
    """只返回登记过的固定示例。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
        _enabled: 目录接口是否对登录用户返回数据。
    """

    def __init__(self, session_factory: sessionmaker[Session], clock: Clock, enabled: bool) -> None:
        """保存查询依赖。

        Args:
            session_factory: 数据库会话工厂。
            clock: 用来计算有效状态的时钟。
            enabled: 关闭时返回空页，不删除已有示例。
        """
        self._factory = session_factory
        self._clock = clock
        self._enabled = enabled

    def list_registered(self, filters: DemoListFilters) -> Page[DemoPollSummary]:
        """按固定顺序返回一页示例摘要。

        Args:
            filters: 页码、页大小和搜索词。

        Returns:
            过滤后的摘要页。关闭目录时总条数为 0。

        Raises:
            AppError: 搜索词超过 120 个字符。
        """
        if not self._enabled:
            return Page(items=[], page=filters.page, page_size=filters.page_size, total=0)
        clauses = _search_clauses(filters.text)
        with self._factory() as session:
            total = session.scalar(_count(clauses)) or 0
            rows = session.execute(_page(clauses, filters)).all()
            poll_ids = [poll.id for _fixture, poll in rows]
            counts: dict[int, int] = {}
            if poll_ids:
                count_rows = session.execute(
                    select(Vote.poll_id, func.count(Vote.id))
                    .where(Vote.poll_id.in_(poll_ids))
                    .group_by(Vote.poll_id)
                ).all()
                counts = {pid: int(cnt) for pid, cnt in count_rows}
            now = self._clock.now()
            items = [_summary(fixture, poll, now, counts.get(poll.id, 0)) for fixture, poll in rows]
        return Page(items=items, page=filters.page, page_size=filters.page_size, total=int(total))


def _search_clauses(text: str | None) -> list[object]:
    """把搜索词转成标题或目录键条件。

    Args:
        text: 原始搜索词。

    Returns:
        WHERE 条件。空白搜索为空列表。

    Raises:
        AppError: 去掉空白后仍超过 120 个字符。
    """
    if text is None:
        return []
    cleaned = text.strip()
    if not cleaned:
        return []
    if len(cleaned) > 120:
        raise AppError(422, ApiCode.VALIDATION_ERROR, ApiCode.VALIDATION_ERROR.default_message)
    escaped = cleaned.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    return [
        or_(
            Poll.title.ilike(pattern, escape="\\"),
            DemoPollFixture.fixture_key.ilike(pattern, escape="\\"),
        )
    ]


def _count(clauses: list[object]) -> object:
    """统计登记示例的数量。

    Args:
        clauses: WHERE 条件。

    Returns:
        计数语句。
    """
    statement = select(func.count()).select_from(DemoPollFixture).join(
        Poll, Poll.id == DemoPollFixture.poll_id
    )
    if clauses:
        statement = statement.where(*clauses)
    return statement


def _page(clauses: list[object], filters: DemoListFilters) -> object:
    """按展示顺序取一页示例和投票。

    Args:
        clauses: WHERE 条件。
        filters: 分页参数。

    Returns:
        当前页的查询。
    """
    statement = (
        select(DemoPollFixture, Poll)
        .join(Poll, Poll.id == DemoPollFixture.poll_id)
        .order_by(DemoPollFixture.display_order.asc())
    )
    if clauses:
        statement = statement.where(*clauses)
    offset = (filters.page - 1) * filters.page_size
    return statement.offset(offset).limit(filters.page_size)


def _calc_close_reason(poll: Poll, status: str, ballot_count: int) -> str | None:
    """计算已结束投票的关闭原因。"""
    if status != "CLOSED":
        return None
    if poll.vote_limit is not None and ballot_count >= poll.vote_limit:
        return "BALLOT_CAP_REACHED"
    if poll.closed_at is not None and poll.ends_at is not None and poll.closed_at < poll.ends_at:
        return "CLOSED_EARLY"
    return "ENDED"


def _summary(fixture: DemoPollFixture, poll: Poll, now: datetime, ballot_count: int = 0) -> DemoPollSummary:
    """复制一条不含敏感字段的示例摘要。

    Args:
        fixture: 目录登记。
        poll: 关联的投票。
        now: 当前时间。
        ballot_count: 已接收选票数。

    Returns:
        示例摘要。
    """
    status = effective_status(poll, now)
    return DemoPollSummary(
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
        closed_at=poll.closed_at,
        ballot_count=ballot_count,
        close_reason=_calc_close_reason(poll, status, ballot_count),
        fixture_key=fixture.fixture_key,
        display_order=fixture.display_order,
    )
