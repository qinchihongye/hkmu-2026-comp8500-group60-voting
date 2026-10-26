import { useEffect } from "react";

import { useI18n } from "../i18n/LocaleProvider";

export function ComingSoonModal({
  open,
  onClose,
}: {
  open: boolean;
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
      aria-labelledby="coming-soon-title"
    >
      <div
        className="coming-soon-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="coming-soon-header">
          {/* Clock Icon */}
          <div className="coming-soon-icon" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
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

        <h2 id="coming-soon-title" className="coming-soon-title">
          {t("soon.title")}
        </h2>
        <p className="coming-soon-desc">{t("soon.message")}</p>

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
