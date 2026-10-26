"""统一日志与敏感信息去敏。"""

import logging
import re
import sys
from contextvars import ContextVar

_URL_RE = re.compile(r"\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s'\"<>]+")
_ANONYMOUS_PATHS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^/api/v1/polls/[^/]+/votes$"), "/api/v1/polls/{poll_id}/votes"),
    (re.compile(r"^/api/v1/polls/[^/]+/unlock$"), "/api/v1/polls/{poll_id}/unlock"),
)
_TEMPLATED_PATHS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^/api/v1/shares/[^/]+$"), "/api/v1/shares/{share_code}"),
)

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
anonymous_observation_var: ContextVar[bool] = ContextVar("anonymous_observation", default=False)

_configured = False


def redact_secrets(text: str) -> str:
    """去掉文本中的连接串。

    Args:
        text: 原始日志或异常文本。

    Returns:
        连接串被替换后的文本。
    """
    return _URL_RE.sub("***", text)


def classify_path(path: str) -> tuple[bool, str]:
    """判断路径是否属于匿名参与观测，并给出可写入日志的路由模板。

    Args:
        path: 不含查询串的请求路径。

    Returns:
        是否按匿名链路记录，以及去掉定位码或场次编号后的模板。
    """
    for pattern, template in _ANONYMOUS_PATHS:
        if pattern.fullmatch(path):
            return True, template
    for pattern, template in _TEMPLATED_PATHS:
        if pattern.fullmatch(path):
            return False, template
    return False, path


class RedactionFilter(logging.Filter):
    """过滤日志中的连接串，并在匿名链路上去掉请求标识。"""

    def filter(self, record: logging.LogRecord) -> bool:
        """就地清理一条日志。

        Args:
            record: 待输出的日志记录。

        Returns:
            始终返回 True，表示记录仍要输出。
        """
        message = redact_secrets(record.getMessage())
        if anonymous_observation_var.get():
            request_id = request_id_var.get()
            if request_id:
                message = message.replace(request_id, "")
        if message != record.getMessage():
            record.msg = message
            record.args = ()
        return True


def setup_logging() -> logging.Logger:
    """配置名为 voting 的日志器。

    Returns:
        已配置的应用日志器。
    """
    global _configured
    logger = logging.getLogger("voting")
    logger.setLevel(logging.INFO)
    if _configured:
        return logger
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    handler.addFilter(RedactionFilter())
    logger.addHandler(handler)
    _configured = True
    return logger


def get_logger(name: str) -> logging.Logger:
    """取得应用日志器的子日志器。

    Args:
        name: 子日志器名称。

    Returns:
        会传播到 voting 日志器的子日志器。
    """
    setup_logging()
    return logging.getLogger(f"voting.{name}")
