"""固定示例目录和确保命令的纯检查。"""

import json
from importlib.resources import files

import pytest

from src.main.python.algorithms.demo_module.demo_seed_service import (
    DATASET_VERSION,
    DemoCatalogError,
    load_demo_catalog,
    validate_demo_catalog,
)
from src.main.python.cli import main
from src.main.python.constants.enums import IdentityMode, SelectionMode, Visibility
from tests.conftest import build_settings


def test_catalog_covers_the_full_matrix(monkeypatch, tmp_path) -> None:
    """32 场核心示例恰好是五维笛卡尔积，38 个键和顺序都不重复。"""
    monkeypatch.chdir(tmp_path)
    catalog = load_demo_catalog()
    assert catalog.dataset_version == DATASET_VERSION
    core = [item for item in catalog.polls if not item.key.startswith("state-")]
    expected = {
        (identity, visibility, limit, mode, live)
        for identity in (IdentityMode.NAMED, IdentityMode.ANONYMOUS)
        for visibility in (Visibility.PUBLIC, Visibility.PRIVATE)
        for limit in (None, 20)
        for mode in (SelectionMode.SINGLE, SelectionMode.MULTIPLE)
        for live in (False, True)
    }
    actual = {
        (
            item.identity_mode,
            item.visibility,
            item.vote_limit,
            item.selection_mode,
            item.allow_live_results,
        )
        for item in core
    }
    assert len(catalog.polls) == 38
    assert len(core) == 32
    assert actual == expected
    assert len({item.key for item in catalog.polls}) == 38
    assert [item.display_order for item in catalog.polls] == list(range(1, 39))
    assert all(
        len(item.options) >= 3 or item.selection_mode == SelectionMode.SINGLE
        for item in catalog.polls
    )
    assert all(
        item.selection_mode != SelectionMode.MULTIPLE or len(item.options) >= 3
        for item in catalog.polls
    )
    assert all(
        item.vote_limit is None or len(item.seed_ballots) <= item.vote_limit
        for item in catalog.polls
    )
    assert sum(len(item.seed_ballots) for item in catalog.polls) == 108


def test_invalid_catalog_fails_before_any_database_write() -> None:
    """损坏的目录在写库前被拒绝。"""
    fixture_path = files("src.main.python.fixtures").joinpath("demo_polls.json")
    raw = json.loads(fixture_path.read_text(encoding="utf-8"))
    raw["polls"][2]["options"] = raw["polls"][2]["options"][:2]
    with pytest.raises(DemoCatalogError, match="poll fields are invalid"):
        validate_demo_catalog(raw)
    raw = json.loads(fixture_path.read_text(encoding="utf-8"))
    raw["dataset_version"] = "other"
    with pytest.raises(DemoCatalogError, match="version"):
        validate_demo_catalog(raw)


def test_disabled_command_does_not_open_a_database(monkeypatch) -> None:
    """关闭开关时命令不连接数据库。"""
    monkeypatch.setattr(
        "src.main.python.cli.get_settings",
        lambda: build_settings(demo_polls_enabled=False),
    )

    def fail_open(_url: str) -> None:
        raise AssertionError("database opened")

    monkeypatch.setattr("src.main.python.cli.create_session_factory", fail_open)
    assert main(["ensure-demo-polls"]) == 0


def test_enabled_command_rejects_a_missing_password_without_prompt(monkeypatch) -> None:
    """启用后缺少密码直接失败，不调用交互输入。"""
    monkeypatch.setenv("DEMO_POLL_PASSWORD", "")
    monkeypatch.setattr(
        "src.main.python.cli.get_settings",
        lambda: build_settings(demo_polls_enabled=True),
    )

    def fail_prompt(*_args: object, **_kwargs: object) -> str:
        raise AssertionError("prompt")

    def fail_open(_url: str) -> None:
        raise AssertionError("database opened")

    monkeypatch.setattr("src.main.python.cli.getpass.getpass", fail_prompt)
    monkeypatch.setattr("src.main.python.cli.create_session_factory", fail_open)
    assert main(["ensure-demo-polls"]) == 1
