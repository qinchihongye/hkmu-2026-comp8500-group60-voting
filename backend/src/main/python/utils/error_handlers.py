"""把框架异常和业务异常收成统一响应。"""

import traceback
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.main.python.config.logger_config import (
    anonymous_observation_var,
    get_logger,
    redact_secrets,
)
from src.main.python.constants.error_codes import ApiCode, api_code_for_status
from src.main.python.fileds.response.response import FieldError, ResponseModel, ValidationErrorData
from src.main.python.utils.response_util import error_body, json_from_model, request_id_of

logger = get_logger("errors")


class AppError(Exception):
    """调用方已经确定的业务错误。

    Attributes:
        status_code: 要保留的 HTTP 状态码。
        code: 数值业务码。
        msg: 对外说明。
        data: 放进响应 data 的附加内容。
        headers: 需要原样保留的响应头。
    """

    def __init__(
        self,
        status_code: int,
        code: ApiCode,
        msg: str,
        *,
        data: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        """记录业务错误的状态、业务码和响应头。

        Args:
            status_code: HTTP 状态码。
            code: 数值业务码。
            msg: 对外说明。
            data: 附加响应数据。
            headers: 不能被统一外壳去掉的响应头。
        """
        super().__init__(msg)
        self.status_code = status_code
        self.code = code
        self.msg = msg
        self.data = data
        self.headers = headers


def error_response_declarations() -> dict[int, dict[str, Any]]:
    """给出 OpenAPI 中与实际错误体一致的响应声明。

    Returns:
        HTTP 状态到响应模型的映射。
    """
    plain = {"model": ResponseModel[None]}
    return {
        401: dict(plain),
        403: dict(plain),
        404: dict(plain),
        405: dict(plain),
        409: dict(plain),
        415: dict(plain),
        422: {"model": ResponseModel[ValidationErrorData | None]},
        429: dict(plain),
        500: dict(plain),
        502: dict(plain),
        503: dict(plain),
        504: dict(plain),
    }


def _validation_data(exc: RequestValidationError) -> ValidationErrorData:
    """把校验异常收成字段位置和说明。

    Args:
        exc: FastAPI 的请求校验异常。

    Returns:
        不含提交值、Cookie 或完整请求体的错误数据。
    """
    errors: list[FieldError] = []
    for error in exc.errors():
        loc = [str(item) for item in error.get("loc", ())]
        errors.append(FieldError(field=_field_path(loc), message=_safe_validation_message(error)))
    if not errors:
        errors.append(FieldError(field="body", message=ApiCode.VALIDATION_ERROR.default_message))
    return ValidationErrorData(errors=errors)


def _field_path(loc: list[str]) -> str:
    """把校验位置收成不含 body 外壳的字段路径。

    Args:
        loc: Pydantic 报告的位置。

    Returns:
        以点连接的路径。没有位置时为 body。
    """
    parts = [item for item in loc if item != "body"]
    return ".".join(parts) if parts else "body"


def _safe_validation_message(error: dict[str, Any]) -> str:
    """去掉框架前缀，并避免把字符串原文带回响应。

    Args:
        error: Pydantic 的单条错误。

    Returns:
        可以展示的说明。
    """
    message = str(error.get("msg", ApiCode.VALIDATION_ERROR.default_message))
    message = message.removeprefix("Value error, ")
    raw_input = error.get("input")
    if isinstance(raw_input, str) and raw_input and raw_input in message:
        message = message.replace(raw_input, "***")
    return message


def log_unexpected_error(request: Request, exc: Exception) -> None:
    """记录未预期异常的类型和堆栈。

    不记录异常消息，避免把连接串、密码或请求正文写入日志。堆栈里的连接串仍会去掉。
    匿名链路不写请求标识。

    Args:
        request: 当前 HTTP 请求。
        exc: 未预期异常。
    """
    redacted = redact_secrets("".join(traceback.format_tb(exc.__traceback__)))
    error_type = type(exc).__name__
    if anonymous_observation_var.get() or getattr(request.state, "anonymous_observation", False):
        logger.error("未预期故障 type=%s\n%s", error_type, redacted)
        return
    logger.error(
        "未预期故障 type=%s request_id=%s\n%s",
        error_type,
        request_id_of(request),
        redacted,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """注册统一异常处理。校验失败和框架的 404、405 也走同一外壳。

    Args:
        app: FastAPI 应用。
    """

    @app.exception_handler(AppError)
    def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        """输出已识别的业务错误。

        Args:
            request: 当前 HTTP 请求。
            exc: 业务异常。

        Returns:
            保留原状态码和响应头的统一 JSON。
        """
        body = error_body(request, exc.code, exc.msg, data=exc.data)
        return json_from_model(body, exc.status_code, exc.headers)

    @app.exception_handler(StarletteHTTPException)
    def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """输出框架 HTTP 错误，不转发异常 detail 里可能出现的连接信息。

        Args:
            request: 当前 HTTP 请求。
            exc: 框架 HTTP 异常。

        Returns:
            统一 JSON 响应。
        """
        code = api_code_for_status(exc.status_code)
        known = next((item for item in ApiCode if int(item) == code), None)
        msg = known.default_message if known is not None else "请求失败"
        headers = {key: value for key, value in (exc.headers or {}).items()}
        return json_from_model(error_body(request, code, msg), exc.status_code, headers or None)

    @app.exception_handler(RequestValidationError)
    def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        """输出参数错误，不回显提交值。

        Args:
            request: 当前 HTTP 请求。
            exc: 请求校验异常。

        Returns:
            HTTP 422 的统一 JSON。
        """
        body = error_body(
            request,
            ApiCode.VALIDATION_ERROR,
            ApiCode.VALIDATION_ERROR.default_message,
            data=_validation_data(exc),
        )
        return json_from_model(body, 422)

    @app.exception_handler(Exception)
    def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        """输出未预期故障。对外只有固定说明。

        Args:
            request: 当前 HTTP 请求。
            exc: 未预期异常。

        Returns:
            HTTP 500 的统一 JSON。
        """
        log_unexpected_error(request, exc)
        body = error_body(request, ApiCode.INTERNAL_ERROR, ApiCode.INTERNAL_ERROR.default_message)
        return json_from_model(body, 500)
