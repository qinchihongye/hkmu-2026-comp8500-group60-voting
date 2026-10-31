import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { getMyElectionRegistrations, getPublicElections } from "../features/elections/api";
import { ElectionCard } from "../features/elections/ElectionCard";
import type { ElectionPhase, ElectionSummary, VoterRegistrationSummary } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./ElectionsPage.css";

const PHASE_FILTERS: Array<{ key: string; phase?: ElectionPhase }> = [
  { key: "all" },
  { key: "registration", phase: "REGISTRATION_OPEN" },
  { key: "voting", phase: "VOTING_OPEN" },
  { key: "closed", phase: "CLOSED" },
];

export function ElectionsPage() {
  const { t } = useI18n();
  const { user, status } = useAuth();
  const authenticated = status === "authenticated" || Boolean(user);
  const [searchParams, setSearchParams] = useSearchParams();

  // Primary view mode: "explore" (All public elections) vs "my_registrations" (User's registrations)
  const currentView = searchParams.get("view") === "my_registrations" ? "my_registrations" : "explore";

  // Public elections state
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // My registrations state
  const [registrations, setRegistrations] = useState<VoterRegistrationSummary[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regCount, setRegCount] = useState<number | null>(null);

  const activeTab = searchParams.get("tab") || "all";
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Load public elections
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getPublicElections({ page, page_size: 12 })
      .then((data) => {
        if (cancelled) return;
        setElections(data.items);
        setTotal(data.total);
        setPages(Math.ceil(data.total / (data.page_size || 1)) || 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || t("error.internal"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, activeTab, t]);

  // Load user registrations if authenticated
  useEffect(() => {
    if (!authenticated) {
      setRegistrations([]);
      setRegCount(null);
      return;
    }

    let cancelled = false;
    setRegLoading(true);
    setRegError(null);

    getMyElectionRegistrations({ page: 1, page_size: 50 })
      .then((data) => {
        if (cancelled) return;
        setRegistrations(data.items);
        setRegCount(data.items.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setRegError(err.message || t("error.internal"));
      })
      .finally(() => {
        if (!cancelled) setRegLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, t]);

  const handleViewChange = (viewKey: "explore" | "my_registrations") => {
    const next = new URLSearchParams(searchParams);
    if (viewKey === "explore") {
      next.delete("view");
    } else {
      next.set("view", "my_registrations");
    }
    setSearchParams(next);
  };

  const handleTabChange = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === "all") {
      next.delete("tab");
    } else {
      next.set("tab", key);
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(newPage));
    setSearchParams(next);
  };

  const filteredElections = elections.filter((item) => {
    if (activeTab === "registration") return item.phase === "REGISTRATION_OPEN";
    if (activeTab === "voting") return item.phase === "VOTING_OPEN";
    if (activeTab === "closed") return item.phase === "CLOSED";
    return true;
  });

  return (
    <div className="view-root">
      <header className="view-header" style={{ marginBottom: 16 }}>
        <div className="elections-header-row">
          <div>
            <h1 className="view-title">{t("election.title")}</h1>
            <p className="view-subtitle">{t("election.subtitle")}</p>
          </div>

          {authenticated ? (
            <div className="elections-view-switcher" role="tablist" aria-label="Elections view switcher">
              <button
                type="button"
                role="tab"
                aria-selected={currentView === "explore"}
                className={`view-switch-btn ${currentView === "explore" ? "active" : ""}`}
                onClick={() => handleViewChange("explore")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>{t("election.tabs.explore")}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={currentView === "my_registrations"}
                className={`view-switch-btn ${currentView === "my_registrations" ? "active" : ""}`}
                onClick={() => handleViewChange("my_registrations")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>{t("election.tabs.myRegistrations")}</span>
                {regCount != null && regCount > 0 ? (
                  <span className="tab-count-badge">{regCount}</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        {/* Phase filters - only shown when in Explore view */}
        {currentView === "explore" ? (
          <div className="elections-filter-tabs" style={{ marginTop: 18 }}>
            {PHASE_FILTERS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`filter-tab-btn ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.key === "all" ? t("status.all") : t(`election.phase.${tab.phase}` as any)}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="view-scroll-frame">
        {currentView === "explore" ? (
          /* ================= EXPLORE / ALL ELECTIONS VIEW ================= */
          <>
            {loading ? (
              <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                {t("common.loading")}
              </div>
            ) : error ? (
              <div className="saas-table-card" style={{ padding: 24, textAlign: "center", color: "#dc2626" }}>
                {error}
              </div>
            ) : filteredElections.length === 0 ? (
              <div
                className="saas-table-card elections-empty-card"
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
                    <path d="m9 12 2 2 4-4"/>
                    <path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/>
                    <path d="M22 19H2"/>
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  {t("polls.emptyPublic")}
                </h3>
                <p style={{ margin: "0 0 22px 0", maxWidth: 440, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
                  Official cryptographic elections will appear here once scheduled or published by administrators.
                </p>
              </div>
            ) : (
              <div className="elections-grid">
                {filteredElections.map((elec) => (
                  <ElectionCard key={elec.id} election={elec} />
                ))}
              </div>
            )}

            {pages > 1 ? (
              <footer className="elections-pagination">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  {t("common.previous")}
                </button>
                <span className="pagination-info">
                  {t("common.pageOf", { page, pages, total })}
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page >= pages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  {t("common.next")}
                </button>
              </footer>
            ) : null}
          </>
        ) : (
          /* ================= MY REGISTRATIONS VIEW ================= */
          <div className="registrations-list-wrapper">
            {regLoading ? (
              <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                {t("common.loading")}
              </div>
            ) : regError ? (
              <div className="saas-table-card" style={{ padding: 24, textAlign: "center", color: "#dc2626" }}>
                {regError}
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
                <button
                  type="button"
                  className="view-btn view-btn-primary"
                  onClick={() => handleViewChange("explore")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 20px",
                    borderRadius: 9999,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="7" height="7" x="3" y="3" rx="1"/>
                    <rect width="7" height="7" x="14" y="3" rx="1"/>
                    <rect width="7" height="7" x="14" y="14" rx="1"/>
                    <rect width="7" height="7" x="3" y="14" rx="1"/>
                  </svg>
                  {t("election.tabs.explore")}
                </button>
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
        )}
      </div>
    </div>
  );
}
