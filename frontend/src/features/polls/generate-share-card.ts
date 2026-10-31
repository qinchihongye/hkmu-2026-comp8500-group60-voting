import type { PollDetail, PollResults } from "../../lib/api-types";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  if (width <= 0 || height <= 0) return;
  radius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let str = text;
  while (str.length > 0 && ctx.measureText(str + "...").width > maxWidth) {
    str = str.slice(0, -1);
  }
  return str ? str + "..." : "";
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (ctx.measureText(text).width <= maxWidth) {
    return [text];
  }
  const isCjk = /[\u4e00-\u9fa5]/.test(text);
  const tokens = isCjk ? text.split("") : text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const separator = isCjk || currentLine === "" ? "" : " ";
    const testLine = currentLine + separator + token;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine !== "") {
        lines.push(currentLine);
      }
      // If single token is wider than maxWidth, break character-by-character
      if (ctx.measureText(token).width > maxWidth) {
        let subToken = "";
        for (const char of token) {
          if (ctx.measureText(subToken + char).width <= maxWidth) {
            subToken += char;
          } else {
            if (subToken !== "") lines.push(subToken);
            subToken = char;
          }
        }
        currentLine = subToken;
      } else {
        currentLine = token;
      }
    }
  }
  if (currentLine !== "") {
    lines.push(currentLine);
  }
  return lines;
}

function formatDateTimeStr(dateStr?: string | null): string {
  if (!dateStr) return "--";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "--";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return "--";
  }
}

