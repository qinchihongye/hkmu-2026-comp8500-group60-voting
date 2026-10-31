import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyElectionRegistrations } from "../features/elections/api";
import type { VoterRegistrationSummary } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./MyElectionRegistrationsPage.css";

export function MyElectionRegistrationsPage() {
  const { t } = useI18n();
  const [registrations, setRegistrations] = useState<VoterRegistrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getMyElectionRegistrations({ page: 1, page_size: 50 })
      .then((data) => setRegistrations(data.items))
      .catch((err) => setError(err.message || t("error.internal")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="view-root">
      <header className="view-header">
        <h1 className="view-title">{t("election.registration.myRegistrationsTitle")}</h1>
        <p className="view-subtitle">{t("election.subtitle")}</p>
      </header>

      <div className="view-scroll-frame">
        {loading ? (
          <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="saas-table-card" style={{ padding: 24, textAlign: "center", color: "#dc2626" }}>
            {error}
          </div>
        ) : registrations.length === 0 ? (
          <div
            className="saas-table-card my-registrations-empty"
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              {t("election.registration.emptyRegistrations")}
            </h3>
            <p style={{ margin: "0 0 22px 0", maxWidth: 440, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Register your identity before roster freeze to receive single-use credentials for upcoming elections.
            </p>
            <Link
              to="/elections"
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="7" height="7" x="3" y="3" rx="1"/>
                <rect width="7" height="7" x="14" y="3" rx="1"/>
                <rect width="7" height="7" x="14" y="14" rx="1"/>
                <rect width="7" height="7" x="3" y="14" rx="1"/>
              </svg>
              {t("election.actions.registerNow")}
            </Link>
          </div>
        ) : (
          <div className="registrations-list">
            {registrations.map((reg) => (
              <div key={reg.id} className="registration-card">
                <div className="reg-card-header">
                  <h3 className="reg-poll-title">
                    <Link to={`/elections/${reg.poll_id}`}>{reg.poll_title}</Link>
                  </h3>
                  <span className={`status-pill status-${reg.status.toLowerCase()}`}>
                    {t(`election.status.${reg.status}` as any)}
                  </span>
                </div>

                <div className="reg-card-grid">
                  <div className="reg-meta-item">
                    <span className="label">{t("election.registration.legalName")}:</span>
                    <span className="val">{reg.legal_name_snapshot}</span>
                  </div>
                  <div className="reg-meta-item">
                    <span className="label">{t("election.registration.docType")}:</span>
                    <span className="val">{t(`election.docType.${reg.document_type}` as any)}</span>
                  </div>
                  <div className="reg-meta-item">
                    <span className="label">{t("election.registration.docNumber")}:</span>
                    <span className="val">•••• •••• {reg.document_suffix}</span>
                  </div>
                  <div className="reg-meta-item">
                    <span className="label">{t("election.registration.issuer")}:</span>
                    <span className="val">{reg.issuer}</span>
                  </div>
                </div>

                <div className="reg-card-footer">
                  <span className="reg-date">
                    {new Date(reg.submitted_at).toLocaleString()}
                  </span>
                  <Link to={`/elections/${reg.poll_id}`} className="btn-outline">
                    {t("polls.viewDetails")} &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
