"""记名和匿名各自最多一票，门禁在写入前生效。"""

from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.main.python.algorithms.audit_module.audit_service import AuditService
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import AuditEvent, Vote
from src.main.python.utils.security_util import anonymous_voter_hash
from tests.auth_support import envelope, error_body, post_json
from tests.poll_support import (
    ACCESS_PASSWORD,
    cast,
    clock_of,
    create_poll,
    ensure_guest,
    open_session,
    publish_poll,
    register_and_login,
    share_code_of,
    unlock,
)


def _option(detail: dict[str, object], index: int = 0) -> int:
    """读取详情里的选项编号。

    Args:
        detail: 投票详情。
        index: 选项下标。

    Returns:
        选项主键。
    """
    options = detail["options"]
    assert isinstance(options, list)
    return int(options[index]["id"])


def _vote_count(client: TestClient, poll_id: int) -> int:
    """统计一场投票的选票数。

    Args:
        client: 测试客户端。
        poll_id: 投票主键。

    Returns:
        选票行数。
    """
    with open_session(client) as session:
        total = session.scalar(
            select(func.count()).select_from(Vote).where(Vote.poll_id == poll_id)
        )
    return int(total or 0)


def test_named_vote_once_and_audited(auth_client: TestClient) -> None:
    """记名投票写入账户和审计；第二次返回已投票。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf)
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    option_id = _option(detail)

    first = cast(auth_client, guest_csrf, poll_id, option_id)
    receipt = envelope(first, 201)
    assert set(receipt) == {"receipt_id", "poll_id", "submitted_at"}
    assert receipt["poll_id"] == poll_id
    assert first.headers["cache-control"] == "no-store"
    second = cast(auth_client, guest_csrf, poll_id, option_id)
    error_body(second, 409, int(ApiCode.ALREADY_VOTED))
    assert _vote_count(auth_client, poll_id) == 1

    with open_session(auth_client) as session:
        vote = session.scalar(select(Vote).where(Vote.poll_id == poll_id))
        audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.poll_id == poll_id,
                AuditEvent.action == "VOTE_NAMED",
            )
        )
        assert vote is not None and audit is not None
        assert vote.voter_id == created["creator_id"]
        assert vote.anonymous_voter_hash is None
        assert str(vote.receipt_id) == receipt["receipt_id"]
        assert audit.action == "VOTE_NAMED"
        assert audit.actor_id == vote.voter_id
        assert audit.receipt_id == vote.receipt_id
        assert audit.request_id == first.json()["request_id"]


def test_named_vote_requires_guest_then_account(auth_client: TestClient) -> None:
    """没有访客上下文时不能用账户 CSRF 投票。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf)
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    detail = envelope(auth_client.get(f"/api/v1/me/polls/{poll_id}"), 200)
    option_id = _option(detail)
    missing_guest = post_json(
        auth_client,
        f"/api/v1/polls/{poll_id}/votes",
        {"option_ids": [option_id]},
        csrf=csrf,
    )
    error_body(missing_guest, 403, int(ApiCode.FORBIDDEN))
    assert missing_guest.json()["msg"] == "需要先建立访客上下文"

    with TestClient(auth_client.app) as browser:
        guest_csrf = ensure_guest(browser)
        unauthenticated = cast(browser, guest_csrf, poll_id, option_id)
        error_body(unauthenticated, 401, int(ApiCode.UNAUTHENTICATED))
        assert _vote_count(auth_client, poll_id) == 0


