import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as electionApi from "../../features/elections/api";
import { renderRoute } from "../../test/fixtures";

describe("ElectionResultPage", () => {
  it("中文环境下：展示“导出选举公报”与“导出 Excel”，点击弹出选举公报模态框与操作按钮", async () => {
    localStorage.setItem("voting_locale", "zh");

    vi.spyOn(electionApi, "getElectionResults").mockResolvedValue({
      poll_id: 42,
      title: "2026 未来科技大学学术委员会教员代表差额选举",
      phase: "CLOSED",
      allow_live_results: true,
      scale: {
        registration_count: 5,
        approved_count: 5,
        ballot_count: 24,
        turnout_percentage: 480,
        abstention_count: 0,
      },
      is_tie: false,
      winner_option_ids: [1],
      candidate_results: [
        {
          candidate_option_id: 1,
          candidate_code: "C_1",
          name: "Prof. Sarah Jenkins",
          vote_count: 12,
          percentage: 50,
        },
        {
          candidate_option_id: 2,
          candidate_code: "C_2",
          name: "Prof. David Thorne",
          vote_count: 8,
          percentage: 33.33,
        },
      ],
    });

    vi.spyOn(electionApi, "getPublicElection").mockResolvedValue({
      id: 42,
      title: "2026 未来科技大学学术委员会教员代表差额选举",
      description: "选举描述",
      phase: "CLOSED",
      lifecycle: "CLOSED",
      registration_starts_at: "2026-10-20T00:00:00Z",
      registration_ends_at: "2026-10-22T00:00:00Z",
      starts_at: "2026-10-23T00:00:00Z",
      ends_at: "2026-10-25T00:00:00Z",
      allow_live_results: true,
      candidates: [],
    });

    renderRoute("/elections/42/results");

    await waitFor(() => {
      expect(screen.getByText("2026 未来科技大学学术委员会教员代表差额选举")).toBeInTheDocument();
    });

    const reportBtn = screen.getByTestId("export-election-report-btn");
    const excelBtn = screen.getByTestId("export-election-excel-btn");
    expect(reportBtn).toBeInTheDocument();
    expect(excelBtn).toBeInTheDocument();
    expect(reportBtn).toHaveTextContent("导出选举公报");
    expect(excelBtn).toHaveTextContent("导出 Excel");

    fireEvent.click(reportBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("选举结果报告公示")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /复制图片/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下载公报 PNG/i })).toBeInTheDocument();
  });

  it("英文环境下：展示 Export Election Gazette 与 Export Excel，弹窗展示规范英文术语", async () => {
    localStorage.setItem("voting_locale", "en");

    vi.spyOn(electionApi, "getElectionResults").mockResolvedValue({
      poll_id: 43,
      title: "2026 Computer Science Faculty Council Election",
      phase: "CLOSED",
      allow_live_results: true,
      scale: {
        registration_count: 10,
        approved_count: 10,
        ballot_count: 8,
        turnout_percentage: 80,
        abstention_count: 2,
      },
      is_tie: false,
      winner_option_ids: [1],
      candidate_results: [
        {
          candidate_option_id: 1,
          candidate_code: "C_1",
          name: "Dr. Elena Rostova",
          vote_count: 5,
          percentage: 62.5,
        },
      ],
    });

    vi.spyOn(electionApi, "getPublicElection").mockResolvedValue({
      id: 43,
      title: "2026 Computer Science Faculty Council Election",
      description: "Faculty election",
      phase: "CLOSED",
      lifecycle: "CLOSED",
      registration_starts_at: "2026-10-20T00:00:00Z",
      registration_ends_at: "2026-10-22T00:00:00Z",
      starts_at: "2026-10-23T00:00:00Z",
      ends_at: "2026-10-25T00:00:00Z",
      allow_live_results: true,
      candidates: [],
    });

    renderRoute("/elections/43/results");

    await waitFor(() => {
      expect(screen.getByText("2026 Computer Science Faculty Council Election")).toBeInTheDocument();
    });

    const reportBtn = screen.getByTestId("export-election-report-btn");
    const excelBtn = screen.getByTestId("export-election-excel-btn");
    expect(reportBtn).toBeInTheDocument();
    expect(excelBtn).toBeInTheDocument();
    expect(reportBtn).toHaveTextContent("Export Election Gazette");
    expect(excelBtn).toHaveTextContent("Export Excel");

    fireEvent.click(reportBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("Official Election Gazette Report")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy Image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download Gazette PNG/i })).toBeInTheDocument();
  });
});
