import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { useI18n } from "../../i18n/LocaleProvider";
import { useAuth } from "../auth/AuthProvider";
import { generateElectionShareCardImage } from "./generate-election-share-card";
import type { ElectionDetail, ElectionResultResponse } from "./types";

interface ElectionShareCardModalProps {
  results: ElectionResultResponse;
  electionDetail?: ElectionDetail | null;
  onClose: () => void;
}

export function ElectionShareCardModal({
  results,
  electionDetail,
  onClose,
}: ElectionShareCardModalProps) {
  const { locale } = useI18n();
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(true);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isZh = locale === "zh";

  const exporterName =
    user?.display_name || user?.username || (isZh ? "系统管理员" : "System Admin");

  const shareUrl = `${window.location.origin}/elections/${results.poll_id}/results`;

  // Generate image once mounted and QR code rendered
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void generateElectionShareCardImage(
        results,
        electionDetail,
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
          console.error("Failed to generate election gazette share card", err);
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
  }, [results, electionDetail, locale, exporterName]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    const safeTitle = (results.title || electionDetail?.title || "election").replace(/[/\\?%*:|"<>]/g, "_");
    link.download = `${safeTitle}_election_gazette.png`;
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
      aria-labelledby="election-share-card-modal-title"
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
              {isZh ? "公报图片已添加到剪贴板" : "Gazette image copied to clipboard"}
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
            <span style={{ fontSize: "1.3rem" }}>🏛️</span>
            <div>
              <h2
                id="election-share-card-modal-title"
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {isZh ? "选举结果报告公示" : "Official Election Gazette Report"}
              </h2>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "0.82rem",
                  color: "#64748b",
                }}
              >
                {isZh
                  ? "已生成法定规范选举公报，包含选票核验二维码与防伪指纹"
                  : "Official election gazette report with ballot verification QR and tamper-evident fingerprint"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isZh ? "关闭" : "Close"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.25rem",
              color: "#94a3b8",
              padding: "4px 8px",
              borderRadius: "8px",
              transition: "all 0.15s ease",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Image Preview */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: generating ? "center" : "flex-start",
            minHeight: "360px",
          }}
        >
          {generating ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                color: "#64748b",
                fontSize: "0.92rem",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  border: "3px solid #e2e8f0",
                  borderTopColor: "#047857",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span>{isZh ? "正在生成法定选举公报与核验二维码..." : "Generating election gazette & cryptographic ledger..."}</span>
            </div>
          ) : imageUrl ? (
            <div
              style={{
                width: "100%",
                maxWidth: "680px",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
              }}
            >
              <img
                src={imageUrl}
                alt={isZh ? "官方选举结果公示书" : "Certificate of Election Results"}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                }}
              />
            </div>
          ) : (
            <div style={{ color: "#ef4444", fontSize: "0.9rem" }}>
              {isZh ? "生成选举公报失败，请稍后重试" : "Failed to generate election gazette. Please try again."}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              fontSize: "0.82rem",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>💡</span>
            <span>
              {isZh
                ? "提示：可直接点击“复制图片”粘贴至微信、飞书或文档"
                : "Tip: Click 'Copy Image' to paste directly into documents or chats"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={handleCopy}
              disabled={generating || !imageBlob}
              style={{
                padding: "8px 18px",
                borderRadius: "10px",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: generating || !imageBlob ? "not-allowed" : "pointer",
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>📋</span>
              <span>{copied ? (isZh ? "已复制！" : "Copied!") : (isZh ? "复制图片" : "Copy Image")}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={generating || !imageUrl}
              style={{
                padding: "8px 20px",
                borderRadius: "10px",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: generating || !imageUrl ? "not-allowed" : "pointer",
                background: "#047857",
                color: "#ffffff",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 4px rgba(4, 120, 87, 0.25)",
                transition: "all 0.15s ease",
              }}
            >
              <span>📥</span>
              <span>{isZh ? "下载公报 PNG" : "Download Gazette PNG"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

