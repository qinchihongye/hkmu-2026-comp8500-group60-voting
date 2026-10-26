"""公共请求、响应、时钟和数据库工厂的契约。"""

from datetime import UTC

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from src.main.python.config.database_config import (
    create_session_factory,
    dispose_session_factory,
    engine_for,
)
from src.main.python.config.server_config import Settings
from src.main.python.constants.error_codes import ApiCode
from src.main.python.fileds.request.request import BaseRequestData, PageQuery, RequestModel
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.utils.clock_util import Clock
from tests.conftest import build_settings


class _LabelData(BaseRequestData):
    """只含一个标签的测试参数。"""

    label: str


def test_request_rejects_missing_null_and_extra_fields() -> None:
    """写请求必须有对象形式的 data，外层和内层都不能多字段。"""
    with pytest.raises(ValidationError):
        RequestModel[_LabelData].model_validate({})
    with pytest.raises(ValidationError):
        RequestModel[_LabelData].model_validate({"data": None})
    with pytest.raises(ValidationError):
        RequestModel[_LabelData].model_validate({"data": {"label": "票"}, "role": "ADMIN"})
    with pytest.raises(ValidationError):
        RequestModel[_LabelData].model_validate({"data": {"label": "票", "lifecycle": "OPEN"}})

    parsed = RequestModel[_LabelData].model_validate({"data": {"label": "票"}})
    assert parsed.data.label == "票"


def test_response_always_has_four_fields() -> None:
    """成功和空数据响应都保留四个顶层字段。"""
    empty = ResponseModel[dict[str, str]](code=0, msg="ok", data=None, request_id="abc")
    dumped = empty.model_dump(mode="json")

    assert set(dumped) == {"code", "msg", "data", "request_id"}
    assert dumped["data"] is None
    with pytest.raises(ValidationError):
        ResponseModel[dict[str, str]].model_validate(
            {"code": 0, "msg": "ok", "data": None, "request_id": "abc", "error": {}}
        )


def test_page_query_limits() -> None:
    """分页默认值与上下限固定。"""
    query = PageQuery()
    page = Page[str](items=["a"], page=1, page_size=12, total=1)

    assert query.page == 1
    assert query.page_size == 12
    assert page.total == 1
    with pytest.raises(ValidationError):
        PageQuery(page=0, page_size=51)


def test_api_codes_are_numeric() -> None:
    """业务码是整数，成功码为 0。"""
    assert isinstance(ApiCode.OK, int)
    assert int(ApiCode.OK) == 0
    assert int(ApiCode.SERVICE_UNAVAILABLE) == 50301
    assert all(isinstance(code, int) for code in ApiCode)


def test_clock_returns_utc() -> None:
    """时钟返回带 UTC 时区的时间。"""
    moment = Clock().now()

    assert moment.tzinfo is UTC


def test_hmac_key_and_distinct_database_urls() -> None:
    """空密钥可以留在示例中；过短密钥和相同的两个库地址要被拒绝。"""
    settings = build_settings(anon_voter_hmac_key="")
    assert settings.anon_voter_hmac_key == ""
    assert settings.database_url != settings.test_database_url

    with pytest.raises(ValidationError):
        build_settings(anon_voter_hmac_key="short")
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+psycopg://voting:pw@127.0.0.1:1/voting",
            test_database_url="postgresql+psycopg://voting:pw@127.0.0.1:1/voting",
            anon_voter_hmac_key="k" * 32,
        )


def test_session_factory_hides_parameters_and_uses_read_committed() -> None:
    """会话工厂使用 READ COMMITTED，并隐藏 SQL 参数。创建工厂时不连接数据库。"""
    factory = create_session_factory(
        "postgresql+psycopg://voting:secret-db-password@127.0.0.1:1/voting"
    )
    try:
        engine = engine_for(factory)
        assert isinstance(factory, sessionmaker)
        assert engine.hide_parameters is True
        assert engine.dialect._on_connect_isolation_level == "READ COMMITTED"
    finally:
        dispose_session_factory(factory)
