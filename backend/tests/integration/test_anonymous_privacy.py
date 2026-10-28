"""已登录用户投匿名票时，不能从回执、审计或日志找回账户。"""

import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main.python.database.models import AuditEvent, Vote
from src.main.python.utils.security_util import anonymous_voter_hash
from tests.auth_support import envelope
from tests.poll_support import (
    audit_actions,
    cast,
    create_poll,
    ensure_guest,
    open_session,
    poll_row,
    publish_poll,
    register_and_login,
)

_KEY = "k" * 32


def _option(detail: dict[str, object]) -> int:
    """读取第一个选项编号。

    Args:
        detail: 投票详情。

    Returns:
        选项主键。
    """
    options = detail["options"]
    assert isinstance(options, list)
    return int(options[0]["id"])


def test_logged_in_anonymous_vote_is_not_linked(
    auth_client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """匿名票不写 voter_id，回执和请求标识也不能在审计或日志里对上账户。"""
    username = "ada_priv"
    display_name = "隐私姓名"
    csrf = register_and_login(auth_client, username, display_name=display_name)
    created = create_poll(auth_client, csrf, identity_mode="ANONYMOUS", title="匿名场")
    other = create_poll(auth_client, csrf, identity_mode="ANONYMOUS", title="另一匿名场")
    poll_id = int(created["id"])
    other_id = int(other["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    publish_poll(auth_client, csrf, other_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    raw_token = auth_client.cookies.get("voting_guest")
    assert isinstance(raw_token, str) and raw_token

    caplog.set_level(logging.INFO, logger="voting")
    caplog.clear()
    response = cast(auth_client, guest_csrf, poll_id, _option(detail))
    receipt = envelope(response, 201)
    assert set(receipt) == {"receipt_id", "poll_id", "submitted_at"}
    request_id = response.json()["request_id"]
    logged = caplog.text
    for secret in (username, display_name, raw_token, request_id, str(receipt["receipt_id"])):
        assert secret not in logged

    digest = anonymous_voter_hash(_KEY, poll_id, raw_token)
    restarted = anonymous_voter_hash(_KEY, poll_id, raw_token)
    other_digest = anonymous_voter_hash(_KEY, other_id, raw_token)
    assert digest == restarted
    assert digest != other_digest
    with open_session(auth_client) as session:
        vote = session.scalar(select(Vote).where(Vote.poll_id == poll_id))
        assert vote is not None
        assert vote.voter_id is None
        assert vote.anonymous_voter_hash == digest
        assert vote.identity_mode == "ANONYMOUS"
        linked_receipt = session.scalar(
            select(AuditEvent).where(AuditEvent.receipt_id == vote.receipt_id)
        )
        linked_request = session.scalar(
            select(AuditEvent).where(AuditEvent.request_id == request_id)
        )
        assert linked_receipt is None
        assert linked_request is None


def test_anonymous_capacity_close_does_not_link_account(
    auth_client: TestClient,
) -> None:
    """已登录用户投出匿名的最后一票时，不写账户，也不伪造关闭审计。"""
    username = "ada_full"
    csrf = register_and_login(auth_client, username, display_name="满额姓名")
    created = create_poll(
        auth_client,
        csrf,
        identity_mode="ANONYMOUS",
        vote_limit=1,
        title="满额匿名",
    )
    poll_id = int(created["id"])
    publish_poll(auth_client, csrf, poll_id, 1)
    guest_csrf = ensure_guest(auth_client)
    detail = envelope(auth_client.get(f"/api/v1/polls/{poll_id}"), 200)
    response = cast(auth_client, guest_csrf, poll_id, _option(detail))
    envelope(response, 201)
    lifecycle, closed_at, _password_hash = poll_row(auth_client, poll_id)
    assert lifecycle == "CLOSED"
    assert closed_at is not None
    actions = audit_actions(auth_client, poll_id)
    assert "CLOSE" not in actions
    assert "VOTE_NAMED" not in actions
    with open_session(auth_client) as session:
        vote = session.scalar(select(Vote).where(Vote.poll_id == poll_id))
        assert vote is not None
        assert vote.voter_id is None
        assert vote.identity_mode == "ANONYMOUS"
