"""编排投票文字识别。模型只提供候选，这里决定哪些字段可以填进表单。"""

import time
from collections.abc import Awaitable
from datetime import datetime
from typing import Protocol

from src.main.python.algorithms.poll_import_module.poll_text_prompt import (
    HONG_KONG,
    ModelPollExtraction,
    TimeHint,
)
from src.main.python.algorithms.poll_import_module.poll_time_resolver import resolve_time_hint
from src.main.python.config.logger_config import get_logger
from src.main.python.constants.enums import SelectionMode
from src.main.python.constants.error_codes import ApiCode
from src.main.python.fileds.response.poll_import_response import (
    POLL_IMPORT_TIMEZONE,
    ParsedOption,
    PollParseIssue,
    PollParseIssueCode,
    PollTextFields,
    PollTextParseResult,
)
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError

logger = get_logger("poll_text_parse")

_TITLE_LIMIT = 120
_DESCRIPTION_LIMIT = 2000
_OPTION_LIMIT = 200


class PollTextExtractor(Protocol):
    """可替换的模型提取器。"""

    def extract_poll(
        self,
        text: str,
        reference_time: datetime,
        *,
        request_id: str = "",
    ) -> Awaitable[ModelPollExtraction]:
        """提取一场投票的内部结构。

        Args:
            text: 已经检查过边界的原文。
            reference_time: 这次识别固定的服务端时间。
            request_id: 当前请求标识。只用于日志。

        Returns:
            通过结构校验的提取结果。
        """


class PollTextParseService:
    """把模型提取结果收成可填表的字段。不访问数据库。

    Attributes:
        _clock: 可注入的服务端时钟。
        _extractor: 模型提取器。功能关闭时为空。
        _enabled: 配置是否允许调用模型。
    """

    def __init__(
        self,
        clock: Clock,
        extractor: PollTextExtractor | None,
        *,
        enabled: bool,
    ) -> None:
        """保存时钟和提取器。

        Args:
            clock: 服务端时钟。
            extractor: 模型提取器。未配置客户端时为空。
            enabled: 开关、密钥和模型名是否齐全。
        """
        self._clock = clock
        self._extractor = extractor
        self._enabled = enabled

    async def parse(self, text: str, *, request_id: str = "") -> PollTextParseResult:
        """识别一段投票文字。

        Args:
            text: 已经检查过边界的原文。
            request_id: 当前请求标识。只写入日志。

        Returns:
            候选字段、问题码和这次使用的参考时间。

        Raises:
            AppError: 功能关闭、上游不可用、超时或输出无法使用。
        """
        reference = self._clock.now().astimezone(HONG_KONG).replace(second=0, microsecond=0)
        if not self._enabled:
            raise _failure(503, ApiCode.POLL_PARSE_DISABLED)
        if self._extractor is None:
            raise _failure(503, ApiCode.POLL_PARSE_UNAVAILABLE)
        started = time.perf_counter()
        extraction = await self._extractor.extract_poll(
            text,
            reference,
            request_id=request_id,
        )
        result = self._result(text, extraction, reference)
        logger.info(
            "status=ok duration_ms=%s issue_codes=%s request_id=%s",
            int((time.perf_counter() - started) * 1000),
            ",".join(issue.code for issue in result.issues) or "-",
            request_id,
        )
        return result

    def _result(
        self,
        text: str,
        extraction: ModelPollExtraction,
        reference: datetime,
    ) -> PollTextParseResult:
        """按内容类别生成对外结果。

        Args:
            text: 用户原文，用来核对时间线索是否真的出现过。
            extraction: 已通过结构校验的模型结果。
            reference: 精确到分钟的香港参考时间。

        Returns:
            不包含模型无法保证的字段。
        """
        if extraction.content_category == "multiple_polls":
            return _empty(reference, [_issue("text", PollParseIssueCode.MULTIPLE_POLLS)])
        if extraction.content_category == "unrelated":
            return _empty(reference, [_issue("text", PollParseIssueCode.NO_POLL_CONTENT)])
        return self._single(text, extraction, reference)

    def _single(
        self,
        text: str,
        extraction: ModelPollExtraction,
        reference: datetime,
    ) -> PollTextParseResult:
        """整理一场投票的标题、选项和时间。

        Args:
            text: 用户原文。
            extraction: 内容类别为 single_poll 的结果。
            reference: 精确到分钟的香港参考时间。

        Returns:
            部分字段和问题码。
        """
        issues: list[PollParseIssue] = []
        title, title_issue = _title(extraction.title)
        description, description_issue = _description(extraction.description)
        options, option_issue = _options(extraction.options)
        mode, mode_issue = _selection(extraction.selection_mode, len(options))
        for issue in (title_issue, description_issue, option_issue, mode_issue):
            if issue is not None:
                issues.append(issue)
        starts, start_issues = _time(text, extraction.starts_hint, reference, "starts_at")
        ends, end_issues = _time(text, extraction.ends_hint, reference, "ends_at")
        issues.extend(start_issues)
        issues.extend(end_issues)
        if starts is not None and ends is not None and ends <= starts:
            starts = None
            ends = None
            issues.append(_issue("text", PollParseIssueCode.TIME_RANGE_CONFLICT))
        nothing_usable = (
            title is None
            and description is None
            and not options
            and starts is None
            and ends is None
        )
        if nothing_usable:
            issues.append(_issue("text", PollParseIssueCode.NO_POLL_CONTENT))
        return PollTextParseResult(
            fields=PollTextFields(
                title=title,
                description=description,
                options=[ParsedOption(label=label) for label in options],
                starts_at=starts,
                ends_at=ends,
                selection_mode=mode,
            ),
            issues=issues,
            reference_time=reference,
            timezone=POLL_IMPORT_TIMEZONE,
        )


