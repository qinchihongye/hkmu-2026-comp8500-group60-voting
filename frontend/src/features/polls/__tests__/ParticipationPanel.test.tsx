import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { Providers } from "../../../app/providers";
import { usePollAccess, type PollAccessView } from "../../poll-access/usePollAccess";
import { ApiCode } from "../../../lib/api-codes";
import type { PollDetail } from "../../../lib/api-types";
import { envelope, fail, guestOk, installFetch, meAnonymous, renderWithProviders, samplePoll } from "../../../test/fixtures";
import { ParticipationPanel } from "../ParticipationPanel";

const receipt = {
  receipt_id: "11111111-1111-1111-1111-111111111111",
  poll_id: 7,
  submitted_at: "2026-10-24T02:00:00Z",
};

function panel(access: PollAccessView): ReactElement {
  return (
    <Providers>
      <MemoryRouter>
        <ParticipationPanel access={access} resultsHref="/polls/7/results" />
      </MemoryRouter>
    </Providers>
  );
}

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
          total_selections: 0,
          selection_mode: "SINGLE",
          vote_limit: null,
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

  it("最后一份成功后详情结束，仍显示这次回执", async () => {
    const reload = vi.fn();
    installFetch((url, init) => {
      if (url.includes("/auth/me")) {
        return fail(ApiCode.UNAUTHENTICATED, "需要登录", 401);
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/votes") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ data: { option_ids: [1] } });
        return envelope(receipt, 201);
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    const open = samplePoll({ effective_status: "OPEN", can_vote: true });
    const access = accessFor(open);
    access.reload = reload;
    const view = render(panel(access));
    await userEvent.click(await screen.findByRole("radio", { name: "面" }));
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(await screen.findByTestId("receipt")).toHaveTextContent(receipt.receipt_id);
    expect(reload).toHaveBeenCalled();
    const closed = samplePoll({
      effective_status: "CLOSED",
      can_vote: false,
      has_voted: true,
      receipt: null,
      can_view_results: false,
    });
    view.rerender(panel(accessFor(closed)));
    expect(screen.getByTestId("closed-receipt")).toHaveTextContent(receipt.receipt_id);
    expect(screen.queryByTestId("vote-submit")).not.toBeInTheDocument();
  });

  it("达到上限时刷新为结束，不会再提交一次", async () => {
    const reload = vi.fn();
    let posts = 0;
    installFetch((url, init) => {
      if (url.includes("/auth/me")) {
        return fail(ApiCode.UNAUTHENTICATED, "需要登录", 401);
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/votes") && init?.method === "POST") {
        posts += 1;
        return fail(ApiCode.POLL_CAPACITY_REACHED, "This poll has reached its ballot limit.", 409);
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    const access = accessFor(samplePoll({ can_vote: true }));
    access.reload = reload;
    const view = render(panel(access));
    await userEvent.click(await screen.findByRole("radio", { name: "饭" }));
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(posts).toBe(1);
    view.rerender(panel(accessFor(samplePoll({ effective_status: "CLOSED", can_vote: false, can_view_results: false }))));
    expect(screen.getByText("This poll has ended. You cannot vote.")).toBeInTheDocument();
    expect(screen.queryByTestId("vote-submit")).not.toBeInTheDocument();
  });

  it("正文中断后仍能找回回执，查不到时保留再次查询且不重投", async () => {
    let posts = 0;
    let guests = 0;
    let reads = 0;
    installFetch((url, init) => {
      if (url.includes("/auth/me")) {
        return fail(ApiCode.UNAUTHENTICATED, "需要登录", 401);
      }
      if (url.includes("/guest/context")) {
        guests += 1;
        return guestOk();
      }
      if (url.includes("/votes") && init?.method === "POST") {
        posts += 1;
        return {
          status: 201,
          text: async () => {
            throw new TypeError("disconnected");
          },
        } as unknown as Response;
      }
      if (url.includes("/polls/7")) {
        reads += 1;
        if (reads === 1) {
          return envelope(samplePoll({ has_voted: true, receipt, effective_status: "CLOSED", can_vote: false }));
        }
        return envelope(samplePoll({ has_voted: false, receipt: null, can_vote: false }));
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    const access = accessFor(samplePoll({ can_vote: true }));
    renderWithProviders(<ParticipationPanel access={access} resultsHref="/polls/7/results" />);
    await userEvent.click(await screen.findByRole("radio", { name: "面" }));
    const guestsBeforeSubmit = guests;
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(await screen.findByTestId("receipt")).toHaveTextContent(receipt.receipt_id);
    expect(posts).toBe(1);
    expect(guests).toBe(guestsBeforeSubmit);
    expect(access.clearUnknown).toHaveBeenCalled();
  });

  it("一次查询尚无记录时保留再次查询，重新读取后仍不重投", async () => {
    let posts = 0;
    let guests = 0;
    installFetch((url, init) => {
      if (url.includes("/auth/me")) {
        return meAnonymous();
      }
      if (url.includes("/guest/context")) {
        guests += 1;
        return guestOk();
      }
      if (url.includes("/votes") && init?.method === "POST") {
        posts += 1;
        return {
          status: 503,
          text: async () => {
            throw new TypeError("disconnected");
          },
        } as unknown as Response;
      }
      if (url.includes("/polls/7")) {
        return envelope(samplePoll({ has_voted: false, receipt: null, can_vote: true }));
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    function LivePanel() {
      const access = usePollAccess({ pollId: 7 });
      return <ParticipationPanel access={access} resultsHref="/polls/7/results" />;
    }
    renderWithProviders(<LivePanel />);
    await userEvent.click(await screen.findByRole("radio", { name: "面" }));
    const guestsBeforeSubmit = guests;
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(await screen.findByTestId("unknown-status")).toHaveTextContent("No record found yet.");
    const checkAgain = screen.getByRole("button", { name: "Check again" });
    expect(posts).toBe(1);
    expect(guests).toBe(guestsBeforeSubmit);
    await userEvent.click(checkAgain);
    expect(await screen.findByTestId("unknown-status")).toHaveTextContent("No record found yet.");
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(posts).toBe(1);
    expect(guests).toBe(guestsBeforeSubmit);
  });
});
