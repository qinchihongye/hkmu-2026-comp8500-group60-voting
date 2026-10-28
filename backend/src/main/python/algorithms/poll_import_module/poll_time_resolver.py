"""把模型给出的时间线索解析成香港时间。

模型只提供类型和原文中的字面值。这里不做推测，缺钟点、非法日期和无法确定的星期都返回空。
"""

from datetime import date, datetime, timedelta, timezone

from src.main.python.algorithms.poll_import_module.poll_text_prompt import HONG_KONG, TimeHint
from src.main.python.fileds.response.poll_import_response import PollParseIssue, PollParseIssueCode

_OFFSET_LIMIT = 14 * 60


def resolve_time_hint(
    hint: TimeHint,
    reference_time: datetime,
) -> tuple[datetime | None, list[PollParseIssue]]:
    """把一条时间线索解析到分钟。

    Args:
        hint: 模型给出的线索。
        reference_time: 这次识别固定的服务端时间，必须带时区。

    Returns:
        香港时间，以及需要确认的问题。无法确定时时刻为空。
        问题的 field 先写成 text，由调用方改到具体字段。
    """
    reference = _hong_kong_minute(reference_time)
    if hint.kind == "unresolved":
        return None, [_issue(PollParseIssueCode.TIME_AMBIGUOUS)]
    resolved = _resolve_kind(hint, reference)
    if isinstance(resolved, PollParseIssue):
        return None, [resolved]
    if resolved < reference:
        return None, [_issue(PollParseIssueCode.TIME_IN_PAST)]
    return resolved, []


def _hong_kong_minute(moment: datetime) -> datetime:
    """把带时区的时刻换成香港时间并去掉秒。

    Args:
        moment: 带时区的时刻。

    Returns:
        精确到分钟的香港时间。

    Raises:
        ValueError: 时刻没有时区。
    """
    if moment.tzinfo is None or moment.tzinfo.utcoffset(moment) is None:
        raise ValueError("reference_time 必须带时区")
    return moment.astimezone(HONG_KONG).replace(second=0, microsecond=0)


def _resolve_kind(hint: TimeHint, reference: datetime) -> datetime | PollParseIssue:
    """按线索类型构造时刻。形状不对时返回问题。

    Args:
        hint: 模型给出的线索。
        reference: 精确到分钟的香港参考时间。

    Returns:
        香港时间，或一条时间问题。
    """
    if hint.kind == "absolute":
        return _absolute(hint)
    if hint.kind == "day_offset":
        return _day_offset(hint, reference)
    if hint.kind == "weekday":
        return _weekday(hint, reference)
    return _issue(PollParseIssueCode.TIME_AMBIGUOUS)


def _absolute(hint: TimeHint) -> datetime | PollParseIssue:
    """构造绝对时间，并换算到香港时间。

    Args:
        hint: kind 为 absolute 的线索。

    Returns:
        香港时间，或一条时间问题。
    """
    if hint.day_offset is not None or hint.weekday is not None or hint.week_scope is not None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    parsed = _clock(hint.local_date, hint.time)
    if parsed is None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    if hint.utc_offset_minutes is None:
        zone = HONG_KONG
    elif -_OFFSET_LIMIT <= hint.utc_offset_minutes <= _OFFSET_LIMIT:
        zone = timezone(timedelta(minutes=hint.utc_offset_minutes))
    else:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    return parsed.replace(tzinfo=zone).astimezone(HONG_KONG).replace(second=0, microsecond=0)


def _day_offset(hint: TimeHint, reference: datetime) -> datetime | PollParseIssue:
    """按今天、明天或后天加上钟点。

    Args:
        hint: kind 为 day_offset 的线索。
        reference: 精确到分钟的香港参考时间。

    Returns:
        香港时间，或一条时间问题。
    """
    if hint.utc_offset_minutes is not None or hint.local_date is not None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    if hint.weekday is not None or hint.week_scope is not None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    if hint.day_offset not in {0, 1, 2}:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    parsed = _clock("2000-01-01", hint.time)
    if parsed is None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    day = reference.date() + timedelta(days=hint.day_offset)
    return datetime(
        day.year,
        day.month,
        day.day,
        parsed.hour,
        parsed.minute,
        tzinfo=HONG_KONG,
    )


def _weekday(hint: TimeHint, reference: datetime) -> datetime | PollParseIssue:
    """按香港时间的周一为一周起点解析星期。

    裸周几选择今天或之后最近的一次。如果今天就是该星期且钟点已过，不自动跳到下周。

    Args:
        hint: kind 为 weekday 的线索。
        reference: 精确到分钟的香港参考时间。

    Returns:
        香港时间，或一条时间问题。
    """
    if (
        hint.utc_offset_minutes is not None
        or hint.local_date is not None
        or hint.day_offset is not None
    ):
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    if hint.weekday not in range(1, 8) or hint.week_scope is None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    parsed = _clock("2000-01-01", hint.time)
    if parsed is None:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    today = reference.date()
    monday = today - timedelta(days=today.isoweekday() - 1)
    if hint.week_scope == "this":
        day = monday + timedelta(days=hint.weekday - 1)
    elif hint.week_scope == "next":
        day = monday + timedelta(days=hint.weekday - 1 + 7)
    elif hint.week_scope == "unqualified":
        delta = (hint.weekday - today.isoweekday()) % 7
        if delta == 0:
            candidate = _at(today, parsed)
            if candidate < reference:
                return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
            return candidate
        day = today + timedelta(days=delta)
    else:
        return _issue(PollParseIssueCode.TIME_AMBIGUOUS)
    return _at(day, parsed)


def _at(day: date, clock: datetime) -> datetime:
    """把日期和钟点合成香港时间。

    Args:
        day: 公历日期。
        clock: 只使用其中的时和分。

    Returns:
        精确到分钟的香港时间。
    """
    return datetime(day.year, day.month, day.day, clock.hour, clock.minute, tzinfo=HONG_KONG)


def _clock(local_date: str | None, clock: str | None) -> datetime | None:
    """严格解析日期和钟点。不存在的日期返回空。

    Args:
        local_date: YYYY-MM-DD。只解析钟点时可以传入一个已知合法日期。
        clock: HH:mm。

    Returns:
        不含时区的时刻。格式或日期不合法时为空。
    """
    if local_date is None or clock is None:
        return None
    try:
        return datetime.strptime(f"{local_date} {clock}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def _issue(code: PollParseIssueCode) -> PollParseIssue:
    """构造一条还没绑定具体字段的时间问题。

    Args:
        code: 时间问题码。

    Returns:
        field 为 text 的问题。
    """
    return PollParseIssue(field="text", code=code)
