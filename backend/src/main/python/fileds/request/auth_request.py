"""注册和登录的请求参数。未知字段会被外壳拒绝。"""

from pydantic import field_validator

from src.main.python.fileds.request.request import BaseRequestData
from src.main.python.utils.security_util import (
    check_password_length,
    normalize_display_name,
    normalize_username,
)


class RegisterRequest(BaseRequestData):
    """公开注册参数。不能提交角色或账户状态。

    Attributes:
        username: 规范化后的用户名。
        display_name: 显示名。
        password: 原密码。只用于计算散列，不进入响应。
    """

    username: str
    display_name: str
    password: str

    @field_validator("username")
    @classmethod
    def normalize_user(cls, value: str) -> str:
        """规范化用户名。

        Args:
            value: 提交的用户名。

        Returns:
            小写且符合字符规则的用户名。
        """
        return normalize_username(value)

    @field_validator("display_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        """规范化显示名。

        Args:
            value: 提交的显示名。

        Returns:
            去掉首尾空白后的显示名。
        """
        return normalize_display_name(value)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        """检查密码长度，不改写内容。

        Args:
            value: 提交的密码。

        Returns:
            原密码。
        """
        return check_password_length(value)


class LoginRequest(BaseRequestData):
    """登录参数。密码不做长度裁剪，错误统一按凭据失败处理。

    Attributes:
        username: 规范化后的用户名。
        password: 原密码。
    """

    username: str
    password: str

    @field_validator("username")
    @classmethod
    def normalize_user(cls, value: str) -> str:
        """规范化用户名。

        Args:
            value: 提交的用户名。

        Returns:
            小写且符合字符规则的用户名。
        """
        return normalize_username(value)
