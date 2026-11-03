import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/LocaleProvider";
import { ElectionLifecycleTimeline } from "./ElectionLifecycleTimeline";
import { ElectionPhaseBadge } from "./ElectionPhaseBadge";
import { normalizeElectionPhase, type ElectionSummary } from "./types";
import "./ElectionCard.css";

interface Props {
  election: ElectionSummary;
}

function formatCountdown(targetDate: string, isZh: boolean): string | null {
  try {
    const diff = new Date(targetDate).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return isZh ? `剩余 ${days} 天 ${hours} 小时` : `${days}d ${hours}h left`;
    }
    if (hours > 0) {
      return isZh ? `剩余 ${hours} 小时 ${mins} 分钟` : `${hours}h ${mins}m left`;
    }
    return isZh ? `剩余 ${Math.max(1, mins)} 分钟` : `${Math.max(1, mins)}m left`;
  } catch {
    return null;
  }
}

export function ElectionCard({ election }: Props) {
  const { t, locale } = useI18n();
  const isZh = locale.startsWith("zh");
  const dateLocale = locale === "en" ? "en-US" : locale === "zh-TW" ? "zh-TW" : "zh-CN";

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(dateLocale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const regStatus = election.my_registration_status || election.user_registration_status;
  const canonicalPhase = normalizeElectionPhase(election.phase);

  const getScheduleDetails = () => {
    if (canonicalPhase === "REGISTRATION") {
      const countdown = formatCountdown(election.registration_ends_at, isZh);
      return {
        label: t("election.admin.registrationWindow"),
        range: `${formatDate(election.registration_starts_at)} ~ ${formatDate(election.registration_ends_at)}`,
        countdown,
      };
    }
    if (canonicalPhase === "UPCOMING") {
      const countdown = formatCountdown(election.registration_starts_at, isZh);
      return {
        label: t("election.admin.registrationWindow"),
        range: `${formatDate(election.registration_starts_at)} ~ ${formatDate(election.registration_ends_at)}`,
        countdown: countdown ? (isZh ? `${countdown}开启` : `opens in ${countdown}`) : null,
      };
    }
    if (canonicalPhase === "REVIEW") {
      return {
        label: t("election.admin.votingWindow"),
        range: `${formatDate(election.starts_at)} ~ ${formatDate(election.ends_at)}`,
        countdown: isZh ? "待开票" : "Opening soon",
      };
    }
    if (canonicalPhase === "VOTING") {
      const countdown = formatCountdown(election.ends_at, isZh);
      return {
        label: t("election.admin.votingWindow"),
        range: `${formatDate(election.starts_at)} ~ ${formatDate(election.ends_at)}`,
        countdown,
      };
    }
    // RESULTS
    return {
      label: t("election.admin.votingWindow"),
      range: `${formatDate(election.starts_at)} ~ ${formatDate(election.ends_at)}`,
      countdown: isZh ? "已结束" : "Closed",
    };
  };

  const scheduleInfo = getScheduleDetails();

  const renderAction = () => {
    if (canonicalPhase === "REGISTRATION") {
      if (!regStatus) {
        return (
          <Link to={`/elections/${election.id}/register`} className="election-btn election-btn-primary">
            <span>{t("election.actions.registerNow")}</span>
            <span className="btn-arrow">→</span>
          </Link>
        );
      }
      return (
        <Link to={`/elections/${election.id}`} className="election-btn election-btn-outline">
          {t("polls.viewDetails")}
        </Link>
      );
    }

    if (canonicalPhase === "VOTING") {
      if (election.has_voted) {
        return (
          <Link to={`/elections/${election.id}/results`} className="election-btn election-btn-secondary">
            {t("election.actions.viewResults")}
          </Link>
        );
      }
      if (regStatus === "APPROVED") {
        return (
          <Link to={`/elections/${election.id}/vote`} className="election-btn election-btn-emerald">
            <span className="btn-icon">🗳️</span>
            <span>{t("election.actions.goVote")}</span>
          </Link>
        );
      }
      return (
        <Link to={`/elections/${election.id}`} className="election-btn election-btn-outline">
          {t("polls.viewDetails")}
        </Link>
      );
    }

    if (canonicalPhase === "RESULTS") {
      return (
        <Link to={`/elections/${election.id}/results`} className="election-btn election-btn-secondary">
          {t("election.actions.viewResults")}
        </Link>
      );
    }

    return (
      <Link to={`/elections/${election.id}`} className="election-btn election-btn-outline">
        {t("polls.viewDetails")}
      </Link>
    );
  };

  const isPendingFreeze =
    canonicalPhase === "REVIEW" && new Date(election.starts_at).getTime() <= Date.now();

  const candidateUnit = isZh ? "位候选人" : "candidates";

  return (
    <article className="election-card">
      <div className="election-card-header">
        <div className="election-card-badge-row">
          <div className="election-badge-cluster">
            <span className="official-stamp-pill">
              <span className="official-stamp-icon">🏛️</span>
              {t("election.badge")}
            </span>
            {isPendingFreeze ? (
              <span className="pending-freeze-pill">⏳ {t("election.pendingFreezeBadge")}</span>
            ) : null}
          </div>
          <ElectionPhaseBadge phase={election.phase} />
        </div>
        <h3 className="election-card-title">
          <Link to={`/elections/${election.id}`}>{election.title}</Link>
        </h3>
        {election.description ? (
          <p className="election-card-desc">{election.description}</p>
        ) : null}
      </div>

      {/* Structured Micro-Data Grid (Proposal A) */}
      <div className="election-data-grid">
        {/* Cell 1: Candidates count */}
        <div className="data-grid-cell">
          <span className="cell-label">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            {t("election.admin.candidatesTitle")}
          </span>
          <span className="cell-value">
            {election.candidate_count} <span className="cell-value-unit">{candidateUnit}</span>
          </span>
        </div>

        {/* Cell 2: Rule / Threshold / Live Results / Cryptographic mechanism */}
        <div className="data-grid-cell">
          {election.winning_threshold ? (
            <>
              <span className="cell-label">
                🏆 {t("election.admin.winningThreshold")}
              </span>
              <span className="cell-value cell-value-highlight">
                {t("election.results.votes", { count: election.winning_threshold })}
              </span>
            </>
          ) : election.allow_live_results ? (
            <>
              <span className="cell-label">
                <span className="live-dot" /> {t("polls.liveResults")}
              </span>
              <span className="cell-value cell-value-live">
                {isZh ? "计票实时可见" : "Live Counting"}
              </span>
            </>
          ) : (
            <>
              <span className="cell-label">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                {isZh ? "安全架构" : "Security Arch"}
              </span>
              <span className="cell-value">
                {isZh ? "B2 密码学核验" : "B2 Cryptographic"}
              </span>
            </>
          )}
        </div>

        {/* Cell 3: Schedule window & dynamic countdown (full width) */}
        <div className="data-grid-cell cell-full-width">
          <div className="cell-header-inline">
            <span className="cell-label">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              {scheduleInfo.label}
            </span>
            {scheduleInfo.countdown ? (
              <span className="schedule-countdown-badge">
                <span className="countdown-pulse-dot" />
                {scheduleInfo.countdown}
              </span>
            ) : null}
          </div>
          <span className="cell-value cell-schedule-range">{scheduleInfo.range}</span>
        </div>
      </div>

      {isPendingFreeze ? (
        <div className="election-card-pending-notice">
          <span className="notice-icon">⚠️</span>
          <span>{t("election.pendingFreezeNotice")}</span>
        </div>
      ) : null}

      {/* Footer: User voter status on the left, clear CTA actions on the right */}
      <div className="election-card-footer">
        <div className="election-user-status">
          {election.has_voted ? (
            <span className="badge-voter-status status-voted">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span className="voter-status-label">{t("election.actions.alreadyVoted")}</span>
            </span>
          ) : regStatus ? (
            <span className={`badge-voter-status status-${regStatus.toLowerCase()}`}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {regStatus === "APPROVED" ? (
                  <polyline points="20 6 9 17 4 12"></polyline>
                ) : regStatus === "REJECTED" ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </>
                ) : (
                  <circle cx="12" cy="12" r="9"></circle>
                )}
              </svg>
              <span className="voter-status-text">
                <span className="voter-registered-label">{t("election.actions.alreadyRegistered")}</span>
                <span className="voter-status-sep">·</span>
                <span className="voter-status-label">{t(`election.status.${regStatus}` as any)}</span>
              </span>
            </span>
          ) : canonicalPhase === "REGISTRATION" ? (
            <span className="badge-voter-status status-unregistered">
              <span className="unregistered-dot" />
              <span className="voter-status-label">{isZh ? "未登记" : "Not registered"}</span>
            </span>
          ) : null}
        </div>
        <div className="election-card-action">{renderAction()}</div>
      </div>
      <ElectionLifecycleTimeline phase={election.phase} compact />
    </article>
  );
}
