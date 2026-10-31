import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getPublicElections } from "../features/elections/api";
import { ElectionCard } from "../features/elections/ElectionCard";
import type { ElectionPhase, ElectionSummary } from "../features/elections/types";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeTab = searchParams.get("tab") || "all";
  const page = parseInt(searchParams.get("page") || "1", 10);

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
        <h1 className="view-title">{t("election.title")}</h1>
        <p className="view-subtitle">{t("election.subtitle")}</p>
        <div className="elections-filter-tabs" style={{ marginTop: 16 }}>
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
      </div>
    </div>
  );
}
