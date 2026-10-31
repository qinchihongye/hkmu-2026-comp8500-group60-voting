/**
 * API client functions for Election features.
 */

import { apiClient } from "../../lib/http";
import type { Page, PageQuery } from "../../lib/api-types";
import type {
  BallotReceiptResponse,
  CreateElectionPayload,
  ElectionDetail,
  ElectionResultResponse,
  ElectionSummary,
  RegisterVoterPayload,
  ReviewRegistrationPayload,
  RosterFreezeResponse,
  UpdateElectionPayload,
  VoterRegistrationSummary,
} from "./types";

// Public & Voter API
export function getPublicElections(query: PageQuery = {}): Promise<Page<ElectionSummary>> {
  return apiClient({ path: "/api/v1/elections", query });
}

export function getPublicElection(electionId: number, signal?: AbortSignal): Promise<ElectionDetail> {
  return apiClient({ path: `/api/v1/elections/${electionId}`, signal });
}

export function registerVoter(
  electionId: number,
  payload: RegisterVoterPayload
): Promise<VoterRegistrationSummary> {
  return apiClient({
    method: "POST",
    path: `/api/v1/elections/${electionId}/registrations`,
    data: payload,
    csrfSource: "auth",
  });
}

export function castElectionBallot(
  electionId: number,
  candidateOptionId: number
): Promise<BallotReceiptResponse> {
  return apiClient({
    method: "POST",
    path: `/api/v1/elections/${electionId}/ballots`,
    data: { candidate_option_id: candidateOptionId },
    csrfSource: "auth",
  });
}

export function getElectionResults(
  electionId: number,
  signal?: AbortSignal
): Promise<ElectionResultResponse> {
  return apiClient({ path: `/api/v1/elections/${electionId}/results`, signal });
}

export function getMyElectionRegistrations(
  query: PageQuery = {}
): Promise<Page<VoterRegistrationSummary>> {
  return apiClient({ path: "/api/v1/me/election-registrations", query });
}

// Admin API
export function getAdminElections(query: PageQuery = {}): Promise<Page<ElectionSummary>> {
  return apiClient({ path: "/api/v1/admin/elections", query });
}

export function getAdminElection(electionId: number): Promise<ElectionDetail> {
  return apiClient({ path: `/api/v1/admin/elections/${electionId}` });
}

export function createAdminElection(payload: CreateElectionPayload): Promise<ElectionDetail> {
  return apiClient({
    method: "POST",
    path: "/api/v1/admin/elections",
    data: payload,
    csrfSource: "auth",
  });
}

export function updateAdminElection(
  electionId: number,
  payload: UpdateElectionPayload
): Promise<ElectionDetail> {
  return apiClient({
    method: "PATCH",
    path: `/api/v1/admin/elections/${electionId}`,
    data: payload,
    csrfSource: "auth",
  });
}

export function publishAdminElection(electionId: number): Promise<ElectionDetail> {
  return apiClient({
    method: "POST",
    path: `/api/v1/admin/elections/${electionId}/publish`,
    data: {},
    csrfSource: "auth",
  });
}

export function freezeAdminRoster(electionId: number): Promise<RosterFreezeResponse> {
  return apiClient({
    method: "POST",
    path: `/api/v1/admin/elections/${electionId}/freeze-roster`,
    data: {},
    csrfSource: "auth",
  });
}

export function closeAdminElection(electionId: number): Promise<ElectionDetail> {
  return apiClient({
    method: "POST",
    path: `/api/v1/admin/elections/${electionId}/close`,
    data: {},
    csrfSource: "auth",
  });
}

export function getAdminRegistrations(
  electionId: number,
  query: PageQuery & { status?: string } = {}
): Promise<Page<VoterRegistrationSummary>> {
  return apiClient({
    path: `/api/v1/admin/elections/${electionId}/registrations`,
    query,
  });
}

export function reviewAdminRegistration(
  electionId: number,
  registrationId: number,
  payload: ReviewRegistrationPayload
): Promise<VoterRegistrationSummary> {
  return apiClient({
    method: "POST",
    path: `/api/v1/admin/elections/${electionId}/registrations/${registrationId}/review`,
    data: payload,
    csrfSource: "auth",
  });
}

