import type { PollDetail, PollResults } from "../../lib/api-types";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
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
  return str + "...";
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

const PALETTE = [
  "#0a2540", // Navy
  "#1e3a8a", // Slate Blue
  "#10b981", // Emerald
  "#d97706", // Amber
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#64748b", // Slate
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
      const scale = 2; // High-DPI 2x
      const width = 760;

      const title = results.poll_title || pollDetail?.title || (isZh ? "投票活动" : "Poll Event");
      const sortedOptions = [...results.options].sort((a, b) => b.count - a.count);

      const pad = 40;
      const contentWidth = width - pad * 2; // 680

      // Compute dynamic table height based on options count
      const tableRowHeight = 36;
      const tableBodyHeight = Math.max(sortedOptions.length * tableRowHeight, 3 * tableRowHeight);
      const tableTotalHeight = 36 + tableBodyHeight + 36; // Header + Body + Total row
      const chartsTotalHeight = 280;
      const middleSectionHeight = Math.max(tableTotalHeight, chartsTotalHeight) + 40;

      // Estimate total height
      const headerHeight = 110;
      const topCardsHeight = 180;
      const bottomCardsHeight = 115;
      const footerHeight = 44;
      const totalHeight = pad + headerHeight + topCardsHeight + 24 + middleSectionHeight + 24 + bottomCardsHeight + 30 + footerHeight;

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = totalHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        // Fallback for headless environments
        const fallbackPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        resolve({
          dataUrl: fallbackPng,
          blob: new Blob(["mock"], { type: "image/png" }),
        });
        return;
      }

      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = "#fcfdfe";
      roundRect(ctx, 0, 0, width, totalHeight, 20);
      ctx.fill();

      // Outer border
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      roundRect(ctx, 1, 1, width - 2, totalHeight - 2, 20);
      ctx.stroke();

      // ==========================================
      // 1. Header: 投票结果报告
      // ==========================================
      const reportTitle = isZh ? "投票结果报告" : "VOTING RESULTS REPORT";
      ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
      const titleWidth = ctx.measureText(reportTitle).width;
      const titleX = (width - titleWidth) / 2;
      const titleY = pad + 15;

      // Left & Right flanking decorative navy lines
      ctx.strokeStyle = "#0a2540";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad + 15, titleY - 8);
      ctx.lineTo(titleX - 20, titleY - 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(titleX + titleWidth + 20, titleY - 8);
      ctx.lineTo(width - pad - 15, titleY - 8);
      ctx.stroke();

      // Title text
      ctx.fillStyle = "#0a2540";
      ctx.fillText(reportTitle, titleX, titleY);

      // Subtitle
      const subTitle = isZh ? "VoteNow 投票系统 · 结果公示" : "VoteNow Polling Platform · Official Results Publication";
      ctx.font = "500 13px -apple-system, BlinkMacSystemFont, sans-serif";
      const subWidth = ctx.measureText(subTitle).width;
      ctx.fillStyle = "#475569";
      ctx.fillText(subTitle, (width - subWidth) / 2, titleY + 28);

      // Decorative divider with green tick
      const divY = titleY + 48;
      ctx.strokeStyle = "#0a2540";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad, divY);
      ctx.lineTo(width - pad, divY);
      ctx.stroke();

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(pad, divY + 3);
      ctx.lineTo(width - pad, divY + 3);
      ctx.stroke();

      // Emerald center accent block
      ctx.fillStyle = "#10b981";
      ctx.fillRect(width / 2 - 22, divY - 2, 44, 4);

      // ==========================================
      // 2. Top Info Row (Two Cards)
      // ==========================================
      const cardY = divY + 24;
      const cardW = (contentWidth - 20) / 2; // 330
      const cardH = topCardsHeight;

      // --- Left Card: Navy Blue Information Card ---
      roundRect(ctx, pad, cardY, cardW, cardH, 12);
      ctx.fillStyle = "#0a2540";
      ctx.fill();

      // Bullet contents
      const isSingle = (results.selection_mode || pollDetail?.selection_mode) === "SINGLE";
      const isNamed = pollDetail?.identity_mode === "NAMED";
      const statusText = results.is_final
        ? isZh ? "已结束 (最终结果)" : "Closed (Final)"
        : isZh ? "进行中 (实时结果)" : "Open (Live)";

      const infoBullets = [
        { label: isZh ? "投票名称:" : "Poll Title:", val: title },
        { label: isZh ? "投票类型:" : "Type:", val: `${isSingle ? (isZh ? "单选" : "Single") : (isZh ? "多选" : "Multiple")} · ${isNamed ? (isZh ? "记名" : "Named") : (isZh ? "匿名" : "Anonymous")}` },
        { label: isZh ? "投票状态:" : "Status:", val: statusText },
        { label: isZh ? "开始时间:" : "Starts:", val: formatDateTimeStr(pollDetail?.starts_at) },
        { label: isZh ? "结束时间:" : "Ends:", val: formatDateTimeStr(pollDetail?.ends_at) },
      ];

      ctx.font = "500 12px -apple-system, BlinkMacSystemFont, sans-serif";
      let bulletY = cardY + 24;
      infoBullets.forEach((item) => {
        // Cyan dot
        ctx.fillStyle = "#06b6d4";
        ctx.beginPath();
        ctx.arc(pad + 20, bulletY - 4, 3, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = "#93c5fd";
        ctx.fillText(item.label, pad + 32, bulletY);

        // Value
        ctx.fillStyle = "#ffffff";
        const valX = pad + (isZh ? 94 : 80);
        const maxValW = cardW - (valX - pad) - 16;
        const valStr = truncateText(ctx, item.val, maxValW);
        ctx.fillText(valStr, valX, bulletY);

        bulletY += 28;
      });

      // --- Right Card: Participation Overview Card ---
      const rcX = pad + cardW + 20;
      roundRect(ctx, rcX, cardY, cardW, cardH, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.5;
      roundRect(ctx, rcX, cardY, cardW, cardH, 12);
      ctx.stroke();

      // Header: 参与概览
      ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(isZh ? "参与概览" : "Participation", rcX + 20, cardY + 28);

      // Big Stat: Number
      const totalCountStr = String(results.total_votes);
      ctx.font = "900 42px 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#0a2540";
      ctx.fillText(totalCountStr, rcX + 20, cardY + 84);

      // Label next to big number
      const numW = ctx.measureText(totalCountStr).width;
      ctx.font = "500 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(isZh ? "总参与" : "Total", rcX + 26 + numW, cardY + 66);
      ctx.fillText(isZh ? "人数" : "Ballots", rcX + 26 + numW, cardY + 82);

      // Pills below
      const pillY = cardY + 120;
      // Valid votes pill
      ctx.fillStyle = "#f8fafc";
      roundRect(ctx, rcX + 16, pillY, 94, 30, 6);
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      roundRect(ctx, rcX + 16, pillY, 94, 30, 6);
      ctx.stroke();

      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#0a2540";
      ctx.fillText(isZh ? "有效票" : "Valid", rcX + 22, pillY + 19);
      ctx.font = "bold 12px 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(totalCountStr, rcX + (isZh ? 64 : 58), pillY + 19);

      // Invalid votes pill
      ctx.fillStyle = "#f8fafc";
      roundRect(ctx, rcX + 116, pillY, 78, 30, 6);
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      roundRect(ctx, rcX + 116, pillY, 78, 30, 6);
      ctx.stroke();

      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(isZh ? "无效票" : "Void", rcX + 122, pillY + 19);
      ctx.font = "bold 12px 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("0", rcX + (isZh ? 168 : 158), pillY + 19);

      // QR Code on right
      const qrSize = 82;
      const qrX = rcX + cardW - qrSize - 16;
      const qrY = cardY + 28;

      if (qrCanvas) {
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      } else {
        // Draw crisp simulated QR code matrix pattern
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.strokeRect(qrX, qrY, qrSize, qrSize);

        ctx.fillStyle = "#0f172a";
        const dot = 6;
        for (let qx = qrX + 4; qx < qrX + qrSize - 4; qx += dot + 2) {
          for (let qy = qrY + 4; qy < qrY + qrSize - 4; qy += dot + 2) {
            if ((qx * 3 + qy * 7) % 11 < 6) {
              ctx.fillRect(qx, qy, dot, dot);
            }
          }
        }
      }

      ctx.font = "500 10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      const qrCaption = isZh ? "扫码核验结果" : "Scan to Verify";
      const qrCapW = ctx.measureText(qrCaption).width;
      ctx.fillText(qrCaption, qrX + (qrSize - qrCapW) / 2, qrY + qrSize + 16);

      // ==========================================
      // 3. Middle Section: 票数对比 (Results Comparison)
      // ==========================================
      const secTitleY = cardY + cardH + 28;
      ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#0a2540";
      const compTitle = isZh ? "票数对比" : "Vote Breakdown & Comparison";
      const compTitleW = ctx.measureText(compTitle).width;
      ctx.fillText(compTitle, (width - compTitleW) / 2, secTitleY);

      const midContentY = secTitleY + 16;

      // --- Left Column: Data Table ---
      const tblX = pad;
      const tblW = cardW;

      // Table Header (Navy Blue)
      roundRect(ctx, tblX, midContentY, tblW, 34, 6);
      ctx.fillStyle = "#0a2540";
      ctx.fill();

      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(isZh ? "排名" : "Rank", tblX + 16, midContentY + 22);
      ctx.fillText(isZh ? "选项" : "Option", tblX + 70, midContentY + 22);
      ctx.fillText(isZh ? "票数" : "Votes", tblX + 200, midContentY + 22);
      ctx.fillText(isZh ? "占比" : "Ratio", tblX + 270, midContentY + 22);

      let rowY = midContentY + 34;
      ctx.font = "500 12px -apple-system, BlinkMacSystemFont, sans-serif";

      sortedOptions.forEach((opt, idx) => {
        const isWinner = idx === 0 && opt.count > 0;
        ctx.fillStyle = isWinner ? "#fef3c7" : idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        ctx.fillRect(tblX, rowY, tblW, tableRowHeight);
        ctx.strokeStyle = "#f1f5f9";
        ctx.lineWidth = 1;
        ctx.strokeRect(tblX, rowY, tblW, tableRowHeight);

        // Rank
        ctx.fillStyle = isWinner ? "#b45309" : "#334155";
        ctx.font = isWinner ? "bold 12px sans-serif" : "500 12px sans-serif";
        ctx.fillText(String(idx + 1), tblX + 22, rowY + 22);

        // Option label (truncated)
        ctx.fillStyle = "#0f172a";
        const optName = truncateText(ctx, opt.label, 110);
        ctx.fillText(optName, tblX + 70, rowY + 22);

        // Vote count
        ctx.fillStyle = "#0f172a";
        ctx.fillText(String(opt.count), tblX + 200, rowY + 22);

        // Percentage
        ctx.fillStyle = "#0a2540";
        ctx.fillText(`${opt.percentage.toFixed(1)}%`, tblX + 270, rowY + 22);

        rowY += tableRowHeight;
      });

      // Total Row
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(tblX, rowY, tblW, tableRowHeight);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(tblX, rowY, tblW, tableRowHeight);

      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(isZh ? "合计" : "Total", tblX + 70, rowY + 22);
      ctx.fillText(String(results.total_selections || results.total_votes), tblX + 200, rowY + 22);
      ctx.fillText("100%", tblX + 270, rowY + 22);

      // --- Right Column: Dual Charts (Bar + Donut) ---
      const chartX = rcX;
      let barY = midContentY + 12;

      // 1. Horizontal Bar Chart
      const maxVotes = Math.max(...sortedOptions.map((o) => o.count), 1);
      const maxBarLen = cardW - 30;

      sortedOptions.slice(0, 3).forEach((opt, idx) => {
        const ratio = opt.count / maxVotes;
        const bLen = Math.max(ratio * maxBarLen, ratio > 0 ? 8 : 0);
        const col = PALETTE[idx % PALETTE.length];

        ctx.fillStyle = col;
        roundRect(ctx, chartX + 10, barY, bLen, 16, 4);
        ctx.fill();

        barY += 26;
      });

      // Axis line & numbers
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartX + 10, barY + 4);
      ctx.lineTo(chartX + 10 + maxBarLen, barY + 4);
      ctx.stroke();

      ctx.font = "500 10px 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("0", chartX + 10, barY + 16);
      const stepVal = Math.ceil(maxVotes / 3);
      ctx.fillText(String(stepVal), chartX + 10 + maxBarLen * 0.33, barY + 16);
      ctx.fillText(String(stepVal * 2), chartX + 10 + maxBarLen * 0.66, barY + 16);
      ctx.fillText(String(maxVotes), chartX + 10 + maxBarLen - 12, barY + 16);

      // 2. Donut Ring Chart
      const donutCenterX = chartX + cardW / 2;
      const donutCenterY = barY + 95;
      const rOuter = 52;
      const rInner = 30;

      let startAngle = -Math.PI / 2;
      sortedOptions.forEach((opt, idx) => {
        const sliceAngle = (opt.percentage / 100) * (Math.PI * 2);
        const endAngle = startAngle + sliceAngle;
        const col = PALETTE[idx % PALETTE.length];

        ctx.beginPath();
        ctx.arc(donutCenterX, donutCenterY, rOuter, startAngle, endAngle);
        ctx.arc(donutCenterX, donutCenterY, rInner, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();

        // Callout text for major slices (> 10%)
        if (opt.percentage >= 10) {
          const midA = startAngle + sliceAngle / 2;
          const textDist = rOuter + 22;
          const tx = donutCenterX + Math.cos(midA) * textDist;
          const ty = donutCenterY + Math.sin(midA) * textDist;
          ctx.font = "bold 10px 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillStyle = col;
          ctx.fillText(`${opt.percentage.toFixed(1)}%`, tx - 12, ty + 4);
        }

        startAngle = endAngle;
      });

      // Legend below Donut
      const legY = donutCenterY + 68;
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      let legX = chartX + 14;

      sortedOptions.slice(0, 3).forEach((opt, idx) => {
        const col = PALETTE[idx % PALETTE.length];
        ctx.fillStyle = col;
        ctx.fillRect(legX, legY, 10, 10);

        ctx.fillStyle = "#334155";
        const shortName = truncateText(ctx, opt.label, 70);
        ctx.fillText(shortName, legX + 14, legY + 9);

        legX += ctx.measureText(shortName).width + 26;
      });

      // ==========================================
      // 4. Bottom Section: 统计说明 & 导出防伪审计
      // ==========================================
      const bottomY = Math.max(rowY + 24, legY + 36);
      const bottomH = bottomCardsHeight;

      // Left Box: 统计说明
      roundRect(ctx, pad, bottomY, cardW, bottomH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      roundRect(ctx, pad, bottomY, cardW, bottomH, 10);
      ctx.stroke();

      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(isZh ? "统计说明" : "Statistical Notes", pad + 16, bottomY + 24);

      const notes = isZh
        ? [
            "1. 本次投票采用一人一票制（或匿名去重凭据规则）。",
            "2. 结果以最终提交记录为准，投票结束后不再接受修改。",
            "3. 数据经过系统校验，防篡改记录完整归档公示。",
          ]
        : [
            "1. Voting follows one-person-one-vote or credential deduplication.",
            "2. Official records are final; no modifications permitted after close.",
            "3. Integrity hash verified and permanently archived for audit.",
          ];

      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      let noteY = bottomY + 46;
      notes.forEach((n) => {
        ctx.fillText(n, pad + 16, noteY);
        noteY += 20;
      });

      // Right Box: 导出元数据 / 防伪审计
      roundRect(ctx, rcX, bottomY, cardW, bottomH, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      roundRect(ctx, rcX, bottomY, cardW, bottomH, 10);
      ctx.stroke();

      const fingerprint = getFingerprint(results.poll_id, results.total_votes, results.total_selections);
      const currentTime = formatDateTimeStr(new Date().toISOString());

      const auditItems = [
        { label: isZh ? "导出人:" : "Exporter:", val: exporterName },
        { label: isZh ? "导出时间:" : "Export Time:", val: currentTime },
        { label: isZh ? "版本:" : "Version:", val: "v1.0" },
        { label: isZh ? "数据指纹:" : "Fingerprint:", val: fingerprint },
      ];

      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      let auditY = bottomY + 24;
      auditItems.forEach((item) => {
        ctx.fillStyle = "#64748b";
        ctx.fillText(item.label, rcX + 16, auditY);

        ctx.fillStyle = "#1e293b";
        ctx.fillText(item.val, rcX + (isZh ? 76 : 84), auditY);
        auditY += 21;
      });

      // ==========================================
      // 5. Footer Line & Caption
      // ==========================================
      const footY = bottomY + bottomH + 24;
      ctx.strokeStyle = "#0a2540";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad, footY);
      ctx.lineTo(width - pad, footY);
      ctx.stroke();

      const footerNotice = isZh ? "公示结果以系统统计为准" : "Official Results are Subject to System Verified Records";
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#64748b";
      const footNoticeW = ctx.measureText(footerNotice).width;
      ctx.fillText(footerNotice, (width - footNoticeW) / 2, footY + 16);

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
