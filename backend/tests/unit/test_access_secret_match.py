"""非 ASCII 访问密码和分享码按字节比较，不再抛出类型错误。"""

from types import SimpleNamespace

from src.main.python.algorithms.poll_access_module.poll_access_service import (
    PollAccessService,
    _codes_match,
)
from src.main.python.fileds.request.poll_access_request import UnlockRequest
from src.main.python.utils.security_util import (
    constant_text_match,
    dummy_password_hash,
    tokens_match,
    verify_password,
)
from tests.auth_support import fast_password_hash

UNICODE_PASSWORD = "中文密码"
ASCII_PASSWORD = "access-pass"
LEGACY_PASSWORD = "legacy-pass"


def _service() -> SimpleNamespace:
    """组装只含散列器的解锁服务替身。

    Returns:
        可供 _password_ok 使用的对象。
    """
    passwords = fast_password_hash()
    return SimpleNamespace(
        _passwords=passwords,
        _dummy_hash=dummy_password_hash(passwords),
    )


def _unlock(share_code: str, password: str) -> UnlockRequest:
    """构造解锁请求。

    Args:
        share_code: 分享码。
        password: 访问密码。

    Returns:
        已通过字段校验的请求。
    """
    return UnlockRequest.model_validate({"share_code": share_code, "password": password})


def test_unicode_plaintext_password_matches_and_mismatch_stays_false() -> None:
    """正确的非 ASCII 明文可以解锁，错误的非 ASCII 明文返回否。"""
    service = _service()
    poll = SimpleNamespace(
        share_code="share-code",
        private_password=UNICODE_PASSWORD,
        private_password_hash=None,
    )
    matched = PollAccessService._password_ok(
        service, poll, _unlock("share-code", UNICODE_PASSWORD)
    )
    assert matched
    assert not PollAccessService._password_ok(service, poll, _unlock("share-code", "错误密码"))
    wrong_ascii = PollAccessService._password_ok(
        service, poll, _unlock("share-code", ASCII_PASSWORD)
    )
    assert wrong_ascii is False


def test_unicode_share_code_does_not_raise() -> None:
    """同长度的非 ASCII 分享码比较返回否，不抛出 TypeError。"""
    assert _codes_match("中文码", "abcdef") is False
    assert _codes_match("分享码", "分享码") is True
    assert _codes_match("中文码", None) is False
    service = _service()
    poll = SimpleNamespace(
        share_code="abcdef",
        private_password=ASCII_PASSWORD,
        private_password_hash=None,
    )
    assert PollAccessService._password_ok(service, poll, _unlock("中文码", ASCII_PASSWORD)) is False


def test_ascii_password_and_legacy_hash_still_match() -> None:
    """ASCII 明文和旧散列密码仍按原规则核对。"""
    service = _service()
    plaintext = SimpleNamespace(
        share_code="plain",
        private_password=ASCII_PASSWORD,
        private_password_hash=None,
    )
    assert PollAccessService._password_ok(service, plaintext, _unlock("plain", ASCII_PASSWORD))
    digest = service._passwords.hash(LEGACY_PASSWORD)
    legacy = SimpleNamespace(
        share_code="legacy",
        private_password=None,
        private_password_hash=digest,
    )
    assert PollAccessService._password_ok(service, legacy, _unlock("legacy", LEGACY_PASSWORD))
    assert not PollAccessService._password_ok(service, legacy, _unlock("legacy", "wrong-legacy"))
    assert verify_password(service._passwords, LEGACY_PASSWORD, digest)


def test_token_match_accepts_unicode_bytes() -> None:
    """令牌比较同样接受非 ASCII，长度不同则为否。"""
    assert constant_text_match("密码", "密码") is True
    assert tokens_match("密码", "暗号") is False
    assert tokens_match("éé", "ab") is False
    assert tokens_match(None, "ab") is False
    assert tokens_match("", "ab") is False
