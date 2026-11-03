"""Verify that the closed demo election has one eligible voter per seeded ballot."""

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from src.main.python.algorithms.election_module.demo_election_seed import seed_realistic_elections
from src.main.python.database.models import Poll, User
from src.main.python.database.models.election import (
    ElectionBallot,
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
)
from tests.poll_support import open_session


def test_closed_demo_election_turnout_is_consistent_after_reseed(auth_client: TestClient) -> None:
    """The sample's ballot, approved voter and consumed credential counts remain equal."""
    with open_session(auth_client) as session:
        admin = User(
            username="demo_election_admin",
            display_name="Election admin",
            password_hash=auth_client.app.state.passwords.hash("Password123!"),
            role="ADMIN",
        )
        session.add(admin)
        session.commit()

    factory = auth_client.app.state.session_factory
    for _ in range(2):
        election_ids = seed_realistic_elections(factory, b"e" * 32)
        closed_id = election_ids[-1]
        with open_session(auth_client) as session:
            poll = session.get(Poll, closed_id)
            config = session.get(ElectionConfig, closed_id)
            assert poll is not None and config is not None
            ballots = session.scalar(
                select(func.count())
                .select_from(ElectionBallot)
                .where(ElectionBallot.poll_id == closed_id)
            )
            approved = session.scalar(
                select(func.count()).select_from(ElectionRegistration).where(
                    ElectionRegistration.poll_id == closed_id,
                    ElectionRegistration.status == "APPROVED",
                )
            )
            consumed = session.scalar(
                select(func.count()).select_from(ElectionVoterCredential).where(
                    ElectionVoterCredential.poll_id == closed_id,
                    ElectionVoterCredential.status == "CONSUMED",
                )
            )
            assert ballots == approved == consumed == config.eligible_voter_count == 24

    # Simulate a database seeded by the older fixture: keep all 24 ballots,
    # but remove the additional voter roster and its credentials.
    with open_session(auth_client) as session:
        fixture_registrations = session.scalars(
            select(ElectionRegistration)
            .join(User, ElectionRegistration.user_id == User.id)
            .where(
                ElectionRegistration.poll_id == closed_id,
                User.username.like("election_fixture_voter_%"),
            )
        ).all()
        assert fixture_registrations
        fixture_ids = [registration.id for registration in fixture_registrations]
        session.execute(
            delete(ElectionVoterCredential).where(
                ElectionVoterCredential.registration_id.in_(fixture_ids)
            )
        )
        session.execute(
            delete(ElectionRegistration).where(ElectionRegistration.id.in_(fixture_ids))
        )
        config = session.get(ElectionConfig, closed_id)
        assert config is not None
        remaining_approved = session.scalar(
            select(func.count()).select_from(ElectionRegistration).where(
                ElectionRegistration.poll_id == closed_id,
                ElectionRegistration.status == "APPROVED",
            )
        )
        config.eligible_voter_count = remaining_approved
        session.commit()

    seed_realistic_elections(factory, b"e" * 32)
    with open_session(auth_client) as session:
        config = session.get(ElectionConfig, closed_id)
        assert config is not None
        ballots = session.scalar(
            select(func.count())
            .select_from(ElectionBallot)
            .where(ElectionBallot.poll_id == closed_id)
        )
        approved = session.scalar(
            select(func.count()).select_from(ElectionRegistration).where(
                ElectionRegistration.poll_id == closed_id,
                ElectionRegistration.status == "APPROVED",
            )
        )
        consumed = session.scalar(
            select(func.count()).select_from(ElectionVoterCredential).where(
                ElectionVoterCredential.poll_id == closed_id,
                ElectionVoterCredential.status == "CONSUMED",
            )
        )
        assert ballots == approved == consumed == config.eligible_voter_count == 24
