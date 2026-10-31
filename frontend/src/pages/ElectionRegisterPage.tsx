import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getPublicElection, registerVoter } from "../features/elections/api";
import type { DocumentType, RegistrationStatus, VoterRegistrationSummary } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./ElectionRegisterPage.css";

export function ElectionRegisterPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const electionId = id ? parseInt(id, 10) : 0;

  const [legalName, setLegalName] = useState("");
  const [docType, setDocType] = useState<DocumentType>("STUDENT_ID");
  const [issuer, setIssuer] = useState("HKMU");
  const [docNumber, setDocNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyRegisteredStatus, setAlreadyRegisteredStatus] = useState<RegistrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoterRegistrationSummary | null>(null);

  useEffect(() => {
    if (!electionId) {
      setChecking(false);
      return;
    }
    getPublicElection(electionId)
      .then((data) => {
        const regStatus = data.my_registration_status || data.user_registration_status;
        if (regStatus) {
          setAlreadyRegisteredStatus(regStatus);
        }
      })
      .catch(() => {
        // non-blocking
      })
      .finally(() => {
        setChecking(false);
      });
  }, [electionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!legalName.trim()) {
      setError(t("election.registration.legalName") + " required");
      return;
    }
    if (!docNumber.trim()) {
      setError(t("election.registration.docNumber") + " required");
      return;
    }

    try {
      setLoading(true);
      const res = await registerVoter(electionId, {
        legal_name: legalName.trim(),
        document_type: docType,
        issuer: issuer.trim(),
        document_number: docNumber.trim(),
      });
      setResult(res);
    } catch (err: any) {
      if (err.code === 40911 || (err.message && err.message.toLowerCase().includes("already registered"))) {
        setAlreadyRegisteredStatus("APPROVED");
      } else {
        setError(err.message || t("error.validation"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view-root view-root-narrow">
      <div className="view-scroll-frame">
        <div className="election-register-page">
          <div className="register-breadcrumb">
            <Link to={`/elections/${electionId}`} className="back-link">
              &larr; {t("election.actions.backToList")}
            </Link>
          </div>

          <div className="register-card">
            <header className="register-header">
              <span className="official-stamp-pill">{t("election.badge")}</span>
              <h1 className="register-title">{t("election.registration.title")}</h1>
              <p className="register-subtitle">{t("election.registration.subtitle")}</p>
            </header>

            {checking ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                {t("common.loading")}
              </div>
            ) : result ? (
              <div className="register-success-view">
                <div className={`result-alert-box status-${result.status.toLowerCase()}`}>
                  <div className="result-alert-icon">
                    {result.status === "APPROVED" ? "✓" : "!"}
                  </div>
                  <div className="result-alert-text">
                    <h3>{t("election.registration.successTitle")}</h3>
                    <p>
                      {t("election.registration.successDesc", {
                        status: t(`election.status.${result.status}` as any),
                      })}
                    </p>
                    <p className="result-detail-hint">
                      {result.status === "APPROVED"
                        ? t("election.registration.autoApproved")
                        : t("election.registration.pendingManual")}
                    </p>
                  </div>
                </div>

                <div className="registration-meta-summary">
                  <div className="summary-item">
                    <span className="label">{t("election.registration.legalName")}:</span>
                    <span className="val">{result.legal_name_snapshot}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">{t("election.registration.docType")}:</span>
                    <span className="val">{t(`election.docType.${result.document_type}` as any)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">{t("election.registration.docNumber")}:</span>
                    <span className="val">•••• •••• {result.document_suffix}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">{t("election.registration.issuer")}:</span>
                    <span className="val">{result.issuer}</span>
                  </div>
                </div>

                <div className="register-success-actions">
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={() => navigate(`/elections/${electionId}`)}
                  >
                    {t("polls.viewDetails")}
                  </button>
                </div>
              </div>
            ) : alreadyRegisteredStatus ? (
              <div className="register-success-view">
                <div className={`result-alert-box status-${alreadyRegisteredStatus.toLowerCase()}`}>
                  <div className="result-alert-icon">✓</div>
                  <div className="result-alert-text">
                    <h3>{t("election.registration.alreadyRegisteredTitle")}</h3>
                    <p>
                      {t("election.registration.alreadyRegisteredDesc", {
                        status: t(`election.status.${alreadyRegisteredStatus}` as any),
                      })}
                    </p>
                  </div>
                </div>

                <div className="register-success-actions" style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={() => navigate(`/elections/${electionId}`)}
                  >
                    {t("polls.viewDetails")}
                  </button>
                  <Link
                    to="/elections?view=my_registrations"
                    className="btn-submit"
                    style={{
                      background: "#f1f5f9",
                      color: "#334155",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {t("election.registration.myRegistrationsTitle")}
                  </Link>
                </div>
              </div>
            ) : (
              <form className="register-form" onSubmit={handleSubmit}>
                <div className="security-notice-callout">
                  <span className="notice-icon">🔒</span>
                  <p className="notice-text">{t("election.registration.docHint")}</p>
                </div>

                {error ? <div className="register-error-banner">{error}</div> : null}

                <div className="form-group">
                  <label htmlFor="legalName" className="form-label">
                    {t("election.registration.legalName")} *
                  </label>
                  <input
                    id="legalName"
                    type="text"
                    className="form-input"
                    placeholder={t("election.registration.legalNamePlaceholder")}
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="docType" className="form-label">
                    {t("election.registration.docType")} *
                  </label>
                  <select
                    id="docType"
                    className="form-select"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                  >
                    <option value="STUDENT_ID">{t("election.docType.STUDENT_ID")}</option>
                    <option value="HK_MACAU_PERMIT">{t("election.docType.HK_MACAU_PERMIT")}</option>
                    <option value="RESIDENT_ID">{t("election.docType.RESIDENT_ID")}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="issuer" className="form-label">
                    {t("election.registration.issuer")} *
                  </label>
                  <input
                    id="issuer"
                    type="text"
                    className="form-input"
                    placeholder={t("election.registration.issuerPlaceholder")}
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="docNumber" className="form-label">
                    {t("election.registration.docNumber")} *
                  </label>
                  <input
                    id="docNumber"
                    type="text"
                    className="form-input"
                    placeholder={t("election.registration.docNumberPlaceholder")}
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="form-submit-row">
                  <button type="submit" className="btn-submit" disabled={loading}>
                    {loading
                      ? t("election.registration.submitting")
                      : t("election.registration.submitBtn")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
