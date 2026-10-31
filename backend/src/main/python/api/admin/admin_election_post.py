"""Admin election write endpoints: creation, publishing, and early closing."""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import (
    election_service_for,
    eligibility_service_for,
    require_admin_csrf,
    roster_service_for,
)
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.election_request import (
    CreateElectionRequest,
    ReviewRegistrationRequest,
)
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.election_response import (
    AdminRegistrationItem,
    ElectionDetail,
    RosterFreezeResponse,
)
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["admin-elections"])


@router.post(
    "/admin/elections",
    status_code=201,
    response_model=ResponseModel[ElectionDetail],
    responses=error_response_declarations(),
)
def create_election(
    payload: RequestModel[CreateElectionRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin_csrf),
) -> ResponseModel[ElectionDetail]:
    """Create a new draft election."""
    mark_private(response)
    detail = election_service_for(request).create_election(principal, payload.data)
    return success_body(request, detail)


@router.post(
    "/admin/elections/{election_id}/publish",
    response_model=ResponseModel[ElectionDetail],
    responses=error_response_declarations(),
)
def publish_election(
    election_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin_csrf),
) -> ResponseModel[ElectionDetail]:
    """Publish a draft election."""
    mark_private(response)
    detail = election_service_for(request).publish_election(election_id, principal)
    return success_body(request, detail)


@router.post(
    "/admin/elections/{election_id}/close",
    response_model=ResponseModel[ElectionDetail],
    responses=error_response_declarations(),
)
def close_election(
    election_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin_csrf),
) -> ResponseModel[ElectionDetail]:
    """Admin early close for an election in progress."""
    mark_private(response)
    detail = election_service_for(request).close_election(election_id, principal)
    return success_body(request, detail)


@router.post(
    "/admin/elections/{election_id}/registrations/{registration_id}/review",
    response_model=ResponseModel[AdminRegistrationItem],
    responses=error_response_declarations(),
)
def review_registration(
    election_id: int,
    registration_id: int,
    payload: RequestModel[ReviewRegistrationRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin_csrf),
) -> ResponseModel[AdminRegistrationItem]:
    """Admin manual review of a registration."""
    mark_private(response)
    item = eligibility_service_for(request).review_registration(
        poll_id=election_id,
        registration_id=registration_id,
        admin_id=principal.user_id,
        request=payload.data,
    )
    return success_body(request, item)


@router.post(
    "/admin/elections/{election_id}/freeze-roster",
    response_model=ResponseModel[RosterFreezeResponse],
    responses=error_response_declarations(),
)
def freeze_roster(
    election_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin_csrf),
) -> ResponseModel[RosterFreezeResponse]:
    """Explicitly freeze voter eligibility roster and batch-issue credentials."""
    mark_private(response)
    freeze_result = roster_service_for(request).freeze_roster(
        election_id=election_id,
        admin_id=principal.user_id,
    )
    return success_body(request, freeze_result)

