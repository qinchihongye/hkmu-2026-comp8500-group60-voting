import React from "react";
import "./InlineBanner.css";

export interface InlineBannerProps {
  type?: "success" | "error" | "warning" | "info";
  message: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function InlineBanner({
  type = "info",
  message,
  icon,
  onClose,
  className = "",
  style,
}: InlineBannerProps) {
  if (!message) return null;

  const defaultIcon =
    type === "success" ? "✅" : type === "error" ? "⚠️" : type === "warning" ? "⚡" : "ℹ️";

  return (
    <div
      role="alert"
      className={`inline-banner type-${type} ${className}`}
      style={style}
    >
      <span className="inline-banner-icon" aria-hidden="true">
        {icon ?? defaultIcon}
      </span>
      <span className="inline-banner-message">{message}</span>
      {onClose ? (
        <button
          type="button"
          className="inline-banner-close"
          onClick={onClose}
          aria-label="Close notification"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

