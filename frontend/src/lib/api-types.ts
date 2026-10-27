export type UserRole = "USER" | "ADMIN";
export type IdentityMode = "NAMED" | "ANONYMOUS";
export type Visibility = "PUBLIC" | "PRIVATE";
export type PollLifecycle = "DRAFT" | "PUBLISHED" | "CLOSED";
export type EffectiveStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";
export type ResultsAccessReason = "creator" | "admin" | "closed" | "unavailable";

export type UserPublic = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole | string;
};

export type SessionPublic = {
  user: UserPublic;
  csrf_token: string;
  session_expires_at: string;
};

export type GuestPublic = {
  csrf_token: string;
  expires_at: string;
};

export type Page<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};

export type ValidationIssue = {
  field: string;
  loc: string[];
  msg: string;
};

export type ValidationErrorData = {
  issues: ValidationIssue[];
};

export type Envelope<T> = {
  code: number;
  msg: string;
  data: T | null;
  request_id: string;
};

export type OptionPublic = {
  id: number;
  label: string;
  position: number;
};

export type PollSummary = {
  id: number;
  title: string;
  identity_mode: IdentityMode | string;
  visibility: Visibility | string;
  starts_at: string;
  ends_at: string;
  effective_status: EffectiveStatus | string;
  created_at: string;
};

export type ManagePollSummary = PollSummary & {
  lifecycle: PollLifecycle | string;
  version: number;
  creator_id: number;
};

export type VoteReceipt = {
  receipt_id: string;
  poll_id: number;
  submitted_at: string;
};

export type PollDetail = PollSummary & {
  description: string | null;
  options: OptionPublic[];
  has_voted: boolean;
  receipt: VoteReceipt | null;
  server_time: string;
  can_vote: boolean;
  can_manage: boolean;
  can_view_results: boolean;
  results_access_reason: ResultsAccessReason | string;
};

export type ManagePollDetail = PollSummary & {
  description: string | null;
  options: OptionPublic[];
  lifecycle: PollLifecycle | string;
  version: number;
  creator_id: number;
  closed_at: string | null;
  has_access_password: boolean;
  server_time: string;
  can_manage: boolean;
  can_view_results: boolean;
};

export type ShareEntry = {
  poll_id: number;
  identity_mode: IdentityMode | string;
  visibility: Visibility | string;
  password_required: boolean;
  login_required: boolean;
};

export type ShareLink = {
  share_url: string;
  requires_password: boolean;
  requires_login: boolean;
  access_password: string | null;
};

export type AccessGrantPublic = {
  poll_id: number;
  expires_at: string;
};

export type OptionResult = {
  option_id: number;
  label: string;
  count: number;
  percentage: number;
};

export type PollResults = {
  poll_id: number;
  total_votes: number;
  options: OptionResult[];
  winner_option_ids: number[];
  is_final: boolean;
  server_time: string;
};

export type MyVote = {
  receipt_id: string;
  poll_id: number;
  poll_title: string;
  submitted_at: string;
};

export type AuditEventPublic = {
  id: number;
  actor_id: number;
  action: string;
  poll_id: number;
  receipt_id: string | null;
  created_at: string;
  request_id: string;
};

export type OptionInput = {
  label: string;
};

export type PollWriteBody = {
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  identity_mode: IdentityMode;
  visibility: Visibility;
  access_password: string | null;
  options: OptionInput[];
};

export type PollUpdateBody = PollWriteBody & {
  expected_version: number;
};

export type PageQuery = {
  page?: number;
  page_size?: number;
  status?: string;
  q?: string;
  poll_id?: number;
  action?: string;
};
