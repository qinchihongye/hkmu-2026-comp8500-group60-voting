import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { getPublicElection } from "../features/elections/api";
import { ElectionLifecycleTimeline } from "../features/elections/ElectionLifecycleTimeline";
import { ElectionPhaseBadge } from "../features/elections/ElectionPhaseBadge";
import type { ElectionDetail } from "../features/elections/types";
import { normalizeElectionPhase } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./ElectionDetailPage.css";

export function ElectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
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

  const canonicalPhase = normalizeElectionPhase(election.phase);
  const isPendingFreeze =
  canonicalPhase === "REVIEW" && new Date(election.starts_at).getTime() <= Date.now();

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
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="official-stamp-pill">{t("election.badge")}</span>
                {isPendingFreeze ? (
                  <span className="pending-freeze-pill" style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "#b45309",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    padding: "3px 9px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}>
                    ⏳ {t("election.pendingFreezeBadge")}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {user?.role === "ADMIN" ? (
                  <Link
                    to={`/admin/elections/${election.id}`}
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#1d4ed8",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    ⚙️ {t("election.actions.manageElection")}
                  </Link>
                ) : null}
                <ElectionPhaseBadge phase={election.phase} />
              </div>
            </div>
            <h1 className="detail-title">{election.title}</h1>
            {election.description ? (
              <p className="detail-description">{election.description}</p>
            ) : null}

            {/* Stage Progress Timeline */}
            <div style={{ margin: "16px 0 20px 0" }}>
              <ElectionLifecycleTimeline phase={election.phase} />
            </div>

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

              {election.winning_threshold ? (
                <div className="timeline-box">
                  <span className="timeline-label">{t("election.admin.winningThreshold")}</span>
                  <span className="timeline-val">
                    <span className="live-tag enabled" style={{ background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" }}>
                      🏆 {t("election.results.votes", { count: election.winning_threshold })}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            {isPendingFreeze ? (
              <div
                className="election-detail-pending-banner"
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  color: "#92400e",
                  marginTop: "16px",
                  fontSize: "0.92rem",
                  lineHeight: "1.5",
                }}
              >
                <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>🔔</span>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: "2px", fontSize: "0.96rem" }}>
                    {t("election.pendingFreezeBadge")}
                  </div>
                  <div style={{ fontWeight: 500, color: "#b45309" }}>
                    {t("election.pendingFreezeNotice")}
                  </div>
                </div>
              </div>
            ) : null}

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
                    {t("election.status.PENDING") ? "未登记" : "Not Registered"}
                  </span>
                )}
                {election.has_voted ? (
                  <span className="status-pill status-voted">{t("election.actions.alreadyVoted")}</span>
                ) : null}
                {election.my_registration_status ? (
                  <Link
                    to="/elections?view=my_registrations"
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#2563eb",
                      textDecoration: "none",
                      marginLeft: "6px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    {t("election.actions.viewMyRegistrations")} →
                  </Link>
                ) : null}
              </div>

              <div className="voter-actions">
                  { canonicalPhase === "REGISTRATION" && !election.my_registration_status ? (
                    <Link to={`/elections/${election.id}/register`} className="action-btn btn-primary">
                      {t("election.actions.registerNow")}
                    </Link>
                  ) : null}

                  { canonicalPhase === "VOTING" &&
                  election.my_registration_status === "APPROVED" &&
                  !election.has_voted ? (
                  <Link to={`/elections/${election.id}/vote`} className="action-btn btn-primary">
                    {t("election.actions.goVote")}
                  </Link>
                ) : null}

                  {
                    election.has_voted || canonicalPhase === "RESULTS" ? (
                      <Link to={`/elections/${election.id}/results`} className="action-btn btn-secondary">
                        {t("election.actions.viewResults")}
                      </Link>
                    ) : null
                  }
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
