import { useEffect } from "react";

import { useI18n } from "../i18n/LocaleProvider";

export function PolicyModal({
  open,
  title,
  onClose,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

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

  if (!open) return null;

  return (
    <div
      className="coming-soon-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-modal-title"
    >
      <div
        className="coming-soon-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className="coming-soon-header">
          {/* Document Icon */}
          <div className="coming-soon-icon" aria-hidden="true" style={{ color: "#3b82f6" }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          {/* Close button */}
          <button
            type="button"
            className="coming-soon-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <h2 id="policy-modal-title" className="coming-soon-title">
          {title}
        </h2>
        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 10,
            padding: "20px 18px",
            margin: "4px 0 24px 0",
            color: "#cbd5e1",
            fontSize: "0.96rem",
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0 }}>后续会补充</p>
        </div>

        <button
          type="button"
          className="coming-soon-btn"
          onClick={onClose}
        >
          {t("soon.ok")}
        </button>
      </div>
    </div>
  );
}

