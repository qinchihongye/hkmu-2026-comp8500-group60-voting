import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiCode } from "../../../lib/api-codes";
import { emptyPage, envelope, installFetch, renderWithProviders, samplePoll } from "../../../test/fixtures";
import { DemoPollSection } from "../DemoPollSection";

function demoPoll(overrides: Record<string, unknown> = {}) {
  return {
    ...samplePoll({
      id: 11,
      title: "Technical sharing topics · A01",
      identity_mode: "NAMED",
      visibility: "PRIVATE",
      vote_limit: 20,
      selection_mode: "MULTIPLE",
      allow_live_results: false,
      effective_status: "OPEN",
    }),
    fixture_key: "named-private-07",
    display_order: 23,
    ...overrides,
  };
}

describe("DemoPollSection", () => {
  beforeEach(() => {
    localStorage.setItem("voting_locale", "en");
  });

  it("按固定页展示五个维度，搜索回到第一页", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    installFetch((url) => {
      urls.push(url);
      if (!url.includes("/demo-polls")) {
        return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
      }
      if (url.includes("q=A01")) {
        return envelope({ items: [demoPoll()], page: 1, page_size: 8, total: 1 });
      }
      if (url.includes("page=2")) {
        return envelope({
          items: [demoPoll({ id: 12, title: "Campus activity preferences · B01", fixture_key: "anonymous-public-01" })],
          page: 2,
          page_size: 8,
          total: 9,
        });
      }
      return envelope({ items: [demoPoll()], page: 1, page_size: 8, total: 9 });
    });
    renderWithProviders(<DemoPollSection />);
    expect(await screen.findByRole("link", { name: "Technical sharing topics · A01" })).toHaveAttribute("href", "/polls/11");
    expect(screen.getByText("Multiple choice")).toBeInTheDocument();
    expect(screen.getByText("Up to 20 ballots")).toBeInTheDocument();
    expect(screen.getByText("Results after it ends")).toBeInTheDocument();
    expect(screen.getByText("Private · Named")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View poll" })).toHaveAttribute("href", "/polls/11");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(urls.some((url) => url.includes("/demo-polls") && url.includes("page=2"))).toBe(true));
    await user.type(screen.getByPlaceholderText("Search examples"), "A01");
    await waitFor(() => expect(urls.some((url) => url.includes("q=A01") && url.includes("page=1"))).toBe(true));
  });

  it("关闭后显示最终结果，私密卡片进入详情而不是结果页", async () => {
    installFetch((url) => {
      if (!url.includes("/demo-polls")) {
        return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
      }
      return envelope({
        items: [
          demoPoll({
            id: 8,
            title: "Completed team decision",
            effective_status: "CLOSED",
            allow_live_results: false,
            visibility: "PRIVATE",
            selection_mode: "SINGLE",
            vote_limit: null,
          }),
        ],
        page: 1,
        page_size: 8,
        total: 1,
      });
    });
    renderWithProviders(<DemoPollSection />);
    expect(await screen.findByText("Final results")).toBeInTheDocument();
    expect(screen.queryByText("Results after it ends")).not.toBeInTheDocument();
    expect(screen.getByText("Single choice")).toBeInTheDocument();
    expect(screen.getByText("No ballot cap")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute("href", "/polls/8");
  });

  it("空目录隐藏区域，中文标签不溢出到英文", async () => {
    localStorage.setItem("voting_locale", "zh");
    installFetch((url) => {
      if (!url.includes("/demo-polls")) {
        return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
      }
      if (url.includes("page_size=8")) {
        return envelope({
          items: [demoPoll({ visibility: "PUBLIC", identity_mode: "ANONYMOUS", allow_live_results: true, vote_limit: null, selection_mode: "SINGLE" })],
          page: 1,
          page_size: 8,
          total: 1,
        });
      }
      return emptyPage(0);
    });
    const view = renderWithProviders(<DemoPollSection />);
    expect(await screen.findByText("单选")).toBeInTheDocument();
    expect(screen.getByText("不限票数")).toBeInTheDocument();
    expect(screen.getByText("实时结果")).toBeInTheDocument();
    expect(screen.queryByText("Single choice")).not.toBeInTheDocument();
    expect(screen.getByTestId("demo-polls").querySelector(".plaza-card-tags")).toBeTruthy();
    view.unmount();
    installFetch(() => emptyPage(0));
    renderWithProviders(<DemoPollSection />);
    await waitFor(() => expect(screen.queryByTestId("demo-polls")).not.toBeInTheDocument());
  });
});
