"""Public / voter election query endpoints."""

from fastapi import APIRouter, Depends, Query, Request, Response

from src.main.python.api.dependencies import (
    election_result_service_for,
    election_service_for,
    eligibility_service_for,
    get_optional_principal,
    require_user,
)
from src.main.python.constants.enums import UserRole
from src.main.python.fileds.context import Principal
from src.main.python.fileds.response.election_response import (
    ElectionDetail,
    ElectionResultResponse,
    ElectionSummary,
    VoterRegistrationSummary,
)
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["elections"])


@router.get(
    "/elections",
    response_model=ResponseModel[Page[ElectionSummary]],
    responses=error_response_declarations(),
)
def list_elections(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ResponseModel[Page[ElectionSummary]]:
    """List published and closed elections for public."""
    mark_private(response)
    mark_no_referrer(response)
    items = election_service_for(request).list_public_elections(page=page, page_size=page_size)
    return success_body(request, items)



@router.get(
    "/elections/{election_id}",
    response_model=ResponseModel[ElectionDetail],
    responses=error_response_declarations(),
)
def get_election(
    election_id: int,
    request: Request,
    response: Response,
    principal: Principal | None = Depends(get_optional_principal),
) -> ResponseModel[ElectionDetail]:
    """Get election details for public and voters."""
    mark_private(response)
    mark_no_referrer(response)
    user_id = principal.user_id if principal else None
    detail = election_service_for(request).get_public_election(election_id, user_id=user_id)
    return success_body(request, detail)


@router.get(
    "/me/election-registrations",
    response_model=ResponseModel[Page[VoterRegistrationSummary]],
    responses=error_response_declarations(),
)
def list_my_election_registrations(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    principal: Principal = Depends(require_user),
) -> ResponseModel[Page[VoterRegistrationSummary]]:
    """List current user's voter registration history across all elections."""
    mark_private(response)
    mark_no_referrer(response)
    items = eligibility_service_for(request).list_user_registrations(
        user_id=principal.user_id,
        page=page,
        page_size=page_size,
    )
    return success_body(request, items)


@router.get(
    "/elections/{election_id}/results",
    response_model=ResponseModel[ElectionResultResponse],
    responses=error_response_declarations(),
)
def get_election_results(
    election_id: int,
    request: Request,
    response: Response,
    principal: Principal | None = Depends(get_optional_principal),
) -> ResponseModel[ElectionResultResponse]:
    """Get election turnout scale and candidate tallies subject to authorization rules."""
    mark_private(response)
    mark_no_referrer(response)
    user_id = principal.user_id if principal else None
    is_admin = (principal.role == UserRole.ADMIN.value) if principal else False
    results = election_result_service_for(request).get_results(
        poll_id=election_id,
        user_id=user_id,
        is_admin=is_admin,
    )
    return success_body(request, results)


