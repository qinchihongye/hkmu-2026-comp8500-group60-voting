import { useEffect, useState } from "react";

import { PageState } from "../components/PageState";
import { getPolls } from "../features/polls/api";
import { PollCard } from "../features/polls/PollCard";
import { PollSortDropdown } from "../features/polls/PollSortDropdown";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { PollSortBy, PollSummary } from "../lib/api-types";
import "../styles/polls.css";

export function PollListPage() {
  const { t } = useI18n();
  const failure = useFailure("error.pollsLoad");
  const { setCause, clear } = failure;
  const statusTabs = [
    { value: "", label: t("status.all") },
    { value: "OPEN", label: t("status.open"), dot: true },
    { value: "SCHEDULED", label: t("status.scheduled") },
    { value: "CLOSED", label: t("status.closed") },
  ];
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState<PollSortBy>("created_at");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PollSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 12;
  const queryKey = `${page}:${q}:${status}:${sortBy}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void getPolls({
      page,
      page_size: pageSize,
      q,
      status: status || undefined,
      sort_by: sortBy,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setItems(result.items);
        setTotal(result.total);
        clear();
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
  }, [page, q, status, sortBy, setCause, clear]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="polls-page-root">
      {/* Header */}
      <header className="polls-header">
        <div className="polls-header-left">
          <h1 className="polls-page-title">
            {t("polls.publicTitle")}
          </h1>
        </div>
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
              placeholder={t("polls.searchPublic")}
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
            />
          </div>

          {/* Sort Dropdown */}
          <PollSortDropdown
            value={sortBy}
            onChange={(newSort) => {
              setPage(1);
              setSortBy(newSort);
            }}
          />
        </div>

        {/* Status Segmented Tabs */}
        <div className="polls-status-tabs">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`polls-tab-btn ${status === tab.value ? "active" : ""}`}
              onClick={() => {
                setPage(1);
                setStatus(tab.value);
              }}
            >
              {tab.dot ? <span className="polls-tab-dot" /> : null}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area: Independent Scroll Frame */}
      <div className="polls-scroll-frame">
        <PageState
          loading={loading}
          error={failure.message}
          empty={
            !loading && items.length === 0 ? (
              <div className="polls-empty-card">
                <span className="polls-empty-icon">🗳️</span>
                <p className="polls-empty-text">{t("polls.emptyPublic")}</p>
                <span style={{ fontSize: "0.88rem", color: "#94a3b8" }}>
                  {t("polls.emptyPublicHint")}
                </span>
              </div>
            ) : null
          }
        >
          <div className="polls-grid">
            {items.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        </PageState>

        {/* Pagination Bar */}
        {total > 0 ? (
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
