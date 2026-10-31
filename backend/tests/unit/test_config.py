"""配置校验测试。"""

import pytest

from src.main.python.config.server_config import Settings


def _valid_kwargs() -> dict[str, object]:
    return {
        "database_url": "postgresql+psycopg://voting:pw@127.0.0.1:5432/voting",
        "test_database_url": "postgresql+psycopg://voting:pw@127.0.0.1:5433/voting_test",
        "allowed_origins": ["http://localhost:5173"],
        "anon_voter_hmac_key": "a" * 32,
        "identity_fingerprint_hmac_key": "b" * 32,
    }


def test_valid_settings_succeeds() -> None:
    settings = Settings(**_valid_kwargs())
    assert settings.identity_fingerprint_hmac_key == "b" * 32
    assert settings.anon_voter_hmac_key == "a" * 32


def test_empty_identity_hmac_key_rejected() -> None:
    kwargs = _valid_kwargs()
    kwargs["identity_fingerprint_hmac_key"] = ""
    with pytest.raises(ValueError, match="IDENTITY_FINGERPRINT_HMAC_KEY"):
        Settings(**kwargs)


def test_short_identity_hmac_key_rejected() -> None:
    kwargs = _valid_kwargs()
    kwargs["identity_fingerprint_hmac_key"] = "short_key_under_32_bytes"
    with pytest.raises(ValueError, match="IDENTITY_FINGERPRINT_HMAC_KEY"):
        Settings(**kwargs)


def test_reused_anon_hmac_key_rejected() -> None:
    kwargs = _valid_kwargs()
    kwargs["identity_fingerprint_hmac_key"] = "s" * 32
    kwargs["anon_voter_hmac_key"] = "s" * 32
    with pytest.raises(
        ValueError, match="IDENTITY_FINGERPRINT_HMAC_KEY 不能与 ANON_VOTER_HMAC_KEY 相同"
    ):
        Settings(**kwargs)
