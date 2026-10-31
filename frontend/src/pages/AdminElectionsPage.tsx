import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  closeAdminElection,
  freezeAdminRoster,
  getAdminElections,
  publishAdminElection,
} from "../features/elections/api";
import { ElectionPhaseBadge } from "../features/elections/ElectionPhaseBadge";
import type { ElectionSummary } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./AdminElectionsPage.css";

export function AdminElectionsPage() {
  const { t } = useI18n();
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchElections = () => {
    setLoading(true);
    setError(null);
    getAdminElections({ page: 1, page_size: 50 })
      .then((data) => setElections(data.items))
      .catch((err) => setError(err.message || t("error.internal")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchElections();
  }, [t]);

  const handlePublish = async (id: number) => {
    if (!window.confirm(t("election.admin.publishPrompt"))) return;
    try {
      await publishAdminElection(id);
      setActionMsg(t("election.admin.publishPrompt"));
      fetchElections();
    } catch (err: any) {
      alert(err.message || t("error.internal"));
    }
  };

  const handleFreeze = async (id: number) => {
    if (!window.confirm(t("election.admin.freezePrompt"))) return;
    try {
      const res = await freezeAdminRoster(id);
      alert(t("election.admin.freezeSuccess", { count: res.issued_credential_count }));
      fetchElections();
    } catch (err: any) {
      alert(err.message || t("error.internal"));
    }
  };

  const handleClose = async (id: number) => {
    if (!window.confirm(t("election.admin.closePrompt"))) return;
    try {
      await closeAdminElection(id);
      alert(t("election.admin.closeSuccess"));
      fetchElections();
    } catch (err: any) {
      alert(err.message || t("error.internal"));
    }
  };

  return (
    <div className="view-root">
      <header className="view-header admin-page-header">
        <div className="header-text-group">
          <h1 className="view-title">{t("election.admin.title")}</h1>
          <p className="view-subtitle">{t("election.subtitle")}</p>
        </div>
        <Link to="/admin/elections/new" className="btn-create-election">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{t("election.admin.createNew")}</span>
        </Link>
      </header>

      <div className="view-scroll-frame">
        {actionMsg ? <div className="admin-success-banner">{actionMsg}</div> : null}
        {error ? <div className="admin-error-banner">{error}</div> : null}

        {loading ? (
          <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
            {t("common.loading")}
          </div>
        ) : elections.length === 0 ? (
          <div
            className="saas-table-card admin-empty-card"
            style={{
              padding: "54px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                background: "#f0f7ff",
                border: "1px solid #dbeafe",
                display: "grid",
                placeItems: "center",
                marginBottom: 16,
                color: "#2563eb",
              }}
              aria-hidden="true"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              {t("polls.emptyPublic")}
            </h3>
            <p style={{ margin: "0 0 22px 0", maxWidth: 440, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
              No official elections have been created yet. Launch a new cryptographic election to begin voter registration.
            </p>
            <Link
              to="/admin/elections/new"
              className="view-btn view-btn-primary"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 20px",
                borderRadius: 9999,
                fontWeight: 600,
              }}
            >
              + {t("election.admin.createNew")}
            </Link>
          </div>
        ) : (
          <div className="saas-table-card admin-elections-table-wrapper">
            <table className="saas-table admin-elections-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("common.searchTitle")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("polls.liveResults")}</th>
                  <th>{t("election.admin.candidatesTitle")}</th>
                  <th>{t("election.admin.votingWindow")}</th>
                  <th>{t("action.all")}</th>
                </tr>
              </thead>
              <tbody>
                {elections.map((elec) => (
                  <tr key={elec.id}>
                    <td className="col-id">#{elec.id}</td>
                    <td className="col-title">
                      <Link to={`/admin/elections/${elec.id}`}>{elec.title}</Link>
                    </td>
                    <td>
                      <ElectionPhaseBadge phase={elec.phase} />
                    </td>
                    <td>
                      {elec.allow_live_results ? (
                        <span className="live-status-pill enabled">✓</span>
                      ) : (
                        <span className="live-status-pill disabled">✕</span>
                      )}
                    </td>
                    <td>{elec.candidate_count}</td>
                    <td className="col-dates">
                      {new Date(elec.starts_at).toLocaleDateString()} ~{" "}
                      {new Date(elec.ends_at).toLocaleDateString()}
                    </td>
                    <td className="col-actions">
                      <Link to={`/admin/elections/${elec.id}`} className="table-btn btn-view">
                        {t("polls.openWorkspace")}
                      </Link>

                      <Link
                        to={`/admin/elections/${elec.id}/registrations`}
                        className="table-btn btn-review"
                      >
                        {t("election.actions.reviewRegistrations")}
                      </Link>

                      {elec.phase === "DRAFT" ? (
                        <button
                          type="button"
                          className="table-btn btn-publish"
                          onClick={() => handlePublish(elec.id)}
                        >
                          {t("election.actions.publish")}
                        </button>
                      ) : null}

                      {elec.phase === "REVIEWING" ? (
                        <button
                          type="button"
                          className="table-btn btn-freeze"
                          onClick={() => handleFreeze(elec.id)}
                        >
                          {t("election.actions.freezeRoster")}
                        </button>
                      ) : null}

                      {elec.phase === "VOTING_OPEN" ? (
                        <button
                          type="button"
                          className="table-btn btn-close"
                          onClick={() => handleClose(elec.id)}
                        >
                          {t("election.actions.earlyClose")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
