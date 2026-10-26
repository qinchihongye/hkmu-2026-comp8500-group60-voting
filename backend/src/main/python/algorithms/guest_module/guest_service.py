"""访客凭据的创建和恢复。"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.config.logger_config import get_logger
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import GuestSession
from src.main.python.fileds.context import GuestContext, GuestInitResult
from src.main.python.fileds.response.guest_response import GuestPublic
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.security_util import hash_token, new_secret

logger = get_logger("guest")


class GuestService:
    """浏览器参与凭据。不关联账户，重复初始化不更换有效令牌。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
        _guest_ttl_days: 新凭据的有效天数。
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        clock: Clock,
        guest_ttl_days: int,
    ) -> None:
        """保存会话工厂、时钟和有效期。

        Args:
            session_factory: 数据库会话工厂。
            clock: 服务端 UTC 时钟。
            guest_ttl_days: 新建凭据的有效天数。
        """
        self._factory = session_factory
        self._clock = clock
        self._guest_ttl_days = guest_ttl_days

    def ensure_context(self, raw_token: str | None) -> GuestInitResult:
        """恢复仍有效的访客凭据，否则新建一条。

        恢复时不返回原令牌，调用方因此不会重写 Cookie。

        Args:
            raw_token: 浏览器已有的访客令牌。没有时新建。

        Returns:
            原令牌是否需要写入 Cookie，以及公开的访客资料。

        Raises:
            AppError: 数据库不可用。
        """
        with self._factory() as session:
            try:
                current = self._active_row(session, raw_token)
                if current is not None:
                    return GuestInitResult(raw_token=None, guest=_guest_public(current))
                created_raw = new_secret()
                expires_at = self._clock.now() + timedelta(days=self._guest_ttl_days)
                created = GuestSession(
                    token_hash=hash_token(created_raw),
                    csrf_token=new_secret(),
                    expires_at=expires_at,
                )
                session.add(created)
                session.commit()
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
            return GuestInitResult(raw_token=created_raw, guest=_guest_public(created))

    def authenticate(self, raw_token: str | None) -> GuestContext | None:
        """按 Cookie 读取仍有效的访客凭据。

        Args:
            raw_token: 浏览器带来的原令牌。

        Returns:
            内部访客上下文。没有或已过期时为空。

        Raises:
            AppError: 数据库不可用。
        """
        if not raw_token:
            return None
        with self._factory() as session:
            try:
                current = self._active_row(session, raw_token)
            except SQLAlchemyError:
                raise _unavailable() from None
            if current is None:
                return None
            return GuestContext(
                guest_session_id=current.id,
                csrf_token=current.csrf_token,
                expires_at=current.expires_at,
                raw_token=raw_token,
            )

    def _active_row(self, session: Session, raw_token: str | None) -> GuestSession | None:
        """查找未过期的访客凭据。

        Args:
            session: 当前数据库会话。
            raw_token: 原令牌。

        Returns:
            仍有效的凭据；没有时为空。
        """
        if not raw_token:
            return None
        row = session.scalar(
            select(GuestSession).where(GuestSession.token_hash == hash_token(raw_token))
        )
        if row is None or row.expires_at <= self._clock.now():
            return None
        return row


def _guest_public(row: GuestSession) -> GuestPublic:
    """复制可公开的访客字段。

    Args:
        row: 访客凭据。

    Returns:
        不含数据库编号和原令牌的资料。
    """
    return GuestPublic(csrf_token=row.csrf_token, expires_at=row.expires_at)


def _unavailable() -> AppError:
    """构造不包含连接信息的数据库不可用错误。

    Returns:
        HTTP 503 的业务异常。
    """
    logger.error("数据库暂时不可用")
    return AppError(503, ApiCode.SERVICE_UNAVAILABLE, ApiCode.SERVICE_UNAVAILABLE.default_message)
