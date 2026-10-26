"""统一响应的构建。业务服务不负责包这一层。"""

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from src.main.python.constants.error_codes import ApiCode
from src.main.python.fileds.response.response import ResponseModel


def request_id_of(request: Request) -> str:
    """读取本次请求的标识。缺失时补一个，避免错误响应丢掉该字段。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        非空的请求标识。
    """
    request_id = getattr(request.state, "request_id", "")
    if isinstance(request_id, str) and request_id:
        return request_id
    return ""


def success_body(request: Request, data: Any, msg: str = "ok") -> ResponseModel[Any]:
    """组装成功响应体。

    Args:
        request: 当前 HTTP 请求。
        data: 放进 data 的业务对象。
        msg: 给人读的说明。

    Returns:
        code 为 0 的响应模型。
    """
    return ResponseModel(
        code=int(ApiCode.OK), msg=msg, data=data, request_id=request_id_of(request)
    )


def error_body(
    request: Request,
    code: ApiCode | int,
    msg: str,
    data: Any = None,
) -> ResponseModel[Any]:
    """组装失败响应体。

    Args:
        request: 当前 HTTP 请求。
        code: 数值业务码。
        msg: 给人读的说明。
        data: 附加数据。参数错误时放入字段问题，其余情况保持 null。

    Returns:
        只含四个顶层字段的响应模型。
    """
    return ResponseModel(code=int(code), msg=msg, data=data, request_id=request_id_of(request))


def json_from_model(
    model: ResponseModel[Any],
    status_code: int,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """按真实 HTTP 状态输出 JSON，并保留调用方给出的响应头。

    Args:
        model: 已组装的响应模型。
        status_code: 要保留的 HTTP 状态码。
        headers: Cookie、Retry-After、Cache-Control 等不能被外壳丢掉的头。

    Returns:
        四个顶层字段都在的 JSON 响应。
    """
    response = JSONResponse(status_code=status_code, content=model.model_dump(mode="json"))
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response
