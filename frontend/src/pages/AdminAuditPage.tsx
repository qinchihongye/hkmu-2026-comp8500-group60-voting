import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PageState } from "../components/PageState";
import { getAuditEvents } from "../features/admin/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import type { AuditEventPublic } from "../lib/api-types";
import { formatHongKong } from "../lib/time";
import "../styles/views.css";
import "../styles/polls.css";

const actions = ["", "CREATE", "PUBLISH", "CLOSE", "UPDATE", "VOTE_NAMED"];

const actionKeys: Record<string, MessageKey> = {
  CREATE: "action.create",
  UPDATE: "action.update",
  PUBLISH: "action.publish",
  CLOSE: "action.close",
  VOTE_NAMED: "action.voteNamed",
};

export function AdminAuditPage() {
  const { t } = useI18n();
  const failure = useFailure("error.auditLoad");
  const { setCause, clear } = failure;

  const [pollIdInput, setPollIdInput] = useState("");
  const [pollId, setPollId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditEventPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const pageSize = 12;

  // Auto-debounce poll ID search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setPollId(pollIdInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [pollIdInput]);

  const queryKey = `${page}:${pollId}:${action}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void getAuditEvents({
      page,
      page_size: pageSize,
      poll_id: pollId ? Number(pollId) : undefined,
      action: action || undefined,
    })
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
  }, [page, pollId, action, setCause, clear]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const renderActionBadge = (act: string) => {
    const label = actionKeys[act] ? t(actionKeys[act]) : act;
    let cls = "admin-audit-tag-create";
    if (act === "PUBLISH") cls = "admin-audit-tag-publish";
    else if (act === "CLOSE") cls = "admin-audit-tag-close";
    else if (act === "UPDATE") cls = "admin-audit-tag-update";
    else if (act === "VOTE_NAMED") cls = "admin-audit-tag-vote";

    return <span className={`admin-audit-tag ${cls}`}>{label}</span>;
  };

  return (
    <div className="admin-page-root">
      {/* Header Area */}
      <header className="admin-header">
        <div className="admin-header-title-area">
          <div className="admin-header-title-row">
            <h1 className="admin-page-title">{t("admin.auditTitle")}</h1>
            <span className="admin-readonly-pill">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>{t("admin.immutableBadge")}</span>
            </span>
          </div>
          <p className="admin-page-subtitle">{t("admin.auditNote")}</p>
        </div>

        <div className="admin-stat-chip">
          <span>{t("common.events", { total })}</span>
        </div>
      </header>

      {/* Modern Filter Toolbar */}
      <form
        className="polls-filter-card"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setPollId(pollIdInput.trim());
        }}
      >
        <div className="polls-filter-main-row" style={{ flexWrap: "wrap", gap: 14 }}>
          {/* Poll ID Input */}
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.82rem", fontWeight: 700, color: "#475569" }}>
            <span>{t("admin.pollId")}</span>
            <div className="admin-poll-input-wrap">
              <span style={{ color: "#94a3b8", fontWeight: 700 }}>#</span>
              <input
                name="poll_id"
                type="text"
                inputMode="numeric"
                className="admin-poll-input"
                placeholder={t("admin.pollIdHint")}
                value={pollIdInput}
                onChange={(event) => {
                  setPollIdInput(event.target.value);
                }}
              />
            </div>
          </label>

          {/* Filter Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
            <button type="submit" className="admin-filter-submit-btn">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{t("common.filter")}</span>
            </button>

            {pollId || pollIdInput || action ? (
              <button
                type="button"
                className="admin-clear-filter-btn"
                onClick={() => {
                  setPollIdInput("");
                  setPollId("");
                  setAction("");
                  setPage(1);
                }}
              >
                {t("admin.reset")}
              </button>
            ) : null}
          </div>
        </div>

        {/* Action Quick Filter Tabs */}
        <div className="polls-status-tabs">
          {actions.map((item) => (
            <button
              key={item}
              type="button"
              className={`polls-tab-btn ${action === item ? "active" : ""}`}
              onClick={() => {
                setPage(1);
                setAction(item);
              }}
            >
              <span>{item ? (actionKeys[item] ? t(actionKeys[item]) : item) : t("action.all")}</span>
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
                <span className="polls-empty-icon">🛡️</span>
                <p className="polls-empty-text">{t("admin.emptyAudit")}</p>
                {pollId || action ? (
                  <button
                    type="button"
                    className="admin-clear-filter-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setPollIdInput("");
                      setPollId("");
                      setAction("");
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
                    <th>{t("admin.time")}</th>
                    <th>{t("admin.action")}</th>
                    <th>{t("admin.actor")}</th>
                    <th>{t("admin.poll")}</th>
                    <th>{t("admin.receipt")}</th>
                    <th>{t("admin.requestId")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} data-testid="audit-row">
                      {/* 1. Time */}
                      <td>
                        <span className="admin-audit-time">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 14 14" />
                          </svg>
                          <span>{formatHongKong(item.created_at)}</span>
                        </span>
                      </td>

                      {/* 2. Action */}
                      <td>{renderActionBadge(item.action)}</td>

                      {/* 3. Actor */}
                      <td>
                        <span className="admin-creator-chip">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>User #{item.actor_id}</span>
                        </span>
                      </td>

                      {/* 4. Target Poll */}
                      <td>
                        <Link to={`/admin/polls/${item.poll_id}`} className="admin-audit-poll-link" title={t("admin.inspect")}>
                          #{item.poll_id}
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </Link>
                      </td>

                      {/* 5. Receipt */}
                      <td>
                        {item.receipt_id ? (
                          <span className="admin-audit-receipt" title={item.receipt_id}>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span>{item.receipt_id}</span>
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>

                      {/* 6. Request ID */}
                      <td>
                        <span
                          className="admin-audit-request-id"
                          title={item.request_id}
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="4 17 10 11 4 5" />
                            <line x1="12" y1="19" x2="20" y2="19" />
                          </svg>
                          <span>
                            {item.request_id.length > 18
                              ? `${item.request_id.slice(0, 8)}…${item.request_id.slice(-6)}`
                              : item.request_id}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
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
