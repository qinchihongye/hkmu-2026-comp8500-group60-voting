export type GuestStatus = "loading" | "ready" | "missing";

export type AccessPhase =
  | "access_loading"
  | "login_required"
  | "password_required"
  | "ready"
  | "voted"
  | "submission_unknown";

export type GuestState = {
  guestStatus: GuestStatus;
  guestCsrf: string | null;
  guestExpiresAt: string | null;
  ensureGuest: () => Promise<void>;
};
