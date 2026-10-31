import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/LocaleProvider";
import { ElectionPhaseBadge } from "./ElectionPhaseBadge";
import type { ElectionSummary } from "./types";
import "./ElectionCard.css";

interface Props {
  election: ElectionSummary;
}

export function ElectionCard({ election }: Props) {
  const { t } = useI18n();

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const renderAction = () => {
    if (election.phase === "REGISTRATION_OPEN") {
      if (!election.my_registration_status) {
        return (
          <Link to={`/elections/${election.id}/register`} className="election-btn election-btn-primary">
            {t("election.actions.registerNow")}
          </Link>
        );
      }
      return (
        <span className="election-status-tag tag-registered">
          {t("election.actions.alreadyRegistered")}
        </span>
      );
    }

    if (election.phase === "VOTING_OPEN") {
      if (election.has_voted) {
        return (
          <div className="election-action-group">
            <span className="election-status-tag tag-voted">{t("election.actions.alreadyVoted")}</span>
            <Link to={`/elections/${election.id}/results`} className="election-btn election-btn-secondary">
              {t("election.actions.viewResults")}
            </Link>
          </div>
        );
      }
      if (election.my_registration_status === "APPROVED") {
        return (
          <Link to={`/elections/${election.id}/vote`} className="election-btn election-btn-emerald">
            {t("election.actions.goVote")}
          </Link>
        );
      }
    }

    if (election.phase === "CLOSED") {
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

  return (
    <article className="election-card">
      <div className="election-card-header">
        <div className="election-card-badge-row">
          <span className="official-stamp-pill">{t("election.badge")}</span>
          <ElectionPhaseBadge phase={election.phase} />
        </div>
        <h3 className="election-card-title">
          <Link to={`/elections/${election.id}`}>{election.title}</Link>
        </h3>
        {election.description ? (
          <p className="election-card-desc">{election.description}</p>
        ) : null}
      </div>

      <div className="election-card-meta">
        <div className="election-meta-item">
          <span className="meta-label">{t("election.admin.candidatesTitle")}:</span>
          <span className="meta-value">{election.candidate_count}</span>
        </div>
        <div className="election-meta-item">
          <span className="meta-label">{t("election.admin.registrationWindow")}:</span>
          <span className="meta-value">
            {formatDate(election.registration_starts_at)} ~ {formatDate(election.registration_ends_at)}
          </span>
        </div>
        <div className="election-meta-item">
          <span className="meta-label">{t("election.admin.votingWindow")}:</span>
          <span className="meta-value">
            {formatDate(election.starts_at)} ~ {formatDate(election.ends_at)}
          </span>
        </div>
        {election.allow_live_results ? (
          <div className="election-meta-live">
            <span className="live-dot" /> {t("polls.liveResults")}
          </div>
        ) : null}
      </div>

      <div className="election-card-footer">
        <div className="election-user-status">
          {election.my_registration_status ? (
            <span className={`user-reg-tag status-${election.my_registration_status.toLowerCase()}`}>
              {t(`election.status.${election.my_registration_status}` as any)}
            </span>
          ) : null}
        </div>
        <div className="election-card-action">{renderAction()}</div>
      </div>
    </article>
  );
}

