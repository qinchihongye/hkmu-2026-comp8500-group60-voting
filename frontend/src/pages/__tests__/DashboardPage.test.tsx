import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiCode } from "../../lib/api-codes";
import { emptyPage, envelope, fail, guestOk, installFetch, renderRoute, samplePoll, sessionOf } from "../../test/fixtures";

function pageOf(items: unknown[], total = items.length) {
  return envelope({ items, page: 1, page_size: 8, total });
}

describe("DashboardPage", () => {
  beforeEach(() => {
    localStorage.setItem("voting_locale", "en");
  });

  it("概览使用列表 total，卡片来自公开投票而不是示例", async () => {
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return sessionOf("USER");
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/me/votes")) {
        return envelope({
          items: [
            {
              receipt_id: "11111111-1111-1111-1111-111111111111",
              poll_id: 1,
              poll_title: "只有这一行",
              submitted_at: "2026-10-24T00:00:00Z",
            },
          ],
          page: 1,
          page_size: 1,
          total: 7,
        });
      }
      if (url.includes("/polls") && url.includes("status=OPEN")) {
        return envelope({ items: [], page: 1, page_size: 1, total: 40 });
      }
      if (url.includes("/polls")) {
        return pageOf([
          samplePoll({ id: 7, title: "午饭吃什么" }),
          samplePoll({ id: 8, title: "Closed plaza", effective_status: "CLOSED" }),
        ]);
      }
      return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
    });
    renderRoute("/overview");
    await waitFor(() => expect(screen.getByTestId("open-total")).toHaveTextContent("40"));
    await waitFor(() => expect(screen.getByTestId("named-total")).toHaveTextContent("7"));
    expect(screen.queryByText("Community Park Expansion")).not.toBeInTheDocument();
    expect(screen.queryByText("2,890/4,000 votes")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "午饭吃什么" })).toHaveAttribute("href", "/polls/7");
    expect(screen.getByRole("link", { name: "View poll" })).toHaveAttribute("href", "/polls/7");
    expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute("href", "/polls/8/results");
  });

  it("搜索发给公开列表接口，没有结果时显示空状态", async () => {
    const user = userEvent.setup();
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return sessionOf("USER");
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/me/votes")) {
        return emptyPage(0);
      }
      if (url.includes("/polls") && url.includes("status=OPEN")) {
        return envelope({ items: [], page: 1, page_size: 1, total: 0 });
      }
      if (url.includes("/polls") && url.includes("q=Missing")) {
        return emptyPage(0);
      }
      if (url.includes("/polls")) {
        return pageOf([samplePoll({ id: 3, title: "Visible plaza" })]);
      }
      return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
    });
    renderRoute("/overview");
    await waitFor(() => expect(screen.getByRole("link", { name: "Visible plaza" })).toHaveAttribute("href", "/polls/3"));
    await user.type(screen.getByPlaceholderText("Search polls"), "Missing");
    await waitFor(() => expect(screen.getByText("No public polls match this filter.")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Visible plaza" })).not.toBeInTheDocument();
    expect(screen.queryByText("Community Park Expansion")).not.toBeInTheDocument();
  });

  it("公开列表加载失败后可以重试", async () => {
    const user = userEvent.setup();
    let allowList = false;
    let listCalls = 0;
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return sessionOf("USER");
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/me/votes")) {
        return emptyPage(1);
      }
      if (url.includes("/polls") && url.includes("status=OPEN")) {
        return envelope({ items: [], page: 1, page_size: 1, total: 4 });
      }
      if (url.includes("/polls")) {
        listCalls += 1;
        if (!allowList) {
          return fail(ApiCode.SERVICE_UNAVAILABLE, "busy", 503);
        }
        return pageOf([samplePoll({ id: 9, title: "Recovered plaza" })]);
      }
      return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
    });
    renderRoute("/overview");
    await waitFor(() => expect(screen.getByText("The service is temporarily unavailable.")).toBeInTheDocument());
    expect(screen.queryByText("Community Park Expansion")).not.toBeInTheDocument();
    const failedCalls = listCalls;
    allowList = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Recovered plaza" })).toHaveAttribute("href", "/polls/9"));
    expect(listCalls).toBeGreaterThan(failedCalls);
  });
});
