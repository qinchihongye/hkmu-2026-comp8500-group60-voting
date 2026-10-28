import { apiClient } from "../../lib/http";
import type { MyVote, Page, PageQuery, PollDetail, PollResults, PollSummary, VoteReceipt } from "../../lib/api-types";

export function getPolls(query: PageQuery = {}): Promise<Page<PollSummary>> {
  return apiClient({ path: "/api/v1/polls", query });
}

export function getPoll(pollId: number, signal?: AbortSignal): Promise<PollDetail> {
  return apiClient({ path: `/api/v1/polls/${pollId}`, signal });
}

export function castVote(pollId: number, optionIds: number[]): Promise<VoteReceipt> {
  return apiClient({
    method: "POST",
    path: `/api/v1/polls/${pollId}/votes`,
    data: { option_ids: optionIds },
    csrfSource: "guest",
  });
}

export function getResults(pollId: number): Promise<PollResults> {
  return apiClient({ path: `/api/v1/polls/${pollId}/results` });
}

export function getMyVotes(query: PageQuery = {}): Promise<Page<MyVote>> {
  return apiClient({ path: "/api/v1/me/votes", query });
}
