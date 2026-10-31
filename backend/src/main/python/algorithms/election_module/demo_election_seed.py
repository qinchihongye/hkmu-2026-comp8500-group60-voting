"""Seed realistic demo elections across different lifecycle phases with simulated voters."""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.election_module.eligibility_service import (
    compute_fingerprint,
    compute_suffix,
)
from src.main.python.constants.enums import (
    ActivityType,
    CredentialStatus,
    DocumentType,
    IdentityMode,
    PollLifecycle,
    RegistrationStatus,
    SelectionMode,
    UserRole,
    Visibility,
)
from src.main.python.database.models import Poll, PollOption, User
from src.main.python.database.models.election import (
    ElectionBallot,
    ElectionCandidate,
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
    EligibilityReviewEvent,
    VoterIdentity,
)
from src.main.python.utils.security_util import PasswordHash, check_password_length

logger = logging.getLogger(__name__)

HKT = timezone(timedelta(hours=8))


class DemoVoterSpec(NamedTuple):
    username: str
    display_name: str
    password: str
    doc_type: DocumentType
    issuer: str
    doc_number: str
    status: RegistrationStatus
    reason_codes: list[str]
    score: int
    review_note: str | None


DEMO_VOTERS: tuple[DemoVoterSpec, ...] = (
    DemoVoterSpec(
        username="voter_approved_01",
        display_name="陈晓明 (Chan Hiu Ming)",
        password="Password123!",
        doc_type=DocumentType.STUDENT_ID,
        issuer="HKMU",
        doc_number="s1234567",
        status=RegistrationStatus.APPROVED,
        reason_codes=["STUDENT_ID_VALID", "ISSUER_RECOGNIZED"],
        score=100,
        review_note="教务处在读全日制学籍验证通过",
    ),
    DemoVoterSpec(
        username="voter_approved_02",
        display_name="李嘉慧 (Li Ka Wai)",
        password="Password123!",
        doc_type=DocumentType.STUDENT_ID,
        issuer="HKMU",
        doc_number="s2345678",
        status=RegistrationStatus.APPROVED,
        reason_codes=["STUDENT_ID_VALID", "ISSUER_RECOGNIZED"],
        score=100,
        review_note="在籍硕士研究生，资格核验通过",
    ),
    DemoVoterSpec(
        username="voter_rejected_01",
        display_name="王大锤 (Wong Tai Chui)",
        password="Password123!",
        doc_type=DocumentType.STUDENT_ID,
        issuer="UNKNOWN_CAMPUS",
        doc_number="777777",
        status=RegistrationStatus.REJECTED,
        reason_codes=["STUDENT_ID_LENGTH_OR_FORMAT_INVALID", "ISSUER_UNRECOGNIZED"],
        score=0,
        review_note="经学籍库比对，号码长度不合法且非本校注册学生，审核未通过",
    ),
    DemoVoterSpec(
        username="voter_rejected_02",
        display_name="张伟客 (Cheung Wai)",
        password="Password123!",
        doc_type=DocumentType.HK_MACAU_PERMIT,
        issuer="HKMU",
        doc_number="W123",
        status=RegistrationStatus.REJECTED,
        reason_codes=["PERMIT_FORMAT_INVALID", "NAME_MISMATCH"],
        score=0,
        review_note="通行证号码校验失败，且填报的法定姓名与教务处登记记录不一致",
    ),
    DemoVoterSpec(
        username="voter_pending_01",
        display_name="赵子龙 (Chiu Tsz Lung)",
        password="Password123!",
        doc_type=DocumentType.RESIDENT_ID,
        issuer="HKMU",
        doc_number="110101199801018888",
        status=RegistrationStatus.NEEDS_REVIEW,
        reason_codes=["BORDERLINE_SCORE", "MANUAL_VERIFICATION_REQUIRED"],
        score=65,
        review_note="证件格式有效，等待教务处人工复核跨境交流学籍状态",
    ),
)


