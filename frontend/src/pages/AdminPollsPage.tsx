import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ModeTags, StatusTag } from "../components/StatusTag";
import { PollFilters } from "../features/creator/PollFilters";
import { getAdminPolls } from "../features/admin/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { ManagePollSummary } from "../lib/api-types";

export function AdminPollsPage() {
  const { t } = useI18n();
  const failure = useFailure("error.adminLoad");
  const { setCause, clear } = failure;
  const statuses = [
    { value: "", label: t("status.all") },
    { value: "DRAFT", label: t("status.draft") },
    { value: "SCHEDULED", label: t("status.scheduled") },
    { value: "OPEN", label: t("status.open") },
    { value: "CLOSED", label: t("status.closed") },
  ];
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ManagePollSummary[]>([]);
  const [total, setTotal] = useState(0);


  useEffect(() => {
    let cancelled = false;
    void getAdminPolls({ page, page_size: 12, q, status: status || undefined })
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
  }, [page, q, status, setCause, clear]);

  return (
    <div className="view-root">
      <header className="view-header">
        <h1 className="view-title">{t("admin.title")}</h1>
        <p className="view-subtitle">
          {t("admin.note")}
        </p>
      </header>

      <div style={{ marginBottom: 20 }}>
        <PollFilters
          q={q}
          status={status}
          statuses={statuses}
          onChange={(next) => {
            setPage(1);
            setQ(next.q);
            setStatus(next.status);
          }}
        />
      </div>

      {failure.message ? (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
          <p role="alert" style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>{failure.message}</p>
        </div>
      ) : null}

      {/* Independent Scrolling Frame */}
      <div className="view-scroll-frame">
        <div className="saas-table-card">
          <table className="saas-table">
            <thead>
              <tr>
                <th>{t("admin.titleCol")}</th>
                <th>{t("admin.mode")}</th>
                <th>{t("admin.status")}</th>
                <th>{t("admin.creator")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                    {t("admin.empty")}
                  </td>
                </tr>
              ) : (
                items.map((poll) => (
                  <tr key={poll.id}>
                    <td>
                      <Link
                        to={`/admin/polls/${poll.id}`}
                        style={{ color: "#1363df", fontWeight: 700, textDecoration: "none" }}
                      >
                        {poll.title}
                      </Link>
                    </td>
                    <td>
                      <ModeTags identity={poll.identity_mode} visibility={poll.visibility} />
                    </td>
                    <td>
                      <StatusTag status={poll.effective_status} />
                    </td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.88rem", color: "#64748b" }}>
                      #{poll.creator_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>{t("common.pageOf", { page, pages: Math.max(1, Math.ceil(total / 12)), total })}</p>
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
              disabled={page * 12 >= total}
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
