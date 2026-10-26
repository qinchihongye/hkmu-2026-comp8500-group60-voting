import { apiClient } from "../../lib/http";
import type { AccessGrantPublic, ShareEntry } from "../../lib/api-types";

export function resolveShare(code: string, signal?: AbortSignal): Promise<ShareEntry> {
  return apiClient({ path: `/api/v1/shares/${encodeURIComponent(code)}`, signal });
}

export function unlockPoll(
  pollId: number,
  body: { share_code: string; password: string },
): Promise<AccessGrantPublic> {
  return apiClient({
    method: "POST",
    path: `/api/v1/polls/${pollId}/unlock`,
    data: body,
    csrfSource: "guest",
  });
}

export function ensureGuestRequest(): Promise<{ csrf_token: string; expires_at: string }> {
  return apiClient({ method: "POST", path: "/api/v1/guest/context", data: {}, csrfSource: "none" });
}
