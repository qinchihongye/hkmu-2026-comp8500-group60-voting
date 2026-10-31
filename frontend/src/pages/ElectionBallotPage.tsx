import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { castElectionBallot, getPublicElection } from "../features/elections/api";
import type { BallotReceiptResponse, ElectionDetail } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./ElectionBallotPage.css";

export function ElectionBallotPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const electionId = id ? parseInt(id, 10) : 0;

  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BallotReceiptResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!electionId) return;
    setLoading(true);
    getPublicElection(electionId)
      .then((data) => {
        setElection(data);
        if (data.has_voted) {
          navigate(`/elections/${electionId}/results`, { replace: true });
        }
      })
      .catch((err) => setError(err.message || t("error.pollNotFound")))
      .finally(() => setLoading(false));
  }, [electionId, navigate, t]);

  const handleOpenConfirm = () => {
    if (!selectedCandidateId) return;
    setError(null);
    setConfirmModalOpen(true);
  };

  const handleConfirmVote = async () => {
    if (!selectedCandidateId) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await castElectionBallot(electionId, selectedCandidateId);
      setReceipt(res);
      setConfirmModalOpen(false);
    } catch (err: any) {
      setConfirmModalOpen(false);
      setError(err.message || t("error.internal"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyReceipt = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(receipt.receipt_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getCandidateId = (c: { option_id?: number; poll_option_id?: number }): number => {
    return c.option_id ?? c.poll_option_id ?? 0;
  };

  const handleToggleCandidate = (candidateId: number) => {
    setSelectedCandidateId((prev) => (prev === candidateId ? null : candidateId));
  };

  const selectedCandidate = election?.candidates.find(
    (c) => getCandidateId(c) === selectedCandidateId
  );

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

  if (!election) {
    return (
      <div className="view-root">
        <div className="view-scroll-frame">
          <div className="saas-table-card" style={{ padding: 36, textAlign: "center", color: "#dc2626" }}>
            <p style={{ margin: "0 0 16px 0", fontWeight: 600 }}>{error || t("error.pollNotFound")}</p>
            <Link to="/elections" className="back-link">&larr; {t("election.actions.backToList")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-root">
      <div className="view-scroll-frame">
        <div className="election-ballot-page">
          <div className="ballot-breadcrumb">
            <Link to={`/elections/${electionId}`} className="back-link">
              &larr; {election.title}
            </Link>
          </div>

          {receipt ? (
            <div className="ballot-receipt-card">
              <div className="receipt-success-banner">
                <div className="success-icon">✓</div>
                <div className="success-text">
                  <h2>{t("election.ballot.submittedTitle")}</h2>
                  <p className="submitted-at-text">
                    {t("election.ballot.submittedAt", {
                      time: new Date(receipt.submitted_at).toLocaleString(),
                    })}
                  </p>
                </div>
              </div>

              <div className="receipt-box-container">
                <span className="receipt-label">{t("election.ballot.receiptLabel")}</span>
                <div className="receipt-id-row">
                  <code className="receipt-code">{receipt.receipt_id}</code>
                  <button
                    type="button"
                    className={`copy-btn ${copied ? "copied" : ""}`}
                    onClick={handleCopyReceipt}
                  >
                    {copied ? t("election.ballot.receiptCopied") : t("election.ballot.copyReceipt")}
                  </button>
                </div>
                <p className="receipt-hint">{t("election.ballot.keepReceiptHint")}</p>
              </div>

              <div className="receipt-actions-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`/elections/${electionId}/results`)}
                >
                  {t("election.actions.viewResults")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate("/elections")}
                >
                  {t("election.actions.backToList")}
                </button>
              </div>
            </div>
          ) : (
            <div className="ballot-booth-card">
              <header className="booth-header">
                <span className="official-stamp-pill">{t("election.badge")}</span>
                <h1 className="booth-title">{election.title}</h1>
                <p className="booth-subtitle">{t("election.ballot.title")}</p>
              </header>

              <div className="b2-privacy-notice">
                <div className="notice-shield">🛡️</div>
                <div className="notice-body">
                  <strong>{t("election.ballot.noticeTitle")}</strong>
                  <p>{t("election.ballot.noticeDesc")}</p>
                </div>
              </div>

              {error ? <div className="ballot-error-banner">{error}</div> : null}

              <div className="candidate-selection-container">
                <label className="selection-prompt">{t("election.ballot.selectCandidate")}</label>
                <div className="candidate-radio-grid">
                  {election.candidates.map((cand) => {
                    const candId = getCandidateId(cand);
                    const isSelected = selectedCandidateId !== null && selectedCandidateId === candId;
                    return (
                      <div
                        key={candId || cand.candidate_code}
                        className={`candidate-radio-card ${isSelected ? "selected" : ""}`}
                        onClick={() => handleToggleCandidate(candId)}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            handleToggleCandidate(candId);
                          }
                        }}
                      >
                        <div className="radio-indicator">
                          <span className="radio-circle">{isSelected ? "●" : ""}</span>
                        </div>
                        <div className="candidate-info">
                          <span className="candidate-code-pill">
                            {t("election.ballot.candidateCode", { code: cand.candidate_code })}
                          </span>
                          <h3 className="candidate-card-name">{cand.name}</h3>
                          {cand.statement ? (
                            <p className="candidate-card-statement">{cand.statement}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="booth-submit-row">
                <button
                  type="button"
                  className="btn-cast-ballot"
                  disabled={!selectedCandidateId || submitting}
                  onClick={handleOpenConfirm}
                >
                  {t("election.actions.goVote")}
                </button>
              </div>
            </div>
          )}

          {/* Irrevocable Submission Confirmation Modal */}
          {confirmModalOpen && selectedCandidate ? (
            <div className="modal-backdrop">
              <div className="confirm-modal-box">
                <div className="modal-warning-icon">⚠️</div>
                <h3 className="modal-title">{t("election.ballot.confirmModalTitle")}</h3>
                <p className="modal-desc">
                  {t("election.ballot.confirmPrompt", { name: selectedCandidate.name })}
                </p>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setConfirmModalOpen(false)}
                    disabled={submitting}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="btn-modal-confirm"
                    onClick={handleConfirmVote}
                    disabled={submitting}
                  >
                    {submitting ? t("common.saving") : t("election.ballot.submitBtn")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
