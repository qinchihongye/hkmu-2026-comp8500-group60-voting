"""账户注册、登录、恢复和注销。"""

from datetime import timedelta

from pwdlib import PasswordHash
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.config.logger_config import get_logger
from src.main.python.constants.enums import UserRole
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import AuthSession, User
from src.main.python.fileds.context import LoginResult, Principal, SessionContext
from src.main.python.fileds.request.auth_request import LoginRequest, RegisterRequest
from src.main.python.fileds.response.auth_response import SessionPublic, UserPublic
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.security_util import (
    dummy_password_hash,
    hash_token,
    new_secret,
    verify_password,
)

logger = get_logger("auth")


class AuthService:
    """账户会话服务。每次调用使用自己的数据库会话。

    Attributes:
        _factory: 会话工厂。
        _clock: 服务端时钟。
        _passwords: Argon2 散列器。
        _session_ttl_hours: 会话有效小时数，不自动续期。
        _dummy_hash: 用户不存在时仍执行的密码核对。
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        clock: Clock,
        passwords: PasswordHash,
        session_ttl_hours: int,
    ) -> None:
        """保存会话工厂、时钟和密码散列器。

        Args:
            session_factory: 数据库会话工厂。
            clock: 服务端 UTC 时钟。
            passwords: Argon2 散列器。
            session_ttl_hours: 新会话的有效小时数。
        """
        self._factory = session_factory
        self._clock = clock
        self._passwords = passwords
        self._session_ttl_hours = session_ttl_hours
        self._dummy_hash = dummy_password_hash(passwords)

    def register(self, payload: RegisterRequest) -> UserPublic:
        """注册普通账户。角色固定为 USER。

        Args:
            payload: 已通过字段校验的注册参数。

        Returns:
            不含密码的公开身份。

        Raises:
            AppError: 用户名已存在、字段仍被数据库拒绝，或数据库不可用。
        """
        with self._factory() as session:
            user = User(
                username=payload.username,
                display_name=payload.display_name,
                password_hash=self._passwords.hash(payload.password),
                role=UserRole.USER,
            )
            session.add(user)
            try:
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                self._raise_register_conflict(exc)
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
            logger.info("注册成功 user_id=%s", user.id)
            return _user_public(user)

    def login(self, payload: LoginRequest) -> LoginResult:
        """核对密码并创建会话。失败时不说明用户名是否存在。

        Args:
            payload: 已规范化用户名的登录参数。

        Returns:
            原令牌和公开会话资料。

        Raises:
            AppError: 凭据错误、账户停用或数据库不可用。
        """
        with self._factory() as session:
            try:
                user = session.scalar(select(User).where(User.username == payload.username))
                stored = user.password_hash if user is not None else self._dummy_hash
                matched = verify_password(self._passwords, payload.password, stored)
                if user is None or not user.is_active or not matched:
                    logger.info("登录失败")
                    raise AppError(
                        401,
                        ApiCode.INVALID_CREDENTIALS,
                        ApiCode.INVALID_CREDENTIALS.default_message,
                    )
                raw_token = new_secret()
                csrf_token = new_secret()
                expires_at = self._clock.now() + timedelta(hours=self._session_ttl_hours)
                session.add(
                    AuthSession(
                        user_id=user.id,
                        token_hash=hash_token(raw_token),
                        csrf_token=csrf_token,
                        expires_at=expires_at,
                    )
                )
                session.commit()
            except AppError:
                raise
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None
            public = SessionPublic(
                user=_user_public(user),
                csrf_token=csrf_token,
                session_expires_at=expires_at,
            )
            return LoginResult(raw_token=raw_token, session=public)

    def authenticate(self, raw_token: str | None) -> SessionContext:
        """按 Cookie 中的原令牌恢复有效会话。

        Args:
            raw_token: Cookie 中的原令牌。没有时视为未登录。

        Returns:
            不含原令牌的会话上下文。

        Raises:
            AppError: 会话缺失、过期、账户停用或数据库不可用。
        """
        context = self.active_session(raw_token)
        if context is None:
            raise AppError(401, ApiCode.UNAUTHENTICATED, ApiCode.UNAUTHENTICATED.default_message)
        return context

    def active_session(self, raw_token: str | None) -> SessionContext | None:
        """查找仍有效的会话。停用和过期都视为没有会话。

        Args:
            raw_token: Cookie 中的原令牌。

        Returns:
            有效会话；没有时为空。

        Raises:
            AppError: 数据库不可用。
        """
        if not raw_token:
            return None
        with self._factory() as session:
            try:
                found = self._active_row(session, raw_token)
            except SQLAlchemyError:
                raise _unavailable() from None
            if found is None:
                return None
            row, user = found
            return _session_context(user, row)

    def logout(self, raw_token: str | None) -> None:
        """删除与原令牌对应的会话。没有会话时也视为完成。

        Args:
            raw_token: Cookie 中的原令牌。

        Raises:
            AppError: 数据库不可用。
        """
        if not raw_token:
            return
        with self._factory() as session:
            try:
                session.execute(
                    delete(AuthSession).where(AuthSession.token_hash == hash_token(raw_token))
                )
                session.commit()
            except SQLAlchemyError:
                session.rollback()
                raise _unavailable() from None

    def _active_row(self, session: Session, raw_token: str) -> tuple[AuthSession, User] | None:
        """读取未过期且账户仍启用的会话。

        Args:
            session: 当前数据库会话。
            raw_token: Cookie 中的原令牌。

        Returns:
            会话和账户；任一条件不满足时为空。
        """
        row = session.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_token(raw_token))
        )
        if row is None or row.expires_at <= self._clock.now():
            return None
        user = session.get(User, row.user_id)
        if user is None or not user.is_active:
            return None
        return row, user

    def _raise_register_conflict(self, exc: IntegrityError) -> None:
        """把用户名冲突转换成业务错误。

        Args:
            exc: 数据库完整性异常。

        Raises:
            AppError: 用户名已占用，或其他不能对外展示细节的约束失败。
        """
        if _constraint_name(exc) == "users_username_key":
            raise AppError(409, ApiCode.USERNAME_TAKEN, ApiCode.USERNAME_TAKEN.default_message)
        logger.error("注册被数据库拒绝")
        raise AppError(422, ApiCode.VALIDATION_ERROR, ApiCode.VALIDATION_ERROR.default_message)


def _user_public(user: User) -> UserPublic:
    """复制可公开的账户字段。

    Args:
        user: 已加载的账户。

    Returns:
        不含密码散列的身份。
    """
    return UserPublic(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
    )


def _session_context(user: User, row: AuthSession) -> SessionContext:
    """把账户和会话行收成内部上下文。

    Args:
        user: 启用中的账户。
        row: 未过期的会话。

    Returns:
        不含原令牌的会话上下文。
    """
    return SessionContext(
        principal=Principal(user_id=user.id, role=user.role),
        user=_user_public(user),
        csrf_token=row.csrf_token,
        expires_at=row.expires_at,
    )


def _constraint_name(exc: IntegrityError) -> str | None:
    """读取数据库报告的约束名。

    Args:
        exc: 完整性异常。

    Returns:
        约束名；驱动没有提供时为空。
    """
    diag = getattr(exc.orig, "diag", None)
    if diag is None:
        return None
    return diag.constraint_name


def _unavailable() -> AppError:
    """构造不包含连接信息的数据库不可用错误。

    Returns:
        HTTP 503 的业务异常。
    """
    logger.error("数据库暂时不可用")
    return AppError(503, ApiCode.SERVICE_UNAVAILABLE, ApiCode.SERVICE_UNAVAILABLE.default_message)
