import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as adminApi from "../../features/admin/api";
import { renderWithProviders } from "../../test/fixtures";
import { AdminAuditPage } from "../AdminAuditPage";

describe("AdminAuditPage", () => {
  it("展示审计日志现代表格、不可篡改标记与审计字段，不含选项列", async () => {
    localStorage.setItem("voting_locale", "en");
    vi.spyOn(adminApi, "getAuditEvents").mockResolvedValue({
      items: [
        {
          id: 101,
          actor_id: 1,
          action: "PUBLISH",
          poll_id: 39,
          receipt_id: null,
          created_at: "2026-10-29T18:50:00Z",
          request_id: "61c83692e707419ab982896ec41186c6",
        },
        {
          id: 102,
          actor_id: 2,
          action: "VOTE_NAMED",
          poll_id: 39,
          receipt_id: "RCPT-2026-ABCD",
          created_at: "2026-10-29T19:00:00Z",
          request_id: "02da3aa6577b4f3e964183c1e41c04a0",
        },
      ],
      total: 2,
      page: 1,
      page_size: 12,
    });

    renderWithProviders(<AdminAuditPage />);

    // 头部标题与不可篡改标记
    expect(screen.getByRole("heading", { name: "Audit" })).toBeInTheDocument();
    expect(screen.getByText("Immutable log")).toBeInTheDocument();

    // 等待数据加载
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "Action" })).toBeInTheDocument();
      expect(screen.getAllByText("Publish").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Named vote").length).toBeGreaterThanOrEqual(1);
    });

    // 严格不包含 Option
    expect(screen.queryByRole("columnheader", { name: "Option" })).not.toBeInTheDocument();

    // 校验操作者与场次链接
    expect(screen.getByText("User #1")).toBeInTheDocument();
    expect(screen.getByText("User #2")).toBeInTheDocument();
    const pollLink = screen.getAllByRole("link", { name: "#39" })[0];
    expect(pollLink).toHaveAttribute("href", "/admin/polls/39");

    // 校验回执与追踪号
    expect(screen.getByText("RCPT-2026-ABCD")).toBeInTheDocument();
    expect(screen.getByText(/61c83692/)).toBeInTheDocument();
  });

  it("点击动作标签即时筛选审计事件", async () => {
    localStorage.setItem("voting_locale", "zh");
    const getAuditSpy = vi.spyOn(adminApi, "getAuditEvents").mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 12,
    });

    renderWithProviders(<AdminAuditPage />);

    expect(screen.getByRole("heading", { name: "审计" })).toBeInTheDocument();
    expect(screen.getByText("不可篡改记录")).toBeInTheDocument();

    // 点击发布筛选标签
    const publishBtn = screen.getByRole("button", { name: "发布" });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(getAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PUBLISH",
        }),
      );
    });
  });
});
