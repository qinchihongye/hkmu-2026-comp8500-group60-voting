import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import type { PollTextParseResult } from "../../lib/api-types";
import "./JsonPreviewModal.css";

interface JsonPreviewModalProps {
  open: boolean;
  data: PollTextParseResult | null;
  onClose: () => void;
  onApply?: () => void;
}

export function JsonPreviewModal({ open, data, onClose, onApply }: JsonPreviewModalProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !data) {
    return null;
  }

  const jsonString = JSON.stringify(data, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy using textarea
      const el = document.createElement("textarea");
      el.value = jsonString;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      className="json-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="json-preview-title"
      onClick={onClose}
    >
      <div className="json-preview-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="json-preview-header">
          <div className="json-preview-title-row">
            <span className="json-preview-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </span>
            <h3 id="json-preview-title" className="json-preview-title">
              {t("form.importPreviewTitle")}
            </h3>
            <span className="json-preview-status-pill">200 OK</span>
          </div>

          <div className="json-preview-header-actions">
            <button
              type="button"
              className={`json-preview-copy-btn ${copied ? "copied" : ""}`}
              onClick={handleCopy}
              title={copied ? t("form.importPreviewCopied") : t("form.importPreviewCopy")}
            >
              {copied ? (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{t("form.importPreviewCopied")}</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>{t("form.importPreviewCopy")}</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="json-preview-close-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Overview Bar */}
        <div className="json-preview-summary-bar">
          <div className="json-preview-meta-item">
            <span className="meta-label">Title:</span>
            <strong className="meta-value">{data.fields?.title || "(empty)"}</strong>
          </div>
          <div className="json-preview-meta-item">
            <span className="meta-label">Options:</span>
            <strong className="meta-value">{data.fields?.options?.length || 0} detected</strong>
          </div>
          <div className="json-preview-meta-item">
            <span className="meta-label">Issues:</span>
            <strong className="meta-value">{data.issues?.length || 0}</strong>
          </div>
        </div>

        {/* Code Content */}
        <div className="json-preview-body">
          <pre className="json-preview-code" data-testid="json-preview-code">
            <code>{jsonString}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="json-preview-footer">
          <button
            type="button"
            className="json-preview-btn-cancel"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
          {onApply ? (
            <button
              type="button"
              className="json-preview-btn-apply"
              onClick={() => {
                onApply();
                onClose();
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{t("form.importPreviewApply")}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
