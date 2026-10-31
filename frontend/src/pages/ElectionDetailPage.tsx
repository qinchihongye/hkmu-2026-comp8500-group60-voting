import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicElection } from "../features/elections/api";
import { ElectionPhaseBadge } from "../features/elections/ElectionPhaseBadge";
import type { ElectionDetail } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./ElectionDetailPage.css";

export function ElectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const electionId = id ? parseInt(id, 10) : 0;

  useEffect(() => {
    if (!electionId) return;
    setLoading(true);
    getPublicElection(electionId)
      .then((data) => setElection(data))
      .catch((err) => setError(err.message || t("error.pollNotFound")))
      .finally(() => setLoading(false));
  }, [electionId, t]);

  if (loading) {
    return (
      <div className="view-root">
        <div className="view-scroll-frame">
          <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="view-root">
        <div className="view-scroll-frame">
          <div className="saas-table-card" style={{ padding: 36, textAlign: "center", color: "#dc2626" }}>
            <p style={{ margin: "0 0 16px 0", fontWeight: 600 }}>{error || t("error.pollNotFound")}</p>
            <Link to="/elections" className="back-link">
              &larr; {t("election.actions.backToList")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="view-root">
      <div className="view-scroll-frame">
        <div className="election-detail-page">
          <div className="detail-breadcrumb">
            <Link to="/elections" className="back-link">
              &larr; {t("election.actions.backToList")}
            </Link>
          </div>

          <header className="detail-header-card">
            <div className="detail-badge-row">
              <span className="official-stamp-pill">{t("election.badge")}</span>
              <ElectionPhaseBadge phase={election.phase} />
            </div>
            <h1 className="detail-title">{election.title}</h1>
            {election.description ? (
              <p className="detail-description">{election.description}</p>
            ) : null}

            {/* Timelines */}
            <div className="detail-timeline-grid">
              <div className="timeline-box">
                <span className="timeline-label">{t("election.admin.registrationWindow")}</span>
                <span className="timeline-val">
                  {formatDate(election.registration_starts_at)}
                  <br />
                  &darr;
                  <br />
                  {formatDate(election.registration_ends_at)}
                </span>
              </div>

              <div className="timeline-box">
                <span className="timeline-label">{t("election.admin.votingWindow")}</span>
                <span className="timeline-val">
                  {formatDate(election.starts_at)}
                  <br />
                  &darr;
                  <br />
                  {formatDate(election.ends_at)}
                </span>
              </div>

              <div className="timeline-box">
                <span className="timeline-label">{t("election.admin.allowLiveResults")}</span>
                <span className="timeline-val">
                  {election.allow_live_results ? (
                    <span className="live-tag enabled">{t("polls.liveResults")}</span>
                  ) : (
                    <span className="live-tag disabled">{t("polls.resultsAfterClose")}</span>
                  )}
                </span>
              </div>
            </div>

            {/* Voter Status & Next Step Action */}
            <div className="detail-voter-panel">
              <div className="voter-status-info">
                <span className="panel-title">{t("dashboard.myVotes")}:</span>
                {election.my_registration_status ? (
                  <span className={`status-pill status-${election.my_registration_status.toLowerCase()}`}>
                    {t(`election.status.${election.my_registration_status}` as any)}
                  </span>
                ) : (
                  <span className="status-pill status-unregistered">
                    {t("election.phase.REGISTRATION_OPEN")}
                  </span>
                )}
                {election.has_voted ? (
                  <span className="status-pill status-voted">{t("election.actions.alreadyVoted")}</span>
                ) : null}
              </div>

              <div className="voter-actions">
                {election.phase === "REGISTRATION_OPEN" && !election.my_registration_status ? (
                  <Link to={`/elections/${election.id}/register`} className="action-btn btn-primary">
                    {t("election.actions.registerNow")}
                  </Link>
                ) : null}

                {election.phase === "VOTING_OPEN" &&
                election.my_registration_status === "APPROVED" &&
                !election.has_voted ? (
                  <Link to={`/elections/${election.id}/vote`} className="action-btn btn-primary">
                    {t("election.actions.goVote")}
                  </Link>
                ) : null}

                {election.has_voted || election.phase === "CLOSED" ? (
                  <Link to={`/elections/${election.id}/results`} className="action-btn btn-secondary">
                    {t("election.actions.viewResults")}
                  </Link>
                ) : null}
              </div>
            </div>
          </header>

          {/* Candidate List Section */}
          <section className="detail-candidates-section">
            <h2 className="section-title">
              {t("election.admin.candidatesTitle")} ({election.candidates.length})
            </h2>
            <div className="candidates-list-grid">
              {election.candidates.map((cand) => (
                <div key={cand.option_id ?? cand.poll_option_id ?? cand.candidate_code} className="candidate-card">
                  <div className="candidate-header">
                    <span className="candidate-code-tag">{cand.candidate_code}</span>
                    <h3 className="candidate-name">{cand.name}</h3>
                  </div>
                  {cand.statement ? (
                    <p className="candidate-statement">{cand.statement}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
