import * as XLSX from "xlsx";
import type { ElectionResultResponse } from "./types";
import { normalizeElectionPhase } from "./types";

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "election";
}

/**
 * Exports election results to an Excel spreadsheet (.xlsx),
 * formatted with two sheets: Overview (Summary) and Candidate Results Breakdown.
 */
export function exportElectionResultsToExcel(
  results: ElectionResultResponse,
  locale = "en"
): void {
  const isZh = locale === "zh" || locale === "zh-TW";
  const title = results.title || "Election";
  const canonicalPhase = normalizeElectionPhase(results.phase);
  const isClosed = canonicalPhase === "RESULTS" || results.phase === "CLOSED";

  const wb = XLSX.utils.book_new();

  // Find winner candidate(s)
  const winners =
    results.candidate_results?.filter((c) =>
      results.winner_option_ids?.includes(c.candidate_option_id)
    ) || [];

  const winnerText =
    winners.length > 0
      ? winners
          .map((w) => `${w.name} (${w.candidate_code})`)
          .join(isZh ? "、" : ", ")
      : isZh
      ? "暂无 / 未决出"
      : "None";

  // ================= 1. Overview Sheet =================
  const overviewRows: (string | number)[][] = [
    [isZh ? "属性" : "Property", isZh ? "信息" : "Details"],
    [isZh ? "选举标题" : "Election Title", title],
    [isZh ? "选举编号" : "Election ID", results.poll_id],
    [
      isZh ? "状态" : "Status",
      isClosed
        ? isZh
          ? "已结束（法定最终认证结果）"
          : "Closed (Final Certified Results)"
        : isZh
        ? "进行中（实时计票结果）"
        : "In Progress (Live Results)",
    ],
    [isZh ? "当前阶段" : "Current Phase", canonicalPhase],
    [isZh ? "合资格选民数" : "Eligible Voters", results.scale.approved_count],
    [isZh ? "已投选票数" : "Ballots Cast", results.scale.ballot_count],
    [
      isZh ? "投票率 (%)" : "Turnout Rate (%)",
      `${results.scale.turnout_percentage ?? 0}%`,
    ],
    [
      isClosed
        ? isZh
          ? "最终弃权人数"
          : "Final Abstentions"
        : isZh
        ? "未投票人数"
        : "Remaining Voters",
      isClosed
        ? results.scale.abstention_count ?? 0
        : results.scale.remaining_count ?? 0,
    ],
    [isZh ? "获胜候选人" : "Winning Candidate(s)", winnerText],
    [
      isZh ? "提前当选门槛票数" : "Winning Threshold",
      results.winning_threshold
        ? `${results.winning_threshold} ${isZh ? "票" : "votes"}`
        : isZh
        ? "无门槛（最高票当选）"
        : "None (Plurality)",
    ],
    [
      isZh ? "平票情况" : "Tie Status",
      results.is_tie
        ? isZh
          ? "出现平票"
          : "Tied"
        : isZh
        ? "无平票"
        : "No Tie",
    ],
    [isZh ? "报表生成时间" : "Exported At", new Date().toLocaleString()],
  ];

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview["!cols"] = [{ wch: 24 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, isZh ? "选举概况" : "Overview");

  // ================= 2. Candidates Breakdown Sheet =================
  const candidates = [...(results.candidate_results || [])].sort(
    (a, b) => b.vote_count - a.vote_count
  );

  const breakdownRows: (string | number)[][] = [
    [
      isZh ? "排名" : "Rank",
      isZh ? "候选人代号" : "Candidate Code",
      isZh ? "候选人姓名" : "Candidate Name",
      isZh ? "得票数" : "Votes",
      isZh ? "得票率 (%)" : "Share (%)",
      isZh ? "当选状态" : "Status",
    ],
    ...candidates.map((cand, index) => {
      const isWinner = results.winner_option_ids?.includes(
        cand.candidate_option_id
      );
      return [
        index + 1,
        cand.candidate_code,
        cand.name,
        cand.vote_count,
        Number(cand.percentage.toFixed(2)),
        isWinner
          ? isClosed
            ? isZh
              ? "★ 胜选"
              : "★ Winner"
            : isZh
            ? "★ 当前领先"
            : "★ Leading"
          : "",
      ];
    }),
  ];

  // Append summary row
  breakdownRows.push([
    isZh ? "合计" : "Total",
    "-",
    "-",
    results.scale.ballot_count,
    candidates.length > 0 && results.scale.ballot_count > 0 ? 100 : 0,
    "",
  ]);

  const wsBreakdown = XLSX.utils.aoa_to_sheet(breakdownRows);
  wsBreakdown["!cols"] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 36 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(
    wb,
    wsBreakdown,
    isZh ? "候选人得票明细" : "Candidate Breakdown"
  );

  const filename = `${sanitizeFilename(title)}_election_results.xlsx`;
  XLSX.writeFile(wb, filename);
}

