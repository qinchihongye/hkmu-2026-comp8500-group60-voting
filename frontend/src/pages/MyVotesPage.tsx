import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../features/auth/AuthProvider";
import { getMyVotes } from "../features/polls/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { formatHongKong } from "../lib/time";
import type { MyVote } from "../lib/api-types";

function getDeletedReceipts(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function MyVotesPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const failure = useFailure("error.votesLoad");
  const { setCause, clear } = failure;
  const [items, setItems] = useState<MyVote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [recordToDelete, setRecordToDelete] = useState<MyVote | null>(null);
  const pageSize = 12;

  const storageKey = auth.user
    ? `votenow_deleted_votes_${auth.user.username}`
    : "votenow_deleted_votes_guest";

  useEffect(() => {
    let cancelled = false;
    void getMyVotes({ page, page_size: pageSize })
      .then((result) => {
        if (!cancelled) {
          const deleted = getDeletedReceipts(storageKey);
          const filtered = result.items.filter((item) => !deleted.includes(item.receipt_id));
          setItems(filtered);
          setTotal(Math.max(0, result.total - deleted.length));
          clear();
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setCause(caught);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, storageKey, setCause, clear]);

  return (
    <div className="view-root">
      <header className="view-header">
        <h1 className="view-title">{t("votes.title")}</h1>
        <p className="view-subtitle">
          {t("votes.note")}
        </p>
      </header>

      {failure.message ? (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
          <p role="alert" style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>{failure.message}</p>
        </div>
      ) : null}

      {/* Independent Scrolling Frame */}
      <div className="view-scroll-frame">
        {total === 0 && items.length === 0 ? (
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
                <path d="m9 12 2 2 4-4"/>
                <path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/>
                <path d="M22 19H2"/>
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="7" height="7" x="3" y="3" rx="1"/>
                <rect width="7" height="7" x="14" y="3" rx="1"/>
                <rect width="7" height="7" x="14" y="14" rx="1"/>
                <rect width="7" height="7" x="3" y="14" rx="1"/>
              </svg>
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
                  {items.map((item) => (
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
                        setItems((prev) => prev.filter((i) => i.receipt_id !== recordToDelete.receipt_id));
                        setTotal((prev) => Math.max(0, prev - 1));
                        setRecordToDelete(null);
                      }}
                    >
                      {t("votes.confirmDelete")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>{t("common.records", { total })}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="view-btn view-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  {t("common.previous")}
                </button>
                <button
                  type="button"
                  className="view-btn view-btn-secondary"
                  disabled={page * pageSize >= total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
