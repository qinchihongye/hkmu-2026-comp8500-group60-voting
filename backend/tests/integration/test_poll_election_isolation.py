"""普通投票与选举在数据表和领域服务上的绝对隔离测试。

确保当数据库中存在 activity_type == 'ELECTION' 的记录时：
1. 普通公开列表、创作者管理列表、管理员全量列表均不返回选举；
2. 普通投票详情、分享入口、解锁接口对选举返回 404（不可见）；
3. 普通投票提交服务拒绝向选举投票；
4. 普通结果服务拒绝返回选举结果；
5. 示例目录查询排除选举。
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from src.main.python.algorithms.demo_module.demo_catalog_service import (
    DemoCatalogService,
    DemoListFilters,
)
from src.main.python.algorithms.poll_access_module.poll_access_service import PollAccessService
from src.main.python.algorithms.poll_module.poll_service import PollListFilters, PollService
from src.main.python.algorithms.result_module.result_service import ResultService
from src.main.python.algorithms.vote_module.vote_service import VoteService
from src.main.python.constants.enums import (
    ActivityType,
    IdentityMode,
    PollLifecycle,
    SelectionMode,
    UserRole,
    Visibility,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import (
    ElectionCandidate,
    ElectionConfig,
    GuestSession,
    Poll,
    PollOption,
    User,
)
from src.main.python.fileds.context import GuestContext, PollAccessContext, Principal
from src.main.python.fileds.request.poll_access_request import UnlockRequest
from src.main.python.utils.error_handlers import AppError
from src.main.python.utils.rate_limit_util import AttemptLimiter
from tests.auth_support import ManualClock, fast_password_hash
from tests.conftest import build_settings, truncate_application_tables


def test_poll_and_election_activity_type_isolation(
    migrated_engine: Engine,
) -> None:
    truncate_application_tables(migrated_engine)
    session_factory = sessionmaker(migrated_engine)
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=UTC)
    clock = ManualClock()
    clock.moment = now

    with session_factory() as db_session:
        # 准备管理员与普通用户
        admin = User(
            username="admin_user",
            display_name="Admin",
            password_hash="dummy_hash",
            role=UserRole.ADMIN,
        )
        creator = User(
            username="creator_user",
            display_name="Creator",
            password_hash="dummy_hash",
            role=UserRole.USER,
        )
        voter = User(
            username="voter_user",
            display_name="Voter",
            password_hash="dummy_hash",
            role=UserRole.USER,
        )
        db_session.add_all([admin, creator, voter])
        db_session.commit()

        admin_id = admin.id
        admin_role = admin.role
        creator_id = creator.id
        creator_role = creator.role
        voter_id = voter.id
        voter_role = voter.role

        admin_principal = Principal(user_id=admin_id, role=admin_role)
        creator_principal = Principal(user_id=creator_id, role=creator_role)
        voter_principal = Principal(user_id=voter_id, role=voter_role)

        # 1. 创建普通公开投票 (POLL)
        normal_poll = Poll(
            activity_type=ActivityType.POLL.value,
            title="Normal Public Poll",
            description="A normal poll description",
            identity_mode=IdentityMode.NAMED.value,
            visibility=Visibility.PUBLIC.value,
            vote_limit=100,
            selection_mode=SelectionMode.SINGLE.value,
            allow_live_results=True,
            share_code="normal-share-code-1234",
            lifecycle=PollLifecycle.PUBLISHED.value,
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(hours=2),
            creator_id=creator_id,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db_session.add(normal_poll)
        db_session.flush()
        opt1 = PollOption(poll_id=normal_poll.id, label="Option A", position=0)
        opt2 = PollOption(poll_id=normal_poll.id, label="Option B", position=1)
        db_session.add_all([opt1, opt2])

        # 2. 创建一场选举 (ELECTION)
        election_poll = Poll(
            activity_type=ActivityType.ELECTION.value,
            title="Student Union Presidential Election",
            description="Official election",
            identity_mode=IdentityMode.ANONYMOUS.value,
            visibility=Visibility.PUBLIC.value,
            vote_limit=None,
            selection_mode=SelectionMode.SINGLE.value,
            allow_live_results=False,
            share_code="election-share-code-5678",
            lifecycle=PollLifecycle.PUBLISHED.value,
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(hours=2),
            creator_id=admin_id,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db_session.add(election_poll)
        db_session.flush()

        el_opt1 = PollOption(poll_id=election_poll.id, label="Candidate Alice", position=0)
        el_opt2 = PollOption(poll_id=election_poll.id, label="Candidate Bob", position=1)
        db_session.add_all([el_opt1, el_opt2])
        db_session.flush()

        cand1 = ElectionCandidate(
            poll_option_id=el_opt1.id,
            poll_id=election_poll.id,
            candidate_code="CAND-01",
            statement="Vote for Alice",
        )
        cand2 = ElectionCandidate(
            poll_option_id=el_opt2.id,
            poll_id=election_poll.id,
            candidate_code="CAND-02",
            statement="Vote for Bob",
        )
        el_cfg = ElectionConfig(
            poll_id=election_poll.id,
            registration_starts_at=now - timedelta(days=2),
            registration_ends_at=now - timedelta(hours=2),
            roster_frozen_at=now - timedelta(hours=2),
            eligible_voter_count=10,
        )
        db_session.add_all([cand1, cand2, el_cfg])
        guest_session = GuestSession(
            token_hash="dummy_token_hash",
            csrf_token="dummy_csrf_token",
            created_at=now,
            expires_at=now + timedelta(days=30),
        )
        db_session.add(guest_session)
        db_session.commit()

        normal_poll_id = normal_poll.id
        election_poll_id = election_poll.id
        el_opt1_id = el_opt1.id
        guest_session_id = guest_session.id

    # 初始化各个普通服务
    settings = build_settings()
    poll_svc = PollService(session_factory, clock, "http://localhost:5173")
    vote_svc = VoteService(session_factory, clock, "k" * 32)
    result_svc = ResultService(session_factory, clock)
    access_svc = PollAccessService(
        session_factory,
        clock,
        fast_password_hash(),
        AttemptLimiter(),
        settings,
    )
    demo_svc = DemoCatalogService(session_factory, clock, enabled=True)

    # 验证 1: 公开列表只能查到 normal_poll，查不到 election_poll
    public_page = poll_svc.list_public(PollListFilters(page=1, page_size=20))
    public_ids = [p.id for p in public_page.items]
    assert normal_poll_id in public_ids
    assert election_poll_id not in public_ids

    # 验证 2: 创作者管理列表查不到选举
    creator_page = poll_svc.list_owned(creator_principal, PollListFilters(page=1, page_size=20))
    creator_ids = [p.id for p in creator_page.items]
    assert normal_poll_id in creator_ids
    assert election_poll_id not in creator_ids

    owned_page = poll_svc.list_owned(admin_principal, PollListFilters(page=1, page_size=20))
    owned_ids = [p.id for p in owned_page.items]
    assert election_poll_id not in owned_ids

    # 验证 3: 管理员全量投票列表查不到选举
    admin_page = poll_svc.list_admin(admin_principal, PollListFilters(page=1, page_size=20))
    admin_ids = [p.id for p in admin_page.items]
    assert normal_poll_id in admin_ids
    assert election_poll_id not in admin_ids

    # 验证 4: get_owned / get_admin / get_share 针对选举 ID 返回 404 NOT_FOUND
    with pytest.raises(AppError) as exc_owned:
        poll_svc.get_owned(admin_principal, election_poll_id)
    assert exc_owned.value.code == ApiCode.POLL_NOT_FOUND

    with pytest.raises(AppError) as exc_admin_get:
        poll_svc.get_admin(admin_principal, election_poll_id)
    assert exc_admin_get.value.code == ApiCode.POLL_NOT_FOUND

    with pytest.raises(AppError) as exc_share:
        poll_svc.get_share(admin_principal, election_poll_id)
    assert exc_share.value.code == ApiCode.POLL_NOT_FOUND

    # 验证 5: 分享入口与详情查询对选举返回 404
    with pytest.raises(AppError) as exc_entry:
        access_svc.resolve_share("election-share-code-5678")
    assert exc_entry.value.code == ApiCode.POLL_NOT_FOUND

    guest_ctx = GuestContext(
        guest_session_id=guest_session_id,
        csrf_token="dummy_csrf_token",
        expires_at=now + timedelta(days=30),
        raw_token="dummy_raw_token",
    )
    access_ctx = PollAccessContext(principal=voter_principal, guest=guest_ctx)

    with pytest.raises(AppError) as exc_detail:
        access_svc.get_visible(access_ctx, election_poll_id)
    assert exc_detail.value.code == ApiCode.POLL_NOT_FOUND

    with pytest.raises(AppError) as exc_unlock:
        access_svc.unlock(
            guest_ctx,
            election_poll_id,
            UnlockRequest(share_code="election-share-code-5678", password="pwd"),
        )
    assert exc_unlock.value.code == ApiCode.POLL_NOT_FOUND

    # 验证 6: 普通投票接口向选举提交投票返回 404
    with pytest.raises(AppError) as exc_vote:
        vote_svc.cast_vote(access_ctx, election_poll_id, [el_opt1_id])
    assert exc_vote.value.code == ApiCode.POLL_NOT_FOUND

    # 验证 7: 普通结果查询接口针对选举返回 404
    with pytest.raises(AppError) as exc_res:
        result_svc.get_results(access_ctx, election_poll_id)
    assert exc_res.value.code == ApiCode.POLL_NOT_FOUND

    # 验证 8: 示例目录不包含选举
    demo_page = demo_svc.list_registered(DemoListFilters(page=1, page_size=20))
    demo_ids = [item.poll_id for item in demo_page.items]
    assert election_poll_id not in demo_ids
