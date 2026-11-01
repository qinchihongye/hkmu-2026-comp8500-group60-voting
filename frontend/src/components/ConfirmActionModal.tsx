import { useEffect } from "react";
import "./ConfirmActionModal.css";

export interface ConfirmActionModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmActionModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const iconEmoji = variant === "danger" ? "⚠️" : variant === "warning" ? "⚡" : "ℹ️";

  return (
    <div
      className="confirm-action-backdrop"
      onClick={() => {
        if (!loading) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-action-title"
    >
      <div
        className={`confirm-action-card variant-${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`confirm-action-icon-circle variant-${variant}`} aria-hidden="true">
          {iconEmoji}
        </div>

        <h3 id="confirm-action-title" className="confirm-action-title">
          {title}
        </h3>

        <p className="confirm-action-message">{message}</p>

        <div className="confirm-action-actions">
          <button
            type="button"
            className="btn-confirm-action-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn-confirm-action-submit variant-${variant}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

