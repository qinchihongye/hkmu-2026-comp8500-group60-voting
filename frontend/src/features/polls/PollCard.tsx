import { useState } from "react";
import { Link } from "react-router-dom";

import { useI18n } from "../../i18n/LocaleProvider";
import type { PollSummary } from "../../lib/api-types";
import { pollScheduleText } from "./scheduleLabel";

export function PollCard({ poll }: { poll: PollSummary }) {
  const { locale, t } = useI18n();
  const [now] = useState(() => Date.now());
  const isOpen = poll.effective_status === "OPEN";
  const isClosed = poll.effective_status === "CLOSED";
  const isScheduled = poll.effective_status === "SCHEDULED";
  const isPrivate = poll.visibility === "PRIVATE";

  const identity = poll.identity_mode === "NAMED" ? t("identity.named") : t("identity.anonymous");
  const visibility = isPrivate ? t("visibility.private") : t("visibility.public");
  const choice = poll.selection_mode === "MULTIPLE" ? t("polls.multipleChoice") : t("polls.singleChoice");

  // Status Badge
  const statusBadgeType = isClosed ? "closed" : isScheduled ? "scheduled" : "open";
  const statusLabel = isClosed
    ? locale === "zh"
      ? "已结束"
      : "CLOSED"
    : isScheduled
      ? locale === "zh"
        ? "未开始"
        : "SCHEDULED"
      : locale === "zh"
        ? "进行中"
        : "OPEN";

  // Target href: private polls go to entry page for passcode verification
  const href = isPrivate || !isClosed ? `/polls/${poll.id}` : `/polls/${poll.id}/results`;

  // Progress logic
  const hasVoteLimit = poll.vote_limit != null && poll.vote_limit > 0;
  let progressLabel = "";
  let progressValueText: string | null = null;
  let percent = 0;
  const progressFillClass = hasVoteLimit ? "plaza-progress-fill-blue" : "plaza-progress-fill-purple";

  if (hasVoteLimit) {
    progressLabel = t("polls.ballotsReceived");
    const count = poll.ballot_count ?? 0;
    const limit = poll.vote_limit!;
    percent = count >= limit ? 100 : Math.min(99, Math.max(0, Math.floor((count / limit) * 100)));
    progressValueText = `${count} / ${limit} · ${percent}%`;
  } else {
    // Unlimited ballots -> Time elapsed progress
    if (isScheduled) {
      progressLabel = t("polls.notStarted");
      percent = 0;
      progressValueText = null;
    } else if (isClosed) {
      if (poll.close_reason === "CLOSED_EARLY" && poll.closed_at) {
        progressLabel = t("polls.timeElapsedAtClosing");
        const startTime = new Date(poll.starts_at).getTime();
        const endTime = new Date(poll.ends_at).getTime();
        const closedTime = new Date(poll.closed_at).getTime();
        const duration = endTime - startTime;
        const elapsed = closedTime - startTime;
        percent = duration > 0 ? Math.min(100, Math.max(0, Math.floor((elapsed / duration) * 100))) : 0;
        progressValueText = `${percent}%`;
      } else {
        progressLabel = t("polls.timeElapsed");
        percent = 100;
        progressValueText = "100%";
      }
    } else {
      // OPEN
      progressLabel = t("polls.timeElapsed");
      const startTime = new Date(poll.starts_at).getTime();
      const endTime = new Date(poll.ends_at).getTime();
      const duration = endTime - startTime;
      const elapsed = now - startTime;
      percent = duration > 0 ? Math.min(99, Math.max(0, Math.floor((elapsed / duration) * 100))) : 0;
      progressValueText = `${percent}%`;
    }
  }

  return (
    <article className="plaza-card" data-testid="poll-card">
      {/* 1. Header: Title + Status */}
      <div className="plaza-card-top">
        <h3 className="plaza-card-title">
          <Link to={`/polls/${poll.id}`}>{poll.title}</Link>
        </h3>
        <span className={`plaza-status-badge plaza-status-${statusBadgeType}`}>
          {isScheduled ? (
            <svg
              className="plaza-status-icon"
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
          ) : null}
          <span>{statusLabel}</span>
          {isOpen || isClosed ? <span className="plaza-status-dot" /> : null}
        </span>
      </div>

      {/* 2. Rules Meta */}
      <div className="plaza-card-rules">
        <span className="plaza-rule-item">{identity}</span>
        <span className="plaza-rule-sep">·</span>
        <span className="plaza-rule-item">
          {isPrivate ? (
            <span className="plaza-private-wrap">
              <svg
                className="plaza-lock-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
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
              <span>{visibility}</span>
            </span>
          ) : (
            visibility
          )}
        </span>
        <span className="plaza-rule-sep">·</span>
        <span className="plaza-rule-item">{choice}</span>
      </div>

      {/* 3. Time Row */}
      <div className="plaza-card-time">
        <svg
          className="plaza-time-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
        <span>{pollScheduleText(poll, locale, t)}</span>
      </div>

      {/* 4. Progress Section */}
      <div className="plaza-card-progress">
        <div className="plaza-progress-header">
          <span className="plaza-progress-label">{progressLabel}</span>
          {progressValueText ? <span className="plaza-progress-value">{progressValueText}</span> : null}
        </div>
        <div className="plaza-progress-track">
          <div
            className={`plaza-progress-fill ${progressFillClass}`}
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progressLabel}
          />
        </div>
      </div>

      {/* 5. Description (up to 2 lines, omit if absent) */}
      {poll.description ? (
        <p className="plaza-card-desc">{poll.description}</p>
      ) : (
        <div className="plaza-card-desc-placeholder" aria-hidden="true" />
      )}

      {/* 6. Action Footer */}
      <div className="plaza-card-footer">
        {isOpen ? (
          isPrivate ? (
            <>
              <Link to={href} className="plaza-card-btn plaza-card-btn-outline">
                {t("polls.viewPoll")}
              </Link>
              <button disabled type="button" className="plaza-card-btn plaza-card-btn-muted">
                {t("polls.privateAccess")}
              </button>
            </>
          ) : !poll.allow_live_results ? (
            <>
              <Link to={href} className="plaza-card-btn plaza-card-btn-outline">
                {t("polls.viewPoll")}
              </Link>
              <button disabled type="button" className="plaza-card-btn plaza-card-btn-muted">
                {t("polls.resultsAfterClosing")}
              </button>
            </>
          ) : (
            <>
              <Link to={href} className="plaza-card-btn plaza-card-btn-primary">
                {t("polls.viewPoll")}
              </Link>
              <Link to={`/polls/${poll.id}/results`} className="plaza-card-btn plaza-card-btn-outline">
                {t("polls.viewResults")}
              </Link>
            </>
          )
        ) : isScheduled ? (
          <Link to={href} className="plaza-card-btn plaza-card-btn-outline plaza-card-btn-full">
            {t("polls.viewDetails")}
          </Link>
        ) : (
          <Link to={href} className="plaza-card-btn plaza-card-btn-outline plaza-card-btn-full">
            {t("polls.viewResults")}
          </Link>
        )}
      </div>
    </article>
  );
}
