"""投票的公开和管理响应。任何模型都不包含密码散列。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.main.python.fileds.response.vote_response import VoteReceipt


class OptionPublic(BaseModel):
    """可以展示的选项。

    Attributes:
        id: 选项主键。
        label: 选项文本。
        position: 展示顺序，从 0 开始。
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    label: str
    position: int


class PollSummary(BaseModel):
    """广场和列表上的投票摘要。不含个性化参与状态。

    Attributes:
        id: 投票主键。
        title: 标题。
        identity_mode: NAMED 或 ANONYMOUS。
        visibility: PUBLIC 或 PRIVATE。
        vote_limit: 整场选票份数上限。为空表示不限。
        selection_mode: SINGLE 或 MULTIPLE。
        starts_at: 开始时间，UTC。
        ends_at: 结束时间，UTC。
        effective_status: 按当前时间计算出的状态。
        created_at: 创建时间，UTC。
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    identity_mode: str
    visibility: str
    vote_limit: int | None
    selection_mode: str
    starts_at: datetime
    ends_at: datetime
    effective_status: str
    created_at: datetime


class ManagePollSummary(PollSummary):
    """创建者和管理员列表中的摘要。

    Attributes:
        lifecycle: 库存生命周期。
        version: 乐观锁版本。
        creator_id: 创建者账户。
    """

    lifecycle: str
    version: int
    creator_id: int


class PollDetail(PollSummary):
    """参与者看到的投票详情。

    Attributes:
        description: 说明。
        options: 按位置排列的选项。
        has_voted: 当前身份是否已投。
        receipt: 已投时的回执。未投时为空。
        server_time: 服务端当前时间，UTC。
        can_vote: 当前身份现在能否提交。
        can_manage: 当前账户是否为创建者。
        can_view_results: 当前身份能否看汇总。
        results_access_reason: creator、admin、closed 或 unavailable。
    """

    description: str | None
    options: list[OptionPublic]
    has_voted: bool
    receipt: VoteReceipt | None = None
    server_time: datetime
    can_vote: bool
    can_manage: bool
    can_view_results: bool
    results_access_reason: str


class ManagePollDetail(PollSummary):
    """创建者和管理员看到的管理详情。不含参与状态和密码。

    Attributes:
        description: 说明。
        options: 按位置排列的选项。
        lifecycle: 库存生命周期。
        version: 乐观锁版本。
        creator_id: 创建者账户。
        closed_at: 显式关闭时间。自然结束时为空。
        has_access_password: 是否配置了访问密码。不返回密码本身。
        server_time: 服务端当前时间，UTC。
        can_manage: 调用者是否为创建者。
        can_view_results: 管理读取始终可以看汇总。
    """

    description: str | None
    options: list[OptionPublic]
    lifecycle: str
    version: int
    creator_id: int
    closed_at: datetime | None
    has_access_password: bool
    server_time: datetime
    can_manage: bool
    can_view_results: bool
