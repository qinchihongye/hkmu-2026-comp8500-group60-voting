import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { useI18n } from "../../i18n/LocaleProvider";
import type { PollDetail, PollResults } from "../../lib/api-types";
import { useAuth } from "../auth/AuthProvider";
import { generateShareCardImage } from "./generate-share-card";

interface ShareCardModalProps {
  results: PollResults;
  pollDetail?: PollDetail | null;
  onClose: () => void;
}

export function ShareCardModal({ results, pollDetail, onClose }: ShareCardModalProps) {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(true);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isZh = locale === "zh";

  const exporterName =
    user?.display_name || user?.username || (isZh ? "系统管理员" : "System Admin");

  const shareUrl = `${window.location.origin}/polls/${results.poll_id}/results`;

  // Generate image once mounted and QR code rendered
  useEffect(() => {
    let active = true;
    // Brief timeout to ensure QR canvas is painted
    const timer = setTimeout(() => {
      void generateShareCardImage(
        results,
        pollDetail,
        locale,
        exporterName,
        qrCanvasRef.current
      )
        .then(({ dataUrl, blob }) => {
          if (active) {
            setImageUrl(dataUrl);
            setImageBlob(blob);
          }
        })
        .catch((err) => {
          console.error("Failed to generate share card", err);
        })
        .finally(() => {
          if (active) {
            setGenerating(false);
          }
        });
    }, 50);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [results, pollDetail, locale, exporterName]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    const safeTitle = (results.poll_title || pollDetail?.title || "poll").replace(/[/\\?%*:|"<>]/g, "_");
    link.download = `${safeTitle}_results_report.png`;
    link.href = imageUrl;
    link.click();
  };

  const handleCopy = async () => {
    if (!imageBlob) return;
    try {
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": imageBlob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } else {
        // Fallback: trigger download
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Hidden QRCodeCanvas for rendering onto main canvas */}
      <div style={{ display: "none" }} aria-hidden="true">
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={shareUrl}
          size={164}
          level="M"
          marginSize={1}
        />
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "740px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.35)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Floating Centered Toast when Copied */}
        {copied && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(15, 23, 42, 0.88)",
              color: "#ffffff",
              padding: "20px 32px",
              borderRadius: "16px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.45)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              zIndex: 100,
              backdropFilter: "blur(10px)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "2.5px solid #ffffff",
                display: "grid",
                placeItems: "center",
                fontSize: "22px",
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <div style={{ fontSize: "15px", fontWeight: 600 }}>
              {isZh ? "已添加到剪贴板" : "Copied to clipboard"}
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.3rem" }}>📊</span>
            <div>
              <h2
                id="share-card-modal-title"
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {isZh ? "投票结果报告公示" : "Official Voting Results Report"}
              </h2>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0 0" }}>
                {isZh
                  ? "已生成规范化公示报告格式，包含核验二维码与防伪指纹"
                  : "Standardized official report layout with verification QR code and audit hash"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            style={{
              border: "none",
              background: "#f1f5f9",
              width: 32,
              height: 32,
              borderRadius: "50%",
              cursor: "pointer",
              color: "#64748b",
              display: "grid",
              placeItems: "center",
              fontSize: "1.1rem",
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>

        {/* Modal Body / Preview */}
        <div
          style={{
            padding: "20px 24px",
            background: "#f1f5f9",
            overflowY: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "360px",
          }}
        >
          {generating ? (
            <div style={{ color: "#64748b", fontWeight: 600, textAlign: "center" }}>
              <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>⏳</div>
              {isZh ? "正在生成投票结果报告..." : "Generating voting results report..."}
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Poll Results Report"
              style={{
                width: "100%",
                maxWidth: "680px",
                maxHeight: "62vh",
                objectFit: "contain",
                borderRadius: "12px",
                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                border: "1px solid #cbd5e1",
              }}
            />
          ) : (
            <div style={{ color: "#ef4444" }}>
              {isZh ? "生成报告失败，请重试" : "Failed to generate report, please try again."}
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
            {isZh ? "💡 提示：可直接点击“复制图片”粘贴至微信、飞书或文档" : "💡 Tip: Copy image directly to share in chat or docs"}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!imageUrl}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: imageUrl ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <span>{copied ? "✅" : "📋"}</span>
              <span>
                {copied
                  ? isZh ? "已复制到剪贴板！" : "Copied!"
                  : isZh ? "复制图片" : "Copy Image"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!imageUrl}
              style={{
                padding: "10px 22px",
                borderRadius: "10px",
                border: "none",
                background: "#0a2540",
                color: "#ffffff",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: imageUrl ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 2px 8px rgba(10, 37, 64, 0.25)",
                transition: "all 0.15s ease",
              }}
            >
              <span>📥</span>
              <span>{isZh ? "下载报告 PNG" : "Download PNG"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
