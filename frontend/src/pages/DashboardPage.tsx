import { useEffect, useState } from "react";
import { Alert } from "antd";

import { useAuth } from "../features/auth/AuthProvider";
import { getMyVotes, getPolls } from "../features/polls/api";
import { DemoPollSection } from "../features/polls/DemoPollSection";
import { PollCard } from "../features/polls/PollCard";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { PollSummary } from "../lib/api-types";
import "../styles/dashboard.css";
import "../styles/polls.css";

const pageSize = 8;

export function DashboardPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const failure = useFailure("error.pollsLoad");
  const { setCause, clear } = failure;
  const [openTotal, setOpenTotal] = useState<number | null>(null);
  const [namedTotal, setNamedTotal] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PollSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const queryKey = `${page}:${q}:${attempt}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void getPolls({ page: 1, page_size: 1, status: "OPEN" })
      .then((result) => {
        if (!cancelled) {
          setOpenTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenTotal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }
    let cancelled = false;
    void getMyVotes({ page: 1, page_size: 1 })
      .then((result) => {
        if (!cancelled) {
          setNamedTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNamedTotal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  useEffect(() => {
    let cancelled = false;
    void getPolls({ page, page_size: pageSize, q })
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
          setItems([]);
          setTotal(0);
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
  }, [page, q, attempt, setCause, clear]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="dashboard-root" data-testid="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title-area">
          <h1 className="dashboard-heading">{t("dashboard.title")}</h1>
          <p style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
            {t("dashboard.note")}
          </p>
        </div>

        <div className="dashboard-header-right">
          <div className="dashboard-stats-strip">
            <div className="dashboard-stat-chip">
              <span>{t("dashboard.openPolls")}</span>
              <strong data-testid="open-total">{openTotal ?? "—"}</strong>
            </div>

            {auth.status === "authenticated" ? (
              <div className="dashboard-stat-chip">
                <span>{t("dashboard.myVotes")}</span>
                <strong data-testid="named-total">{namedTotal ?? "—"}</strong>
              </div>
            ) : null}
          </div>

          <div className="dashboard-search-wrap">
            <svg
              className="dashboard-search-icon"
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
              type="text"
              placeholder={t("dashboard.search")}
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              className="dashboard-search-input"
            />
          </div>
        </div>
      </header>

      {auth.status === "authenticated" ? <DemoPollSection /> : null}

      <div className="dashboard-board">
        <div className="dashboard-grid">
          {loading ? (
            <div className="dashboard-span" role="status">
              {t("common.loading")}
            </div>
          ) : failure.message ? (
            <div className="dashboard-span">
              <Alert type="error" showIcon title={failure.message} />
              <button type="button" className="polls-page-btn" onClick={() => setAttempt((value) => value + 1)}>
                {t("access.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="polls-empty-card dashboard-span">
              <span className="polls-empty-icon">🗳️</span>
              <p className="polls-empty-text">{t("polls.emptyPublic")}</p>
              <span style={{ fontSize: "0.88rem", color: "#94a3b8" }}>{t("polls.emptyPublicHint")}</span>
            </div>
          ) : (
            items.map((poll) => <PollCard key={poll.id} poll={poll} />)
          )}
        </div>

        {!loading && !failure.message && total > pageSize ? (
          <div className="polls-pagination-bar">
            <span>{t("common.pageOf", { page, pages, total })}</span>
            <div className="polls-page-btn-group">
              <button type="button" className="polls-page-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                {t("common.previous")}
              </button>
              <button type="button" className="polls-page-btn" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
                {t("common.next")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
