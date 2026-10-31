import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../features/auth/AuthProvider";
import { MyPollCard } from "../features/creator/MyPollCard";
import { getMyPolls } from "../features/creator/api";
import { getMyVotes } from "../features/polls/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { ManagePollSummary, MyVote } from "../lib/api-types";
import { formatHongKong } from "../lib/time";
import "./MyActivityPage.css";
import "../styles/polls.css";

interface MyActivityPageProps {
  defaultTab?: "created" | "voted";
}

function getDeletedReceipts(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function MyActivityPage({ defaultTab }: MyActivityPageProps) {
  const { t } = useI18n();
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlTab = searchParams.get("tab");
  const activeTab = urlTab === "voted" || (!urlTab && defaultTab === "voted") ? "voted" : "created";

  const handleTabSwitch = (tabKey: "created" | "voted") => {
    const next = new URLSearchParams(searchParams);
    if (tabKey === "created") {
      next.delete("tab");
    } else {
      next.set("tab", "voted");
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  /* ================= TAB 1: CREATED POLLS STATE ================= */
  const pollFailure = useFailure("error.myPollsLoad");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [pollPage, setPollPage] = useState(1);
  const [createdPolls, setCreatedPolls] = useState<ManagePollSummary[]>([]);
  const [createdTotal, setCreatedTotal] = useState(0);
  const [pollLoading, setPollLoading] = useState(true);
  const pollPageSize = 12;

  const statusTabs = [
    { value: "", label: t("status.all") },
    { value: "DRAFT", label: t("status.draft") },
    { value: "OPEN", label: t("status.open"), dot: true },
    { value: "SCHEDULED", label: t("status.scheduled") },
    { value: "CLOSED", label: t("status.closed") },
  ];

  useEffect(() => {
    if (activeTab !== "created") return;
    let cancelled = false;
    setPollLoading(true);

    getMyPolls({ page: pollPage, page_size: pollPageSize, q, status: status || undefined })
      .then((res) => {
        if (!cancelled) {
          setCreatedPolls(res.items);
          setCreatedTotal(res.total);
          pollFailure.clear();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          pollFailure.setCause(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPollLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, pollPage, q, status]);

  /* ================= TAB 2: VOTING HISTORY STATE ================= */
  const voteFailure = useFailure("error.votesLoad");
  const [votedItems, setVotedItems] = useState<MyVote[]>([]);
  const [votedTotal, setVotedTotal] = useState(0);
  const [votePage, setVotePage] = useState(1);
  const [voteLoading, setVoteLoading] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<MyVote | null>(null);
  const votePageSize = 12;

  const storageKey = auth.user
    ? `votenow_deleted_votes_${auth.user.username}`
    : "votenow_deleted_votes_guest";

  useEffect(() => {
    if (activeTab !== "voted") return;
    let cancelled = false;
    setVoteLoading(true);

    getMyVotes({ page: votePage, page_size: votePageSize })
      .then((res) => {
        if (!cancelled) {
          const deleted = getDeletedReceipts(storageKey);
          const filtered = res.items.filter((item) => !deleted.includes(item.receipt_id));
          setVotedItems(filtered);
          setVotedTotal(Math.max(0, res.total - deleted.length));
          voteFailure.clear();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          voteFailure.setCause(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, votePage, storageKey]);

  const createdPages = Math.max(1, Math.ceil(createdTotal / pollPageSize));
  const votedPages = Math.max(1, Math.ceil(votedTotal / votePageSize));

  return (
    <div className="view-root">
      {/* Unified Activity Header */}
      <header className="view-header activity-page-header">
        <div className="activity-header-left">
          <h1 className="view-title">{t("activity.title")}</h1>
          <p className="view-subtitle">{t("activity.subtitle")}</p>
        </div>

        {/* Top-Level Activity Switcher */}
        <div className="activity-tabs-switcher" role="tablist" aria-label="My Activity Switcher">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "created"}
            className={`activity-tab-btn ${activeTab === "created" ? "active" : ""}`}
            onClick={() => handleTabSwitch("created")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>{t("activity.tabCreated")}</span>
            {createdTotal > 0 ? <span className="activity-count-badge">{createdTotal}</span> : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "voted"}
            className={`activity-tab-btn ${activeTab === "voted" ? "active" : ""}`}
            onClick={() => handleTabSwitch("voted")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
            <span>{t("activity.tabVoted")}</span>
            {votedTotal > 0 ? <span className="activity-count-badge">{votedTotal}</span> : null}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="view-scroll-frame">
        {activeTab === "created" ? (
          /* ================= CREATED POLLS TAB ================= */
          <div className="activity-tab-content">
            {pollFailure.message ? (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
                <p role="alert" style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>{pollFailure.message}</p>
              </div>
            ) : null}

            {/* Sub-Filters and Search Bar */}
            <div className="polls-filter-card" style={{ marginBottom: 20 }}>
              <div className="polls-filter-main-row">
                <div className="polls-search-wrap">
                  <svg
                    className="polls-search-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="search"
                    className="polls-search-input"
                    placeholder={t("dashboard.search")}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPollPage(1);
                    }}
                    aria-label={t("dashboard.search")}
                  />
                </div>

                <div className="polls-status-tabs" role="tablist" aria-label="Status filter">
                  {statusTabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={status === tab.value}
                      className={`polls-status-tab ${status === tab.value ? "active" : ""}`}
                      onClick={() => {
                        setStatus(tab.value);
                        setPollPage(1);
                      }}
                    >
                      {tab.dot && <span className="status-tab-dot" />}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                <Link to="/my-polls/new" className="polls-create-btn" style={{ marginLeft: "auto" }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>{t("polls.create")}</span>
                </Link>
              </div>
            </div>

            {/* List / Grid */}
            {pollLoading ? (
              <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                {t("common.loading")}
              </div>
            ) : createdPolls.length === 0 ? (
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
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  {t("polls.emptyMine")}
                </h3>
                <p style={{ margin: "0 0 20px 0", maxWidth: 440, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
                  {t("polls.emptyMineDesc")}
                </p>
                <Link to="/my-polls/new" className="view-btn view-btn-primary">
                  + {t("polls.create")}
                </Link>
              </div>
            ) : (
              <div className="polls-grid">
                {createdPolls.map((poll) => (
                  <MyPollCard key={poll.id} poll={poll} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {createdPages > 1 ? (
              <footer className="elections-pagination">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={pollPage <= 1}
                  onClick={() => setPollPage((p) => p - 1)}
                >
                  {t("common.previous")}
                </button>
                <span className="pagination-info">
                  {t("common.pageOf", { page: pollPage, pages: createdPages, total: createdTotal })}
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={pollPage >= createdPages}
                  onClick={() => setPollPage((p) => p + 1)}
                >
                  {t("common.next")}
                </button>
              </footer>
            ) : null}
          </div>
        ) : (
          /* ================= VOTED HISTORY TAB ================= */
          <div className="activity-tab-content">
            {voteFailure.message ? (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
                <p role="alert" style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>{voteFailure.message}</p>
              </div>
            ) : null}

            <div className="activity-privacy-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>{t("votes.note")}</span>
            </div>

            {voteLoading ? (
              <div className="saas-table-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                {t("common.loading")}
              </div>
            ) : votedItems.length === 0 ? (
              <div
                className="saas-table-card my-votes-empty"
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
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  {t("votes.empty")}
                </h3>
                <p style={{ margin: "0 0 22px 0", maxWidth: 440, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
                  Participate in open polls across the overview plaza to track your verified ballots and audit receipts here.
                </p>
                <Link
                  to="/overview"
                  className="view-btn view-btn-primary"
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 18px",
                    borderRadius: 9999,
                    fontWeight: 600,
                  }}
                >
                  {t("nav.overview")}
                </Link>
              </div>
            ) : (
              <>
                <div className="saas-table-card">
                  <table className="saas-table">
                    <thead>
                      <tr>
                        <th>{t("votes.poll")}</th>
                        <th>{t("votes.receipt")}</th>
                        <th>{t("votes.submitted")}</th>
                        <th style={{ textAlign: "right" }}>{t("votes.action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {votedItems.map((item) => (
                        <tr key={item.receipt_id}>
                          <td>
                            <strong style={{ color: "#0f172a" }}>{item.poll_title}</strong>
                          </td>
                          <td>
                            <span className="receipt-id-box" style={{ margin: 0 }}>{item.receipt_id}</span>
                          </td>
                          <td style={{ color: "#64748b", fontSize: "0.88rem" }}>
                            {formatHongKong(item.submitted_at)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="vote-delete-row-btn"
                              onClick={() => setRecordToDelete(item)}
                            >
                              {t("votes.deleteRecord")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Delete Confirmation Modal */}
                {recordToDelete ? (
                  <div
                    className="vote-delete-modal-backdrop"
                    onClick={() => setRecordToDelete(null)}
                  >
                    <div
                      className="vote-delete-modal-card"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h4 className="vote-delete-modal-title">{t("votes.deleteTitle")}</h4>
                      <p className="vote-delete-modal-text">{t("votes.deleteConfirm")}</p>
                      <p className="vote-delete-modal-hint">{t("votes.deleteHint")}</p>
                      <div className="vote-delete-modal-actions">
                        <button
                          type="button"
                          className="vote-delete-modal-cancel"
                          onClick={() => setRecordToDelete(null)}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className="vote-delete-modal-confirm"
                          onClick={() => {
                            const deleted = getDeletedReceipts(storageKey);
                            if (!deleted.includes(recordToDelete.receipt_id)) {
                              deleted.push(recordToDelete.receipt_id);
                              try {
                                localStorage.setItem(storageKey, JSON.stringify(deleted));
                              } catch {
                                // ignore
                              }
                            }
                            setVotedItems((prev) => prev.filter((i) => i.receipt_id !== recordToDelete.receipt_id));
                            setVotedTotal((prev) => Math.max(0, prev - 1));
                            setRecordToDelete(null);
                          }}
                        >
                          {t("votes.confirmDelete")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Pagination */}
                {votedPages > 1 ? (
                  <footer className="elections-pagination">
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={votePage <= 1}
                      onClick={() => setVotePage((p) => p - 1)}
                    >
                      {t("common.previous")}
                    </button>
                    <span className="pagination-info">
                      {t("common.pageOf", { page: votePage, pages: votedPages, total: votedTotal })}
                    </span>
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={votePage >= votedPages}
                      onClick={() => setVotePage((p) => p + 1)}
                    >
                      {t("common.next")}
                    </button>
                  </footer>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

