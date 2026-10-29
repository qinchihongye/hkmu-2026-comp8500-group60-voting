import { useI18n } from "../../i18n/LocaleProvider";
import { ModeTags, StatusTag } from "../../components/StatusTag";
import { formatDuration, formatHongKongDateTimeParts } from "../../lib/time";
import { pollScheduleText } from "./scheduleLabel";
import "./PollHeroHeader.css";

export interface PollHeroHeaderProps {
  title: string;
  description?: string | null;
  status: string;
  identityMode: string;
  visibility: string;
  startsAt: string;
  endsAt: string;
  version?: number;
  hasAccessPassword?: boolean;
  closeReason?: string | null;
  statusNotice?: React.ReactNode;
}

export function PollHeroHeader({
  title,
  description,
  status,
  identityMode,
  visibility,
  startsAt,
  endsAt,
  version,
  hasAccessPassword,
  closeReason,
  statusNotice,
}: PollHeroHeaderProps) {
  const { t, locale } = useI18n();

  const startParts = formatHongKongDateTimeParts(startsAt, locale);
  const endParts = formatHongKongDateTimeParts(endsAt, locale);
  const durationText = formatDuration(startsAt, endsAt, locale);

  const isClosed = status === "CLOSED";
  const isOpen = status === "OPEN";
  const isScheduled = status === "SCHEDULED";

  const scheduleInfo = pollScheduleText(
    {
      effective_status: status,
      starts_at: startsAt,
      ends_at: endsAt,
      close_reason: closeReason,
    },
    locale,
    t,
  );

  return (
    <header className="poll-hero-header" data-testid="poll-hero-header">
      {/* 1. Top Badges & Version */}
      <div className="poll-hero-top-row">
        <div className="poll-hero-badges">
          <StatusTag status={status} />
          <ModeTags identity={identityMode} visibility={visibility} />
          {hasAccessPassword ? (
            <span className="poll-hero-password-badge" title={t("workspace.passcodeSet")}>
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>{t("workspace.passcodeSet")}</span>
            </span>
          ) : null}
        </div>

        {version !== undefined ? (
          <div className="poll-hero-version-wrapper">
            <span className="poll-hero-version-badge" title={t("workspace.version", { version })}>
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span>{t("workspace.version", { version })}</span>
            </span>
          </div>
        ) : null}
      </div>

      {/* 2. Title & Description */}
      <div className="poll-hero-title-area">
        <h1 className="poll-hero-title">{title}</h1>
        {description ? <p className="poll-hero-description">{description}</p> : null}
      </div>

      {statusNotice ? (
        <div className="poll-hero-status-notice-wrap">
          {statusNotice}
        </div>
      ) : null}

      {/* 3. Schedule Card Widget */}
      <div className="poll-schedule-widget" data-testid="poll-schedule-widget">
        <div className="poll-schedule-track">
          <div className="poll-schedule-icon-wrapper" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>

          <div className="poll-schedule-flow">
            {/* Start Node */}
            <div className="poll-schedule-point">
              <span className="poll-schedule-point-label">{t("form.starts")}</span>
              <div className="poll-schedule-point-val">
                <span className="poll-schedule-date">{startParts.date}</span>
                <span className="poll-schedule-time">{startParts.time}</span>
              </div>
            </div>

            {/* Connector */}
            <div className="poll-schedule-connector" aria-hidden="true">
              <div className="poll-schedule-line" />
              <span className="poll-schedule-duration-pill" title="Duration">
                {durationText}
              </span>
              <div className="poll-schedule-line" />
              <svg
                className="poll-schedule-arrow"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* End Node */}
            <div className="poll-schedule-point">
              <span className="poll-schedule-point-label">{t("form.ends")}</span>
              <div className="poll-schedule-point-val">
                <span className="poll-schedule-date">{endParts.date}</span>
                <span className="poll-schedule-time">{endParts.time}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side: Timezone and status badge */}
        <div className="poll-schedule-side">
          <span className="poll-schedule-tz-tag" title="Hong Kong Time (UTC+8)">
            {t("common.hkt")}
          </span>

          {isClosed ? (
            <span className="poll-schedule-status-pill is-closed">
              {closeReason === "BALLOT_CAP_REACHED"
                ? t("polls.ballotCapReached")
                : t("polls.ended")}
            </span>
          ) : isOpen ? (
            <span className="poll-schedule-status-pill is-open">
              <span className="poll-schedule-pulse" aria-hidden="true" />
              <span>{scheduleInfo}</span>
            </span>
          ) : isScheduled ? (
            <span className="poll-schedule-status-pill is-scheduled">
              <span>{scheduleInfo}</span>
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
