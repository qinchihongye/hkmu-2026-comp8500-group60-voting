import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PageState } from "../components/PageState";
import { MyPollCard } from "../features/creator/MyPollCard";
import { getMyPolls } from "../features/creator/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { ManagePollSummary } from "../lib/api-types";
import "../styles/polls.css";

export function MyPollsPage() {
  const { locale, t } = useI18n();
  const failure = useFailure("error.myPollsLoad");
  const { setCause, clear } = failure;
  const statusTabs = [
    { value: "", label: t("status.all") },
    { value: "DRAFT", label: t("status.draft") },
    { value: "OPEN", label: t("status.open"), dot: true },
    { value: "SCHEDULED", label: t("status.scheduled") },
    { value: "CLOSED", label: t("status.closed") },
  ];
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ManagePollSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 12;
  const queryKey = `${page}:${q}:${status}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void getMyPolls({ page, page_size: pageSize, q, status: status || undefined })
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          clear();
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setCause(caught);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, q, status, setCause, clear]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="polls-page-root">
      {/* Page Header */}
      <header className="polls-header">
        <div className="polls-header-left">
          <h1 className="polls-page-title">
            {t("polls.mineTitle")}
          </h1>
        </div>

        {/* Primary Action: Create Poll */}
        <Link to="/my-polls/new" className="polls-create-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{t("polls.create")}</span>
        </Link>
      </header>

      {/* Filter & Search Bar */}
      <div className="polls-filter-card">
        <div className="polls-filter-main-row">
          {/* Search Input */}
          <div className="polls-search-wrap">
            <svg
              className="polls-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="polls-search-input"
              placeholder={t("polls.searchMine")}
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
            />
          </div>
        </div>

        {/* Status Segmented Tabs */}
        <div className="polls-status-tabs">
          {statusTabs.map((tab) => {
            const isActive = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                className={`polls-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setPage(1);
                  setStatus(tab.value);
                }}
              >
                {tab.dot ? <span className="polls-tab-dot" /> : null}
                <span>{tab.label}</span>
                {isActive && total > 0 ? (
                  <span className="polls-tab-count">{total}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Polls Management List: Independent Scroll Frame */}
      <div className="polls-scroll-frame">
        <PageState
          loading={loading}
          error={failure.message}
          empty={
            !loading && items.length === 0 ? (
              <div className="polls-empty-card dashboard-span">
                <span className="polls-empty-icon">📝</span>
                <p className="polls-empty-text">{t("polls.emptyMine")}</p>
                <Link to="/my-polls/new" className="polls-create-btn" style={{ marginTop: 8 }}>
                  {t("polls.create")}
                </Link>
              </div>
            ) : null
          }
        >
          <div className="polls-grid">
            {items.map((poll) => (
              <MyPollCard key={poll.id} poll={poll} />
            ))}
            {items.length > 0 && items.length < pageSize && (
              <Link
                to="/my-polls/new"
                className="plaza-card my-polls-quick-create-card"
                aria-label={t("polls.create")}
              >
                <div className="quick-create-inner">
                  <div className="quick-create-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <span className="quick-create-title">{t("polls.create")}</span>
                  <span className="quick-create-desc">
                    {locale === "zh" ? "快速发起一场新投票" : "Launch a new poll quickly"}
                  </span>
                </div>
              </Link>
            )}
          </div>
        </PageState>

        {/* Pagination Bar */}
        {total > pageSize ? (
          <div className="polls-pagination-bar">
            <span>
              {t("common.pageOf", { page, pages, total })}
            </span>
            <div className="polls-page-btn-group">
              <button
                type="button"
                className="polls-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("common.previous")}
              </button>
              <button
                type="button"
                className="polls-page-btn"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
