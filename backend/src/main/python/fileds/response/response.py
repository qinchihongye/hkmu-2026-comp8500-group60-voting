"""公共响应模型。

所有应用 API 的 JSON 只有 code、msg、data、request_id 四个顶层字段。
"""

from pydantic import BaseModel, ConfigDict, Field


class ResponseModel[T](BaseModel):
    """统一响应外壳。

    Attributes:
        code: 业务码。成功为 0，失败为 ApiCode 中的整数。
        msg: 给人读的说明。
        data: 业务数据。无附加数据时为 null。
        request_id: 服务端为本次请求生成的标识。
    """

    model_config = ConfigDict(extra="forbid")

    code: int = Field(description="业务码。成功为 0，失败为数值 ApiCode。")
    msg: str = Field(description="给人读的说明。")
    data: T | None = Field(default=None, description="业务数据。无附加数据时为 null。")
    request_id: str = Field(description="服务端生成的请求标识。")


class Page[T](BaseModel):
    """分页结果。放在 ResponseModel.data 内，不再另做一层响应格式。

    Attributes:
        items: 当前页记录。
        page: 当前页码。
        page_size: 每页条数。
        total: 符合条件的总条数。
    """

    model_config = ConfigDict(extra="forbid")

    items: list[T]
    page: int
    page_size: int
    total: int


class FieldError(BaseModel):
    """单条参数错误。只保留位置和固定说明，不回显提交值。

    Attributes:
        field: 从 data 起的字段路径，例如 data.option_ids。
        message: 不含原始输入的说明。
    """

    model_config = ConfigDict(extra="forbid")

    field: str
    message: str


class ValidationErrorData(BaseModel):
    """参数校验失败时放进 data 的内容。

    Attributes:
        errors: 字段错误列表。
    """

    model_config = ConfigDict(extra="forbid")

    errors: list[FieldError]
