import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { InlineBanner } from "../components/InlineBanner";
import {
  closeAdminElection,
  freezeAdminRoster,
  getAdminElection,
  publishAdminElection,
} from "../features/elections/api";
import { ElectionPhaseBadge } from "../features/elections/ElectionPhaseBadge";
import type { ElectionDetail } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./AdminElectionDetailPage.css";

export function AdminElectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const electionId = id ? parseInt(id, 10) : 0;

  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const loadElection = () => {
    if (!electionId) return;
    setLoading(true);
    getAdminElection(electionId)
      .then((data) => setElection(data))
      .catch((err) => setError(err.message || t("error.pollNotFound")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadElection();
  }, [electionId, t]);

  const handlePublish = () => {
    setActionMsg(null);
    setActionError(null);
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
          await publishAdminElection(electionId);
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionMsg(t("election.admin.publishSuccess"));
          loadElection();
        } catch (err: any) {
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionError(err.message || t("error.internal"));
        }
      },
    });
  };

  const handleFreeze = () => {
    setActionMsg(null);
    setActionError(null);
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
          const res = await freezeAdminRoster(electionId);
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionMsg(t("election.admin.freezeSuccess", { count: res.issued_credential_count }));
          loadElection();
        } catch (err: any) {
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionError(err.message || t("error.internal"));
        }
      },
    });
  };

  const handleClose = () => {
    setActionMsg(null);
    setActionError(null);
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
          await closeAdminElection(electionId);
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionMsg(t("election.admin.closeSuccess"));
          loadElection();
        } catch (err: any) {
          setConfirmModal((prev) => ({ ...prev, open: false, loading: false }));
          setActionError(err.message || t("error.internal"));
        }
      },
    });
  };

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
            <Link to="/admin/elections">&larr; {t("election.admin.title")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="view-root">
      <div className="view-scroll-frame">
        <div className="admin-election-detail-page">
          <div className="admin-breadcrumb">
            <Link to="/admin/elections" className="back-link">
              &larr; {t("election.admin.title")}
            </Link>
          </div>

          {actionMsg ? (
            <InlineBanner
              type="success"
              message={actionMsg}
              onClose={() => setActionMsg(null)}
            />
          ) : null}
          {actionError ? (
            <InlineBanner
              type="error"
              message={actionError}
              onClose={() => setActionError(null)}
            />
          ) : null}

          <header className="admin-detail-header-card">
            <div className="header-badge-row">
              <span className="official-stamp-pill">#{election.id}</span>
              <ElectionPhaseBadge phase={election.phase} />
              <span className="lifecycle-tag">{election.lifecycle}</span>
            </div>

            <h1 className="header-title">{election.title}</h1>
            {election.description ? (
              <p className="header-desc">{election.description}</p>
            ) : null}

            {/* Admin Action Control Bar */}
            <div className="admin-control-bar">
              {election.phase === "DRAFT" ? (
                <button
                  type="button"
                  className="ctrl-btn btn-publish"
                  onClick={handlePublish}
                >
                  {t("election.actions.publish")}
                </button>
              ) : null}

              <Link
                to={`/admin/elections/${election.id}/registrations`}
                className="ctrl-btn btn-review"
              >
                {t("election.actions.reviewRegistrations")}
              </Link>

              {election.phase === "REVIEWING" ? (
                <button
                  type="button"
                  className="ctrl-btn btn-freeze"
                  onClick={handleFreeze}
                >
                  {t("election.actions.freezeRoster")}
                </button>
              ) : null}

              {election.phase === "VOTING_OPEN" ? (
                <button
                  type="button"
                  className="ctrl-btn btn-close"
                  onClick={handleClose}
                >
                  {t("election.actions.earlyClose")}
                </button>
              ) : null}

              <Link
                to={`/elections/${election.id}/results`}
                className="ctrl-btn btn-results"
              >
                {t("election.actions.viewResults")}
              </Link>
            </div>
          </header>

          {/* Timelines and Config */}
          <section className="detail-meta-grid">
            <div className="meta-card">
              <span className="meta-label">{t("election.admin.registrationWindow")}</span>
              <span className="meta-val">
                {formatDate(election.registration_starts_at)}
                <br />
                &darr;
                <br />
                {formatDate(election.registration_ends_at)}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">{t("election.admin.votingWindow")}</span>
              <span className="meta-val">
                {formatDate(election.starts_at)}
                <br />
                &darr;
                <br />
                {formatDate(election.ends_at)}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">{t("election.admin.allowLiveResults")}</span>
              <span className="meta-val">
                {election.allow_live_results ? (
                  <span className="tag-enabled">✓ {t("polls.liveResults")}</span>
                ) : (
                  <span className="tag-disabled">✕ {t("polls.resultsAfterClose")}</span>
                )}
              </span>
            </div>
          </section>

          {/* Candidates List */}
          <section className="admin-candidates-section">
            <h2 className="section-title">
              {t("election.admin.candidatesTitle")} ({election.candidates.length})
            </h2>
            <div className="saas-table-card candidates-table-card">
              <table className="saas-table candidates-table">
                <thead>
                  <tr>
                    <th>{t("election.admin.candidateCode")}</th>
                    <th>{t("election.admin.candidateName")}</th>
                    <th>{t("election.admin.candidateStatement")}</th>
                  </tr>
                </thead>
                <tbody>
                  {election.candidates.map((c) => (
                    <tr key={c.option_id ?? c.poll_option_id ?? c.candidate_code}>
                      <td className="col-code">
                        <span className="candidate-code-tag">{c.candidate_code}</span>
                      </td>
                      <td className="col-name">{c.name}</td>
                      <td className="col-statement">{c.statement || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
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
