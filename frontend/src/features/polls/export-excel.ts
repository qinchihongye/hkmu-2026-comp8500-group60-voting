import * as XLSX from "xlsx";

import type { PollDetail, PollResults } from "../../lib/api-types";

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "poll";
}

export function exportPollResultsToExcel(
  results: PollResults,
  pollDetail?: PollDetail | null,
  locale = "en"
): void {
  const isZh = locale === "zh";
  const title = results.poll_title || pollDetail?.title || "Poll";

  const wb = XLSX.utils.book_new();

  // ================= 1. Overview Sheet =================
  const overviewRows: (string | number)[][] = [
    [isZh ? "属性" : "Property", isZh ? "信息" : "Details"],
    [isZh ? "投票标题" : "Poll Title", title],
    [isZh ? "投票编号" : "Poll ID", results.poll_id],
    [isZh ? "描述" : "Description", pollDetail?.description || "-"],
    [
      isZh ? "状态" : "Status",
      results.is_final
        ? isZh ? "已结束（最终结果）" : "Closed (Final Results)"
        : isZh ? "进行中（实时结果）" : "Open (Live Results)",
    ],
    [
      isZh ? "选择模式" : "Selection Mode",
      results.selection_mode === "SINGLE"
        ? isZh ? "单选" : "Single Choice"
        : isZh ? "多选" : "Multiple Choice",
    ],
    [
      isZh ? "身份模式" : "Identity Mode",
      pollDetail?.identity_mode === "NAMED"
        ? isZh ? "记名投票" : "Named"
        : pollDetail?.identity_mode === "ANONYMOUS"
        ? isZh ? "匿名投票" : "Anonymous"
        : "-",
    ],
    [
      isZh ? "公开属性" : "Visibility",
      pollDetail?.visibility === "PUBLIC"
        ? isZh ? "公开" : "Public"
        : pollDetail?.visibility === "PRIVATE"
        ? isZh ? "私密" : "Private"
        : "-",
    ],
    [isZh ? "总有效选票份数" : "Total Ballots (Votes)", results.total_votes],
    [isZh ? "总选项选择次数" : "Total Selections", results.total_selections],
    [
      isZh ? "选票上限" : "Ballot Limit",
      results.vote_limit !== null
        ? results.vote_limit
        : isZh ? "不限" : "Unlimited",
    ],
    [
      isZh ? "开始时间" : "Starts At",
      pollDetail?.starts_at ? new Date(pollDetail.starts_at).toLocaleString() : "-",
    ],
    [
      isZh ? "结束时间" : "Ends At",
      pollDetail?.ends_at ? new Date(pollDetail.ends_at).toLocaleString() : "-",
    ],
    [isZh ? "报表生成时间" : "Exported At", new Date().toLocaleString()],
  ];

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  // Set column widths
  wsOverview["!cols"] = [{ wch: 22 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, isZh ? "投票概况" : "Overview");

  // ================= 2. Options Breakdown Sheet =================
  const sortedOptions = [...results.options].sort((a, b) => b.count - a.count);

  const breakdownRows: (string | number)[][] = [
    [
      isZh ? "排名" : "Rank",
      isZh ? "选项编号" : "Option ID",
      isZh ? "选项内容" : "Option Label",
      isZh ? "得票数" : "Votes",
      isZh ? "选择占比 (%)" : "Share (%)",
      isZh ? "领先/胜出" : "Winner",
    ],
    ...sortedOptions.map((opt, index) => {
      const isWinner = results.winner_option_ids.includes(opt.option_id) && opt.count > 0;
      return [
        index + 1,
        opt.option_id,
        opt.label,
        opt.count,
        Number(opt.percentage.toFixed(2)),
        isWinner ? (isZh ? "★ 获胜选项" : "★ Winner") : "",
      ];
    }),
  ];

  // Append summary row
  breakdownRows.push([
    isZh ? "合计" : "Total",
    "-",
    "-",
    results.total_selections,
    results.options.length > 0 && results.total_selections > 0 ? 100 : 0,
    "",
  ]);

  const wsBreakdown = XLSX.utils.aoa_to_sheet(breakdownRows);
  wsBreakdown["!cols"] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 36 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBreakdown, isZh ? "结果明细" : "Results Breakdown");

  const filename = `${sanitizeFilename(title)}_results.xlsx`;
  XLSX.writeFile(wb, filename);
}
