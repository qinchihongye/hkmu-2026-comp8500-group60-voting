"""固定示例目录的摘要。不包含密码、分享码、选项或结果。"""

from src.main.python.fileds.response.poll_response import PollSummary


class DemoPollSummary(PollSummary):
    """登录用户在 Overview 看到的一条固定示例。

    Attributes:
        fixture_key: 目录键。
        display_order: 固定展示顺序。
    """

    fixture_key: str
    display_order: int
