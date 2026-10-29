import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as adminApi from "../../features/admin/api";
import { renderWithProviders, samplePoll } from "../../test/fixtures";
import { AdminPollsPage } from "../AdminPollsPage";

describe("AdminPollsPage", () => {
  it("渲染现代管理控制台表头、筛选栏、表格字段及双操作入口", async () => {
    localStorage.setItem("voting_locale", "en");
    vi.spyOn(adminApi, "getAdminPolls").mockResolvedValue({
      items: [
        {
          ...samplePoll(),
          id: 42,
          title: "Quarterly Strategy Review",
          identity_mode: "NAMED",
          visibility: "PUBLIC",
          selection_mode: "SINGLE",
          effective_status: "OPEN",
          vote_limit: 100,
          ballot_count: 45,
          creator_id: 3,
          lifecycle: "PUBLISHED",
          version: 2,
        },
      ],
      total: 1,
      page: 1,
      page_size: 12,
    });

    renderWithProviders(<AdminPollsPage />);

    // 头部标题与只读监督标签
    expect(screen.getByRole("heading", { name: "Supervision" })).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();

    // 搜索输入框与筛选按钮
    expect(screen.getByLabelText("Search by title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();

    // 等待表格数据加载
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Quarterly Strategy Review" })).toBeInTheDocument();
    });

    // 表格列信息
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Ballots")).toBeInTheDocument();
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();

    // 选票与进度
    expect(screen.getByText("45 / 100")).toBeInTheDocument();
    expect(screen.getByText(/45% · Ballots received/)).toBeInTheDocument();

    // 创建者
    expect(screen.getByText("#3")).toBeInTheDocument();

    // 检查与查看结果入口
    const inspectBtn = screen.getByRole("link", { name: "Inspect" });
    expect(inspectBtn).toHaveAttribute("href", "/admin/polls/42");

    const resultsBtn = screen.getByRole("link", { name: "Results" });
    expect(resultsBtn).toHaveAttribute("href", "/polls/42/results");
  });

  it("支持通过状态标签快速切换筛选", async () => {
    localStorage.setItem("voting_locale", "zh");
    const getAdminSpy = vi.spyOn(adminApi, "getAdminPolls").mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 12,
    });

    renderWithProviders(<AdminPollsPage />);

    expect(screen.getByRole("heading", { name: "监督" })).toBeInTheDocument();
    expect(screen.getByText("只读监督")).toBeInTheDocument();

    // 点击“进行中”状态标签
    const openTab = screen.getByRole("button", { name: "进行中" });
    fireEvent.click(openTab);

    await waitFor(() => {
      expect(getAdminSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "OPEN",
        }),
      );
    });
  });
});