def _title(value: str | None) -> tuple[str | None, PollParseIssue | None]:
    """整理标题。超长时不截断。

    Args:
        value: 模型给出的标题。

    Returns:
        可用标题，以及超长问题。
    """
    if value is None:
        return None, None
    text = value.strip().rstrip("：:").strip()
    if not text:
        return None, None
    if len(text) > _TITLE_LIMIT:
        return None, _issue("title", PollParseIssueCode.FIELD_TOO_LONG)
    return text, None


def _description(value: str | None) -> tuple[str | None, PollParseIssue | None]:
    """整理说明。超长时不截断。

    Args:
        value: 模型给出的说明。

    Returns:
        可用说明，以及超长问题。
    """
    if value is None:
        return None, None
    text = value.strip()
    if not text:
        return None, None
    if len(text) > _DESCRIPTION_LIMIT:
        return None, _issue("description", PollParseIssueCode.FIELD_TOO_LONG)
    return text, None


def _options(value: list[str] | None) -> tuple[list[str], PollParseIssue | None]:
    """整理选项。数量、长度或重复不合法时整组不用。

    Args:
        value: 模型给出的选项。没有时为空。

    Returns:
        可填入的选项，以及一条选项问题。
    """
    if not value:
        return [], None
    labels = [item.strip() for item in value]
    if any(len(item) > _OPTION_LIMIT for item in labels):
        return [], _issue("options", PollParseIssueCode.FIELD_TOO_LONG)
    if any(not item for item in labels):
        return [], _issue("options", PollParseIssueCode.OPTION_COUNT_INVALID)
    if len(labels) != len(set(labels)):
        return [], _issue("options", PollParseIssueCode.DUPLICATE_OPTIONS)
    if not 2 <= len(labels) <= 10:
        return [], _issue("options", PollParseIssueCode.OPTION_COUNT_INVALID)
    return labels, None


def _selection(
    value: str | None,
    option_count: int,
) -> tuple[SelectionMode | None, PollParseIssue | None]:
    """保留原文明确写出的选择方式。多选不足三项时不替用户补选项。

    Args:
        value: 模型给出的选择方式。
        option_count: 这次可以填入的选项数。

    Returns:
        可用的选择方式。多选候选项不足三个时为空，并附问题。
    """
    if value is None:
        return None, None
    mode = SelectionMode(value)
    if mode == SelectionMode.MULTIPLE and option_count < 3:
        return None, _issue("selection_mode", PollParseIssueCode.MULTIPLE_REQUIRES_THREE_OPTIONS)
    return mode, None


def _time(
    text: str,
    hint: TimeHint | None,
    reference: datetime,
    field: str,
) -> tuple[datetime | None, list[PollParseIssue]]:
    """核对线索确实来自原文，再做确定性解析。

    Args:
        text: 用户原文。
        hint: 开始或结束线索。没有时为空。
        reference: 精确到分钟的香港参考时间。
        field: 问题要标到的字段名。

    Returns:
        可用时刻和问题。线索没有出现在原文中时时刻为空。
    """
    if hint is None:
        return None, []
    if not hint.source_text.strip() or hint.source_text not in text:
        return None, [_issue(field, PollParseIssueCode.TIME_AMBIGUOUS)]
    moment, issues = resolve_time_hint(hint, reference)
    return moment, [item.model_copy(update={"field": field}) for item in issues]


def _empty(reference: datetime, issues: list[PollParseIssue]) -> PollTextParseResult:
    """返回不改表单的空结果。

    Args:
        reference: 精确到分钟的香港参考时间。
        issues: 说明为什么不能填表。

    Returns:
        标题为空、选项为空数组的结果。
    """
    return PollTextParseResult(
        fields=PollTextFields(title=None, options=[]),
        issues=issues,
        reference_time=reference,
        timezone=POLL_IMPORT_TIMEZONE,
    )


def _issue(field: str, code: PollParseIssueCode) -> PollParseIssue:
    """构造一条对外问题。

    Args:
        field: 字段名或 text。
        code: 问题码。

    Returns:
        不含模型解释的问题。
    """
    return PollParseIssue(field=field, code=code)


def _failure(status_code: int, code: ApiCode) -> AppError:
    """构造不缓存、不含上游正文的识别失败。

    Args:
        status_code: HTTP 状态码。
        code: 数值业务码。

    Returns:
        固定英文说明的业务错误。
    """
    return AppError(
        status_code,
        code,
        code.default_message,
        headers={"Cache-Control": "no-store"},
    )
