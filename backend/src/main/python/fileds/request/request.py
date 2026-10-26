"""公共请求模型。

POST 与 PATCH 只接受顶层 data。未知字段一律拒绝。
"""

from pydantic import BaseModel, ConfigDict, Field


class BaseRequestData(BaseModel):
    """业务参数基类。

    具体接口的请求体继承本类，不能夹带 role、voter_id 或 lifecycle 等未声明字段。
    """

    model_config = ConfigDict(extra="forbid")


class EmptyRequestData(BaseRequestData):
    """没有业务字段的请求体。

    注销等接口仍要提交 data，内容为空对象，不能为 null。
    """


class RequestModel[T](BaseModel):
    """统一的写请求外壳。

    Attributes:
        data: 该接口的强类型业务参数。
    """

    model_config = ConfigDict(extra="forbid")

    data: T


class PageQuery(BaseModel):
    """列表查询的分页参数。

    Attributes:
        page: 页码，从 1 开始。
        page_size: 每页条数，最大 50。
    """

    model_config = ConfigDict(extra="forbid")

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=12, ge=1, le=50)
