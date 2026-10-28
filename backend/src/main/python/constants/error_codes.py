"""数值业务码。

响应里的 code 使用这里的整数。名称保留计划中的语义，便于前后端对照。
"""

from enum import IntEnum


class ApiCode(IntEnum):
    """应用 API 的数值业务码。"""

    OK = 0
    UNAUTHENTICATED = 40101
    INVALID_CREDENTIALS = 40102
    FORBIDDEN = 40301
    CSRF_FAILED = 40302
    RESULTS_NOT_AVAILABLE = 40303
    POLL_PASSWORD_INVALID = 40304
    POLL_ACCESS_REQUIRED = 40305
    NOT_FOUND = 40400
    POLL_NOT_FOUND = 40401
    METHOD_NOT_ALLOWED = 40500
    ALREADY_VOTED = 40901
    POLL_NOT_OPEN = 40902
    POLL_IMMUTABLE = 40903
    STALE_POLL_VERSION = 40904
    USERNAME_TAKEN = 40905
    POLL_CAPACITY_REACHED = 40906
    UNSUPPORTED_MEDIA_TYPE = 41500
    VALIDATION_ERROR = 42201
    INVALID_OPTION = 42202
    INVALID_SELECTION_COUNT = 42203
    TOO_MANY_ATTEMPTS = 42901
    INTERNAL_ERROR = 50000
    POLL_PARSE_INVALID_OUTPUT = 50201
    SERVICE_UNAVAILABLE = 50301
    SUBMISSION_STATUS_UNKNOWN = 50302
    POLL_PARSE_DISABLED = 50303
    POLL_PARSE_UNAVAILABLE = 50304
    POLL_PARSE_TIMEOUT = 50401

    @property
    def default_message(self) -> str:
        """返回该业务码的默认对外说明。

        Returns:
            不含连接串、密码或请求正文的简短说明。
        """
        return _DEFAULT_MESSAGES[self]


_DEFAULT_MESSAGES: dict[ApiCode, str] = {
    ApiCode.OK: "ok",
    ApiCode.UNAUTHENTICATED: "需要登录",
    ApiCode.INVALID_CREDENTIALS: "用户名或密码错误",
    ApiCode.FORBIDDEN: "没有权限",
    ApiCode.CSRF_FAILED: "请求来源校验失败",
    ApiCode.RESULTS_NOT_AVAILABLE: "结果尚未公布",
    ApiCode.POLL_PASSWORD_INVALID: "投票密码错误",
    ApiCode.POLL_ACCESS_REQUIRED: "需要先完成本场访问验证",
    ApiCode.NOT_FOUND: "资源不存在",
    ApiCode.POLL_NOT_FOUND: "投票不存在",
    ApiCode.METHOD_NOT_ALLOWED: "请求方法不被允许",
    ApiCode.ALREADY_VOTED: "你已参与本次投票",
    ApiCode.POLL_NOT_OPEN: "当前不能参与这次投票",
    ApiCode.POLL_IMMUTABLE: "已发布的投票不能修改",
    ApiCode.STALE_POLL_VERSION: "投票已被其他人更新，请刷新后重试",
    ApiCode.USERNAME_TAKEN: "用户名已被使用",
    ApiCode.POLL_CAPACITY_REACHED: "This poll has reached its ballot limit.",
    ApiCode.UNSUPPORTED_MEDIA_TYPE: "不支持的内容类型",
    ApiCode.VALIDATION_ERROR: "请求参数不合法",
    ApiCode.INVALID_OPTION: "选项不属于这次投票",
    ApiCode.INVALID_SELECTION_COUNT: "The number of selected options is not allowed.",
    ApiCode.TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试",
    ApiCode.INTERNAL_ERROR: "服务内部错误",
    ApiCode.POLL_PARSE_INVALID_OUTPUT: "Poll text recognition returned an unusable result.",
    ApiCode.SERVICE_UNAVAILABLE: "服务暂时不可用",
    ApiCode.SUBMISSION_STATUS_UNKNOWN: "提交结果待确认，请查询本人参与状态",
    ApiCode.POLL_PARSE_DISABLED: "Poll text recognition is turned off.",
    ApiCode.POLL_PARSE_UNAVAILABLE: "Poll text recognition is unavailable.",
    ApiCode.POLL_PARSE_TIMEOUT: "Poll text recognition timed out.",
}

_STATUS_CODES: dict[int, ApiCode] = {
    401: ApiCode.UNAUTHENTICATED,
    403: ApiCode.FORBIDDEN,
    404: ApiCode.NOT_FOUND,
    405: ApiCode.METHOD_NOT_ALLOWED,
    415: ApiCode.UNSUPPORTED_MEDIA_TYPE,
    422: ApiCode.VALIDATION_ERROR,
    429: ApiCode.TOO_MANY_ATTEMPTS,
    500: ApiCode.INTERNAL_ERROR,
    503: ApiCode.SERVICE_UNAVAILABLE,
}


def api_code_for_status(status_code: int) -> int:
    """把框架 HTTP 状态映射到默认业务码。

    Args:
        status_code: HTTP 状态码。

    Returns:
        已约定的业务码。未单列的状态使用该状态乘以 100，避免与成功码 0 相混。
    """
    code = _STATUS_CODES.get(status_code)
    if code is None:
        return status_code * 100
    return int(code)
