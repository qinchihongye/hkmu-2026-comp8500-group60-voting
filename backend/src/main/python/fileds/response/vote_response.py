"""选票回执、汇总和记名历史。不包含匿名身份。"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VoteReceipt(BaseModel):
    """一次成功提交的回执。

    Attributes:
        receipt_id: 对外回执编号。
        poll_id: 所属投票。
        submitted_at: 提交时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    receipt_id: UUID
    poll_id: int
    submitted_at: datetime


class OptionResult(BaseModel):
    """一个选项的汇总。没有被选中的选项也保留。

    Attributes:
        option_id: 选项主键。
        label: 选项文本。
        count: 该选项被选中的次数。
        percentage: 占全部选择次数的百分比，保留两位小数。没有选择时为 0。
    """

    model_config = ConfigDict(extra="forbid")

    option_id: int
    label: str
    count: int
    percentage: float = Field(ge=0, le=100)


class PollResults(BaseModel):
    """一场投票的汇总。进行中只是即时快照。

    Attributes:
        poll_id: 投票主键。
        total_votes: 选票份数，等于父票行数。
        total_selections: 选择次数，等于明细行数。
        selection_mode: SINGLE 或 MULTIPLE。
        vote_limit: 整场最多接收的选票份数。为空表示不限。
        options: 按位置排列的选项汇总，包含未被选中的选项。
        winner_option_ids: 当前最高且选择次数大于 0 的选项。并列时全部列出。
        is_final: 有效状态已结束时为真。进行中为假，最高项不是最终胜出者。
        server_time: 取得共享锁之后的服务端时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    poll_id: int
    total_votes: int
    total_selections: int
    selection_mode: str
    vote_limit: int | None
    options: list[OptionResult]
    winner_option_ids: list[int]
    is_final: bool
    server_time: datetime


class MyVote(BaseModel):
    """当前账户可读取的一条记名记录。不含选项和匿名票。

    Attributes:
        receipt_id: 回执编号。
        poll_id: 投票主键。
        poll_title: 投票标题。
        submitted_at: 提交时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    receipt_id: UUID
    poll_id: int
    poll_title: str
    submitted_at: datetime
