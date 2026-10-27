import { Link } from "react-router-dom";

import { useI18n } from "../../i18n/LocaleProvider";
import { formatHongKong } from "../../lib/time";
import type { PollSummary } from "../../lib/api-types";

export function PollCard({ poll }: { poll: PollSummary }) {
  const { t } = useI18n();
  const isOpen = poll.effective_status === "OPEN";
  const isClosed = poll.effective_status === "CLOSED";
  const isScheduled = poll.effective_status === "SCHEDULED";
  const isPrivate = poll.visibility === "PRIVATE";
  const identity = poll.identity_mode === "NAMED" ? t("identity.named") : t("identity.anonymous");
  const visibility = isPrivate ? t("visibility.private") : t("visibility.public");
  const badgeClass = isClosed
    ? "plaza-badge plaza-badge-closed"
    : isScheduled
      ? "plaza-badge plaza-badge-upcoming"
      : isPrivate
        ? "plaza-badge plaza-badge-private"
        : "plaza-badge plaza-badge-open";
  const badgeLabel = isClosed
    ? t("status.closed")
    : isScheduled
      ? t("status.scheduled")
      : isPrivate
        ? t("visibility.private")
        : t("status.open");
  const action = isClosed ? t("polls.viewResults") : isScheduled ? t("polls.viewDetails") : t("polls.viewPoll");
  const href = isClosed ? `/polls/${poll.id}/results` : `/polls/${poll.id}`;

  return (
    <article className="plaza-card" data-testid="poll-card">
      <div className="plaza-card-top">
        <div className="plaza-card-title-group">
          <h3 className="plaza-card-title">
            <Link to={`/polls/${poll.id}`}>{poll.title}</Link>
          </h3>
          <span className="plaza-card-meta">
            {visibility} · {identity}
          </span>
        </div>
        <span className={badgeClass}>
          {isOpen && !isPrivate ? <span className="plaza-badge-dot" /> : null}
          {badgeLabel}
        </span>
      </div>

      <div className="plaza-card-time">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
        <span>
          {formatHongKong(poll.starts_at)} – {formatHongKong(poll.ends_at)}
        </span>
      </div>

      <div className="plaza-card-footer">
        <Link to={href} className="plaza-card-btn">
          {action}
        </Link>
      </div>

      {isScheduled ? <ScheduledRibbon pollId={poll.id} /> : null}
    </article>
  );
}

function ScheduledRibbon({ pollId }: { pollId: number }) {
  const id = `plaza-ribbon-${pollId}`;
  return (
    <svg className="plaza-card-ribbon" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <path d="M10 100 C 40 70, 70 90, 100 50 C 110 35, 115 15, 120 0 L 120 100 Z" fill={`url(#${id}-a)`} />
      <path d="M30 100 C 60 75, 80 85, 105 60 C 112 50, 118 30, 120 15 L 120 100 Z" fill={`url(#${id}-b)`} />
      <path d="M55 100 C 80 85, 95 90, 110 75 C 116 68, 119 55, 120 40 L 120 100 Z" fill={`url(#${id}-c)`} />
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="100" x2="120" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="20" y1="100" x2="120" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="40" y1="100" x2="120" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
    </svg>
  );
}
