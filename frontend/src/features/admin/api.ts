import { apiClient } from "../../lib/http";
import type { AuditEventPublic, ManagePollDetail, ManagePollSummary, Page, PageQuery } from "../../lib/api-types";

export function getAdminPolls(query: PageQuery = {}): Promise<Page<ManagePollSummary>> {
  return apiClient({ path: "/api/v1/admin/polls", query });
}

export function getAdminPoll(pollId: number): Promise<ManagePollDetail> {
  return apiClient({ path: `/api/v1/admin/polls/${pollId}` });
}

export function getAuditEvents(query: PageQuery = {}): Promise<Page<AuditEventPublic>> {
  return apiClient({ path: "/api/v1/admin/audit-events", query });
}
