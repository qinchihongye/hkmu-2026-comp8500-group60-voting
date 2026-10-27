import { screen, waitFor } from "@testing-library/react";

import type { PollAccessView } from "../../poll-access/usePollAccess";
import { ApiCode } from "../../../lib/api-codes";
import type { PollDetail } from "../../../lib/api-types";
import { envelope, fail, guestOk, installFetch, renderWithProviders, samplePoll } from "../../../test/fixtures";
import { ParticipationPanel } from "../ParticipationPanel";

const receipt = {
  receipt_id: "11111111-1111-1111-1111-111111111111",
  poll_id: 7,
  submitted_at: "2026-10-24T02:00:00Z",
};

function accessFor(detail: PollDetail): PollAccessView {
  return {
    phase: detail.has_voted ? "voted" : "ready",
    entry: null,
    detail,
    error: null,
    accountExpired: false,
    grantExpired: false,
    reload: vi.fn(),
    markUnknown: vi.fn(),
    clearUnknown: vi.fn(),
  };
}

describe("ParticipationPanel", () => {
  it("结束后直接显示最终结果，不再显示选票", async () => {
    const urls: string[] = [];
    installFetch((url) => {
      urls.push(url);
      if (url.includes("/auth/me")) {
        return fail(ApiCode.UNAUTHENTICATED, "需要登录", 401);
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/results")) {
        return envelope({
          poll_id: 7,
          total_votes: 0,
          options: [
            { option_id: 1, label: "甲", count: 0, percentage: 0 },
            { option_id: 2, label: "乙", count: 0, percentage: 0 },
          ],
          winner_option_ids: [],
          is_final: true,
          server_time: "2026-10-24T03:00:00Z",
        });
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    const detail = samplePoll({
      effective_status: "CLOSED",
      can_vote: false,
      can_manage: true,
      can_view_results: true,
      has_voted: true,
      receipt,
    });
    renderWithProviders(<ParticipationPanel access={accessFor(detail)} resultsHref="/polls/7/results" />);
    expect(await screen.findByText("Final results")).toBeInTheDocument();
    expect(screen.getByText("This poll has ended. You cannot vote.")).toBeInTheDocument();
    expect(screen.getByTestId("closed-receipt")).toHaveTextContent(receipt.receipt_id);
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/my-polls/7");
    expect(screen.queryByRole("link", { name: "View results" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit vote" })).not.toBeInTheDocument();
    expect(screen.queryByText("Choose one option")).not.toBeInTheDocument();
    await waitFor(() => expect(urls.some((url) => url.includes("/polls/7/results"))).toBe(true));
  });

  it("进行中仍显示选票，不自动请求结果", async () => {
    const urls: string[] = [];
    installFetch((url) => {
      urls.push(url);
      if (url.includes("/auth/me")) {
        return fail(ApiCode.UNAUTHENTICATED, "需要登录", 401);
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/results")) {
        return fail(ApiCode.RESULTS_NOT_AVAILABLE, "结果尚未公布", 403);
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    const detail = samplePoll({
      effective_status: "OPEN",
      can_vote: true,
      can_manage: true,
      can_view_results: true,
    });
    renderWithProviders(<ParticipationPanel access={accessFor(detail)} resultsHref="/polls/7/results" />);
    expect(await screen.findByRole("button", { name: "Submit vote" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute("href", "/polls/7/results");
    expect(screen.queryByText("Final results")).not.toBeInTheDocument();
    expect(urls.some((url) => url.includes("/results"))).toBe(false);
  });
});
