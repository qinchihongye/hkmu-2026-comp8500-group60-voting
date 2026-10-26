import { useEffect, useState } from "react";

import { getAuditEvents } from "../features/admin/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import { formatHongKong } from "../lib/time";
import type { AuditEventPublic } from "../lib/api-types";

const actions = ["", "CREATE", "UPDATE", "PUBLISH", "CLOSE", "VOTE_NAMED"];

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
  const [pollId, setPollId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditEventPublic[]>([]);
  const [total, setTotal] = useState(0);

  const pageSize = 12;

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
      });
    return () => {
      cancelled = true;
    };
  }, [page, pollId, action, setCause, clear]);

  return (
    <div className="view-root">
      <header className="view-header">
        <h1 className="view-title">{t("admin.auditTitle")}</h1>
        <p className="view-subtitle">
          {t("admin.auditNote")}
        </p>
      </header>

      {/* Filter Toolbar */}
      <div className="view-card" style={{ padding: "18px 24px", marginBottom: 20 }}>
        <form
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPage(1);
            setPollId(String(data.get("poll_id") ?? ""));
            setAction(String(data.get("action") ?? ""));
          }}
        >
          <label style={{ fontSize: "0.88rem", fontWeight: 700, color: "#334155" }}>
            {t("admin.pollId")}
            <input
              name="poll_id"
              defaultValue={pollId}
              inputMode="numeric"
              placeholder={t("admin.pollIdHint")}
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px solid #cbd5e1",
                fontSize: "0.92rem",
                marginTop: 4,
                width: 140,
                outline: "none",
              }}
            />
          </label>

          <label style={{ fontSize: "0.88rem", fontWeight: 700, color: "#334155" }}>
            {t("admin.action")}
            <select
              name="action"
              defaultValue={action}
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px solid #cbd5e1",
                fontSize: "0.92rem",
                marginTop: 4,
                minWidth: 160,
                outline: "none",
                background: "#ffffff",
              }}
            >
              {actions.map((item) => (
                <option key={item} value={item}>
                  {item ? (actionKeys[item] ? t(actionKeys[item]) : item) : t("action.all")}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="view-btn view-btn-primary"
            style={{ padding: "9px 20px", fontSize: "0.92rem" }}
          >
            {t("common.filter")}
          </button>
        </form>
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
                <th>{t("admin.time")}</th>
                <th>{t("admin.actor")}</th>
                <th>{t("admin.action")}</th>
                <th>{t("admin.poll")}</th>
                <th>{t("admin.receipt")}</th>
                <th>{t("admin.requestId")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                    {t("admin.emptyAudit")}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      {formatHongKong(item.created_at)}
                    </td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
                      {item.actor_id}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: "#eff6ff",
                          color: "#1363df",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                        }}
                      >
                        {actionKeys[item.action] ? t(actionKeys[item.action]) : item.action}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>#{item.poll_id}</td>
                    <td>
                      {item.receipt_id ? (
                        <span className="receipt-id-box" style={{ margin: 0, fontSize: "0.82rem" }}>
                          {item.receipt_id}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem", color: "#94a3b8" }}>
                      {item.request_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>{t("common.events", { total })}</p>
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
