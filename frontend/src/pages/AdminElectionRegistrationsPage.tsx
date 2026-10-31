import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getAdminElection,
  getAdminRegistrations,
  reviewAdminRegistration,
} from "../features/elections/api";
import type {
  ElectionDetail,
  RegistrationStatus,
  VoterRegistrationSummary,
} from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./AdminElectionRegistrationsPage.css";

const STATUS_FILTERS: Array<{ key: string; status?: RegistrationStatus }> = [
  { key: "ALL" },
  { key: "NEEDS_REVIEW", status: "NEEDS_REVIEW" },
  { key: "PENDING", status: "PENDING" },
  { key: "APPROVED", status: "APPROVED" },
  { key: "REJECTED", status: "REJECTED" },
];

export function AdminElectionRegistrationsPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const electionId = id ? parseInt(id, 10) : 0;

  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [registrations, setRegistrations] = useState<VoterRegistrationSummary[]>([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review Modal state
  const [reviewingReg, setReviewingReg] = useState<VoterRegistrationSummary | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNote, setReviewNote] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadData = () => {
    if (!electionId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      getAdminElection(electionId),
      getAdminRegistrations(electionId, {
        page: 1,
        page_size: 100,
        status: activeFilter === "ALL" ? undefined : activeFilter,
      }),
    ])
      .then(([elecData, regData]) => {
        setElection(elecData);
        setRegistrations(regData.items);
      })
      .catch((err) => setError(err.message || t("error.internal")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [electionId, activeFilter, t]);

  const handleOpenReview = (reg: VoterRegistrationSummary) => {
    setReviewingReg(reg);
    setDecision("APPROVED");
    setReviewNote("");
  };

  const handleConfirmReview = async () => {
    if (!reviewingReg) return;
    try {
      setSubmittingReview(true);
      await reviewAdminRegistration(electionId, reviewingReg.id, {
        decision,
        review_note: reviewNote.trim() || undefined,
      });
      setReviewingReg(null);
      loadData();
    } catch (err: any) {
      alert(err.message || t("error.internal"));
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="view-root">
      <header className="view-header">
        <div className="admin-breadcrumb" style={{ marginBottom: 8 }}>
          <Link to={`/admin/elections/${electionId}`} className="back-link">
            &larr; {election?.title || t("election.admin.title")}
          </Link>
        </div>

        <div className="registrations-header-row">
          <div>
            <h1 className="view-title">
              {t("election.admin.registrationsTitle", { title: election?.title || "" })}
            </h1>
            <p className="view-subtitle">
              {t("election.admin.candidatesTitle")} ({registrations.length})
            </p>
          </div>

          <div className="filter-pill-row">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-pill ${activeFilter === f.key ? "active" : ""}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.key === "ALL" ? t("status.all") : t(`election.status.${f.key}` as any)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="view-scroll-frame">
        {error ? <div className="admin-error-banner">{error}</div> : null}

        {loading ? (
          <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
            {t("common.loading")}
          </div>
        ) : registrations.length === 0 ? (
          <div
            className="saas-table-card"
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
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              {t("polls.emptyPublic")}
            </h3>
            <p style={{ margin: "0", maxWidth: 440, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
              No voter registration applications found for this filter.
            </p>
          </div>
        ) : (
          <div className="saas-table-card registrations-table-card">
            <table className="saas-table registrations-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("election.registration.legalName")}</th>
                  <th>{t("election.registration.docType")}</th>
                  <th>{t("election.registration.docNumber")}</th>
                  <th>{t("election.registration.issuer")}</th>
                  <th>{t("common.status")}</th>
                  <th>Score</th>
                  <th>{t("action.all")}</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => (
                  <tr key={reg.id}>
                    <td className="col-id">#{reg.id}</td>
                    <td className="col-name">{reg.legal_name_snapshot}</td>
                    <td>{t(`election.docType.${reg.document_type}` as any)}</td>
                    <td>•••• {reg.document_suffix}</td>
                    <td>{reg.issuer}</td>
                    <td>
                      <span className={`status-pill status-${reg.status.toLowerCase()}`}>
                        {t(`election.status.${reg.status}` as any)}
                      </span>
                    </td>
                    <td>
                      {reg.model_score != null ? (
                        <span className="score-tag">{reg.model_score}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-btn btn-review"
                        onClick={() => handleOpenReview(reg)}
                      >
                        {t("election.admin.decision")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewingReg ? (
        <div className="modal-backdrop">
          <div className="review-modal-box">
            <h3 className="modal-title">
              {t("election.admin.decision")}: {reviewingReg.legal_name_snapshot}
            </h3>
            <p className="modal-subtitle">
              •••• {reviewingReg.document_suffix} ({reviewingReg.issuer})
            </p>

            <div className="decision-radio-group">
              <label className={`decision-card ${decision === "APPROVED" ? "selected approve" : ""}`}>
                <input
                  type="radio"
                  name="decision"
                  value="APPROVED"
                  checked={decision === "APPROVED"}
                  onChange={() => setDecision("APPROVED")}
                />
                <span className="decision-label">{t("election.admin.approve")}</span>
              </label>

              <label className={`decision-card ${decision === "REJECTED" ? "selected reject" : ""}`}>
                <input
                  type="radio"
                  name="decision"
                  value="REJECTED"
                  checked={decision === "REJECTED"}
                  onChange={() => setDecision("REJECTED")}
                />
                <span className="decision-label">{t("election.admin.reject")}</span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">{t("election.admin.reviewNote")}</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Reason or notes..."
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setReviewingReg(null)}
                disabled={submittingReview}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleConfirmReview}
                disabled={submittingReview}
              >
                {submittingReview ? t("common.saving") : t("election.admin.confirmDecision")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
