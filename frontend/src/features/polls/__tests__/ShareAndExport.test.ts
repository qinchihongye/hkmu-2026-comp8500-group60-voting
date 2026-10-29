import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import type { PollDetail, PollResults } from "../../../lib/api-types";
import { exportPollResultsToExcel } from "../export-excel";
import { generateShareCardImage } from "../generate-share-card";

vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof import("xlsx")>("xlsx");
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe("Share and Export features", () => {
  const sampleResults: PollResults = {
    poll_id: 39,
    poll_title: "Campus Lunch Poll",
    total_votes: 12,
    total_selections: 15,
    selection_mode: "MULTIPLE",
    vote_limit: 50,
    options: [
      { option_id: 1, label: "Cafeteria A", count: 8, percentage: 53.33 },
      { option_id: 2, label: "Cafeteria B", count: 7, percentage: 46.67 },
    ],
    winner_option_ids: [1],
    is_final: true,
    server_time: "2026-10-30T00:00:00Z",
  };

  const sampleDetail: PollDetail = {
    id: 39,
    title: "Campus Lunch Poll",
    description: "Decide where to have lunch",
    identity_mode: "ANONYMOUS",
    visibility: "PUBLIC",
    vote_limit: 50,
    selection_mode: "MULTIPLE",
    allow_live_results: true,
    starts_at: "2026-10-29T10:00:00Z",
    ends_at: "2026-10-29T18:00:00Z",
    effective_status: "CLOSED",
    created_at: "2026-10-29T09:00:00Z",
    options: [
      { id: 1, label: "Cafeteria A", position: 1 },
      { id: 2, label: "Cafeteria B", position: 2 },
    ],
    has_voted: false,
    receipt: null,
    server_time: "2026-10-30T00:00:00Z",
    can_vote: false,
    can_manage: false,
    can_view_results: true,
    results_access_reason: "CLOSED_PUBLIC",
    needs_access_password: false,
    passcode_entry_path: null,
  };

  it("exportPollResultsToExcel builds a valid workbook with overview and breakdown sheets", () => {
    exportPollResultsToExcel(sampleResults, sampleDetail, "en");
    expect(XLSX.writeFile).toHaveBeenCalled();
    const calls = vi.mocked(XLSX.writeFile).mock.calls;
    expect(calls[0][1]).toBe("Campus Lunch Poll_results.xlsx");
    const wb = calls[0][0];
    expect(wb.SheetNames).toContain("Overview");
    expect(wb.SheetNames).toContain("Results Breakdown");
  });

  it("exportPollResultsToExcel works in Chinese locale", () => {
    exportPollResultsToExcel(sampleResults, sampleDetail, "zh");
    const calls = vi.mocked(XLSX.writeFile).mock.calls;
    const wb = calls[1][0];
    expect(wb.SheetNames).toContain("投票概况");
    expect(wb.SheetNames).toContain("结果明细");
  });

  it("generateShareCardImage creates a PNG dataUrl and Blob", async () => {
    const { dataUrl, blob } = await generateShareCardImage(sampleResults, sampleDetail, "en");
    expect(dataUrl).toContain("data:image/png");
    expect(blob).toBeInstanceOf(Blob);
  });
});
