"""Schema introspection and architectural verification of B2 identity and ballot separation."""

from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import inspect, select

from src.main.python.constants.enums import CredentialStatus, DocumentType, RegistrationStatus
from src.main.python.database.models import PollOption, User
from src.main.python.database.models.election import (
    ElectionBallot,
    ElectionRegistration,
    ElectionVoterCredential,
    VoterIdentity,
)
from tests.poll_support import (
    clock_of,
    envelope,
    open_session,
    post_json,
    register_and_login,
)


def _promote_admin(client: TestClient, username: str) -> None:
    with open_session(client) as session:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        user.role = "ADMIN"
        session.commit()


def test_ballot_table_schema_privacy_isolation(auth_client: TestClient) -> None:
    """Verify that election_ballots schema contains strictly zero voter-identifiable fields or FKs."""
    with open_session(auth_client) as session:
        bind = session.get_bind()
        inspector = inspect(bind)

        # 1. Inspect columns
        columns = inspector.get_columns("election_ballots")
        column_names = {col["name"] for col in columns}
        expected_columns = {"id", "receipt_id", "poll_id", "candidate_option_id", "submitted_at"}

        assert column_names == expected_columns, f"Unexpected columns in election_ballots: {column_names}"

        # Ensure no forbidden columns
        forbidden_substrings = ["user", "cred", "registration", "ip_address", "agent", "identity"]
        for col_name in column_names:
            for forbidden in forbidden_substrings:
                assert forbidden not in col_name.lower(), f"Forbidden column found: {col_name}"

        # 2. Inspect foreign keys
        foreign_keys = inspector.get_foreign_keys("election_ballots")
        referred_tables = {fk["referred_table"] for fk in foreign_keys}
        expected_tables = {"election_candidates"}

        assert referred_tables == expected_tables, f"Unexpected foreign keys on election_ballots: {referred_tables}"

        # Ensure no FK points to voter identities, registrations, credentials, or users
        prohibited_tables = {"users", "voter_identities", "election_registrations", "election_voter_credentials"}
        assert referred_tables.isdisjoint(prohibited_tables), "Prohibited FK found in election_ballots!"


def test_ballot_submission_leaves_no_traceable_link(auth_client: TestClient) -> None:
    """Verify that after casting a ballot, the ballot record in the DB cannot be linked back to the voter."""
    admin_csrf = register_and_login(auth_client, "admin_privacy_test")
    _promote_admin(auth_client, "admin_privacy_test")

    now = clock_of(auth_client).now()
    payload = {
        "title": "Privacy Isolation Election",
        "description": "Test secret ballot B2 architecture.",
        "registration_starts_at": (now - timedelta(days=2)).isoformat(),
        "registration_ends_at": (now - timedelta(hours=1)).isoformat(),
        "starts_at": (now - timedelta(minutes=30)).isoformat(),
        "ends_at": (now + timedelta(days=1)).isoformat(),
        "allow_live_results": True,
        "candidates": [
            {"candidate_code": "CAN_1", "name": "Alice"},
            {"candidate_code": "CAN_2", "name": "Bob"},
        ],
    }
    poll_id = envelope(post_json(auth_client, "/api/v1/admin/elections", payload, csrf=admin_csrf), 201)["id"]
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/publish", {}, csrf=admin_csrf)
    post_json(auth_client, f"/api/v1/admin/elections/{poll_id}/freeze-roster", {}, csrf=admin_csrf)

    # Register voter and issue credential
    voter_csrf = register_and_login(auth_client, "secret_voter")
    with open_session(auth_client) as session:
        voter = session.execute(select(User).where(User.username == "secret_voter")).scalar_one()
        voter_id = voter.id

        ident = VoterIdentity(
            user_id=voter_id,
            version=1,
            document_type=DocumentType.STUDENT_ID.value,
            issuer="HKMU",
            document_fingerprint="priv_fingerprint_01",
            document_suffix="9012",
            fingerprint_key_version=1,
            created_at=now - timedelta(days=1),
        )
        session.add(ident)
        session.flush()

        reg = ElectionRegistration(
            poll_id=poll_id,
            user_id=voter_id,
            identity_id=ident.id,
            legal_name_snapshot="Secret Voter",
            status=RegistrationStatus.APPROVED.value,
            submitted_at=now - timedelta(days=1),
            updated_at=now - timedelta(days=1),
        )
        session.add(reg)
        session.flush()

        cred = ElectionVoterCredential(
            id=uuid4(),
            poll_id=poll_id,
            registration_id=reg.id,
            status=CredentialStatus.ISSUED.value,
            issued_at=now - timedelta(hours=1),
        )
        session.add(cred)

        cand = session.execute(
            select(PollOption).where(PollOption.poll_id == poll_id)
        ).scalars().first()
        cand_id = cand.id
        session.commit()

    # Submit ballot
    vote_res = post_json(
        auth_client,
        f"/api/v1/elections/{poll_id}/ballots",
        {"candidate_option_id": cand_id},
        csrf=voter_csrf,
    )
    receipt_data = envelope(vote_res, 201)
    receipt_id = UUID(receipt_data["receipt_id"])

    # Directly inspect election_ballots row in database
    with open_session(auth_client) as session:
        ballot = session.execute(select(ElectionBallot).where(ElectionBallot.receipt_id == receipt_id)).scalar_one()
        assert ballot.poll_id == poll_id
        assert ballot.candidate_option_id == cand_id

        # Introspect instance attributes: no user reference exists
        assert not hasattr(ballot, "user_id")
        assert not hasattr(ballot, "credential_id")
        assert not hasattr(ballot, "registration_id")
        assert not hasattr(ballot, "ip")
        assert not hasattr(ballot, "user_agent")