def ensure_demo_voter_accounts(session: Session, passwords: PasswordHash) -> dict[str, User]:
    """Ensure all sample voter accounts exist."""
    user_map: dict[str, User] = {}
    for spec in DEMO_VOTERS:
        check_password_length(spec.password)
        user = session.execute(select(User).where(User.username == spec.username)).scalar_one_or_none()
        if user is None:
            user = User(
                username=spec.username,
                display_name=spec.display_name,
                password_hash=passwords.hash(spec.password),
                role=UserRole.USER.value,
            )
            session.add(user)
            session.flush()
            logger.info("Created demo voter account: %s", spec.username)
        user_map[spec.username] = user
    return user_map


def seed_realistic_elections(session_factory: sessionmaker[Session], hmac_key: bytes) -> list[int]:
    """Seed 4 realistic elections spanning different phases with mock voters."""
    passwords = PasswordHash.recommended()
    seeded_election_ids: list[int] = []

    with session_factory() as session:
        # Find admin
        admin = session.execute(
            select(User).where(User.username == "admin", User.role == UserRole.ADMIN.value)
        ).scalar_one_or_none()
        if admin is None:
            admin = session.execute(
                select(User).where(User.role == UserRole.ADMIN.value)
            ).scalars().first()

        if admin is None:
            raise RuntimeError("Admin user not found. Please run seed-demo first.")

        voter_users = ensure_demo_voter_accounts(session, passwords)

        # Also get any active standard users (demo_user, mzc)
        extra_users: list[User] = []
        for extra_name in ["mzc", "demo_user", "demo_voter"]:
            eu = session.execute(select(User).where(User.username == extra_name)).scalar_one_or_none()
            if eu:
                extra_users.append(eu)

        now = datetime.now(timezone.utc)

        # -------------------------------------------------------------
        # Election 1: 资格登记中 (REGISTRATION_OPEN)
        # -------------------------------------------------------------
        e1_title = "2026/2027 香港都会大学全日制学生会干事会换届选举"
        e1_poll = session.execute(
            select(Poll).where(Poll.title == e1_title, Poll.activity_type == ActivityType.ELECTION.value)
        ).scalar_one_or_none()

        if e1_poll is None:
            e1_reg_start = now - timedelta(days=4)
            e1_reg_end = now + timedelta(days=5)
            e1_vote_start = now + timedelta(days=7)
            e1_vote_end = now + timedelta(days=11)

            e1_poll = Poll(
                title=e1_title,
                description=(
                    "香港都会大学学生会二零二六至二零二七年度干事会换届选举。"
                    "面向全校已注册学生开放选民资格登记。本场选举由系统采用 B2 密码学架构，"
                    "实现选民身份与选票彻底解耦，保障神圣投票权。"
                ),
                creator_id=admin.id,
                activity_type=ActivityType.ELECTION.value,
                lifecycle=PollLifecycle.PUBLISHED.value,
                identity_mode=IdentityMode.NAMED.value,
                selection_mode=SelectionMode.SINGLE.value,
                visibility=Visibility.PUBLIC.value,
                starts_at=e1_vote_start,
                ends_at=e1_vote_end,
                closed_at=None,
                allow_live_results=False,
                version=1,
                created_at=e1_reg_start - timedelta(days=2),
                updated_at=e1_reg_start,
            )
            session.add(e1_poll)
            session.flush()

            session.add(
                ElectionConfig(
                    poll_id=e1_poll.id,
                    registration_starts_at=e1_reg_start,
                    registration_ends_at=e1_reg_end,
                    roster_frozen_at=None,
                    eligible_voter_count=None,
                    created_at=e1_poll.created_at,
                    updated_at=e1_poll.created_at,
                )
            )
            session.flush()

            # Candidates
            cands_1 = [
                ("C_1", "启航内阁（庄马：林子谦 Lam Tsz Him）", "专注自修空间扩展、校内餐饮补贴提质与多元学生活动扶持"),
                ("C_2", "同心内阁（庄马：黄嘉欣 Wong Ka Yan）", "专注学生心理健康热线、大湾区实习网络建设与社团扶持"),
                ("C_3", "创研内阁（庄马：陈俊贤 Chan Chun Yin）", "推动跨学科科创项目孵化、竞赛资助与创客空间资源共享"),
            ]
            for idx, (code, name, stmt) in enumerate(cands_1):
                opt = PollOption(poll_id=e1_poll.id, label=name, position=idx)
                session.add(opt)
                session.flush()
                session.add(
                    ElectionCandidate(
                        poll_option_id=opt.id,
                        poll_id=e1_poll.id,
                        candidate_code=code,
                        statement=stmt,
                    )
                )

            # Register sample voters into Election 1
            _register_voters_for_election(
                session=session,
                poll=e1_poll,
                admin=admin,
                voter_users=voter_users,
                extra_users=extra_users,
                hmac_key=hmac_key,
                include_extra=True,
            )
            seeded_election_ids.append(e1_poll.id)
            logger.info("Seeded Election 1 (REGISTRATION_OPEN): id=%d", e1_poll.id)
        else:
            seeded_election_ids.append(e1_poll.id)

        # -------------------------------------------------------------
        # Election 2: 名册已冻结/排期待开票 (VOTING_SCHEDULED)
        # -------------------------------------------------------------
        e2_title = "2026年度 香港计算机学会学术专业委员会联合主席选举"
        e2_poll = session.execute(
            select(Poll).where(Poll.title == e2_title, Poll.activity_type == ActivityType.ELECTION.value)
        ).scalar_one_or_none()

        if e2_poll is None:
            e2_reg_start = now - timedelta(days=14)
            e2_reg_end = now - timedelta(days=3)
            e2_freeze = now - timedelta(days=2)
            e2_vote_start = now + timedelta(days=1)  # Starts tomorrow!
            e2_vote_end = now + timedelta(days=4)

            e2_poll = Poll(
                title=e2_title,
                description=(
                    "香港计算机学会（HKCS）学术与产学研合作委员会联合主席选举。"
                    "选民登记已截止，选民资格名册已由系统管理员完成复核并正式冻结，"
                    "已向全体合资格选民签发一次性不可逆投票凭证，等待正式开票。"
                ),
                creator_id=admin.id,
                activity_type=ActivityType.ELECTION.value,
                lifecycle=PollLifecycle.PUBLISHED.value,
                identity_mode=IdentityMode.NAMED.value,
                selection_mode=SelectionMode.SINGLE.value,
                visibility=Visibility.PUBLIC.value,
                starts_at=e2_vote_start,
                ends_at=e2_vote_end,
                closed_at=None,
                allow_live_results=True,
                version=1,
                created_at=e2_reg_start - timedelta(days=2),
                updated_at=e2_freeze,
            )
            session.add(e2_poll)
            session.flush()

            cands_2 = [
                ("C_1", "梁伟杰 教授 (Prof. Leung Wai Kit)", "聚焦大模型与高可靠软件工程产学研协同落地"),
                ("C_2", "郑思敏 博士 (Dr. Cheng Sze Man)", "专长网络空间安全治理与密码学应用标准制定"),
            ]
            for idx, (code, name, stmt) in enumerate(cands_2):
                opt = PollOption(poll_id=e2_poll.id, label=name, position=idx)
                session.add(opt)
                session.flush()
                session.add(
                    ElectionCandidate(
                        poll_option_id=opt.id,
                        poll_id=e2_poll.id,
                        candidate_code=code,
                        statement=stmt,
                    )
                )

            # Register voters
            approved_count = _register_voters_for_election(
                session=session,
                poll=e2_poll,
                admin=admin,
                voter_users=voter_users,
                extra_users=extra_users,
                hmac_key=hmac_key,
                include_extra=True,
            )

            # Freeze roster and issue credentials
            session.add(
                ElectionConfig(
                    poll_id=e2_poll.id,
                    registration_starts_at=e2_reg_start,
                    registration_ends_at=e2_reg_end,
                    roster_frozen_at=e2_freeze,
                    eligible_voter_count=approved_count,
                    created_at=e2_poll.created_at,
                    updated_at=e2_freeze,
                )
            )
            session.flush()

            _issue_credentials_for_approved_voters(session, e2_poll.id, e2_freeze)
            seeded_election_ids.append(e2_poll.id)
            logger.info("Seeded Election 2 (VOTING_SCHEDULED): id=%d", e2_poll.id)
        else:
            seeded_election_ids.append(e2_poll.id)

        # -------------------------------------------------------------
        # Election 3: 正式投票中 (VOTING_OPEN)
        # -------------------------------------------------------------
        e3_title = "2026 何文田学术创新园区入驻联合会理事选举"
        e3_poll = session.execute(
            select(Poll).where(Poll.title == e3_title, Poll.activity_type == ActivityType.ELECTION.value)
        ).scalar_one_or_none()

        if e3_poll is None:
            e3_reg_start = now - timedelta(days=12)
            e3_reg_end = now - timedelta(days=5)
            e3_freeze = now - timedelta(days=4)
            e3_vote_start = now - timedelta(days=3)  # Voting is OPEN!
            e3_vote_end = now + timedelta(days=3)

            e3_poll = Poll(
                title=e3_title,
                description=(
                    "何文田创新科研园第一届入驻学术机构与企业联合理事会选举。"
                    "名册已冻结，正式投票正在进行中。符合资格的选民可凭系统加密签发的一次性凭证"
                    "进入秘密投票亭进行无记名投票。开启了实时结果查看权限。"
                ),
                creator_id=admin.id,
                activity_type=ActivityType.ELECTION.value,
                lifecycle=PollLifecycle.PUBLISHED.value,
                identity_mode=IdentityMode.NAMED.value,
                selection_mode=SelectionMode.SINGLE.value,
                visibility=Visibility.PUBLIC.value,
                starts_at=e3_vote_start,
                ends_at=e3_vote_end,
                closed_at=None,
                allow_live_results=True,
                version=1,
                created_at=e3_reg_start - timedelta(days=2),
                updated_at=e3_freeze,
            )
            session.add(e3_poll)
            session.flush()

            cands_3 = [
                ("C_1", "张宇轩 博士 (Dr. Alan Cheung)", "促进跨机构算力中心共享与科研经费统筹"),
                ("C_2", "何敏仪 女士 (Ms. Ho Man Yee)", "推动早期科研成果转化与创投资本对接"),
                ("C_3", "周国强 先生 (Mr. Chow Kwok Keung)", "优化园区实验室设备共享与绿色低碳运营"),
            ]
            c3_options: list[PollOption] = []
            for idx, (code, name, stmt) in enumerate(cands_3):
                opt = PollOption(poll_id=e3_poll.id, label=name, position=idx)
                session.add(opt)
                session.flush()
                session.add(
                    ElectionCandidate(
                        poll_option_id=opt.id,
                        poll_id=e3_poll.id,
                        candidate_code=code,
                        statement=stmt,
                    )
                )
                c3_options.append(opt)

            approved_count = _register_voters_for_election(
                session=session,
                poll=e3_poll,
                admin=admin,
                voter_users=voter_users,
                extra_users=extra_users,
                hmac_key=hmac_key,
                include_extra=True,
            )

            session.add(
                ElectionConfig(
                    poll_id=e3_poll.id,
                    registration_starts_at=e3_reg_start,
                    registration_ends_at=e3_reg_end,
                    roster_frozen_at=e3_freeze,
                    eligible_voter_count=approved_count,
                    created_at=e3_poll.created_at,
                    updated_at=e3_freeze,
                )
            )
            session.flush()

            creds = _issue_credentials_for_approved_voters(session, e3_poll.id, e3_freeze)

            # Cast some votes in Election 3 (e.g. voter_approved_01 casts a vote)
            v1_user = voter_users.get("voter_approved_01")
            if v1_user and creds:
                v1_reg = session.execute(
                    select(ElectionRegistration).where(
                        ElectionRegistration.poll_id == e3_poll.id,
                        ElectionRegistration.user_id == v1_user.id,
                    )
                ).scalar_one_or_none()
                if v1_reg:
                    v1_cred = session.execute(
                        select(ElectionVoterCredential).where(
                            ElectionVoterCredential.poll_id == e3_poll.id,
                            ElectionVoterCredential.registration_id == v1_reg.id,
                        )
                    ).scalar_one_or_none()
                    if v1_cred:
                        vote_time = e3_vote_start + timedelta(hours=6)
                        v1_cred.status = CredentialStatus.CONSUMED.value
                        v1_cred.consumed_at = vote_time
                        # Write anonymous ballot
                        session.add(
                            ElectionBallot(
                                receipt_id=uuid.uuid4(),
                                poll_id=e3_poll.id,
                                candidate_option_id=c3_options[0].id,
                                submitted_at=vote_time,
                            )
                        )
                        session.flush()

            seeded_election_ids.append(e3_poll.id)
            logger.info("Seeded Election 3 (VOTING_OPEN): id=%d", e3_poll.id)
        else:
            seeded_election_ids.append(e3_poll.id)

        # -------------------------------------------------------------
        # Election 4: 已结束 (CLOSED)
        # -------------------------------------------------------------
        e4_title = "2026香港都会大学学术委员会教员代表差额选举"
        e4_poll = session.execute(
            select(Poll).where(Poll.title == e4_title, Poll.activity_type == ActivityType.ELECTION.value)
        ).scalar_one_or_none()

        if e4_poll is None:
            e4_reg_start = now - timedelta(days=24)
            e4_reg_end = now - timedelta(days=16)
            e4_freeze = now - timedelta(days=15)
            e4_vote_start = now - timedelta(days=14)
            e4_vote_end = now - timedelta(days=6)  # Ended 6 days ago!

            e4_poll = Poll(
                title=e4_title,
                description=(
                    "2026学年大学学术委员会教职员代表选举。投票已圆满结束，"
                    "计票与加密审计日志已正式封存并由系统审计中心认证，公布最终获胜代表。"
                ),
                creator_id=admin.id,
                activity_type=ActivityType.ELECTION.value,
                lifecycle=PollLifecycle.CLOSED.value,
                identity_mode=IdentityMode.NAMED.value,
                selection_mode=SelectionMode.SINGLE.value,
                visibility=Visibility.PUBLIC.value,
                starts_at=e4_vote_start,
                ends_at=e4_vote_end,
                closed_at=e4_vote_end,
                allow_live_results=True,
                version=2,
                created_at=e4_reg_start - timedelta(days=2),
                updated_at=e4_vote_end,
            )
            session.add(e4_poll)
            session.flush()

            cands_4 = [
                ("C_1", "Prof. Sarah Jenkins (计算机科学系)", "倡导人工智能前沿学术课程与跨学科科研团队组建"),
                ("C_2", "Prof. David Thorne (数据科学系)", "专注科研数据治理与全校高性能计算云平台升级"),
                ("C_3", "Dr. Elena Rostova (人工智能实验室)", "推动青年科研学者导师计划与国际联合课题申报"),
            ]
            c4_options: list[PollOption] = []
            for idx, (code, name, stmt) in enumerate(cands_4):
                opt = PollOption(poll_id=e4_poll.id, label=name, position=idx)
                session.add(opt)
                session.flush()
                session.add(
                    ElectionCandidate(
                        poll_option_id=opt.id,
                        poll_id=e4_poll.id,
                        candidate_code=code,
                        statement=stmt,
                    )
                )
                c4_options.append(opt)

            approved_count = _register_voters_for_election(
                session=session,
                poll=e4_poll,
                admin=admin,
                voter_users=voter_users,
                extra_users=extra_users,
                hmac_key=hmac_key,
                include_extra=True,
            )

            session.add(
                ElectionConfig(
                    poll_id=e4_poll.id,
                    registration_starts_at=e4_reg_start,
                    registration_ends_at=e4_reg_end,
                    roster_frozen_at=e4_freeze,
                    eligible_voter_count=approved_count,
                    created_at=e4_poll.created_at,
                    updated_at=e4_freeze,
                )
            )
            session.flush()

            _issue_credentials_for_approved_voters(session, e4_poll.id, e4_freeze)

            # Consume credentials and seed certified ballots (12 votes for C1, 8 for C2, 4 for C3)
            # Fetch issued credentials
            creds = session.execute(
                select(ElectionVoterCredential).where(
                    ElectionVoterCredential.poll_id == e4_poll.id,
                    ElectionVoterCredential.status == CredentialStatus.ISSUED.value,
                )
            ).scalars().all()

            distribution = [c4_options[0].id] * 12 + [c4_options[1].id] * 8 + [c4_options[2].id] * 4

            # Consume the voter credentials up to the distribution length
            for i, cand_opt_id in enumerate(distribution):
                vote_time = e4_vote_start + timedelta(hours=i * 5 + 1)
                if i < len(creds):
                    creds[i].status = CredentialStatus.CONSUMED.value
                    creds[i].consumed_at = vote_time

                session.add(
                    ElectionBallot(
                        receipt_id=uuid.uuid4(),
                        poll_id=e4_poll.id,
                        candidate_option_id=cand_opt_id,
                        submitted_at=vote_time,
                    )
                )

            seeded_election_ids.append(e4_poll.id)
            logger.info("Seeded Election 4 (CLOSED): id=%d", e4_poll.id)
        else:
            seeded_election_ids.append(e4_poll.id)

        session.commit()
    return seeded_election_ids


