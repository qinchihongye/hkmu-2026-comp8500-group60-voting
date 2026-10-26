import { useEffect, useState } from "react";

import { getMyVotes } from "../features/polls/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { formatHongKong } from "../lib/time";
import type { MyVote } from "../lib/api-types";

export function MyVotesPage() {
  const { t } = useI18n();
  const failure = useFailure("error.votesLoad");
  const { setCause, clear } = failure;
  const [items, setItems] = useState<MyVote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    let cancelled = false;
    void getMyVotes({ page, page_size: pageSize })
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
      });
    return () => {
      cancelled = true;
    };
  }, [page, setCause, clear]);

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

      {/* Independent Scrolling Frame (The Red Box Scroll Frame) */}
      <div className="view-scroll-frame">
        <div className="saas-table-card">
          <table className="saas-table">
            <thead>
              <tr>
                <th>{t("votes.poll")}</th>
                <th>{t("votes.receipt")}</th>
                <th>{t("votes.submitted")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                    {t("votes.empty")}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
      </div>
    </div>
  );
}
