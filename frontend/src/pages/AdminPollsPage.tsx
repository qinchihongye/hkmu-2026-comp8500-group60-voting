import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PageState } from "../components/PageState";
import { getAdminPolls } from "../features/admin/api";
import { pollScheduleText } from "../features/polls/scheduleLabel";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { ManagePollSummary } from "../lib/api-types";
import "../styles/views.css";
import "../styles/polls.css";

export function AdminPollsPage() {
  const { locale, t } = useI18n();
  const failure = useFailure("error.adminLoad");
  const { setCause, clear } = failure;

  const statuses = [
    { value: "", label: t("status.all") },
    { value: "OPEN", label: t("status.open"), dot: true },
    { value: "SCHEDULED", label: t("status.scheduled") },
    { value: "CLOSED", label: t("status.closed") },
    { value: "DRAFT", label: t("status.draft") },
  ];

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ManagePollSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 12;

  // Auto-debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  const queryKey = `${page}:${q}:${status}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void getAdminPolls({ page, page_size: pageSize, q, status: status || undefined })
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
    <div className="admin-page-root">
      {/* Header Area */}
      <header className="admin-header">
        <div className="admin-header-title-area">
          <div className="admin-header-title-row">
            <h1 className="admin-page-title">{t("admin.title")}</h1>
            <span className="admin-readonly-pill">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>{t("admin.readOnlyBadge")}</span>
            </span>
          </div>
          <p className="admin-page-subtitle">{t("admin.note")}</p>
        </div>

        <div className="admin-stat-chip">
          <span>{t("admin.totalPolls")}</span>
          <strong>{total}</strong>
        </div>
      </header>

      {/* Modern Filter Toolbar */}
      <form
        className="polls-filter-card"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQ(qInput.trim());
        }}
      >
        <div className="polls-filter-main-row" style={{ flexWrap: "wrap", gap: 12 }}>
          {/* Accessible Label wrapping Search Input */}
          <label className="admin-search-label">
            <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
              {t("common.searchTitle")}
            </span>
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
              name="q"
              type="text"
              className="polls-search-input"
              aria-label={t("common.searchTitle")}
              placeholder={t("common.searchTitle")}
              value={qInput}
              onChange={(event) => {
                setQInput(event.target.value);
              }}
            />
          </label>

          <button type="submit" className="admin-filter-submit-btn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>{t("common.filter")}</span>
          </button>

          {q || qInput || status ? (
            <button
              type="button"
              className="admin-clear-filter-btn"
              onClick={() => {
                setQInput("");
                setQ("");
                setStatus("");
                setPage(1);
              }}
            >
              {t("admin.reset")}
            </button>
          ) : null}
        </div>

        {/* Status Segmented Tabs */}
        <div className="polls-status-tabs">
          {statuses.map((tab) => (
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
      </form>

      {/* Independent Scrolling Frame */}
      <div className="polls-scroll-frame">
        <PageState
          loading={loading}
          error={failure.message}
          empty={
            !loading && items.length === 0 ? (
              <div className="polls-empty-card">
                <span className="polls-empty-icon">🔍</span>
                <p className="polls-empty-text">{t("admin.empty")}</p>
                {q || status ? (
                  <button
                    type="button"
                    className="admin-clear-filter-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setQInput("");
                      setQ("");
                      setStatus("");
                      setPage(1);
                    }}
                  >
                    {t("admin.reset")}
                  </button>
                ) : null}
              </div>
            ) : null
          }
        >
          <div className="admin-table-card">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("admin.titleCol")}</th>
                    <th>{t("admin.mode")}</th>
                    <th>{t("admin.status")}</th>
                    <th>{t("admin.ballotsCol")}</th>
                    <th>{t("admin.creator")}</th>
                    <th>{t("admin.actionsCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((poll) => {
                    const isDraft = poll.lifecycle === "DRAFT";
                    const isOpen = !isDraft && poll.effective_status === "OPEN";
                    const isClosed = !isDraft && poll.effective_status === "CLOSED";
                    const isScheduled = !isDraft && poll.effective_status === "SCHEDULED";
                    const isPrivate = poll.visibility === "PRIVATE";

                    const statusBadgeType = isDraft ? "draft" : isClosed ? "closed" : isScheduled ? "scheduled" : "open";
                    const statusLabel = isDraft
                      ? locale === "zh"
                        ? "草稿"
                        : "DRAFT"
                      : isClosed
                        ? locale === "zh"
                          ? "已结束"
                          : "CLOSED"
                        : isScheduled
                          ? locale === "zh"
                            ? "未开始"
                            : "SCHEDULED"
                          : locale === "zh"
                            ? "进行中"
                            : "OPEN";

                    const identity = poll.identity_mode === "NAMED" ? t("identity.named") : t("identity.anonymous");
                    const visibility = isPrivate ? t("visibility.private") : t("visibility.public");
                    const choice = poll.selection_mode === "MULTIPLE" ? t("polls.multipleChoice") : t("polls.singleChoice");

                    const hasVoteLimit = poll.vote_limit != null && poll.vote_limit > 0;
                    const percent = hasVoteLimit
                      ? Math.min(100, Math.max(0, Math.floor(((poll.ballot_count ?? 0) / poll.vote_limit!) * 100)))
                      : 0;

                    return (
                      <tr key={poll.id} data-testid="admin-poll-row">
                        {/* 1. Title Column */}
                        <td>
                          <div className="admin-title-cell">
                            <Link to={`/admin/polls/${poll.id}`} className="admin-title-link">
                              {poll.title}
                            </Link>
                            <div className="admin-title-meta">
                              <span className="admin-id-badge">#{poll.id}</span>
                              <span>
                                {isDraft
                                  ? locale === "zh"
                                    ? "草稿待发布"
                                    : "Draft not yet published"
                                  : pollScheduleText(poll, locale, t)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Rules / Mode Column */}
                        <td>
                          <div className="admin-mode-cell">
                            <div className="admin-mode-pill-row">
                              <span className={`admin-pill ${poll.identity_mode === "NAMED" ? "admin-pill-named" : "admin-pill-anon"}`}>
                                {identity}
                              </span>
                              <span className={`admin-pill ${isPrivate ? "admin-pill-private" : "admin-pill-public"}`}>
                                {isPrivate ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    width="11"
                                    height="11"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                ) : null}
                                <span>{visibility}</span>
                              </span>
                            </div>
                            <div className="admin-mode-pill-row">
                              <span className="admin-pill admin-pill-choice">
                                {choice}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 3. Status Column */}
                        <td>
                          <span className={`plaza-status-badge plaza-status-${statusBadgeType}`}>
                            {isScheduled ? (
                              <svg
                                className="plaza-status-icon"
                                viewBox="0 0 24 24"
                                width="13"
                                height="13"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 14 14" />
                              </svg>
                            ) : null}
                            <span>{statusLabel}</span>
                            {isOpen || isClosed ? <span className="plaza-status-dot" /> : null}
                          </span>
                        </td>

                        {/* 4. Ballots Column */}
                        <td>
                          <div className="admin-ballots-cell">
                            {hasVoteLimit ? (
                              <>
                                <div className="admin-ballots-text">
                                  {poll.ballot_count} / {poll.vote_limit}
                                </div>
                                <div className="admin-ballots-sub">
                                  {percent}% · {t("polls.ballotsReceived")}
                                </div>
                                <div className="admin-ballots-bar">
                                  <div className="admin-ballots-bar-fill" style={{ width: `${percent}%` }} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="admin-ballots-text">
                                  {poll.ballot_count} {t("form.voteUnit")}
                                </div>
                                <div className="admin-ballots-sub">
                                  {t("polls.unlimitedBallots")}
                                </div>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 5. Creator Column */}
                        <td>
                          <span className="admin-creator-chip">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>#{poll.creator_id}</span>
                          </span>
                        </td>

                        {/* 6. Actions Column */}
                        <td>
                          <div className="admin-actions-cell">
                            <Link to={`/admin/polls/${poll.id}`} className="admin-action-btn admin-action-btn-inspect">
                              {t("admin.inspect")}
                            </Link>
                            {!isDraft ? (
                              <Link to={`/polls/${poll.id}/results`} className="admin-action-btn admin-action-btn-results">
                                {t("admin.results")}
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </PageState>

        {/* Pagination Bar */}
        {total > pageSize ? (
          <div className="polls-pagination-bar">
            <span>{t("common.pageOf", { page, pages, total })}</span>
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