def _register_voters_for_election(
    session: Session,
    poll: Poll,
    admin: User,
    voter_users: dict[str, User],
    extra_users: list[User],
    hmac_key: bytes,
    include_extra: bool = True,
) -> int:
    """Register demo voters (approved, rejected, pending) for a given election.

    Returns the number of APPROVED registrations.
    """
    approved_count = 0
    now = datetime.now(timezone.utc)

    for spec in DEMO_VOTERS:
        user = voter_users.get(spec.username)
        if not user:
            continue

        existing_reg = session.execute(
            select(ElectionRegistration).where(
                ElectionRegistration.poll_id == poll.id,
                ElectionRegistration.user_id == user.id,
            )
        ).scalar_one_or_none()

        if existing_reg is not None:
            if existing_reg.status == RegistrationStatus.APPROVED.value:
                approved_count += 1
            continue

        # Create or find voter identity
        fingerprint = compute_fingerprint(hmac_key, spec.doc_type.value, spec.issuer, spec.doc_number)
        suffix = compute_suffix(spec.doc_number)

        ident = session.execute(
            select(VoterIdentity).where(
                VoterIdentity.user_id == user.id,
                VoterIdentity.document_type == spec.doc_type.value,
                VoterIdentity.issuer == spec.issuer,
                VoterIdentity.document_fingerprint == fingerprint,
            )
        ).scalar_one_or_none()

        if ident is None:
            max_ver = session.execute(
                select(func.coalesce(func.max(VoterIdentity.version), 0)).where(
                    VoterIdentity.user_id == user.id
                )
            ).scalar_one()
            ident = VoterIdentity(
                user_id=user.id,
                version=max_ver + 1,
                document_type=spec.doc_type.value,
                issuer=spec.issuer,
                document_fingerprint=fingerprint,
                document_suffix=suffix,
                fingerprint_key_version=1,
                created_at=poll.created_at,
                updated_at=poll.created_at,
            )
            session.add(ident)
            session.flush()

        # Registration
        sub_time = poll.created_at + timedelta(hours=2)
        rev_time = sub_time + timedelta(hours=1) if spec.status != RegistrationStatus.PENDING else None
        reviewed_by = admin.id if spec.status != RegistrationStatus.PENDING else None

        reg = ElectionRegistration(
            poll_id=poll.id,
            user_id=user.id,
            identity_id=ident.id,
            legal_name_snapshot=spec.display_name.split()[0],
            status=spec.status.value,
            model_score=spec.score,
            model_reason_codes=spec.reason_codes,
            model_version="mock-eligibility-v1",
            reviewed_by=reviewed_by,
            reviewed_at=rev_time,
            submitted_at=sub_time,
            updated_at=rev_time or sub_time,
        )
        session.add(reg)
        session.flush()

        # Review event
        session.add(
            EligibilityReviewEvent(
                registration_id=reg.id,
                actor_type="MODEL",
                actor_id=None,
                from_status=None,
                to_status=spec.status.value,
                score=spec.score,
                reason_codes=spec.reason_codes,
                model_version="mock-eligibility-v1",
                review_note=spec.review_note,
                request_id=f"seed-{reg.id}",
                created_at=sub_time,
            )
        )
        if spec.status in (RegistrationStatus.APPROVED, RegistrationStatus.REJECTED):
            session.add(
                EligibilityReviewEvent(
                    registration_id=reg.id,
                    actor_type="ADMIN",
                    actor_id=admin.id,
                    from_status=RegistrationStatus.PENDING.value,
                    to_status=spec.status.value,
                    score=spec.score,
                    reason_codes=spec.reason_codes,
                    model_version=None,
                    review_note=spec.review_note,
                    request_id=f"seed-admin-{reg.id}",
                    created_at=rev_time,
                )
            )

        if spec.status == RegistrationStatus.APPROVED:
            approved_count += 1

    # Also register extra users (like mzc / demo_user) as APPROVED voters so user can test seamlessly
    if include_extra:
        for idx, eu in enumerate(extra_users):
            existing_reg = session.execute(
                select(ElectionRegistration).where(
                    ElectionRegistration.poll_id == poll.id,
                    ElectionRegistration.user_id == eu.id,
                )
            ).scalar_one_or_none()
            if existing_reg:
                if existing_reg.status == RegistrationStatus.APPROVED.value:
                    approved_count += 1
                continue

            doc_no = f"s999000{eu.id}"
            fp = compute_fingerprint(hmac_key, DocumentType.STUDENT_ID.value, "HKMU", doc_no)
            suf = compute_suffix(doc_no)

            ident = session.execute(
                select(VoterIdentity).where(
                    VoterIdentity.user_id == eu.id,
                    VoterIdentity.document_fingerprint == fp,
                )
            ).scalar_one_or_none()

            if ident is None:
                max_ver = session.execute(
                    select(func.coalesce(func.max(VoterIdentity.version), 0)).where(
                        VoterIdentity.user_id == eu.id
                    )
                ).scalar_one()
                ident = VoterIdentity(
                    user_id=eu.id,
                    version=max_ver + 1,
                    document_type=DocumentType.STUDENT_ID.value,
                    issuer="HKMU",
                    document_fingerprint=fp,
                    document_suffix=suf,
                    fingerprint_key_version=1,
                    created_at=poll.created_at,
                    updated_at=poll.created_at,
                )
                session.add(ident)
                session.flush()

            reg = ElectionRegistration(
                poll_id=poll.id,
                user_id=eu.id,
                identity_id=ident.id,
                legal_name_snapshot=eu.display_name or eu.username,
                status=RegistrationStatus.APPROVED.value,
                model_score=100,
                model_reason_codes=["STUDENT_ID_VALID", "ISSUER_RECOGNIZED"],
                model_version="mock-eligibility-v1",
                reviewed_by=admin.id,
                reviewed_at=poll.created_at + timedelta(hours=3),
                submitted_at=poll.created_at + timedelta(hours=2),
                updated_at=poll.created_at + timedelta(hours=3),
            )
            session.add(reg)
            session.flush()
            approved_count += 1

    return approved_count


def _issue_credentials_for_approved_voters(
    session: Session, poll_id: int, frozen_at: datetime
) -> list[ElectionVoterCredential]:
    """Issue credentials for all approved registrations in the election."""
    regs = session.execute(
        select(ElectionRegistration).where(
            ElectionRegistration.poll_id == poll_id,
            ElectionRegistration.status == RegistrationStatus.APPROVED.value,
        )
    ).scalars().all()

    creds: list[ElectionVoterCredential] = []
    for reg in regs:
        existing = session.execute(
            select(ElectionVoterCredential).where(
                ElectionVoterCredential.poll_id == poll_id,
                ElectionVoterCredential.registration_id == reg.id,
            )
        ).scalar_one_or_none()
        if existing:
            creds.append(existing)
            continue

        cred = ElectionVoterCredential(
            id=uuid.uuid4(),
            poll_id=poll_id,
            registration_id=reg.id,
            status=CredentialStatus.ISSUED.value,
            issued_at=frozen_at,
            consumed_at=None,
        )
        session.add(cred)
        creds.append(cred)
    session.flush()
    return creds
