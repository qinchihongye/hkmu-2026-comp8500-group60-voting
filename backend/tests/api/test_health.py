"""健康检查接口。"""

import logging

import pytest
from fastapi.testclient import TestClient

_SECRET = "secret-db-password"


def test_live_is_ok_when_database_is_down(client: TestClient) -> None:
    """数据库不可达时，存活检查仍返回 200，且响应不含连接信息。"""
    response = client.get("/api/v1/health/live")
    body = response.json()

    assert response.status_code == 200
    assert set(body) == {"code", "msg", "data", "request_id"}
    assert body["code"] == 0
    assert body["data"] == {"status": "live"}
    assert body["request_id"]
    assert _SECRET not in response.text
    assert "postgresql://" not in response.text


def test_ready_hides_database_failure(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    """数据库不可达时就绪检查返回 503，响应和本应用日志都不含连接串。"""
    with caplog.at_level(logging.DEBUG):
        response = client.get("/api/v1/health/ready")
    body = response.json()
    logged = "\n".join(
        record.getMessage() for record in caplog.records if record.name.startswith("voting")
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    assert set(body) == {"code", "msg", "data", "request_id"}
    assert body["code"] == 50301
    assert body["msg"] == "服务暂时不可用"
    assert body["data"] is None
    assert _SECRET not in response.text
    assert "postgresql://" not in response.text
    assert _SECRET not in logged
    assert "postgresql://" not in logged
