"""投票请求在进入数据库前拒绝非法形状。"""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.main.python.constants.enums import SelectionMode
from src.main.python.fileds.request.poll_access_request import UnlockRequest
from src.main.python.fileds.request.poll_request import PollCreate, PollUpdate, VersionRequest
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.request.vote_request import VoteRequest

START = datetime(2026, 10, 24, 9, tzinfo=UTC)
END = START + timedelta(hours=2)


def _body(**overrides: object) -> dict[str, object]:
    """组装一份合法的创建参数。

    Args:
        overrides: 要替换的字段。

    Returns:
        可交给 PollCreate 的字典。
    """
    body: dict[str, object] = {
        "title": " 课堂投票 ",
        "description": "  ",
        "starts_at": START,
        "ends_at": END,
        "identity_mode": "NAMED",
        "visibility": "PUBLIC",
        "options": [{"label": " 同意 "}, {"label": "反对"}],
    }
    body.update(overrides)
    return body


def test_poll_create_normalizes_text_and_rejects_shape_errors() -> None:
    """标题和选项去空白；公开带密码、私密缺密码、重复选项都拒绝。"""
    created = PollCreate.model_validate(_body())
    assert created.title == "课堂投票"
    assert created.description is None
    assert created.options[0].label == "同意"

    rejected = [
        _body(visibility="PUBLIC", access_password="access-pass1"),
        _body(visibility="PRIVATE"),
        _body(visibility="PRIVATE", access_password="short"),
        _body(visibility="PRIVATE", access_password="p" * 129),
        _body(options=[{"label": "只有一个"}]),
        _body(options=[{"label": f"项{index}"} for index in range(11)]),
        _body(options=[{"label": " 同意 "}, {"label": "同意"}]),
        _body(starts_at=datetime(2026, 10, 24, 9), ends_at=END),
        _body(ends_at=START),
        _body(title="   "),
        {**_body(), "role": "ADMIN"},
    ]
    for body in rejected:
        with pytest.raises(ValidationError):
            PollCreate.model_validate(body)


def test_vote_limit_accepts_null_and_strict_positive_integers() -> None:
    """上限允许空、1 和 32 位整数最大值，拒绝 0、负数、越界、小数、布尔和字符串。"""
    assert PollCreate.model_validate(_body()).vote_limit is None
    assert PollCreate.model_validate(_body(vote_limit=None)).vote_limit is None
    assert PollCreate.model_validate(_body(vote_limit=1)).vote_limit == 1
    assert PollCreate.model_validate(_body(vote_limit=2147483647)).vote_limit == 2147483647
    for value in (0, -1, 2147483648, 1.5, True, "10"):
        with pytest.raises(ValidationError):
            PollCreate.model_validate(_body(vote_limit=value))


def test_multiple_requires_three_real_options() -> None:
    """两项不能多选；空白第三行不算有效选项；三项可以多选。"""
    created = PollCreate.model_validate(_body())
    assert created.selection_mode == SelectionMode.SINGLE
    multiple = PollCreate.model_validate(
        _body(
            selection_mode="MULTIPLE",
            options=[{"label": "甲"}, {"label": "乙"}, {"label": "丙"}],
        )
    )
    assert multiple.selection_mode == SelectionMode.MULTIPLE
    with pytest.raises(ValidationError):
        PollCreate.model_validate(_body(selection_mode="MULTIPLE"))
    with pytest.raises(ValidationError):
        PollCreate.model_validate(
            _body(
                selection_mode="MULTIPLE",
                options=[{"label": "甲"}, {"label": "乙"}, {"label": "   "}],
            )
        )


def test_poll_update_requires_explicit_limit_and_mode() -> None:
    """草稿更新必须显式提交上限和选择模式，缺省不能悄悄重置。"""
    with pytest.raises(ValidationError):
        PollUpdate.model_validate({**_body(), "expected_version": 1})
    updated = PollUpdate.model_validate(
        {
            **_body(vote_limit=12, selection_mode="SINGLE"),
            "expected_version": 2,
        }
    )
    assert updated.vote_limit == 12
    assert updated.selection_mode == SelectionMode.SINGLE


def test_vote_request_accepts_only_unique_option_ids() -> None:
    """选票只接受不重复的严格正整数数组，不再接受 option_id。"""
    accepted = VoteRequest.model_validate({"option_ids": [3, 4]})
    assert accepted.option_ids == [3, 4]
    rejected = [
        {"option_ids": []},
        {"option_ids": [1, 1]},
        {"option_ids": ["1"]},
        {"option_ids": [True]},
        {"option_ids": [1.5]},
        {"option_ids": [0]},
        {"option_ids": list(range(1, 12))},
        {"option_id": 1},
    ]
    for body in rejected:
        with pytest.raises(ValidationError):
            VoteRequest.model_validate(body)


def test_wrappers_reject_extra_and_bad_version() -> None:
    """外壳和版本请求不接收未声明字段。"""
    with pytest.raises(ValidationError):
        RequestModel[PollCreate].model_validate({"data": _body(), "lifecycle": "OPEN"})
    with pytest.raises(ValidationError):
        VersionRequest.model_validate({"expected_version": 0})
    with pytest.raises(ValidationError):
        UnlockRequest.model_validate({"share_code": "code", "password": "short"})
    updated = PollUpdate.model_validate(
        {
            **_body(visibility="PRIVATE", vote_limit=None, selection_mode="SINGLE"),
            "expected_version": 1,
        }
    )
    assert updated.access_password is None
    assert updated.expected_version == 1
