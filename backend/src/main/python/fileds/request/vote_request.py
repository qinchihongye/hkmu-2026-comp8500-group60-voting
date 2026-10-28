"""提交选票的请求。单选和多选都使用选项数组。"""

from pydantic import StrictInt, field_validator

from src.main.python.fileds.request.request import BaseRequestData


class VoteRequest(BaseRequestData):
    """一次选票提交。

    Attributes:
        option_ids: 本次选中的选项。必须属于路径中的那场投票，且不能重复。
    """

    option_ids: list[StrictInt]

    @field_validator("option_ids")
    @classmethod
    def unique_positive_ids(cls, value: list[int]) -> list[int]:
        """拒绝空数组、过多选项、重复项和非正整数。

        Args:
            value: 已通过元素类型检查的选项编号。

        Returns:
            原顺序的选项编号。

        Raises:
            ValueError: 数量不在 1 到 10 之间、编号小于 1，或同一个选项出现多次。
        """
        if len(value) < 1:
            raise ValueError("Select at least one option.")
        if len(value) > 10:
            raise ValueError("Select at most ten options.")
        if any(item < 1 for item in value):
            raise ValueError("Select at least one option.")
        if len(value) != len(set(value)):
            raise ValueError("Select each option once.")
        return value
