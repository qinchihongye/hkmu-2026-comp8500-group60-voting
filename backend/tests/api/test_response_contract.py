"""统一响应在真实 HTTP 状态上的形状。"""

import logging
from collections.abc import Iterator

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.main.python.constants.error_codes import ApiCode
from src.main.python.fileds.request.request import BaseRequestData, RequestModel
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.response_util import success_body

_SECRET = "super-secret-value"
_ENVELOPE = {"code", "msg", "data", "request_id"}


class _Item(BaseRequestData):
    """契约测试用的创建参数。"""

    label: str
    password: str


def _assert_envelope(body: object) -> dict[str, object]:
    """确认 JSON 只有约定的四个顶层字段。

    Args:
        body: 响应 JSON。

    Returns:
        通过检查的响应对象。
    """
    assert isinstance(body, dict)
    assert set(body) == _ENVELOPE
    assert isinstance(body["code"], int)
    assert isinstance(body["msg"], str)
    assert isinstance(body["request_id"], str) and body["request_id"]
    return body


@pytest.fixture
def contract_client(app: FastAPI) -> Iterator[TestClient]:
    """挂上契约探针后再创建客户端。

    Args:
        app: 测试应用。

    Yields:
        可以触发各类状态码的客户端。
    """

    @app.post(
        "/api/v1/_contract/items", status_code=201, response_model=ResponseModel[dict[str, str]]
    )
    def create_item(
        payload: RequestModel[_Item], request: Request
    ) -> ResponseModel[dict[str, str]]:
        """返回创建结果，保持路由声明的 201。

        Args:
            payload: 统一请求外壳。
            request: 当前 HTTP 请求。

        Returns:
            创建成功的响应体。
        """
        return success_body(request, {"label": payload.data.label}, msg="created")

    @app.get("/api/v1/_contract/private")
    def private() -> None:
        """用业务异常检查响应头是否保留。

        Raises:
            AppError: 固定的未登录错误。
        """
        raise AppError(
            401,
            ApiCode.UNAUTHENTICATED,
            ApiCode.UNAUTHENTICATED.default_message,
            headers={
                "Retry-After": "30",
                "Cache-Control": "no-store",
                "Set-Cookie": "voting_session=abc; HttpOnly; Path=/",
            },
        )

    @app.get("/api/v1/_contract/forbidden")
    def forbidden() -> None:
        """触发 403。

        Raises:
            AppError: 固定的无权限错误。
        """
        raise AppError(403, ApiCode.FORBIDDEN, ApiCode.FORBIDDEN.default_message)

    @app.get("/api/v1/_contract/crash")
    def crash() -> None:
        """触发带连接串的未预期异常。异常文本不得进入响应。

        Raises:
            RuntimeError: 含有连接串的内部故障。
        """
        raise RuntimeError(
            "postgresql://voting:secret-db-password@127.0.0.1:1/voting and " + _SECRET
        )

    with TestClient(app) as test_client:
        yield test_client


def test_create_success_stays_201(contract_client: TestClient) -> None:
    """创建成功保持 HTTP 201，而不是被包成 200。"""
    response = contract_client.post(
        "/api/v1/_contract/items",
        json={"data": {"label": "班长", "password": _SECRET}},
    )
    body = _assert_envelope(response.json())

    assert response.status_code == 201
    assert body["code"] == 0
    assert body["data"] == {"label": "班长"}
    assert _SECRET not in response.text


def test_validation_and_extra_fields_use_422(contract_client: TestClient) -> None:
    """缺 data、data 为 null、外层或内层多余字段都返回 422，且不回显密码。"""
    cases = [
        {},
        {"data": None},
        {"data": {"label": "班长", "password": _SECRET}, "role": "ADMIN"},
        {"data": {"label": "班长", "password": _SECRET, "lifecycle": "OPEN"}},
        {"data": {"label": 1, "password": _SECRET}},
    ]

    for payload in cases:
        response = contract_client.post("/api/v1/_contract/items", json=payload)
        body = _assert_envelope(response.json())
        assert response.status_code == 422
        assert body["code"] == int(ApiCode.VALIDATION_ERROR)
        assert isinstance(body["data"], dict)
        errors = body["data"]["errors"]
        assert isinstance(errors, list) and errors
        assert all(set(item) == {"field", "message"} for item in errors)
        assert _SECRET not in response.text


def test_status_errors_share_the_envelope(
    contract_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """401、403、404、405、415、500、503 使用同一外壳，并保留特殊响应头。"""
    with caplog.at_level(logging.DEBUG):
        unauthorized = contract_client.get("/api/v1/_contract/private")
        forbidden = contract_client.get("/api/v1/_contract/forbidden")
        missing = contract_client.get("/api/v1/missing")
        method = contract_client.post("/api/v1/health/live", json={})
        media = contract_client.post(
            "/api/v1/health/live",
            content=b"plain",
            headers={"Content-Type": "text/plain"},
        )
        crashed = contract_client.get("/api/v1/_contract/crash")
        unavailable = contract_client.get("/api/v1/health/ready")
        anonymous = contract_client.post(
            "/api/v1/polls/15/votes",
            json={"data": {"option_ids": [1]}},
        )

    expectations = [
        (unauthorized, 401, ApiCode.UNAUTHENTICATED),
        (forbidden, 403, ApiCode.FORBIDDEN),
        (missing, 404, ApiCode.NOT_FOUND),
        (method, 405, ApiCode.METHOD_NOT_ALLOWED),
        (media, 415, ApiCode.UNSUPPORTED_MEDIA_TYPE),
        (crashed, 500, ApiCode.INTERNAL_ERROR),
        (unavailable, 503, ApiCode.SERVICE_UNAVAILABLE),
    ]
    for response, status_code, code in expectations:
        body = _assert_envelope(response.json())
        assert response.status_code == status_code
        assert body["code"] == int(code)
        assert "secret-db-password" not in response.text
        assert _SECRET not in response.text

    assert unauthorized.headers["retry-after"] == "30"
    assert unauthorized.headers["cache-control"] == "no-store"
    assert "voting_session=abc" in unauthorized.headers["set-cookie"]
    assert "Allow" in method.headers

    anonymous_body = _assert_envelope(anonymous.json())
    logged = "\n".join(
        record.getMessage() for record in caplog.records if record.name.startswith("voting")
    )
    assert anonymous_body["request_id"] not in logged
    assert "/api/v1/polls/15/votes" not in logged
    assert "/api/v1/polls/{poll_id}/votes" in logged
    assert "secret-db-password" not in logged


def test_openapi_error_schema_matches_runtime(app: FastAPI, client: TestClient) -> None:
    """OpenAPI 中的统一响应只声明四个顶层字段，并与实际 404 一致。"""
    schema = app.openapi()
    envelopes = list(_envelope_schemas(schema))
    missing = client.get("/api/v1/missing")

    assert envelopes
    for envelope in envelopes:
        assert set(envelope["properties"]) == _ENVELOPE
        assert envelope.get("additionalProperties") is False
    assert set(missing.json()) == _ENVELOPE


def _envelope_schemas(node: object) -> Iterator[dict[str, object]]:
    """找出声明了统一响应四字段的对象结构。

    Args:
        node: OpenAPI 文档中的任意节点。

    Yields:
        含 code、msg、data、request_id 的 schema。
    """
    if isinstance(node, dict):
        properties = node.get("properties")
        if isinstance(properties, dict) and _ENVELOPE <= set(properties):
            yield node
        for value in node.values():
            yield from _envelope_schemas(value)
    elif isinstance(node, list):
        for item in node:
            yield from _envelope_schemas(item)
