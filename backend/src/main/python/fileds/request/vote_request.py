"""提交选票的请求。只能选择一个选项。"""

from pydantic import Field

from src.main.python.fileds.request.request import BaseRequestData


class VoteRequest(BaseRequestData):
    """一次单选提交。

    Attributes:
        option_id: 被选中的选项。必须属于路径中的那场投票。
    """

    option_id: int = Field(ge=1)
