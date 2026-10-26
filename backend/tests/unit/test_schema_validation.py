"""投票请求在进入数据库前拒绝非法形状。"""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.main.python.fileds.request.poll_access_request import UnlockRequest
from src.main.python.fileds.request.poll_request import PollCreate, PollUpdate, VersionRequest
from src.main.python.fileds.request.request import RequestModel

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


def test_wrappers_reject_extra_and_bad_version() -> None:
    """外壳和版本请求不接收未声明字段。"""
    with pytest.raises(ValidationError):
        RequestModel[PollCreate].model_validate({"data": _body(), "lifecycle": "OPEN"})
    with pytest.raises(ValidationError):
        VersionRequest.model_validate({"expected_version": 0})
    with pytest.raises(ValidationError):
        UnlockRequest.model_validate({"share_code": "code", "password": "short"})
    updated = PollUpdate.model_validate({**_body(visibility="PRIVATE"), "expected_version": 1})
    assert updated.access_password is None
    assert updated.expected_version == 1
