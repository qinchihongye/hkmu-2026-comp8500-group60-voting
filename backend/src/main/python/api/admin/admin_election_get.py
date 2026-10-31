"""Admin election read endpoints for listing and details."""

from fastapi import APIRouter, Depends, Query, Request, Response

from src.main.python.api.dependencies import (
    election_service_for,
    eligibility_service_for,
    require_admin,
)
from src.main.python.constants.enums import RegistrationStatus
from src.main.python.fileds.context import Principal
from src.main.python.fileds.response.election_response import (
    AdminRegistrationItem,
    ElectionDetail,
    ElectionSummary,
)
from src.main.python.fileds.response.response import Page, ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_no_referrer, mark_private

router = APIRouter(tags=["admin-elections"])


@router.get(
    "/admin/elections",
    response_model=ResponseModel[Page[ElectionSummary]],
    responses=error_response_declarations(),
)
def list_admin_elections(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    principal: Principal = Depends(require_admin),
) -> ResponseModel[Page[ElectionSummary]]:
    """List all elections across all phases for administrators."""
    mark_private(response)
    mark_no_referrer(response)
    items = election_service_for(request).list_admin_elections(page=page, page_size=page_size)
    return success_body(request, items)


@router.get(
    "/admin/elections/{election_id}",
    response_model=ResponseModel[ElectionDetail],
    responses=error_response_declarations(),
)
def get_admin_election(
    election_id: int,
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin),
) -> ResponseModel[ElectionDetail]:
    """Get full election details for administrator."""
    mark_private(response)
    mark_no_referrer(response)
    detail = election_service_for(request).get_admin_election(election_id)
    return success_body(request, detail)


@router.get(
    "/admin/elections/{election_id}/registrations",
    response_model=ResponseModel[Page[AdminRegistrationItem]],
    responses=error_response_declarations(),
)
def list_admin_registrations(
    election_id: int,
    request: Request,
    response: Response,
    status: RegistrationStatus | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    principal: Principal = Depends(require_admin),
) -> ResponseModel[Page[AdminRegistrationItem]]:
    """List voter registrations for an election with optional status filter."""
    mark_private(response)
    mark_no_referrer(response)
    items = eligibility_service_for(request).list_admin_registrations(
        poll_id=election_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return success_body(request, items)
