/**
 * Type definitions for Election domain (B2 Architecture).
 */

export type ElectionPhase =
  | "DRAFT"
  | "REGISTRATION_SCHEDULED"
  | "REGISTRATION_OPEN"
  | "REVIEWING"
  | "VOTING_SCHEDULED"
  | "VOTING_OPEN"
  | "CLOSED";

export type DocumentType = "RESIDENT_ID" | "HK_MACAU_PERMIT" | "STUDENT_ID";

export type RegistrationStatus = "PENDING" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";

export interface ElectionCandidateItem {
  candidate_code: string;
  name: string;
  statement?: string | null;
}

export interface CandidatePublic {
  poll_option_id: number;
  candidate_code: string;
  name: string;
  statement: string | null;
  position: number;
}

export interface ElectionSummary {
  id: number;
  title: string;
  description: string;
  phase: ElectionPhase;
  registration_starts_at: string;
  registration_ends_at: string;
  starts_at: string;
  ends_at: string;
  allow_live_results: boolean;
  candidate_count: number;
  my_registration_status?: RegistrationStatus | null;
  user_registration_status?: RegistrationStatus | null;
  has_voted?: boolean;
}

export interface ElectionDetail {
  id: number;
  title: string;
  description: string;
  phase: ElectionPhase;
  lifecycle: string;
  registration_starts_at: string;
  registration_ends_at: string;
  starts_at: string;
  ends_at: string;
  allow_live_results: boolean;
  candidates: CandidatePublic[];
  my_registration_status?: RegistrationStatus | null;
  user_registration_status?: RegistrationStatus | null;
  has_voted?: boolean;
}

export interface RegisterVoterPayload {
  document_type: DocumentType;
  issuer: string;
  document_number: string;
  legal_name: string;
}

export interface VoterRegistrationSummary {
  id: number;
  poll_id: number;
  poll_title?: string;
  election_title?: string;
  document_type: DocumentType;
  issuer: string;
  document_suffix: string;
  legal_name_snapshot: string;
  status: RegistrationStatus;
  model_score?: number | null;
  model_reason_codes?: string[] | null;
  model_version?: string | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface BallotReceiptResponse {
  receipt_id: string;
  poll_id: number;
  submitted_at: string;
}

export interface CandidateResultItem {
  candidate_option_id: number;
  candidate_code: string;
  name: string;
  vote_count: number;
  percentage: number;
}

export interface TurnoutScaleStats {
  registration_count: number;
  approved_count: number;
  ballot_count: number;
  remaining_count?: number | null;
  abstention_count?: number | null;
  turnout_percentage?: number | null;
}

export interface ElectionResultResponse {
  poll_id: number;
  title: string;
  phase: ElectionPhase;
  allow_live_results: boolean;
  scale: TurnoutScaleStats;
  candidate_results?: CandidateResultItem[] | null;
  winner_option_ids?: number[] | null;
  is_tie: boolean;
}

export interface CreateElectionPayload {
  title: string;
  description?: string;
  registration_starts_at: string;
  registration_ends_at: string;
  starts_at: string;
  ends_at: string;
  allow_live_results: boolean;
  candidates: ElectionCandidateItem[];
}

export interface UpdateElectionPayload {
  title?: string;
  description?: string;
  registration_starts_at?: string;
  registration_ends_at?: string;
  starts_at?: string;
  ends_at?: string;
  allow_live_results?: boolean;
  candidates?: ElectionCandidateItem[];
}

export interface ReviewRegistrationPayload {
  decision: "APPROVED" | "REJECTED";
  reason_codes?: string[];
  review_note?: string;
}

export interface RosterFreezeResponse {
  poll_id: number;
  roster_frozen_at: string;
  eligible_voter_count: number;
  issued_credential_count: number;
}

