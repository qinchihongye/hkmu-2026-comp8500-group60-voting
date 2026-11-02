"""Unit tests for election phase computation."""

from datetime import UTC, datetime, timedelta

from src.main.python.algorithms.election_module.election_service import compute_election_phase
from src.main.python.constants.enums import ElectionPhase, PollLifecycle
from src.main.python.database.models import Poll
from src.main.python.database.models.election import ElectionConfig


def _make_election(
    lifecycle: str = PollLifecycle.PUBLISHED,
    roster_frozen: bool = False,
) -> tuple[Poll, ElectionConfig]:
    base = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
    poll = Poll(
        id=1,
        activity_type="ELECTION",
        title="Test Election",
        lifecycle=lifecycle,
        starts_at=base + timedelta(days=5),
        ends_at=base + timedelta(days=10),
        creator_id=1,
    )
    config = ElectionConfig(
        poll_id=1,
        registration_starts_at=base + timedelta(days=1),
        registration_ends_at=base + timedelta(days=3),
        roster_frozen_at=base + timedelta(days=4) if roster_frozen else None,
        eligible_voter_count=10 if roster_frozen else None,
    )
    return poll, config


def test_draft_phase() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.DRAFT)
    now = datetime(2026, 11, 2, 12, 0, tzinfo=UTC)
    assert compute_election_phase(poll, config, now) == ElectionPhase.DRAFT


def test_closed_lifecycle_phase() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.CLOSED)
    now = datetime(2026, 11, 2, 12, 0, tzinfo=UTC)
    assert compute_election_phase(poll, config, now) == ElectionPhase.CLOSED


def test_time_expired_is_closed() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.PUBLISHED)
    now = poll.ends_at + timedelta(seconds=1)
    assert compute_election_phase(poll, config, now) == ElectionPhase.CLOSED


def test_registration_scheduled() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.PUBLISHED)
    now = config.registration_starts_at - timedelta(seconds=1)
    assert compute_election_phase(poll, config, now) == ElectionPhase.REGISTRATION_SCHEDULED


def test_registration_open() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.PUBLISHED)
    now = config.registration_starts_at + timedelta(hours=1)
    assert compute_election_phase(poll, config, now) == ElectionPhase.REGISTRATION_OPEN


def test_reviewing_when_unfrozen() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.PUBLISHED, roster_frozen=False)
    now = config.registration_ends_at + timedelta(hours=1)
    assert compute_election_phase(poll, config, now) == ElectionPhase.REVIEWING


def test_voting_scheduled_when_roster_frozen() -> None:
    poll, config = _make_election(lifecycle=PollLifecycle.PUBLISHED, roster_frozen=True)
    now = poll.starts_at - timedelta(hours=1)
    assert compute_election_phase(poll, config, now) == ElectionPhase.VOTING_SCHEDULED


def test_canonical_five_stages_sequence() -> None:
    """Verify strict sequential transition across the 5 canonical phases:

    UPCOMING -> REGISTRATION -> REVIEW -> VOTING -> RESULTS
    """
    poll, config = _make_election(lifecycle=PollLifecycle.PUBLISHED, roster_frozen=False)

    # 1. UPCOMING: Before registration starts
    t_upcoming = config.registration_starts_at - timedelta(minutes=10)
    assert compute_election_phase(poll, config, t_upcoming) == ElectionPhase.UPCOMING

    # 2. REGISTRATION: Within registration window
    t_reg = config.registration_starts_at + timedelta(minutes=10)
    assert compute_election_phase(poll, config, t_reg) == ElectionPhase.REGISTRATION

    # 3. REVIEW: After registration ends, before roster freeze (mandatory gating)
    t_review = config.registration_ends_at + timedelta(minutes=10)
    assert compute_election_phase(poll, config, t_review) == ElectionPhase.REVIEW

    # Even if time reaches voting start, if roster not frozen, MUST remain in REVIEW
    t_voting_time = poll.starts_at + timedelta(minutes=10)
    assert compute_election_phase(poll, config, t_voting_time) == ElectionPhase.REVIEW

    # Freeze roster:
    config.roster_frozen_at = config.registration_ends_at + timedelta(hours=1)
    config.eligible_voter_count = 10

    # Before voting start time: still in REVIEW
    t_pre_vote = poll.starts_at - timedelta(minutes=10)
    assert compute_election_phase(poll, config, t_pre_vote) == ElectionPhase.REVIEW

    # 4. VOTING: Roster frozen and within voting window
    assert compute_election_phase(poll, config, t_voting_time) == ElectionPhase.VOTING

    # 5. RESULTS: After voting ends
    t_results = poll.ends_at + timedelta(minutes=1)
    assert compute_election_phase(poll, config, t_results) == ElectionPhase.RESULTS

