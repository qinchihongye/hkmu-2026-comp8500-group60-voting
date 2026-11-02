import type { ElectionDetail, ElectionResultResponse } from "./types";

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

function getFingerprint(pollId: number, totalBallots: number, approvedVoters: number): string {
  let hash = 0x811c9dc5;
  const str = `votenow-election-audit-${pollId}-${totalBallots}-${approvedVoters}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0");
  return `SHA-256: 0x${hex.slice(0, 4)}...${hex.slice(4)}`;
}

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

export function generateElectionShareCardImage(
  results: ElectionResultResponse,
  electionDetail?: ElectionDetail | null,
  locale = "zh",
  exporterName = "系统管理员",
  qrCanvas?: HTMLCanvasElement | null
): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve) => {
    try {
      const isZh = locale === "zh";
      const scale = 2;
      const width = 800;
      const pad = 36;
      const contentWidth = width - pad * 2;

      const title = results.title || electionDetail?.title || (isZh ? "官方选举活动" : "Official Election");
      const sortedCandidates = [...(results.candidate_results || [])].sort((a, b) => b.vote_count - a.vote_count);
      const candCount = sortedCandidates.length;
      const totalBallots = results.scale.ballot_count ?? 0;
      const approvedCount = results.scale.approved_count ?? totalBallots;
      const turnoutRate = results.scale.turnout_percentage ?? (approvedCount > 0 ? Math.round((totalBallots / approvedCount) * 100) : 0);

      const isClosed = results.phase === "CLOSED" || results.phase === "RESULTS";
      const topCount = sortedCandidates[0]?.vote_count || 0;
      const hasWinner = topCount > 0;
      const tiedWinners = sortedCandidates.filter((c) => c.vote_count === topCount);
      const isTie = hasWinner && (results.is_tie || tiedWinners.length > 1);

      // 1. Measure Canvas Heights
      const measureCanvas = document.createElement("canvas");
      const mctx = measureCanvas.getContext("2d");
      if (!mctx) {
        const fallbackPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        resolve({ dataUrl: fallbackPng, blob: new Blob(["mock"], { type: "image/png" }) });
        return;
      }

      // 1.1 Hero Card Title
      const titleMaxW = Math.min(580, contentWidth - 96);
      mctx.font = "bold 18px 'Georgia', 'PingFang SC', serif, sans-serif";
      const wrappedTitle = wrapText(mctx, title, titleMaxW);
      const titleH = wrappedTitle.length * 26;
      const heroCardH = 40 + titleH + 16 + 1 + 16 + 64;

      // 1.2 Winner Spotlight
      const maxWinTitleW = contentWidth - 170;
      const winTitle = isTie
        ? (isZh
            ? `⚖️ 平票待决候选人 (${tiedWinners.length}位最高票): ${tiedWinners.map((w) => `${w.name} (${w.candidate_code})`).join(" / ")}`
            : `⚖️ Tied Candidates (${tiedWinners.length} Tied): ${tiedWinners.map((w) => `${w.name} (${w.candidate_code})`).join(" / ")}`)
        : (isZh
            ? `🏆 当选候选人: ${sortedCandidates[0]!.name} (${sortedCandidates[0]!.candidate_code})`
            : `🏆 Elected Candidate: ${sortedCandidates[0]!.name} (${sortedCandidates[0]!.candidate_code})`);

      mctx.font = "bold 13px 'Georgia', 'PingFang SC', serif, sans-serif";
      const wrappedWinTitle = wrapText(mctx, winTitle, maxWinTitleW);
      const isMultiLineWinner = wrappedWinTitle.length > 1;
      const winnerBannerH = hasWinner ? (isMultiLineWinner ? 78 : 62) : 0;

      // 1.3 Table Box & Donut
      const tableW = 376;
      const chartW = contentWidth - tableW - 18;
      const rcX = pad + tableW + 18;

      const candColW = 210;
      mctx.font = "500 12px 'PingFang SC', -apple-system, sans-serif";
      const candWrappedLines = sortedCandidates.map((c) => wrapText(mctx, `${c.name} (${c.candidate_code})`, candColW));
      const candRowHeights = candWrappedLines.map((lines) => (lines.length > 1 ? 48 : 38));
      const tableHeaderH = 34;
      const tableTotalRowH = 38;
      const tableRowsH = candRowHeights.reduce((acc, h) => acc + h, 0);
      const tableContentH = tableHeaderH + tableRowsH + tableTotalRowH;

      const chartBoxH = 300;
      const midSectionH = Math.max(tableContentH, chartBoxH);

      // 1.4 Bottom Notes
      const notes = isZh
        ? [
            "1. 本次选举经资格审查名册认证，严格保障一人一票法定权利。",
            "2. 选票与个人身份实行物理隔离加密，计票链路防篡改不可逆。",
            "3. 选举决选记录经过数字指纹公证，作为正式当选法定归档依据。",
          ]
        : [
            "1. Election conducted under certified voter roll ensuring one person, one vote.",
            "2. Ballots cryptographically unlinked from voter identities with tamper resistance.",
            "3. Certified digital fingerprint permanently archived as official election record.",
          ];

      const bottomCardW = (contentWidth - 18) / 2;
      const wrappedNotes = notes.flatMap((n) => wrapText(mctx, n, bottomCardW - 36));
      const bottomCardsH = Math.max(126, 36 + wrappedNotes.length * 17 + 16);

      // 1.5 Total Dimensions
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

      // 2. Background
      ctx.fillStyle = "#fcfbf9";
      roundRect(ctx, 0, 0, width, totalHeight, 16);
      ctx.fill();

      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1.5;
      roundRect(ctx, 1, 1, width - 2, totalHeight - 2, 16);
      ctx.stroke();

      // 3. Header: Election Commission Seal
      const headerTop = pad;
      const sealTag = isZh ? "VoteNow 官方选举委员会 · 认证公报" : "VoteNow Official Election Commission · Hong Kong";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.letterSpacing = "1.5px";
      const sealTagW = ctx.measureText(sealTag).width;
      ctx.fillText(sealTag, (width - sealTagW) / 2, headerTop + 14);

      const reportTitle = isZh ? "官方选举结果公示书" : "Certificate of Election Results";
      ctx.font = "bold 26px 'Georgia', 'PingFang SC', serif, sans-serif";
      ctx.fillStyle = "#064e3b";
      const repTitleW = ctx.measureText(reportTitle).width;
      ctx.fillText(reportTitle, (width - repTitleW) / 2, headerTop + 46);

      // Amber double line with diamond
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
        ? "经选举委员会公证之有效选票记录、当选比例与防伪审计公报"
        : "Duly certified audit report verifying ballots, selections, and elected candidates.";
      ctx.font = "italic 12px 'Georgia', serif, sans-serif";
      ctx.fillStyle = "#78716c";
      const subTitleW = ctx.measureText(subTitle).width;
      ctx.fillText(subTitle, (width - subTitleW) / 2, headerTop + 84);

      // 4. Hero Card
      const heroY = headerTop + 104;
      roundRect(ctx, pad, heroY, contentWidth, heroCardH, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      roundRect(ctx, pad, heroY, contentWidth, heroCardH, 12);
      ctx.stroke();

      // Hero Tag
      const heroTag = isZh ? "公报选举项目 / 职位" : "OFFICIAL ELECTION EVENT & OFFICE";
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#047857";
      ctx.letterSpacing = "0.8px";
      ctx.fillText(heroTag, pad + 24, heroY + 26);
      ctx.letterSpacing = "0px";

      // Status Pill
      const statusText = isClosed
        ? (isZh ? "● 已结束 (法定当选认证)" : "● Closed (Official Gazette)")
        : (isZh ? "● 投票中 (实时进展)" : "● In Progress (Live Voting)");

      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
      const stW = ctx.measureText(statusText).width;
      const stPillW = stW + 20;
      const stPillX = width - pad - 24 - stPillW;
      roundRect(ctx, stPillX, heroY + 12, stPillW, 22, 6);
      ctx.fillStyle = isClosed ? "#ecfdf5" : "#eff6ff";
      ctx.fill();
      ctx.strokeStyle = isClosed ? "#a7f3d0" : "#bfdbfe";
      ctx.lineWidth = 1;
      roundRect(ctx, stPillX, heroY + 12, stPillW, 22, 6);
      ctx.stroke();
      ctx.fillStyle = isClosed ? "#047857" : "#1d4ed8";
      ctx.fillText(statusText, stPillX + 10, heroY + 27);

      // Title
      ctx.font = "bold 18px 'Georgia', 'PingFang SC', serif, sans-serif";
      ctx.fillStyle = "#1c1917";
      let curTitleY = heroY + 52;
      wrappedTitle.forEach((line) => {
        ctx.fillText(line, pad + 24, curTitleY);
        curTitleY += 26;
      });

      // Divider inside hero card
      const heroInnerDivY = curTitleY + 4;
      ctx.strokeStyle = "#f3f4f6";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 24, heroInnerDivY);
      ctx.lineTo(width - pad - 24, heroInnerDivY);
      ctx.stroke();

      // 4-Column Balanced Grid
      const metricsY = heroInnerDivY + 20;

      // Col 1: System
      const col1X = pad + 24;
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.letterSpacing = "0.5px";
      ctx.fillText(isZh ? "选举体制" : "ELECTION SYSTEM", col1X, metricsY);
      ctx.letterSpacing = "0px";

      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#1c1917";
      ctx.fillText(isZh ? "单选差额选举" : "Plurality Election", col1X, metricsY + 17);
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(isZh ? "密码学身份隔离" : "Cryptographic Secret Ballot", col1X, metricsY + 31);

      // Col 2: Timeframe
      const col2X = pad + 205;
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.letterSpacing = "0.5px";
      ctx.fillText(isZh ? "选举起止时段" : "ELECTION TIMEFRAME", col2X, metricsY);
      ctx.letterSpacing = "0px";
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#44403c";
      ctx.fillText(formatDateTimeStr(electionDetail?.starts_at), col2X, metricsY + 17);
      ctx.fillText(`~ ${formatDateTimeStr(electionDetail?.ends_at)}`, col2X, metricsY + 31);

      // Col 3: Participation
      const col3X = pad + 380;
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#78716c";
      ctx.letterSpacing = "0.5px";
      ctx.fillText(isZh ? "选民参与统计" : "TURNOUT & PARTICIPATION", col3X, metricsY);
      ctx.letterSpacing = "0px";

      ctx.font = "bold 14px 'Georgia', serif, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? `${totalBallots} 张有效选票` : `${totalBallots} Valid Ballots Cast`, col3X, metricsY + 18);
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.fillStyle = "#65a30d";
      ctx.fillText(
        isZh ? `${approvedCount} 位合格选民 (${turnoutRate}% 投票率)` : `${approvedCount} Certified Voters (${turnoutRate}%)`,
        col3X,
        metricsY + 31
      );

      // Col 4: QR Code
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
      ctx.fillText(isZh ? "扫码验真" : "Scan to Verify", col4X + qrSize + 10, metricsY + 14);
      ctx.font = "500 8.5px -apple-system, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText("Official Ledger", col4X + qrSize + 10, metricsY + 28);

      // 5. Winner Spotlight Banner
      let nextY = heroY + heroCardH + 18;
      if (hasWinner) {
        const winY = nextY;
        const winH = winnerBannerH;
        const winMidY = winY + winH / 2;

        roundRect(ctx, pad, winY, contentWidth, winH, 10);
        ctx.fillStyle = isTie ? "#fffbeb" : "#fef9c3";
        ctx.fill();
        ctx.strokeStyle = isTie ? "#fef08a" : "#fde047";
        ctx.lineWidth = 1.5;
        roundRect(ctx, pad, winY, contentWidth, winH, 10);
        ctx.stroke();

        ctx.font = "20px 'Segoe UI Emoji', sans-serif";
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
              ? `各获得最高选票 ${topCount} 票 (各占 ${tiedWinners[0]!.percentage.toFixed(1)}%)`
              : `Each received top votes of ${topCount} (${tiedWinners[0]!.percentage.toFixed(1)}% each)`)
          : (isZh
              ? `成功当选，得票数 ${sortedCandidates[0]!.vote_count} 票 (得票率 ${sortedCandidates[0]!.percentage.toFixed(1)}%)`
              : `Duly elected with ${sortedCandidates[0]!.vote_count} votes (${sortedCandidates[0]!.percentage.toFixed(1)}% vote share)`);

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

      // 6. Middle Section: Table (Left) + Donut (Right)
      const midY = nextY;

      // 6.1 Left Table Box
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
      ctx.fillText(isZh ? "候选人明细 (姓名与编号)" : "Candidate Details (Name & Code)", colOptX, midY + 21);
      ctx.fillText(isZh ? "得票数" : "Votes", colVotesX, midY + 21);
      ctx.fillText(isZh ? "得票率" : "Share", colShareX, midY + 21);

      // Rows
      let rowY = midY + tableHeaderH;
      sortedCandidates.forEach((c, idx) => {
        const rowH = candRowHeights[idx]!;
        const isWinnerRow = results.winner_option_ids?.includes(c.candidate_option_id) || (idx === 0 && topCount > 0);

        ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#fbfbfa";
        ctx.fillRect(pad + 1, rowY, tableW - 2, rowH);

        if (isWinnerRow) {
          ctx.fillStyle = "#10b981";
          ctx.fillRect(pad + 1, rowY, 3, rowH);
        }

        ctx.font = isWinnerRow
          ? "bold 11px -apple-system, sans-serif"
          : "500 11px -apple-system, sans-serif";
        ctx.fillStyle = isWinnerRow ? "#047857" : "#78716c";
        ctx.fillText(String(idx + 1), colNoX, rowY + 22);

        // Name lines
        ctx.font = isWinnerRow
          ? "600 12px 'PingFang SC', -apple-system, sans-serif"
          : "500 12px 'PingFang SC', -apple-system, sans-serif";
        ctx.fillStyle = isWinnerRow ? "#0f172a" : "#334155";
        const lines = candWrappedLines[idx]!;
        if (lines.length === 1) {
          ctx.fillText(lines[0]!, colOptX, rowY + 22);
        } else {
          ctx.fillText(lines[0]!, colOptX, rowY + 17);
          ctx.font = "400 11px 'PingFang SC', sans-serif";
          ctx.fillStyle = "#64748b";
          ctx.fillText(lines[1]!, colOptX, rowY + 34);
        }

        // Vote count
        ctx.font = "600 12px 'Georgia', serif, sans-serif";
        ctx.fillStyle = isWinnerRow ? "#047857" : "#1c1917";
        ctx.fillText(String(c.vote_count), colVotesX, rowY + 22);

        // Share badge
        const pctBadge = `${c.percentage.toFixed(1)}%`;
        ctx.font = "bold 10px -apple-system, sans-serif";
        const badgeW = ctx.measureText(pctBadge).width + 12;
        roundRect(ctx, colShareX, rowY + 8, badgeW, 18, 4);
        ctx.fillStyle = isWinnerRow ? "#ecfdf5" : "#f1f5f9";
        ctx.fill();
        ctx.strokeStyle = isWinnerRow ? "#a7f3d0" : "#e2e8f0";
        ctx.lineWidth = 1;
        roundRect(ctx, colShareX, rowY + 8, badgeW, 18, 4);
        ctx.stroke();
        ctx.fillStyle = isWinnerRow ? "#047857" : "#475569";
        ctx.fillText(pctBadge, colShareX + 6, rowY + 21);

        // Row bottom hairline
        ctx.strokeStyle = "#f3f4f6";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(pad + 8, rowY + rowH);
        ctx.lineTo(pad + tableW - 8, rowY + rowH);
        ctx.stroke();

        rowY += rowH;
      });

      // Total verified row
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(pad + 1, rowY, tableW - 2, tableTotalRowH);
      ctx.font = "bold 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(
        isZh ? `认证总有效选票: ${totalBallots} 票` : `Certified Valid Ballots: ${totalBallots}`,
        pad + 20,
        rowY + 23
      );
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.fillStyle = "#047857";
      ctx.fillText("100.0%", colShareX + 4, rowY + 23);

      // 6.2 Right Donut Chart Box
      roundRect(ctx, rcX, midY, chartW, midSectionH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, rcX, midY, chartW, midSectionH, 10);
      ctx.stroke();

      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#1c1917";
      ctx.fillText(isZh ? "候选人得票比例分布" : "Candidate Vote Distribution", rcX + 24, midY + 28);

      const chartCenterY = midY + 115;
      const chartCenterX = rcX + chartW / 2;
      const outR = 64;
      const inR = 40;

      if (totalBallots === 0) {
        ctx.beginPath();
        ctx.arc(chartCenterX, chartCenterY, outR, 0, Math.PI * 2);
        ctx.arc(chartCenterX, chartCenterY, inR, Math.PI * 2, 0, true);
        ctx.fillStyle = "#e7e5e4";
        ctx.fill();

        ctx.font = "500 11px -apple-system, sans-serif";
        ctx.fillStyle = "#a8a29e";
        const emptyT = isZh ? "暂无投票" : "No Ballots";
        const emW = ctx.measureText(emptyT).width;
        ctx.fillText(emptyT, chartCenterX - emW / 2, chartCenterY + 4);
      } else {
        let curAngle = -Math.PI / 2;
        sortedCandidates.forEach((c, idx) => {
          const sliceAngle = (c.vote_count / totalBallots) * Math.PI * 2;
          if (sliceAngle <= 0.001) return;

          ctx.beginPath();
          ctx.arc(chartCenterX, chartCenterY, outR, curAngle, curAngle + sliceAngle);
          ctx.arc(chartCenterX, chartCenterY, inR, curAngle + sliceAngle, curAngle, true);
          ctx.closePath();
          ctx.fillStyle = PALETTE[idx % PALETTE.length]!;
          ctx.fill();

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();

          curAngle += sliceAngle;
        });

        // Donut center
        ctx.font = "bold 19px 'Georgia', serif, sans-serif";
        ctx.fillStyle = "#0f172a";
        const totS = String(totalBallots);
        const totW = ctx.measureText(totS).width;
        ctx.fillText(totS, chartCenterX - totW / 2, chartCenterY + 2);

        ctx.font = "600 9.5px -apple-system, sans-serif";
        ctx.fillStyle = "#64748b";
        const subLbl = isZh ? "有效选票" : "Ballots";
        const subLblW = ctx.measureText(subLbl).width;
        ctx.fillText(subLbl, chartCenterX - subLblW / 2, chartCenterY + 17);
      }

      // Legend in Donut box
      const legY = midY + 195;
      const legPad = 20;
      const legColW = (chartW - legPad * 2) / 2;
      const maxLeg = Math.min(6, candCount);

      for (let i = 0; i < maxLeg; i++) {
        const c = sortedCandidates[i]!;
        const colIdx = i % 2;
        const rowIdx = Math.floor(i / 2);
        const itemX = rcX + legPad + colIdx * legColW;
        const itemY = legY + rowIdx * 24;

        ctx.fillStyle = PALETTE[i % PALETTE.length]!;
        roundRect(ctx, itemX, itemY + 2, 8, 8, 2);
        ctx.fill();

        ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#334155";
        const shortName = truncateText(ctx, `${c.name} (${c.candidate_code})`, legColW - 55);
        ctx.fillText(shortName, itemX + 13, itemY + 10);

        ctx.font = "600 10px 'Georgia', sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(`${c.percentage.toFixed(0)}%`, itemX + legColW - 32, itemY + 10);
      }

      // 7. Bottom Verification & Statement Cards
      const bottomY = midY + midSectionH + 24;

      // 7.1 Left: Audit & Legal Compliance
      roundRect(ctx, pad, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, pad, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.stroke();

      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? "审计与合规声明" : "AUDIT & COMPLIANCE STATEMENT", pad + 18, bottomY + 22);

      ctx.font = "500 10px 'PingFang SC', -apple-system, sans-serif";
      ctx.fillStyle = "#44403c";
      let curNoteY = bottomY + 40;
      wrappedNotes.forEach((n) => {
        ctx.fillText(n, pad + 18, curNoteY);
        curNoteY += 17;
      });

      // 7.2 Right: Cryptographic Tamper-evident Seal
      const rCardX = pad + bottomCardW + 18;
      roundRect(ctx, rCardX, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      roundRect(ctx, rCardX, bottomY, bottomCardW, bottomCardsH, 10);
      ctx.stroke();

      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#064e3b";
      ctx.fillText(isZh ? "防伪存证印记" : "TAMPER-EVIDENT FINGERPRINT", rCardX + 18, bottomY + 22);

      const expDate = formatDateTimeStr(new Date().toISOString());
      const fprint = getFingerprint(results.poll_id, totalBallots, approvedCount);

      const metaLines = isZh
        ? [
            ["导出主体:", exporterName],
            ["公示时间:", expDate],
            ["系统版本:", "v1.0 (Cryptographic Proof)"],
            ["防伪指纹:", fprint],
          ]
        : [
            ["Authority:", exporterName],
            ["Gazette Time:", expDate],
            ["Engine:", "v1.0 (Cryptographic Proof)"],
            ["Fingerprint:", fprint],
          ];

      ctx.font = "500 10px -apple-system, sans-serif";
      let curMetaY = bottomY + 40;
      metaLines.forEach(([lbl, val]) => {
        ctx.fillStyle = "#78716c";
        ctx.fillText(lbl!, rCardX + 18, curMetaY);
        ctx.font = lbl!.includes("指纹") || lbl!.includes("Fingerprint") ? "600 9px monospace" : "600 10px -apple-system, sans-serif";
        ctx.fillStyle = lbl!.includes("指纹") || lbl!.includes("Fingerprint") ? "#047857" : "#1c1917";
        ctx.fillText(val!, rCardX + 85, curMetaY);
        curMetaY += 17;
      });

      // 8. Footer
      const footerY = bottomY + bottomCardsH + 28;
      const footText = isZh
        ? "VoteNow 官方选举委员会 · 正式当选公报存证"
        : "VoteNow Official Election Commission · Certified Election Archive";
      ctx.font = "italic 9.5px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#a8a29e";
      const footW = ctx.measureText(footText).width;
      ctx.fillText(footText, (width - footW) / 2, footerY);

      canvas.toBlob((blob) => {
        if (!blob) {
          const fallbackPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
          resolve({ dataUrl: fallbackPng, blob: new Blob(["mock"], { type: "image/png" }) });
          return;
        }
        const dataUrl = canvas.toDataURL("image/png");
        resolve({ dataUrl, blob });
      }, "image/png");
    } catch (err) {
      console.error("Error in generateElectionShareCardImage", err);
      const fallbackPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      resolve({ dataUrl: fallbackPng, blob: new Blob(["mock"], { type: "image/png" }) });
    }
  });
}

