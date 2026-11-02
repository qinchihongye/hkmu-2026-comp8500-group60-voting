import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { exportElectionResultsToExcel } from "../export-election-excel";
import type { ElectionResultResponse } from "../types";

vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof import("xlsx")>("xlsx");
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe("exportElectionResultsToExcel", () => {
  const sampleResults: ElectionResultResponse = {
    poll_id: 44,
    title: "2026 Future Tech Faculty Senate Election",
    phase: "RESULTS",
    allow_live_results: true,
    winning_threshold: 10,
    is_tie: false,
    winner_option_ids: [101],
    scale: {
      registration_count: 50,
      approved_count: 45,
      ballot_count: 40,
      abstention_count: 5,
      remaining_count: 0,
      turnout_percentage: 88.89,
    },
    candidate_results: [
      {
        candidate_option_id: 101,
        candidate_code: "C_1",
        name: "Prof. Sarah Jenkins",
        vote_count: 24,
        percentage: 60,
      },
      {
        candidate_option_id: 102,
        candidate_code: "C_2",
        name: "Prof. David Thorne",
        vote_count: 16,
        percentage: 40,
      },
    ],
  };

  it("builds a valid workbook with overview and breakdown sheets in English", () => {
    exportElectionResultsToExcel(sampleResults, "en");
    expect(XLSX.writeFile).toHaveBeenCalled();
    const calls = vi.mocked(XLSX.writeFile).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBe("2026 Future Tech Faculty Senate Election_election_results.xlsx");
    const wb = lastCall[0];
    expect(wb.SheetNames).toContain("Overview");
    expect(wb.SheetNames).toContain("Candidate Breakdown");
  });

  it("builds a valid workbook with Chinese sheets in zh locale", () => {
    exportElectionResultsToExcel(sampleResults, "zh");
    const calls = vi.mocked(XLSX.writeFile).mock.calls;
    const lastCall = calls[calls.length - 1];
    const wb = lastCall[0];
    expect(wb.SheetNames).toContain("选举概况");
    expect(wb.SheetNames).toContain("候选人得票明细");
  });
});

