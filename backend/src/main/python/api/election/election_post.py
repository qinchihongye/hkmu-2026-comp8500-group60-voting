"""Voter election write operations: registration and secret ballot submission."""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import (
    election_ballot_service_for,
    eligibility_service_for,
    require_auth_csrf,
)
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.election_request import (
    RegisterVoterRequest,
    SubmitElectionBallotRequest,
)
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.election_response import (
    BallotReceiptResponse,
    VoterRegistrationSummary,
)
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["elections"])


@router.post(
    "/elections/{election_id}/registrations",
    status_code=201,
    response_model=ResponseModel[VoterRegistrationSummary],
    responses=error_response_declarations(),
)
def register_voter(
    election_id: int,
    payload: RequestModel[RegisterVoterRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[VoterRegistrationSummary]:
    """Submit identity registration for an open election."""
    mark_private(response)
    summary = eligibility_service_for(request).register_voter(
        poll_id=election_id,
        user_id=principal.user_id,
        request=payload.data,
    )
    return success_body(request, summary)


@router.post(
    "/elections/{election_id}/ballots",
    status_code=201,
    response_model=ResponseModel[BallotReceiptResponse],
    responses=error_response_declarations(),
)
def cast_election_ballot(
    election_id: int,
    payload: RequestModel[SubmitElectionBallotRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_auth_csrf),
) -> ResponseModel[BallotReceiptResponse]:
    """Cast a secret anonymous ballot for an approved eligible voter."""
    mark_private(response)
    receipt = election_ballot_service_for(request).cast_ballot(
        poll_id=election_id,
        user_id=principal.user_id,
        candidate_option_id=payload.data.candidate_option_id,
    )
    return success_body(request, receipt)

