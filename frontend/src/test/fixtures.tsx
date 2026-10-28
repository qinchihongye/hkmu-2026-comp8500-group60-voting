import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { AppRouter } from "../app/router";
import { Providers } from "../app/providers";
import { ApiCode } from "../lib/api-codes";
import type { PollDetail } from "../lib/api-types";

export function envelope(data: unknown, status = 200, code: number = ApiCode.OK, msg = "ok"): Response {
  return new Response(JSON.stringify({ code, msg, data, request_id: "req-test" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function fail(code: number, msg: string, status: number, data: unknown = null): Response {
  return envelope(data, status, code, msg);
}

export function installFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function guestOk(): Response {
  return envelope({ csrf_token: "guest-csrf", expires_at: "2026-11-23T00:00:00Z" });
}

export function meAnonymous(): Response {
  return fail(ApiCode.UNAUTHENTICATED, "需要登录", 401);
}

export function sessionOf(role: "USER" | "ADMIN", displayName = "演示用户"): Response {
  return envelope({
    user: { id: role === "ADMIN" ? 1 : 2, username: role === "ADMIN" ? "admin" : "demo_user", display_name: displayName, role },
    csrf_token: "auth-csrf",
    session_expires_at: "2026-10-25T08:00:00Z",
  });
}

export function emptyPage(total = 0): Response {
  return envelope({ items: [], page: 1, page_size: 12, total });
}

export function samplePoll(overrides: Partial<PollDetail> = {}): PollDetail {
  return {
    id: 7,
    title: "午饭吃什么",
    identity_mode: "ANONYMOUS",
    visibility: "PUBLIC",
    vote_limit: null,
    selection_mode: "SINGLE",
    allow_live_results: false,
    starts_at: "2026-10-24T00:00:00Z",
    ends_at: "2026-10-24T12:00:00Z",
    effective_status: "OPEN",
    created_at: "2026-10-24T00:00:00Z",
    description: "单选",
    options: [
      { id: 1, label: "面", position: 0 },
      { id: 2, label: "饭", position: 1 },
    ],
    has_voted: false,
    receipt: null,
    server_time: "2026-10-24T01:00:00Z",
    can_vote: true,
    can_manage: false,
    can_view_results: false,
    results_access_reason: "unavailable",
    needs_access_password: false,
    passcode_entry_path: null,
    ...overrides,
  };
}

export function renderRoute(path: string): ReturnType<typeof render> {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <AppRouter />
      </MemoryRouter>
    </Providers>,
  );
}

export function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(<Providers><MemoryRouter>{ui}</MemoryRouter></Providers>);
}
