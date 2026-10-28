import type { AccessPhase } from "./types";

export function deriveAccessState(input: {
  loading: boolean;
  authenticated: boolean;
  loginRequired: boolean;
  passwordRequired: boolean;
  accountExpired: boolean;
  grantExpired: boolean;
  submissionUnknown: boolean;
  hasVoted: boolean;
  hasDetail: boolean;
}): AccessPhase {
  if (input.loading) {
    return "access_loading";
  }
  if (input.accountExpired) {
    return "login_required";
  }
  if (input.grantExpired) {
    return "password_required";
  }
  if (input.submissionUnknown && !input.hasVoted) {
    return "submission_unknown";
  }
  if (input.hasVoted) {
    return "voted";
  }
  if (input.loginRequired && !input.authenticated) {
    return "login_required";
  }
  if (input.passwordRequired && !input.hasDetail) {
    return "password_required";
  }
  if (input.hasDetail) {
    return "ready";
  }
  return "access_failed";
}