def test_closed_and_foreign_option_do_not_insert(
    auth_app: FastAPI,
    auth_client: TestClient,
) -> None:
    """截止、关闭和其他场次的选项都不会留下选票。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf, identity_mode="ANONYMOUS")
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    other = create_poll(auth_client, csrf, title="另一场", identity_mode="ANONYMOUS")
    other_id = int(other["id"])
    publish_poll(auth_client, csrf, other_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    other_detail = envelope(auth_client.get(f"/api/v1/polls/{other_id}"), 200)

    foreign = cast(auth_client, guest_csrf, poll_id, _option(other_detail))
    error_body(foreign, 422, int(ApiCode.INVALID_OPTION))
    clock_of(auth_client).advance(timedelta(hours=3))
    ended = cast(auth_client, guest_csrf, poll_id, _option(detail))
    error_body(ended, 409, int(ApiCode.POLL_NOT_OPEN))
    assert _vote_count(auth_client, poll_id) == 0
    assert auth_app.state.clock.now() >= clock_of(auth_client).now()


def test_private_vote_requires_grant_even_for_creator(auth_client: TestClient) -> None:
    """创建者能看私密详情，但没有授权时不能投票。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(
        auth_client,
        csrf,
        identity_mode="ANONYMOUS",
        visibility="PRIVATE",
        access_password=ACCESS_PASSWORD,
    )
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    denied = cast(auth_client, guest_csrf, poll_id, _option(detail))
    error_body(denied, 403, int(ApiCode.POLL_ACCESS_REQUIRED))
    unlock(auth_client, guest_csrf, poll_id, share_code_of(auth_client, poll_id))
    accepted = cast(auth_client, guest_csrf, poll_id, _option(detail))
    envelope(accepted, 201)
    assert _vote_count(auth_client, poll_id) == 1


def test_named_audit_failure_rolls_back(auth_client: TestClient, monkeypatch: object) -> None:
    """记名审计失败时选票也不留下。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf)
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/me/polls/{poll_id}"), 200)

    def fail(self: AuditService, *args: object, **kwargs: object) -> None:
        """模拟审计写入失败。

        Args:
            self: 审计服务。
            args: 原位置参数。
            kwargs: 原关键字参数。

        Raises:
            SQLAlchemyError: 始终失败。
        """
        del self, args, kwargs
        raise SQLAlchemyError("audit failed")

    monkeypatch.setattr(AuditService, "record", fail)
    failed = cast(auth_client, guest_csrf, poll_id, _option(detail))
    error_body(failed, 503, int(ApiCode.SERVICE_UNAVAILABLE))
    assert _vote_count(auth_client, poll_id) == 0
    with open_session(auth_client) as session:
        audits = session.scalar(
            select(func.count()).select_from(AuditEvent).where(AuditEvent.action == "VOTE_NAMED")
        )
    assert audits == 0


def test_commit_confirmation_loss_keeps_the_vote(
    auth_client: TestClient,
    monkeypatch: object,
) -> None:
    """提交已经落库但确认丢失时，返回未知状态，查询仍能看到这票。"""
    csrf = register_and_login(auth_client, "ada")
    created = create_poll(auth_client, csrf, identity_mode="ANONYMOUS")
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    real_commit = Session.commit

    def lose_confirmation(self: Session) -> None:
        """先完成提交，再抛出确认丢失。

        Args:
            self: 当前数据库会话。

        Raises:
            SQLAlchemyError: 模拟驱动没有带回提交确认。
        """
        real_commit(self)
        raise SQLAlchemyError("commit confirmation lost")

    monkeypatch.setattr(Session, "commit", lose_confirmation)
    failed = cast(auth_client, guest_csrf, poll_id, _option(detail))
    monkeypatch.setattr(Session, "commit", real_commit)
    error_body(failed, 503, int(ApiCode.SUBMISSION_STATUS_UNKNOWN))
    recovered = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    assert recovered["has_voted"] is True
    assert _vote_count(auth_client, poll_id) == 1
    raw_token = auth_client.cookies.get("voting_guest")
    assert isinstance(raw_token, str)
    with open_session(auth_client) as session:
        vote = session.scalar(select(Vote).where(Vote.poll_id == poll_id))
        assert vote is not None
        assert vote.anonymous_voter_hash == anonymous_voter_hash("k" * 32, poll_id, raw_token)
        assert vote.voter_id is None
