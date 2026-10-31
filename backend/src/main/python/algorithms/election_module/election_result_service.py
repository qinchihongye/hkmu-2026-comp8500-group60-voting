"""Election result computation and authorization service."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from src.main.python.algorithms.election_module.election_service import (
    compute_election_phase,
)
from src.main.python.constants.enums import (
    ActivityType,
    CredentialStatus,
    ElectionPhase,
    PollLifecycle,
    RegistrationStatus,
)
from src.main.python.constants.error_codes import ApiCode
from src.main.python.database.models import Poll, PollOption
from src.main.python.database.models.election import (
    ElectionBallot,
    ElectionCandidate,
    ElectionConfig,
    ElectionRegistration,
    ElectionVoterCredential,
)
from src.main.python.fileds.response.election_response import (
    CandidateResultItem,
    ElectionResultResponse,
    TurnoutScaleStats,
)
from src.main.python.utils.clock_util import Clock
from src.main.python.utils.error_handlers import AppError


class ElectionResultService:
    """Computes election turnout and candidate results under the live results access matrix."""

    def __init__(self, session_factory: sessionmaker[Session], clock: Clock) -> None:
        self._factory = session_factory
        self._clock = clock

    def get_results(
        self,
        poll_id: int,
        user_id: int | None,
        is_admin: bool = False,
    ) -> ElectionResultResponse:
        """Fetch turnout metrics and candidate tallies according to permission rules."""
        now = self._clock.now()

        with self._factory() as session:
            poll = session.execute(
                select(Poll).where(
                    Poll.id == poll_id,
                    Poll.activity_type == ActivityType.ELECTION.value,
                )
            ).scalar_one_or_none()

            if poll is None:
                raise AppError(
                    404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message
                )

            config = session.execute(
                select(ElectionConfig).where(ElectionConfig.poll_id == poll_id)
            ).scalar_one_or_none()
            if config is None:
                raise AppError(
                    404, ApiCode.POLL_NOT_FOUND, ApiCode.POLL_NOT_FOUND.default_message
                )

            phase = compute_election_phase(
                poll=poll,
                config=config,
                now=now,
            )

            is_closed = (
                poll.lifecycle == PollLifecycle.CLOSED.value
                or now >= poll.ends_at
                or phase == ElectionPhase.CLOSED
            )

            # 1. Compute scale metrics
            reg_count = session.execute(
                select(func.count(ElectionRegistration.id)).where(
                    ElectionRegistration.poll_id == poll_id
                )
            ).scalar_one()

            if config.roster_frozen_at is not None and config.eligible_voter_count is not None:
                approved_count = config.eligible_voter_count
            else:
                approved_count = session.execute(
                    select(func.count(ElectionRegistration.id)).where(
                        ElectionRegistration.poll_id == poll_id,
                        ElectionRegistration.status == RegistrationStatus.APPROVED.value,
                    )
                ).scalar_one()

            ballot_count = session.execute(
                select(func.count(ElectionBallot.id)).where(ElectionBallot.poll_id == poll_id)
            ).scalar_one()

            if is_closed:
                abstention_count = max(0, approved_count - ballot_count)
                remaining_count = None
            else:
                abstention_count = None
                remaining_count = max(0, approved_count - ballot_count)

            turnout_pct = (
                round((ballot_count / approved_count) * 100, 2)
                if approved_count > 0
                else 0.0
            )

            scale = TurnoutScaleStats(
                registration_count=reg_count,
                approved_count=approved_count,
                ballot_count=ballot_count,
                remaining_count=remaining_count,
                abstention_count=abstention_count,
                turnout_percentage=turnout_pct,
            )

            # 2. Check authorization for candidate vote counts
            can_view_candidates = False

            if is_closed:
                # Once closed, final results are public to everyone
                can_view_candidates = True
            else:
                # Ongoing or scheduled election
                if not poll.allow_live_results:
                    # Live results disabled
                    if is_admin:
                        # Admin can view turnout scale, but candidate counts remain hidden
                        can_view_candidates = False
                    else:
                        raise AppError(
                            403,
                            ApiCode.ELECTION_RESULTS_NOT_AVAILABLE,
                            "Live results are disabled for this election",
                        )
                else:
                    # Live results enabled
                    if is_admin:
                        can_view_candidates = True
                    elif user_id is not None:
                        # Check if voter has cast a ballot
                        has_voted = session.execute(
                            select(ElectionVoterCredential.id)
                            .join(
                                ElectionRegistration,
                                (
                                    (
                                        ElectionRegistration.poll_id
                                        == ElectionVoterCredential.poll_id
                                    )
                                    & (
                                        ElectionRegistration.id
                                        == ElectionVoterCredential.registration_id
                                    )
                                ),
                            )
                            .where(
                                ElectionVoterCredential.poll_id == poll_id,
                                ElectionRegistration.user_id == user_id,
                                ElectionVoterCredential.status == CredentialStatus.CONSUMED.value,
                            )
                        ).scalar_one_or_none()

                        if has_voted is not None:
                            can_view_candidates = True
                        else:
                            raise AppError(
                                403,
                                ApiCode.ELECTION_RESULTS_NOT_AVAILABLE,
                                "You must submit your ballot before viewing live results",
                            )
                    else:
                        raise AppError(
                            403,
                            ApiCode.ELECTION_RESULTS_NOT_AVAILABLE,
                            "Authentication and voting required to view live results",
                        )

            # 3. Compute candidate tallies if permitted
            candidate_results = None
            winner_option_ids = None
            is_tie = False

            if can_view_candidates:
                candidate_rows = session.execute(
                    select(
                        ElectionCandidate.poll_option_id,
                        ElectionCandidate.candidate_code,
                        PollOption.label,
                    )
                    .join(
                        PollOption,
                        (PollOption.poll_id == ElectionCandidate.poll_id)
                        & (PollOption.id == ElectionCandidate.poll_option_id),
                    )
                    .where(ElectionCandidate.poll_id == poll_id)
                    .order_by(PollOption.position)
                ).all()

                ballot_tallies = dict(
                    session.execute(
                        select(
                            ElectionBallot.candidate_option_id,
                            func.count(ElectionBallot.id),
                        )
                        .where(ElectionBallot.poll_id == poll_id)
                        .group_by(ElectionBallot.candidate_option_id)
                    ).all()
                )

                items: list[CandidateResultItem] = []
                max_votes = -1
                for opt_id, code, name in candidate_rows:
                    votes = ballot_tallies.get(opt_id, 0)
                    pct = round((votes / ballot_count) * 100, 2) if ballot_count > 0 else 0.0
                    items.append(
                        CandidateResultItem(
                            candidate_option_id=opt_id,
                            candidate_code=code,
                            name=name,
                            vote_count=votes,
                            percentage=pct,
                        )
                    )
                    if votes > max_votes:
                        max_votes = votes

                candidate_results = items

                if ballot_count > 0 and max_votes > 0:
                    winners = [
                        it.candidate_option_id for it in items if it.vote_count == max_votes
                    ]
                    winner_option_ids = winners
                    is_tie = len(winners) > 1
                else:
                    winner_option_ids = []
                    is_tie = False

            return ElectionResultResponse(
                poll_id=poll_id,
                title=poll.title,
                phase=phase,
                allow_live_results=poll.allow_live_results,
                scale=scale,
                candidate_results=candidate_results,
                winner_option_ids=winner_option_ids,
                is_tie=is_tie,
            )
