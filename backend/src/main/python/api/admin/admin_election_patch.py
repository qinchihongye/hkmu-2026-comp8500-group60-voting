"""Admin election update endpoints for editing drafts."""

from fastapi import APIRouter, Depends, Request, Response

from src.main.python.api.dependencies import election_service_for, require_admin_csrf
from src.main.python.fileds.context import Principal
from src.main.python.fileds.request.election_request import UpdateElectionRequest
from src.main.python.fileds.request.request import RequestModel
from src.main.python.fileds.response.election_response import ElectionDetail
from src.main.python.fileds.response.response import ResponseModel
from src.main.python.utils.error_handlers import error_response_declarations
from src.main.python.utils.response_util import success_body
from src.main.python.utils.security_util import mark_private

router = APIRouter(tags=["admin-elections"])


@router.patch(
    "/admin/elections/{election_id}",
    response_model=ResponseModel[ElectionDetail],
    responses=error_response_declarations(),
)
def update_election(
    election_id: int,
    payload: RequestModel[UpdateElectionRequest],
    request: Request,
    response: Response,
    principal: Principal = Depends(require_admin_csrf),
) -> ResponseModel[ElectionDetail]:
    """Update a draft election with optimistic concurrency control."""
    mark_private(response)
    detail = election_service_for(request).update_election(election_id, principal, payload.data)
    return success_body(request, detail)

