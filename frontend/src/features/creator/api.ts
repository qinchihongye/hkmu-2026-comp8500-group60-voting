import { apiClient } from "../../lib/http";
import type {
  ManagePollDetail,
  ManagePollSummary,
  Page,
  PageQuery,
  PollUpdateBody,
  PollWriteBody,
  ShareLink,
} from "../../lib/api-types";

export function createPoll(body: PollWriteBody): Promise<ManagePollDetail> {
  return apiClient({ method: "POST", path: "/api/v1/polls", data: body, csrfSource: "auth" });
}

export function updatePoll(pollId: number, body: PollUpdateBody): Promise<ManagePollDetail> {
  return apiClient({ method: "PATCH", path: `/api/v1/polls/${pollId}`, data: body, csrfSource: "auth" });
}

export function publishPoll(pollId: number, expectedVersion: number): Promise<ManagePollDetail> {
  return apiClient({
    method: "POST",
    path: `/api/v1/polls/${pollId}/publish`,
    data: { expected_version: expectedVersion },
    csrfSource: "auth",
  });
}

export function closePoll(pollId: number, expectedVersion: number): Promise<ManagePollDetail> {
  return apiClient({
    method: "POST",
    path: `/api/v1/polls/${pollId}/close`,
    data: { expected_version: expectedVersion },
    csrfSource: "auth",
  });
}

export function getMyPolls(query: PageQuery = {}): Promise<Page<ManagePollSummary>> {
  return apiClient({ path: "/api/v1/me/polls", query });
}

export function getOwnedPoll(pollId: number): Promise<ManagePollDetail> {
  return apiClient({ path: `/api/v1/me/polls/${pollId}` });
}

export function getShareInfo(pollId: number): Promise<ShareLink> {
  return apiClient({ path: `/api/v1/me/polls/${pollId}/share` });
}
