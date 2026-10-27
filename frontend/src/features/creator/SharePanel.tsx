import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { useI18n } from "../../i18n/LocaleProvider";
import "./SharePanel.css";

const QR_LOGO = "/favicon.png";

export function SharePanel({
  shareUrl,
  requiresPassword,
  requiresLogin,
}: {
  shareUrl: string;
  requiresPassword: boolean;
  requiresLogin: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<"link" | "invite" | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const note = [
    requiresLogin ? t("share.login") : t("share.noLogin"),
    requiresPassword ? t("share.password") : t("share.noPassword"),
  ].join(" ");

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  function handleCopied(target: "link" | "invite") {
    setCopied(target);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopied(null);
    }, 2000);
  }

  function copyWithExec(text: string): boolean {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function copyText(text: string, target: "link" | "invite") {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(
        () => handleCopied(target),
        () => {
          if (copyWithExec(text)) {
            handleCopied(target);
          }
        },
      );
      return;
    }
    if (copyWithExec(text)) {
      handleCopied(target);
    }
  }

  function downloadQrCode() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) {
      return;
    }
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const size = 600;
      canvas.width = size;
      canvas.height = size;
      img.onload = () => {
        if (!ctx) {
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 40, 40, size - 80, size - 80);
        const badge = 108;
        const cx = size / 2;
        const cy = size / 2;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(cx - badge / 2, cy - badge / 2, badge, badge, 18);
        ctx.fill();
        const logo = new Image();
        const save = () => {
          const a = document.createElement("a");
          a.download = "poll-qr-code.png";
          a.href = canvas.toDataURL("image/png");
          a.click();
        };
        logo.onload = () => {
          const inset = 16;
          ctx.drawImage(
            logo,
            cx - badge / 2 + inset,
            cy - badge / 2 + inset,
            badge - inset * 2,
            badge - inset * 2,
          );
          save();
        };
        logo.onerror = save;
        logo.src = QR_LOGO;
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch {
      return;
    }
  }

  return (
    <section className="share-panel">
      <div className="share-panel-header">
        <div className="share-panel-title-wrap">
          <span className="share-panel-title-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </span>
          <h2 className="share-panel-title">{t("share.title")}</h2>
        </div>
        <p className="share-panel-note">{note}</p>
      </div>

      <div className="share-panel-grid">
        <div className="share-left-section">
          <div className="share-field-group">
            <label htmlFor="share-url-field" className="share-field-label">
              {t("share.link")}
            </label>
            <div className="share-input-row">
              <div className="share-url-shell">
                <span className="share-url-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <input
                  id="share-url-field"
                  aria-label={t("share.link")}
                  data-testid="share-url"
                  readOnly
                  value={shareUrl}
                  className="share-url-input"
                />
              </div>
              <button
                type="button"
                className={`share-copy-btn ${copied === "link" ? "copied" : ""}`}
                onClick={() => copyText(shareUrl, "link")}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copied === "link" ? t("common.copied") : t("share.copy")}</span>
              </button>
            </div>
          </div>

          {requiresPassword ? (
            <div className="share-passcode-chip">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span>{t("share.passcodeChip")}</span>
            </div>
          ) : null}

          <p className="share-manual-hint">{t("share.manual")}</p>
        </div>

        <div className="share-actions-row">
          <button
            type="button"
            className="share-secondary-btn"
            onClick={() => copyText(`${shareUrl}\n${note}`, "invite")}
          >
            {copied === "invite" ? t("common.copied") : t("share.invite")}
          </button>
          <button
            type="button"
            className="share-secondary-btn"
            onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>{t("share.preview")}</span>
          </button>
        </div>

        <div className="share-right-section">
          <div className="share-qr-card">
            <div className="share-qr-box" ref={qrRef}>
              <QRCodeSVG
                value={shareUrl}
                size={168}
                level="H"
                marginSize={1}
                role="img"
                aria-label={t("share.qr")}
                imageSettings={{
                  src: QR_LOGO,
                  height: 36,
                  width: 36,
                  excavate: true,
                }}
              />
            </div>
            <div className="share-scan-pill">{t("share.scanHint")}</div>
          </div>
        </div>
        <div className="share-download-row">
          <button type="button" className="share-qr-download-btn" onClick={downloadQrCode}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t("share.downloadQr")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
