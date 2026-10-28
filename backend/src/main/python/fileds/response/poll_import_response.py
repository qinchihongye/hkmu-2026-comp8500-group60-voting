"""投票文字识别的响应。可选字段没有可靠值时省略，不代表清空表单。"""

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_serializer

from src.main.python.constants.enums import SelectionMode
from src.main.python.constants.limits import MAX_POLL_TEXT_LENGTH

POLL_IMPORT_TIMEZONE = "Asia/Hong_Kong"
_OPTIONAL_FIELD_KEYS = ("description", "starts_at", "ends_at", "selection_mode")


class PollParseIssueCode(StrEnum):
    """识别结果里可以交给前端的问题码。"""

    FIELD_TOO_LONG = "FIELD_TOO_LONG"
    OPTION_COUNT_INVALID = "OPTION_COUNT_INVALID"
    DUPLICATE_OPTIONS = "DUPLICATE_OPTIONS"
    MULTIPLE_REQUIRES_THREE_OPTIONS = "MULTIPLE_REQUIRES_THREE_OPTIONS"
    TIME_AMBIGUOUS = "TIME_AMBIGUOUS"
    TIME_IN_PAST = "TIME_IN_PAST"
    TIME_RANGE_CONFLICT = "TIME_RANGE_CONFLICT"
    MULTIPLE_POLLS = "MULTIPLE_POLLS"
    NO_POLL_CONTENT = "NO_POLL_CONTENT"


class PollParseIssue(BaseModel):
    """一条需要人工确认的问题。不包含模型解释。

    Attributes:
        field: 相关字段。整段原文的问题使用 text。
        code: 固定问题码。
    """

    model_config = ConfigDict(extra="forbid")

    field: Literal[
        "title",
        "description",
        "options",
        "starts_at",
        "ends_at",
        "selection_mode",
        "text",
    ]
    code: PollParseIssueCode


class ParsedOption(BaseModel):
    """一个可供表单填入的选项。

    Attributes:
        label: 选项文本。
    """

    model_config = ConfigDict(extra="forbid")

    label: str


class PollTextFields(BaseModel):
    """可供表单使用的部分字段。title 和 options 始终出现。

    Attributes:
        title: 标题。没识别到时为 null。
        options: 可填入的选项。没有可应用列表时为空数组。
        description: 说明。没有可靠内容时省略。
        starts_at: 香港时间的开始时刻。不可靠时省略。
        ends_at: 香港时间的结束时刻。不可靠时省略。
        selection_mode: 原文明确写出的选择方式。没说明时省略。
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None
    options: list[ParsedOption]
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    selection_mode: SelectionMode | None = None

    @model_serializer(mode="wrap")
    def serialize_fields(self, handler):  # type: ignore[no-untyped-def]
        """序列化字段。只省略值为 null 的可选键。

        Args:
            handler: Pydantic 默认序列化函数。

        Returns:
            至少包含 title 和 options 的字典。
        """
        data = dict(handler(self))
        for key in _OPTIONAL_FIELD_KEYS:
            if data.get(key) is None:
                data.pop(key, None)
        return data


class PollTextParseResult(BaseModel):
    """一次识别的候选结果。不是创建投票的请求。

    Attributes:
        fields: 可填入表单的字段。
        issues: 需要人工确认的问题。
        reference_time: 这次识别使用的香港时间，精确到分钟。
        timezone: 固定为 Asia/Hong_Kong。
    """

    model_config = ConfigDict(extra="forbid")

    fields: PollTextFields
    issues: list[PollParseIssue]
    reference_time: datetime
    timezone: Literal["Asia/Hong_Kong"] = POLL_IMPORT_TIMEZONE


class PollImportCapabilities(BaseModel):
    """文字识别是否可用。不包含模型名、密钥或地址。

    Attributes:
        enabled: 配置是否齐全。不表示上游此刻可达。
        max_text_length: 原文最多接受的 Unicode 码点数。
        timezone: 识别时间使用的时区。
    """

    model_config = ConfigDict(extra="forbid")

    enabled: bool
    max_text_length: int = MAX_POLL_TEXT_LENGTH
    timezone: Literal["Asia/Hong_Kong"] = POLL_IMPORT_TIMEZONE