function getFingerprint(pollId: number, totalVotes: number, selections: number): string {
  let hash = 0x811c9dc5;
  const str = `votenow-audit-report-${pollId}-${totalVotes}-${selections}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0");
  return `SHA-256: 0x${hex.slice(0, 4)}...${hex.slice(4)}`;
}

// Scheme 2: Earth & Emerald Natural Palette
const PALETTE = [
  "#047857", // Pine Green
  "#10b981", // Emerald
  "#65a30d", // Olive
  "#d97706", // Amber
  "#0d9488", // Teal
  "#84cc16", // Lime
  "#b45309", // Bronze
  "#059669", // Mint
  "#ca8a04", // Sand Gold
  "#78716c", // Warm Slate
];

export function generateShareCardImage(
  results: PollResults,
  pollDetail?: PollDetail | null,
  locale = "en",
  exporterName = "系统管理员",
  qrCanvas?: HTMLCanvasElement | null
): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    try {
      const isZh = locale === "zh";
      const scale = 2; // High-DPI 2x Retina
      const width = 800; // 800px width for generous, elegant spacing
      const pad = 36;
      const contentWidth = width - pad * 2; // 728px

      const title = results.poll_title || pollDetail?.title || (isZh ? "投票活动" : "Poll Event");
      const sortedOptions = [...results.options].sort((a, b) => b.count - a.count);
      const optCount = sortedOptions.length;
      const totalVotes = results.total_votes ?? 0;
      const totalSelections = results.total_selections ?? results.total_votes ?? 0;

      // -------------------------------------------------------------
      // 1. TIE & WINNER DETECTION
      // -------------------------------------------------------------
      const topCount = sortedOptions[0]?.count || 0;
      const hasWinner = topCount > 0;
      const tiedWinners = sortedOptions.filter((o) => o.count === topCount);
      const isTie = hasWinner && tiedWinners.length > 1;

      // -------------------------------------------------------------
      // 2. DYNAMIC PRE-CALCULATION OF SECTION HEIGHTS
      // -------------------------------------------------------------
      const measureCanvas = document.createElement("canvas");
      const mctx = measureCanvas.getContext("2d");
      if (!mctx) {
        const fallbackPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        resolve({ dataUrl: fallbackPng, blob: new Blob(["mock"], { type: "image/png" }) });
        return;
      }

      // 2.1 Measure Full-Width Poll Title (Balanced safe width: 580px, leaves plenty of right padding!)
      const titleMaxW = Math.min(580, contentWidth - 96);
      mctx.font = "bold 18px 'Georgia', 'PingFang SC', serif, sans-serif";
      const wrappedTitle = wrapText(mctx, title, titleMaxW);
      const titleH = wrappedTitle.length * 26;
      const heroCardH = 40 + titleH + 16 + 1 + 16 + 64; // Tag row + Title + gap + divider + gap + 4-col metrics

      // 2.2 Winner Banner Height (Pre-wrap to allow 2 lines if tied candidates or long title)
      const maxWinTitleW = contentWidth - 170;
      const winTitle = isTie
        ? (isZh
            ? `并列优胜 (${tiedWinners.length}项最高票): ${tiedWinners.map(w => w.label).join(" / ")}`
            : `Tied Winners (${tiedWinners.length} Choices Tied): ${tiedWinners.map(w => w.label).join(" / ")}`)
        : (isZh
            ? `当选优胜选项: ${sortedOptions[0]!.label}`
            : `Elected Choice: ${sortedOptions[0]!.label}`);
      mctx.font = "bold 13px 'Georgia', 'PingFang SC', serif, sans-serif";
      const wrappedWinTitle = wrapText(mctx, winTitle, maxWinTitleW);
      const isMultiLineWinner = wrappedWinTitle.length > 1;
      const winnerBannerH = hasWinner ? (isMultiLineWinner ? 78 : 62) : 0;

      // 2.3 Middle Section: Table on Left (376px) + Donut on Right (336px)
      // Natural 2-line wrapping for options avoids stretching the table excessively wide
      const tableW = 376;
      const chartW = contentWidth - tableW - 18; // 336px
      const rcX = pad + tableW + 18;

      // Measure option names with wrapText (optColW = 210px for natural wrapping)
      const optColW = 210;
      mctx.font = "500 12px 'PingFang SC', -apple-system, sans-serif";
      const optionWrappedLines = sortedOptions.map((o) => wrapText(mctx, o.label, optColW));
      const optionRowHeights = optionWrappedLines.map((lines) => (lines.length > 1 ? 48 : 38));
      const tableHeaderH = 34;
      const baseTableH = tableHeaderH + optionRowHeights.reduce((a, b) => a + b, 0) + 38;

      // Right chart height needed: dual chart when options > 4, single donut when options <= 4 (No legend)
      const isManyOptions = optCount > 4;
      const chartBoxNeededH = isManyOptions ? 320 : 220;
      const midSectionH = Math.max(baseTableH, chartBoxNeededH);

      // Distribute any extra midSectionH evenly across candidate rows so table bottom doesn't have blank space
      const extraH = Math.max(0, midSectionH - baseTableH);
      const extraPerRow = optCount > 0 ? extraH / optCount : 0;

      // 2.4 Bottom Section Height (Statistical Notes & Metadata)
      mctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const notes = isZh
        ? [
            "1. 本次投票采用一人一票或去重认证凭据规则。",
            "2. 结果以最终提交记录为准，公示期内数据不可篡改。",
            "3. 数据经过防篡改加密签名，完整归档于系统审计日志。",
          ]
        : [
            "1. Voting follows one-person-one-vote or credential deduplication rules.",
            "2. Official records are final; no modifications permitted after close.",
            "3. Cryptographic integrity hash verified and permanently archived for audit.",
          ];

      const bottomCardW = (contentWidth - 18) / 2;
      const wrappedNotes = notes.flatMap((n) => wrapText(mctx, n, bottomCardW - 36));
      const bottomCardsH = Math.max(126, 36 + wrappedNotes.length * 17 + 16);

      // 2.5 Overall Canvas Dimensions
      const headerH = 116;
      const footerH = 46;
      const totalHeight =
        pad +
        headerH +
        heroCardH +
        (hasWinner ? 18 + winnerBannerH : 0) +
        24 +
        midSectionH +
        24 +
        bottomCardsH +
        24 +
        footerH;

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = totalHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        const fallbackPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        resolve({ dataUrl: fallbackPng, blob: new Blob(["mock"], { type: "image/png" }) });
        return;
      }

      ctx.scale(scale, scale);

      // -------------------------------------------------------------
      // 3. BACKGROUND & OUTER BORDER
      // -------------------------------------------------------------
      ctx.fillStyle = "#fcfbf9";
      roundRect(ctx, 0, 0, width, totalHeight, 16);
      ctx.fill();

      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1.5;
      roundRect(ctx, 1, 1, width - 2, totalHeight - 2, 16);
      ctx.stroke();

      // -------------------------------------------------------------
      // 4. HEADER: Academic / Institutional Seal
      // -------------------------------------------------------------
      const headerTop = pad;
      const sealTag = isZh ? "VoteNow 官方投票发布机构 · 认证公报" : "VoteNow Official Polling Authority · Hong Kong";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.letterSpacing = "1.5px";
      const sealTagW = ctx.measureText(sealTag).width;
      ctx.fillText(sealTag, (width - sealTagW) / 2, headerTop + 14);

      const reportTitle = isZh ? "投票选举结果公示书" : "Certificate of Election Results";
      ctx.font = "bold 26px 'Georgia', 'PingFang SC', serif, sans-serif";
      ctx.fillStyle = "#064e3b";
      const repTitleW = ctx.measureText(reportTitle).width;
      ctx.fillText(reportTitle, (width - repTitleW) / 2, headerTop + 46);

      // Double rule with amber diamond
      const ruleY = headerTop + 62;
      const ruleW = 90;
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(width / 2 - 12 - ruleW, ruleY);
      ctx.lineTo(width / 2 - 12, ruleY);
      ctx.stroke();

      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.moveTo(width / 2, ruleY - 4);
      ctx.lineTo(width / 2 + 5, ruleY);
      ctx.lineTo(width / 2, ruleY + 4);
      ctx.lineTo(width / 2 - 5, ruleY);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(width / 2 + 12, ruleY);
      ctx.lineTo(width / 2 + 12 + ruleW, ruleY);
      ctx.stroke();

      const subTitle = isZh
        ? "经系统公证之有效选票记录、决选比例与防伪审计公报"
        : "Duly certified audit report verifying ballots, selections, and winning candidates.";
      ctx.font = "italic 12px 'Georgia', serif, sans-serif";
      ctx.fillStyle = "#78716c";
      const subTitleW = ctx.measureText(subTitle).width;
      ctx.fillText(subTitle, (width - subTitleW) / 2, headerTop + 84);

      const headerDivY = headerTop + 104;
      ctx.strokeStyle = "#064e3b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad, headerDivY);
      ctx.lineTo(width - pad, headerDivY);
      ctx.stroke();

      // -------------------------------------------------------------
      // 5. UNIFIED FULL-WIDTH HERO CARD (728px wide!)
      // -------------------------------------------------------------
      const heroY = headerDivY + 20;

      roundRect(ctx, pad, heroY, contentWidth, heroCardH, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, pad, heroY, contentWidth, heroCardH, 12);
      ctx.stroke();

      // Top Row: Tag on left, Status Badge on right
      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#047857";
      ctx.fillText(isZh ? "公报投票议案 / 事项" : "OFFICIAL BALLOT MEASURE", pad + 24, heroY + 24);

      // Status Pill
      const isSingle = (results.selection_mode || pollDetail?.selection_mode) === "SINGLE";
      const isNamed = pollDetail?.identity_mode === "NAMED";
      const statusText = results.is_final
        ? isZh ? "● 已结束 (最终公报)" : "● Closed (Final)"
        : isZh ? "● 进行中 (实时进展)" : "● Open (Live)";

      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
      const stW = ctx.measureText(statusText).width;
      const stPillW = stW + 20;
      const stPillX = width - pad - 24 - stPillW;
      roundRect(ctx, stPillX, heroY + 12, stPillW, 22, 6);
      ctx.fillStyle = results.is_final ? "#ecfdf5" : "#eff6ff";
      ctx.fill();
      ctx.strokeStyle = results.is_final ? "#a7f3d0" : "#bfdbfe";
      ctx.lineWidth = 1;
      roundRect(ctx, stPillX, heroY + 12, stPillW, 22, 6);
      ctx.stroke();

      ctx.fillStyle = results.is_final ? "#047857" : "#1d4ed8";
      ctx.fillText(statusText, stPillX + 10, heroY + 27);

      // Full-Width Title (Safe 580px width, NEVER CROSSES BORDER OR COLLIDES!)
      ctx.font = "bold 18px 'Georgia', 'PingFang SC', serif, sans-serif";
      ctx.fillStyle = "#1c1917";
      let curTitleY = heroY + 52;
      wrappedTitle.forEach((line) => {
        ctx.fillText(line, pad + 24, curTitleY);
        curTitleY += 26;
      });

      // Hairline divider inside hero card
      const heroInnerDivY = curTitleY + 4;
      ctx.strokeStyle = "#f3f4f6";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 24, heroInnerDivY);
      ctx.lineTo(width - pad - 24, heroInnerDivY);
      ctx.stroke();

      // Bottom 4-Column Balanced Grid (Stacked 2-line structure, zero overlap!)
      const metricsY = heroInnerDivY + 20;

      // Col 1: Format (Split into 2 distinct lines to prevent any collision)
      const col1X = pad + 24;
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.letterSpacing = "0.5px";
      ctx.fillText(isZh ? "选票类型" : "BALLOT FORMAT", col1X, metricsY);
      ctx.letterSpacing = "0px";

      const formatLine1 = isSingle ? (isZh ? "单选投票" : "Single Choice") : (isZh ? "多选投票" : "Multiple Choice");
      const formatLine2 = isNamed ? (isZh ? "实名认证" : "Named Ballot") : (isZh ? "匿名无痕" : "Secret Ballot (Anonymous)");

      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#1c1917";
      ctx.fillText(formatLine1, col1X, metricsY + 17);
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(formatLine2, col1X, metricsY + 31);

      // Col 2: Voting Period (Shifted to pad + 205 for 80px+ clearance)
      const col2X = pad + 205;
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.letterSpacing = "0.5px";
      ctx.fillText(isZh ? "公示起止时段" : "VOTING TIMEFRAME", col2X, metricsY);
      ctx.letterSpacing = "0px";
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#44403c";
      ctx.fillText(formatDateTimeStr(pollDetail?.starts_at), col2X, metricsY + 17);
      ctx.fillText(`~ ${formatDateTimeStr(pollDetail?.ends_at)}`, col2X, metricsY + 31);

      // Col 3: Participation
      const col3X = pad + 380;
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.letterSpacing = "0.5px";
      ctx.fillText(isZh ? "参与统计" : "PARTICIPATION", col3X, metricsY);
      ctx.letterSpacing = "0px";

      if (totalVotes === 0) {
        ctx.font = "bold 13px 'Georgia', serif, sans-serif";
        ctx.fillStyle = "#78716c";
        ctx.fillText(isZh ? "0 票 (暂无提交)" : "0 Ballots (No Votes Yet)", col3X, metricsY + 18);
        ctx.font = "500 11px -apple-system, sans-serif";
        ctx.fillStyle = "#a8a29e";
        ctx.fillText(isZh ? "等待参与投票中..." : "Awaiting Submissions...", col3X, metricsY + 31);
      } else {
        ctx.font = "bold 14px 'Georgia', serif, sans-serif";
        ctx.fillStyle = "#064e3b";
        ctx.fillText(`${totalVotes} Valid Ballots`, col3X, metricsY + 18);
        ctx.font = "600 11px -apple-system, sans-serif";
        ctx.fillStyle = "#65a30d";
        ctx.fillText(`${totalSelections} Selections Recorded`, col3X, metricsY + 31);
      }

      // Col 4: QR Code & Verification
      const col4X = width - pad - 24 - 130;
      const qrSize = 48;
      const qrY = metricsY - 8;

      if (qrCanvas) {
        ctx.drawImage(qrCanvas, col4X, qrY, qrSize, qrSize);
      } else {
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, col4X, qrY, qrSize, qrSize, 4);
        ctx.fill();
        ctx.strokeStyle = "#d9f99d";
        ctx.lineWidth = 1;
        roundRect(ctx, col4X, qrY, qrSize, qrSize, 4);
        ctx.stroke();

        ctx.fillStyle = "#064e3b";
        const dot = 4;
        for (let qx = col4X + 3; qx < col4X + qrSize - 3; qx += dot + 2) {
          for (let qy = qrY + 3; qy < qrY + qrSize - 3; qy += dot + 2) {
            if ((qx * 3 + qy * 7) % 11 < 6) {
              ctx.fillRect(qx, qy, dot, dot);
            }
          }
        }
      }

      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? "扫码验真" : "Scan to Verify", col4X + qrSize + 10, qrY + 20);
      ctx.font = "500 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.fillText("Official Ledger", col4X + qrSize + 10, qrY + 34);

      // -------------------------------------------------------------
      // 6. WINNER CALLOUT BANNER (Only when totalVotes > 0)
      // -------------------------------------------------------------
      let nextY = heroY + heroCardH + 18;
      if (hasWinner) {
        const winY = nextY;
        const winH = winnerBannerH;
        roundRect(ctx, pad, winY, contentWidth, winH, 8);
        ctx.fillStyle = "#fef3c7";
        ctx.fill();
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1;
        roundRect(ctx, pad, winY, contentWidth, winH, 8);
        ctx.stroke();

        ctx.fillStyle = "#d97706";
        roundRect(ctx, pad, winY, 5, winH, 2);
        ctx.fill();

        const winMidY = winY + winH / 2;
        ctx.font = "20px -apple-system, sans-serif";
        ctx.fillText(isTie ? "⚖️" : "🏆", pad + 16, winMidY + 7);

        ctx.font = "bold 13px 'Georgia', 'PingFang SC', serif, sans-serif";
        ctx.fillStyle = "#92400e";
        if (isMultiLineWinner) {
          ctx.fillText(wrappedWinTitle[0]!, pad + 48, winY + 24);
          ctx.fillText(wrappedWinTitle[1]!, pad + 48, winY + 41);
        } else {
          ctx.fillText(wrappedWinTitle[0]!, pad + 48, winY + 27);
        }

        const winSub = isTie
          ? (isZh
              ? `各获得最高票数 ${topCount} 票 (各占 ${tiedWinners[0]!.percentage.toFixed(1)}%)`
              : `Each received top votes of ${topCount} (${tiedWinners[0]!.percentage.toFixed(1)}% each)`)
          : (isZh
              ? `以 ${sortedOptions[0]!.count} 票获得相对多数胜选，占总选择数的 ${sortedOptions[0]!.percentage.toFixed(1)}%`
              : `Achieved plurality with ${sortedOptions[0]!.count} of ${totalSelections} choices (${sortedOptions[0]!.percentage.toFixed(1)}% of vote share)`);
        ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#b45309";
        const subY = isMultiLineWinner ? winY + 59 : winY + 46;
        ctx.fillText(truncateText(ctx, winSub, contentWidth - 170), pad + 48, subY);

        ctx.font = "bold 22px 'Georgia', serif, sans-serif";
        ctx.fillStyle = "#b45309";
        const pctStr = `${tiedWinners[0]!.percentage.toFixed(1)}%`;
        const pctW = ctx.measureText(pctStr).width;
        ctx.fillText(pctStr, width - pad - pctW - 20, winMidY + 8);

        nextY = winY + winH + 20;
      }

      // -------------------------------------------------------------
      // 7. MIDDLE SECTION: Table on Left + Donut on Right
      // -------------------------------------------------------------
      const midY = nextY;

      // 7.1 Left Table Box (376px wide)
      roundRect(ctx, pad, midY, tableW, midSectionH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, pad, midY, tableW, midSectionH, 10);
      ctx.stroke();

      roundRect(ctx, pad, midY, tableW, tableHeaderH, 10);
      ctx.fillStyle = "#064e3b";
      ctx.fill();
      ctx.fillRect(pad, midY + tableHeaderH - 8, tableW, 8);

      const colNoX = pad + 14;
      const colOptX = pad + 44;
      const colVotesX = pad + tableW - 105;
      const colShareX = pad + tableW - 55;

      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#f7fee7";
      ctx.fillText(isZh ? "序号" : "No.", colNoX, midY + 21);
      ctx.fillText(isZh ? "候选项明细 (完整展示)" : "Candidate / Option (Full Name)", colOptX, midY + 21);
      ctx.fillText(isZh ? "票数" : "Votes", colVotesX, midY + 21);
      ctx.fillText(isZh ? "占比" : "Share", colShareX, midY + 21);

      let rowY = midY + tableHeaderH;
      const maxVotes = Math.max(...sortedOptions.map((o) => o.count), 1);

      sortedOptions.forEach((opt, idx) => {
        const isWinRow = opt.count === topCount && topCount > 0;
        const curRowH = optionRowHeights[idx]! + extraPerRow;
        const lines = optionWrappedLines[idx]!;

        ctx.fillStyle = isWinRow ? "#fffbeb" : idx % 2 === 0 ? "#ffffff" : "#fafaf9";
        ctx.fillRect(pad, rowY, tableW, curRowH);
        ctx.strokeStyle = "#f5f5f4";
        ctx.lineWidth = 1;
        ctx.strokeRect(pad, rowY, tableW, curRowH);

        // Rank
        const rowMidY = rowY + curRowH / 2;
        ctx.fillStyle = isWinRow ? "#d97706" : "#78716c";
        ctx.font = isWinRow ? "bold 11px 'Georgia', serif" : "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(String(idx + 1), colNoX + 2, rowMidY + 4);

        // Option name (MULTI-LINE WRAPPED, 100% COMPLETE!)
        ctx.fillStyle = isWinRow ? "#064e3b" : "#1c1917";
        ctx.font = isWinRow ? "bold 12px 'PingFang SC', sans-serif" : "500 12px 'PingFang SC', sans-serif";

        if (lines.length === 1) {
          ctx.fillText(lines[0]!, colOptX, rowMidY - 2);
        } else {
          ctx.fillText(lines[0]!, colOptX, rowMidY - 8);
          ctx.fillText(lines[1]!, colOptX, rowMidY + 7);
        }

        // Micro-bar below: ONLY DRAW WHEN opt.count > 0!
        if (opt.count > 0) {
          const barY = lines.length > 1 ? rowMidY + 13 : rowMidY + 6;
          const barMaxW = 160;
          const barLen = Math.max((opt.count / maxVotes) * barMaxW, 6);

          ctx.fillStyle = "#f5f5f4";
          roundRect(ctx, colOptX, barY, barMaxW, 3, 1.5);
          ctx.fill();

          ctx.fillStyle = isWinRow ? "#047857" : PALETTE[idx % PALETTE.length]!;
          roundRect(ctx, colOptX, barY, barLen, 3, 1.5);
          ctx.fill();
        }

        // Votes
        ctx.fillStyle = isWinRow ? "#064e3b" : "#44403c";
        ctx.font = "bold 12px 'Georgia', serif, sans-serif";
        ctx.fillText(String(opt.count), colVotesX + 4, rowMidY + 4);

        // Share
        const pctStr = `${opt.percentage.toFixed(1)}%`;
        if (isWinRow) {
          roundRect(ctx, colShareX - 2, rowMidY - 9, 44, 18, 4);
          ctx.fillStyle = "#ecfdf5";
          ctx.fill();
          ctx.strokeStyle = "#a7f3d0";
          ctx.lineWidth = 1;
          roundRect(ctx, colShareX - 2, rowMidY - 9, 44, 18, 4);
          ctx.stroke();

          ctx.fillStyle = "#047857";
          ctx.font = "bold 10px 'Georgia', serif, sans-serif";
          ctx.fillText(pctStr, colShareX + 4, rowMidY + 4);
        } else {
          ctx.fillStyle = "#78716c";
          ctx.font = "500 11px 'Georgia', serif, sans-serif";
          ctx.fillText(pctStr, colShareX + 4, rowMidY + 4);
        }

        rowY += curRowH;
      });

      // Total Row
      ctx.fillStyle = "#f5f5f4";
      ctx.fillRect(pad, rowY, tableW, 38);
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, rowY, tableW, 38);

      ctx.font = "bold 11px 'Georgia', 'PingFang SC', serif, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? "认证有效总计" : "Certified Total", colOptX, rowY + 23);
      ctx.fillText(String(totalSelections), colVotesX + 4, rowY + 23);
      ctx.fillText(totalVotes > 0 ? "100.0%" : "0.0%", colShareX + 4, rowY + 23);

      // 7.2 Right Chart Box (276px wide)
      roundRect(ctx, rcX, midY, chartW, midSectionH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, rcX, midY, chartW, midSectionH, 10);
      ctx.stroke();

      if (isManyOptions) {
        // =====================================================================
        // DUAL CHART MODE (Options > 4): Top Vertical Bar Chart + Bottom Donut
        // =====================================================================
        ctx.font = "bold 12px 'Georgia', 'PingFang SC', serif, sans-serif";
        ctx.fillStyle = "#064e3b";
        ctx.fillText(isZh ? "统计分布与占比" : "Distribution & Share", rcX + 16, midY + 24);

        ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#78716c";
        ctx.letterSpacing = "0.5px";
        ctx.fillText(isZh ? "票数柱状直方分布" : "VOTE COUNT HISTOGRAM", rcX + 16, midY + 42);
        ctx.letterSpacing = "0px";

        // Vertical Bar Chart
        const barAreaW = chartW - 32; // 244px
        const barBaselineY = midY + 120;
        const maxBarH = 56;

        const barW = Math.max(10, Math.min(18, Math.floor((barAreaW - (optCount - 1) * 6) / optCount)));
        const gap = Math.floor((barAreaW - optCount * barW) / (optCount - 1));
        const startX = rcX + 16 + Math.floor((barAreaW - (optCount * barW + (optCount - 1) * gap)) / 2);

        // Baseline
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rcX + 14, barBaselineY);
        ctx.lineTo(rcX + chartW - 14, barBaselineY);
        ctx.stroke();

        sortedOptions.forEach((opt, idx) => {
          const bx = startX + idx * (barW + gap);
          const barH = opt.count > 0 ? Math.max(4, Math.round((opt.count / maxVotes) * maxBarH)) : 0;
          const by = barBaselineY - barH;

          if (barH > 0) {
            roundRect(ctx, bx, by, barW, barH, 3);
            ctx.fillStyle = PALETTE[idx % PALETTE.length]!;
            ctx.fill();
          }

          // Vote count above bar
          ctx.font = "bold 9px 'Georgia', serif, sans-serif";
          ctx.fillStyle = opt.count > 0 ? (idx === 0 ? "#064e3b" : "#44403c") : "#a8a29e";
          ctx.textAlign = "center";
          ctx.fillText(String(opt.count), bx + barW / 2, barH > 0 ? by - 4 : barBaselineY - 4);

          // Option rank #1, #2... below baseline
          ctx.font = "bold 8px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillStyle = idx === 0 ? "#064e3b" : "#78716c";
          ctx.fillText(String(idx + 1), bx + barW / 2, barBaselineY + 12);
          ctx.textAlign = "start";
        });

        // Subtle Divider
        const divY = midY + 138;
        ctx.strokeStyle = "#f1f5f9";
        ctx.beginPath();
        ctx.moveTo(rcX + 16, divY);
        ctx.lineTo(rcX + chartW - 16, divY);
        ctx.stroke();

        // Bottom Donut Chart Section
        ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#78716c";
        ctx.letterSpacing = "0.5px";
        ctx.fillText(isZh ? "各选项占比分布" : "PROPORTIONAL SHARE", rcX + 16, divY + 18);
        ctx.letterSpacing = "0px";

        // Center donut in remaining space below divider
        const bottomAreaTop = divY + 20;
        const bottomAreaH = (midY + midSectionH) - bottomAreaTop;
        const donutCenterY = bottomAreaTop + bottomAreaH / 2;
        const donutCenterX = rcX + chartW / 2;
        const rOuter = Math.min(56, Math.floor(bottomAreaH / 2 - 16));
        const rInner = Math.floor(rOuter * 0.6);

        if (totalVotes === 0) {
          ctx.beginPath();
          ctx.arc(donutCenterX, donutCenterY, rOuter, 0, Math.PI * 2);
          ctx.arc(donutCenterX, donutCenterY, rInner, Math.PI * 2, 0, true);
          ctx.closePath();
          ctx.fillStyle = "#f3f4f6";
          ctx.fill();
          ctx.strokeStyle = "#e5e7eb";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = "bold 20px 'Georgia', serif, sans-serif";
          ctx.fillStyle = "#9ca3af";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("0", donutCenterX, donutCenterY - 2);

          ctx.font = "bold 8px -apple-system, sans-serif";
          ctx.fillStyle = "#9ca3af";
          ctx.fillText(isZh ? "暂无选票" : "AWAITING", donutCenterX, donutCenterY + 14);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        } else {
          let startAngle = -Math.PI / 2;
          sortedOptions.forEach((opt, idx) => {
            const sliceAngle = (opt.percentage / 100) * (Math.PI * 2);
            if (sliceAngle > 0.001) {
              const endAngle = startAngle + sliceAngle;
              ctx.beginPath();
              ctx.arc(donutCenterX, donutCenterY, rOuter, startAngle, endAngle);
              ctx.arc(donutCenterX, donutCenterY, rInner, endAngle, startAngle, true);
              ctx.closePath();
              ctx.fillStyle = PALETTE[idx % PALETTE.length]!;
              ctx.fill();
              startAngle = endAngle;
            }
          });

          ctx.font = "bold 22px 'Georgia', serif, sans-serif";
          ctx.fillStyle = "#064e3b";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(totalSelections), donutCenterX, donutCenterY - 2);

          ctx.font = "bold 8px -apple-system, sans-serif";
          ctx.fillStyle = "#78716c";
          ctx.fillText(isZh ? "选择总次" : "CHOICES", donutCenterX, donutCenterY + 14);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        }
      } else {
        // =====================================================================
        // SINGLE DONUT MODE (Options <= 4): Prominent centered donut, NO legend
        // =====================================================================
        ctx.font = "bold 12px 'Georgia', 'PingFang SC', serif, sans-serif";
        ctx.fillStyle = "#064e3b";
        ctx.fillText(isZh ? "得票比例分布" : "Proportional Vote Share", rcX + 20, midY + 26);

        const donutCenterX = rcX + chartW / 2;
        const donutCenterY = midY + midSectionH / 2 + 10;
        const rOuter = 68;
        const rInner = 42;

        if (totalVotes === 0) {
          ctx.beginPath();
          ctx.arc(donutCenterX, donutCenterY, rOuter, 0, Math.PI * 2);
          ctx.arc(donutCenterX, donutCenterY, rInner, Math.PI * 2, 0, true);
          ctx.closePath();
          ctx.fillStyle = "#f3f4f6";
          ctx.fill();
          ctx.strokeStyle = "#e5e7eb";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = "bold 24px 'Georgia', serif, sans-serif";
          ctx.fillStyle = "#9ca3af";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("0", donutCenterX, donutCenterY - 2);

          ctx.font = "bold 8px -apple-system, sans-serif";
          ctx.fillStyle = "#9ca3af";
          ctx.fillText(isZh ? "暂无选票" : "AWAITING", donutCenterX, donutCenterY + 14);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        } else {
          let startAngle = -Math.PI / 2;
          sortedOptions.forEach((opt, idx) => {
            const sliceAngle = (opt.percentage / 100) * (Math.PI * 2);
            if (sliceAngle > 0.001) {
              const endAngle = startAngle + sliceAngle;
              ctx.beginPath();
              ctx.arc(donutCenterX, donutCenterY, rOuter, startAngle, endAngle);
              ctx.arc(donutCenterX, donutCenterY, rInner, endAngle, startAngle, true);
              ctx.closePath();
              ctx.fillStyle = PALETTE[idx % PALETTE.length]!;
              ctx.fill();
              startAngle = endAngle;
            }
          });

          ctx.font = "bold 24px 'Georgia', serif, sans-serif";
          ctx.fillStyle = "#064e3b";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(totalSelections), donutCenterX, donutCenterY - 2);

          ctx.font = "bold 8px -apple-system, sans-serif";
          ctx.fillStyle = "#78716c";
          ctx.fillText(isZh ? "选择总次" : "CHOICES", donutCenterX, donutCenterY + 14);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        }
      }

      // -------------------------------------------------------------
      // 8. BOTTOM SECTION: Audit & Declarations
      // -------------------------------------------------------------
      const bottomY = midY + midSectionH + 20;

      // 8.1 Left Box
      roundRect(ctx, pad, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, pad, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.stroke();

      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? "审计与合规声明" : "AUDIT & GOVERNANCE DECLARATION", pad + 18, bottomY + 24);

      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#57534e";
      let noteY = bottomY + 44;
      notes.forEach((n) => {
        const wrapped = wrapText(ctx, n, bottomCardW - 36);
        wrapped.forEach((line) => {
          ctx.fillText(line, pad + 18, noteY);
          noteY += 17;
        });
      });

      // 8.2 Right Box
      const rightBottomX = pad + bottomCardW + 18;
      roundRect(ctx, rightBottomX, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, rightBottomX, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.stroke();

      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? "防伪存证印记" : "CRYPTOGRAPHIC SEAL & METADATA", rightBottomX + 18, bottomY + 24);

      const fingerprint = getFingerprint(results.poll_id, totalVotes, totalSelections);
      const currentTime = formatDateTimeStr(new Date().toISOString());

      const auditItems = [
        { label: isZh ? "导出主体:" : "Exporter:", val: exporterName },
        { label: isZh ? "公示时间:" : "Published:", val: currentTime },
        { label: isZh ? "系统版本:" : "Version:", val: "v1.0 (Tamper-evident)" },
        { label: isZh ? "防伪指纹:" : "Fingerprint:", val: fingerprint, isHash: true },
      ];

      let auditY = bottomY + 44;
      auditItems.forEach((item) => {
        ctx.fillStyle = "#78716c";
        ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(item.label, rightBottomX + 18, auditY);
        const lblW = ctx.measureText(item.label).width;

        const valX = rightBottomX + 18 + lblW + 6;
        const maxValW = bottomCardW - 36 - lblW - 6;

        if (item.isHash) {
          ctx.font = "bold 10px monospace";
          ctx.fillStyle = "#047857";
        } else {
          ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillStyle = "#1c1917";
        }
        ctx.fillText(truncateText(ctx, item.val, maxValW), valX, auditY);
        auditY += 19;
      });

      // -------------------------------------------------------------
      // 9. FOOTER WATERMARK
      // -------------------------------------------------------------
      const footY = bottomY + bottomCardsH + 20;
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, footY);
      ctx.lineTo(width - pad, footY);
      ctx.stroke();

      const watermark = isZh
        ? "VoteNow 官方投票发布机构 · 认证存证档案公示"
        : "VoteNow Official Verification Authority · Registered Public Electoral Record";
      ctx.font = "500 10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#a8a29e";
      const wmW = ctx.measureText(watermark).width;
      ctx.fillText(watermark, (width - wmW) / 2, footY + 16);

      // Export as PNG
      const dataUrl = canvas.toDataURL("image/png");
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob failed"));
          return;
        }
        resolve({ dataUrl, blob });
      }, "image/png");
    } catch (err) {
      reject(err);
    }
  });
}
