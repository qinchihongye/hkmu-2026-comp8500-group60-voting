import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getElectionResults } from "../features/elections/api";
import { ElectionPhaseBadge } from "../features/elections/ElectionPhaseBadge";
import type { ElectionResultResponse } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./ElectionResultPage.css";

export function ElectionResultPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const electionId = id ? parseInt(id, 10) : 0;

  const [results, setResults] = useState<ElectionResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbiddenError, setForbiddenError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!electionId) return;
    setLoading(true);
    setForbiddenError(false);
    setErrorMsg(null);

    getElectionResults(electionId)
      .then((data) => setResults(data))
      .catch((err) => {
        if (err.status === 403 || err.code === 40306) {
          setForbiddenError(true);
        } else {
          setErrorMsg(err.message || t("error.internal"));
        }
      })
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

  if (forbiddenError) {
    return (
      <div className="view-root">
        <div className="view-scroll-frame">
          <div className="election-result-page">
            <div className="result-breadcrumb">
              <Link to={`/elections/${electionId}`} className="back-link">
                &larr; {t("election.actions.backToList")}
              </Link>
            </div>
            <div className="result-forbidden-card">
              <div className="forbidden-icon">🔒</div>
              <h2>{t("election.results.forbiddenLive")}</h2>
              <p>{t("error.resultsHidden")}</p>
              <div className="forbidden-actions">
                <Link to={`/elections/${electionId}`} className="btn-primary">
                  {t("polls.viewDetails")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (errorMsg || !results) {
    return (
      <div className="view-root">
        <div className="view-scroll-frame">
          <div className="election-result-page">
            <div className="result-breadcrumb">
              <Link to="/elections" className="back-link">
                &larr; {t("election.actions.backToList")}
              </Link>
            </div>
            <div className="result-error-card">
              <p>{errorMsg || t("error.pollNotFound")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { scale, candidate_results, is_tie, winner_option_ids, phase } = results;
  const isClosed = phase === "CLOSED";

  // Calculate winner candidate info
  const winners = candidate_results?.filter((c) => winner_option_ids?.includes(c.candidate_option_id)) || [];

  return (
    <div className="view-root">
      <div className="view-scroll-frame">
        <div className="election-result-page">
          <div className="result-breadcrumb">
            <Link to={`/elections/${electionId}`} className="back-link">
              &larr; {t("election.actions.backToList")}
            </Link>
          </div>

          <header className="result-header-card">
            <div className="detail-badge-row">
              <span className="official-stamp-pill">{t("election.badge")}</span>
              <ElectionPhaseBadge phase={phase} />
            </div>
            <h1 className="result-title">{results.title}</h1>

            <div className={`result-notice-bar ${isClosed ? "notice-closed" : "notice-live"}`}>
              <span className="notice-dot" />
              <span className="notice-text">
                {isClosed ? t("election.results.closedNotice") : t("election.results.liveNotice")}
              </span>
            </div>
          </header>

          {/* Turnout Scale Metrics Grid */}
          <section className="scale-metrics-grid">
            <div className="scale-metric-card">
              <span className="metric-num">{scale.approved_count}</span>
              <span className="metric-label">{t("election.results.approvedCount")}</span>
            </div>
            <div className="scale-metric-card">
              <span className="metric-num">{scale.ballot_count}</span>
              <span className="metric-label">{t("election.results.ballotCount")}</span>
            </div>
            <div className="scale-metric-card">
              <span className="metric-num">{scale.turnout_percentage ?? 0}%</span>
              <span className="metric-label">{t("election.results.turnoutRate")}</span>
            </div>
            <div className="scale-metric-card">
              <span className="metric-num">
                {isClosed ? (scale.abstention_count ?? 0) : (scale.remaining_count ?? 0)}
              </span>
              <span className="metric-label">
                {isClosed ? t("election.results.abstentionCount") : t("election.results.remainingCount")}
              </span>
            </div>
          </section>

          {/* Winner Spotlight Banner (if candidate results available) */}
          {winners.length > 0 ? (
            <section className={`winner-spotlight-card ${is_tie ? "tie-card" : ""}`}>
              <div className="winner-trophy-icon">{is_tie ? "⚖️" : "🏆"}</div>
              <div className="winner-details">
                <span className="winner-label">
                  {is_tie
                    ? t("election.results.tiedWinners", { count: winners.length })
                    : t("election.results.winner")}
                </span>
                <h2 className="winner-names">
                  {winners.map((w) => `${w.name} (${w.candidate_code})`).join(" / ")}
                </h2>
                <span className="winner-share-badge">
                  {winners[0].percentage}% ({winners[0].vote_count} {t("common.records", { total: winners[0].vote_count })})
                </span>
              </div>
            </section>
          ) : null}

          {/* Candidate Breakdown Section */}
          {candidate_results && candidate_results.length > 0 ? (
            <section className="candidate-results-section">
              <h2 className="section-title">{t("election.admin.candidatesTitle")}</h2>
              <div className="candidate-bars-list">
                {candidate_results.map((c) => {
                  const isWinner = winner_option_ids?.includes(c.candidate_option_id);
                  return (
                    <div
                      key={c.candidate_option_id}
                      className={`candidate-result-row ${isWinner ? "winner-row" : ""}`}
                    >
                      <div className="row-header">
                        <div className="row-candidate-name">
                          <span className="candidate-code-tag">{c.candidate_code}</span>
                          <span className="name-text">{c.name}</span>
                          {isWinner ? <span className="winner-mini-badge">🏆</span> : null}
                        </div>
                        <div className="row-tally">
                          <span className="vote-num">{c.vote_count}</span>
                          <span className="vote-pct">{c.percentage}%</span>
                        </div>
                      </div>

                      <div className="progress-track">
                        <div
                          className={`progress-fill ${isWinner ? "fill-winner" : ""}`}
                          style={{ width: `${Math.min(100, Math.max(c.percentage, 1))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="confidential-scale-notice">
              <p>{t("error.resultsHidden")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
