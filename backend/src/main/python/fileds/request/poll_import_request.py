"""投票文字识别的请求参数。未知字段会被外壳拒绝。"""

from pydantic import field_validator

from src.main.python.constants.limits import MAX_POLL_TEXT_LENGTH
from src.main.python.fileds.request.request import BaseRequestData


class PollTextParseRequest(BaseRequestData):
    """一段待识别的投票文字。

    Attributes:
        text: 去掉首尾空白后的原文，长度为 1 到 10000 个 Unicode 码点。
    """

    text: str

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        """去掉首尾空白并按码点检查长度。

        Args:
            value: 提交的原文。

        Returns:
            去掉首尾空白后的原文。

        Raises:
            ValueError: 空白，或长度超过 10000 个码点。
        """
        stripped = value.strip()
        if not 1 <= len(stripped) <= MAX_POLL_TEXT_LENGTH:
            raise ValueError("文本长度需为 1 到 10000 个字符")
        return stripped
