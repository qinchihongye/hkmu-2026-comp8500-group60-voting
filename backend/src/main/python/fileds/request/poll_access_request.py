"""私密投票解锁参数。密码不裁剪，也不进入响应。"""

from pydantic import field_validator

from src.main.python.fileds.request.request import BaseRequestData
from src.main.python.utils.security_util import check_access_password


class UnlockRequest(BaseRequestData):
    """用分享码和访问密码换取短期授权。

    Attributes:
        share_code: 这场投票的分享码。
        password: 访问密码。不裁剪。
    """

    share_code: str
    password: str

    @field_validator("share_code")
    @classmethod
    def check_share_code(cls, value: str) -> str:
        """拒绝空的或过长的分享码。不改写内容。

        Args:
            value: 提交的分享码。

        Returns:
            原分享码。

        Raises:
            ValueError: 分享码为空或超过 128 个字符。
        """
        if not value or len(value) > 128:
            raise ValueError("分享码不合法")
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        """检查访问密码非空。不限制长度。

        Args:
            value: 提交的密码。

        Returns:
            原密码。
        """
        return check_access_password(value)
