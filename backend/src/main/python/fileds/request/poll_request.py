"""创建和修改投票的请求参数。未知字段会被外壳拒绝。"""

from datetime import datetime

from pydantic import Field, StrictInt, field_validator, model_validator

from src.main.python.constants.enums import IdentityMode, SelectionMode, Visibility
from src.main.python.constants.limits import MAX_VOTE_LIMIT
from src.main.python.fileds.request.request import BaseRequestData
from src.main.python.utils.security_util import check_access_password


class OptionInput(BaseRequestData):
    """一个选项的提交文本。

    Attributes:
        label: 去掉首尾空白后的选项文本。
    """

    label: str

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        """去掉选项首尾空白并检查长度。

        Args:
            value: 提交的选项文本。

        Returns:
            规范化后的文本。

        Raises:
            ValueError: 长度不在 1 到 200 个字符之间。
        """
        stripped = value.strip()
        if not 1 <= len(stripped) <= 200:
            raise ValueError("选项长度需为 1 到 200 个字符")
        return stripped


class _PollFields(BaseRequestData):
    """草稿可改的投票字段。创建和更新共用这些校验。

    Attributes:
        title: 标题。
        description: 说明。空白会变成空值。
        starts_at: 开始时间，必须带时区。
        ends_at: 结束时间，必须晚于开始时间。
        identity_mode: 记名方式。
        visibility: 公开性。
        access_password: 私密投票密码。公开投票不能携带。
        vote_limit: 整场最多接收的选票份数。为空表示不限，填写时为 1 到 100000。
        selection_mode: 一份选票是单选还是多选。
        options: 2 到 10 个选项。
    """

    title: str
    description: str | None = None
    starts_at: datetime
    ends_at: datetime
    identity_mode: IdentityMode
    visibility: Visibility
    access_password: str | None = None
    vote_limit: StrictInt | None = Field(default=None, ge=1, le=MAX_VOTE_LIMIT)
    selection_mode: SelectionMode = SelectionMode.SINGLE
    options: list[OptionInput] = Field(min_length=2, max_length=10)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        """去掉标题首尾空白并检查长度。

        Args:
            value: 提交的标题。

        Returns:
            规范化后的标题。

        Raises:
            ValueError: 长度不在 1 到 120 个字符之间。
        """
        stripped = value.strip()
        if not 1 <= len(stripped) <= 120:
            raise ValueError("标题长度需为 1 到 120 个字符")
        return stripped

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        """把空白说明收成空值。

        Args:
            value: 提交的说明。

        Returns:
            去掉首尾空白后的说明。全空白时为空。

        Raises:
            ValueError: 说明超过 2000 个字符。
        """
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 2000:
            raise ValueError("说明不能超过 2000 个字符")
        return stripped

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        """拒绝没有时区的时间。

        Args:
            value: 提交的时刻。

        Returns:
            带时区的原时刻。

        Raises:
            ValueError: 时间没有时区。
        """
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("时间必须带时区")
        return value

    @field_validator("access_password")
    @classmethod
    def check_secret(cls, value: str | None) -> str | None:
        """检查已提交的访问密码非空。不裁剪内容。

        Args:
            value: 访问密码。未提交时为空。

        Returns:
            原密码或空值。
        """
        if value is None:
            return None
        return check_access_password(value)

    @model_validator(mode="after")
    def check_shape(self) -> "_PollFields":
        """检查时间顺序、选项重复和公开性与密码的搭配。

        Returns:
            通过检查的模型。

        Raises:
            ValueError: 时间、选项或密码与公开性不匹配。
        """
        if self.ends_at <= self.starts_at:
            raise ValueError("结束时间必须晚于开始时间")
        labels = [item.label for item in self.options]
        if len(labels) != len(set(labels)):
            raise ValueError("选项文本不能重复")
        if self.visibility == Visibility.PUBLIC and self.access_password is not None:
            raise ValueError("公开投票不能设置访问密码")
        if self.selection_mode == SelectionMode.MULTIPLE and len(self.options) < 3:
            raise ValueError("Multiple choices need at least three options.")
        return self


class PollCreate(_PollFields):
    """新建草稿。私密投票必须带访问密码。"""

    @model_validator(mode="after")
    def require_private_secret(self) -> "PollCreate":
        """私密草稿必须带访问密码。

        Returns:
            通过检查的模型。

        Raises:
            ValueError: 私密投票没有密码。
        """
        if self.visibility == Visibility.PRIVATE and self.access_password is None:
            raise ValueError("私密投票需要访问密码")
        return self


class PollUpdate(_PollFields):
    """替换草稿内容。未提交新密码时，服务层保留已有明文。

    上限和选择模式必须随这次完整替换一起提交。

    Attributes:
        vote_limit: 整场选票份数上限。空表示不限，填写时为 1 到 100000。
        selection_mode: 一份选票是单选还是多选。
        expected_version: 客户端看到的版本。
    """

    vote_limit: StrictInt | None = Field(ge=1, le=MAX_VOTE_LIMIT)
    selection_mode: SelectionMode
    expected_version: int = Field(ge=1)


class VersionRequest(BaseRequestData):
    """发布或关闭时提交的版本。

    Attributes:
        expected_version: 客户端看到的版本。
    """

    expected_version: int = Field(ge=1)
