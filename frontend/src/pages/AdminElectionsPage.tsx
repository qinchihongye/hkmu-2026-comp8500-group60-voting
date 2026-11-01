import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { InlineBanner } from "../components/InlineBanner";
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
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [elections, setElections] = useState<ElectionSummary[]>([]);

  const handleScroll = (offset: number) => {
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant: "primary" | "warning" | "danger";
    loading: boolean;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: "",
    message: "",
    variant: "primary",
    loading: false,
    onConfirm: async () => {},
  });

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

  const handlePublish = (id: number) => {
    setActionMsg(null);
    setError(null);
    setConfirmModal({
      open: true,
      title: t("election.actions.publish"),
      message: t("election.admin.publishPrompt"),
      confirmText: t("election.actions.publish"),
      variant: "primary",
      loading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, loading: true }));
          await publishAdminElection(id);
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionMsg(t("election.admin.publishSuccess"));
          fetchElections();
        } catch (err: any) {
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setError(err.message || t("error.internal"));
        }
      },
    });
  };

  const handleFreeze = (id: number) => {
    setActionMsg(null);
    setError(null);
    setConfirmModal({
      open: true,
      title: t("election.actions.freezeRoster"),
      message: t("election.admin.freezePrompt"),
      confirmText: t("election.actions.freezeRoster"),
      variant: "warning",
      loading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, loading: true }));
          const res = await freezeAdminRoster(id);
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionMsg(t("election.admin.freezeSuccess", { count: res.issued_credential_count }));
          fetchElections();
        } catch (err: any) {
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setError(err.message || t("error.internal"));
        }
      },
    });
  };

  const handleClose = (id: number) => {
    setActionMsg(null);
    setError(null);
    setConfirmModal({
      open: true,
      title: t("election.actions.earlyClose"),
      message: t("election.admin.closePrompt"),
      confirmText: t("election.actions.earlyClose"),
      variant: "danger",
      loading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, loading: true }));
          await closeAdminElection(id);
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionMsg(t("election.admin.closeSuccess"));
          fetchElections();
        } catch (err: any) {
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setError(err.message || t("error.internal"));
        }
      },
    });
  };

  return (
    <div className="view-root admin-view-root">
      <header className="view-header admin-page-header">
        <div className="header-text-group">
          <h1 className="view-title">{t("election.admin.title")}</h1>
          <p className="view-subtitle">{t("election.subtitle")}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            to="/elections"
            style={{
              padding: "9px 14px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            👁️ {t("election.admin.viewPublicPage")}
          </Link>
          <Link to="/admin/elections/new" className="btn-create-election">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t("election.admin.createNew")}</span>
          </Link>
        </div>
      </header>

      <div className="view-scroll-frame">
        {actionMsg ? (
          <InlineBanner
            type="success"
            message={actionMsg}
            onClose={() => setActionMsg(null)}
          />
        ) : null}
        {error ? (
          <InlineBanner
            type="error"
            message={error}
            onClose={() => setError(null)}
          />
        ) : null}

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
          <>
            <div className="table-scroll-toolbar">
              <span className="scroll-hint-pill">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>{t("election.admin.scrollHint")}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
              <div className="scroll-arrow-controls">
                <button
                  type="button"
                  className="scroll-arrow-btn"
                  onClick={() => handleScroll(-280)}
                  title="向左滑动"
                  aria-label="向左滑动"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="scroll-arrow-btn"
                  onClick={() => handleScroll(280)}
                  title="向右滑动"
                  aria-label="向右滑动"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="saas-table-card admin-elections-table-wrapper" ref={tableWrapperRef}>
              <table className="saas-table admin-elections-table">
                <thead>
                  <tr>
                    <th className="col-id">ID</th>
                    <th className="col-title">{t("admin.titleCol")}</th>
                    <th className="col-phase">{t("common.status")}</th>
                    <th className="col-live">{t("polls.liveResults")}</th>
                    <th className="col-candidates">{t("election.admin.candidatesTitle")}</th>
                    <th className="col-dates">{t("election.admin.votingWindow")}</th>
                    <th className="col-actions-header">{t("admin.actionsCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {elections.map((elec) => (
                    <tr key={elec.id}>
                      <td className="col-id">#{elec.id}</td>
                      <td className="col-title">
                        <Link to={`/admin/elections/${elec.id}`}>{elec.title}</Link>
                      </td>
                      <td className="col-phase">
                        <ElectionPhaseBadge phase={elec.phase} />
                      </td>
                      <td className="col-live">
                        {elec.allow_live_results ? (
                          <span className="live-status-pill enabled">✓</span>
                        ) : (
                          <span className="live-status-pill disabled">✕</span>
                        )}
                      </td>
                      <td className="col-candidates">{elec.candidate_count}</td>
                      <td className="col-dates">
                        <div className="election-dates-box">
                          <span>{new Date(elec.starts_at).toLocaleDateString()}</span>
                          <span className="date-sep">~</span>
                          <span>{new Date(elec.ends_at).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="col-actions">
                        <div className="col-actions-group">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmActionModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={t("common.cancel")}
        variant={confirmModal.variant}
        loading={confirmModal.loading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
