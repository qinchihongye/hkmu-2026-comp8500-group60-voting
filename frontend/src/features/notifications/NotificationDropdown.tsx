import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/LocaleProvider";
import type { NotificationItem, NotificationType } from "./notification-types";
import "./NotificationDropdown.css";

interface NotificationDropdownProps {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

function formatRelativeTime(dateString: string, locale: string): string {
  try {
    const timestamp = new Date(dateString).getTime();
    if (Number.isNaN(timestamp)) return locale === "zh" ? "刚刚" : "Just now";
    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (diffSeconds < 60) {
      return locale === "zh" ? "刚刚" : "Just now";
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return locale === "zh" ? `${diffMinutes}分钟前` : `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return locale === "zh" ? `${diffHours}小时前` : `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return locale === "zh" ? `${diffDays}天前` : `${diffDays}d ago`;
  } catch {
    return locale === "zh" ? "近期" : "Recent";
  }
}

function renderTypeIcon(type: NotificationType) {
  switch (type) {
    case "result":
      // Trophy / Winner badge (green)
      return (
        <span className="notif-icon-badge notif-icon-result">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34" />
            <path d="M6 4h12a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6V6a2 2 0 0 1 2-2Z" />
          </svg>
        </span>
      );
    case "new_poll":
      // Ballot / Vote (blue)
      return (
        <span className="notif-icon-badge notif-icon-poll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </span>
      );
    case "cap":
      // Alert Clock (amber)
      return (
        <span className="notif-icon-badge notif-icon-cap">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </span>
      );
    case "system":
    default:
      // Shield / Security Check (indigo/purple)
      return (
        <span className="notif-icon-badge notif-icon-system">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
      );
  }
}

export function NotificationDropdown({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onClose,
}: NotificationDropdownProps) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const displayedNotifications = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  function handleItemClick(item: NotificationItem) {
    if (!item.read) {
      onMarkAsRead(item.id);
    }
    onClose();
    navigate(item.targetUrl);
  }

  return (
    <>
      {/* Mobile Backdrop Overlay for tap-to-dismiss */}
      <div
        className="notif-mobile-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="notif-dropdown-panel"
        role="region"
        aria-label={t("notifications.title") || "Notifications"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="notif-dropdown-header">
          <div className="notif-header-title-row">
            <div className="notif-title-wrap">
              <span className="notif-header-title">{t("notifications.title")}</span>
              {unreadCount > 0 ? (
                <span className="notif-unread-badge" data-testid="notif-unread-count">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            <div className="notif-header-actions">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="notif-mark-all-btn"
                  onClick={onMarkAllAsRead}
                  title={t("notifications.markAllRead")}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{t("notifications.markAllRead")}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="notif-close-btn"
                onClick={onClose}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                ×
              </button>
            </div>
          </div>

        {/* Filter Tabs */}
        <div className="notif-tabs-row">
          <button
            type="button"
            className={`notif-tab-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            {t("notifications.tabAll")} ({notifications.length})
          </button>
          <button
            type="button"
            className={`notif-tab-btn ${filter === "unread" ? "active" : ""}`}
            onClick={() => setFilter("unread")}
          >
            {t("notifications.tabUnread")} ({unreadCount})
          </button>
        </div>
      </div>

      {/* List Body */}
      <div className="notif-dropdown-body">
        {displayedNotifications.length === 0 ? (
          <div className="notif-empty-state">
            <div className="notif-empty-icon">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#94a3b8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            </div>
            <p className="notif-empty-title">{t("notifications.empty")}</p>
            <p className="notif-empty-desc">{t("notifications.emptyDesc")}</p>
          </div>
        ) : (
          <ul className="notif-list" role="list">
            {displayedNotifications.map((item) => (
              <li
                key={item.id}
                className={`notif-list-item ${item.read ? "read" : "unread"}`}
                onClick={() => handleItemClick(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleItemClick(item);
                  }
                }}
              >
                {renderTypeIcon(item.type)}
                <div className="notif-content">
                  <div className="notif-item-header">
                    <span className="notif-item-title">
                      {t(item.titleKey) || item.titleFallback}
                    </span>
                    {!item.read ? <span className="notif-item-dot" /> : null}
                  </div>
                  {item.pollTitle ? (
                    <p className="notif-item-poll-name">{item.pollTitle}</p>
                  ) : null}
                  <p className="notif-item-message">
                    {t(item.messageKey) || item.messageFallback}
                  </p>
                  <span className="notif-item-time">
                    {formatRelativeTime(item.timestamp, locale)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 ? (
        <div className="notif-dropdown-footer">
          <button
            type="button"
            className="notif-clear-btn"
            onClick={onClearAll}
          >
            {t("notifications.clearAll")}
          </button>
        </div>
      ) : null}
      </div>
    </>
  );
}

