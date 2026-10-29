import { useState } from "react";

import { useI18n } from "../../i18n/LocaleProvider";
import type { PollDetail, PollResults } from "../../lib/api-types";
import { generateShareCardImage } from "./generate-share-card";

interface ShareCardModalProps {
  results: PollResults;
  pollDetail?: PollDetail | null;
  onClose: () => void;
}

export function ShareCardModal({ results, pollDetail, onClose }: ShareCardModalProps) {
  const { locale, t } = useI18n();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(true);

  // Generate image on mount
  useState(() => {
    void generateShareCardImage(results, pollDetail, locale)
      .then(({ dataUrl, blob }) => {
        setImageUrl(dataUrl);
        setImageBlob(blob);
      })
      .catch((err) => {
        console.error("Failed to generate share card", err);
      })
      .finally(() => {
        setGenerating(false);
      });
  });

  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    const safeTitle = (results.poll_title || pollDetail?.title || "poll").replace(/[/\\?%*:|"<>]/g, "_");
    link.download = `${safeTitle}_results.png`;
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
        setTimeout(() => setCopied(false), 2500);
      } else {
        // Fallback: trigger download
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  };

  const isZh = locale === "zh";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
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
      <div
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.25rem" }}>🖼️</span>
            <div>
              <h2
                id="share-card-modal-title"
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {isZh ? "分享投票结果海报" : "Share Results Card"}
              </h2>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0 0" }}>
                {isZh ? "已生成高清长图，可直接保存或复制发送" : "High-resolution card ready to save or share"}
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
            background: "#f8fafc",
            overflowY: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "260px",
          }}
        >
          {generating ? (
            <div style={{ color: "#64748b", fontWeight: 600, textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>⏳</div>
              {isZh ? "正在生成海报图片..." : "Generating results card..."}
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Poll Results Card"
              style={{
                width: "100%",
                maxHeight: "56vh",
                objectFit: "contain",
                borderRadius: "14px",
                boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
                border: "1px solid #e2e8f0",
              }}
            />
          ) : (
            <div style={{ color: "#ef4444" }}>
              {isZh ? "生成海报失败，请重试" : "Failed to generate image, please try again."}
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
            justifyContent: "flex-end",
            gap: 12,
            background: "#ffffff",
          }}
        >
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
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              background: "#1363df",
              color: "#ffffff",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: imageUrl ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 2px 6px rgba(19, 99, 223, 0.25)",
              transition: "all 0.15s ease",
            }}
          >
            <span>📥</span>
            <span>{isZh ? "下载 PNG 图片" : "Download PNG"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
