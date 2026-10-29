import { useEffect, useState } from "react";
import { Alert } from "antd";

import { useFailure } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import type { DemoPollSummary } from "../../lib/api-types";
import { getDemoPolls } from "./api";
import { PollCard } from "./PollCard";

const pageSize = 8;

export function DemoPollSection() {
  const { t } = useI18n();
  const failure = useFailure("error.pollsLoad");
  const { setCause, clear } = failure;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DemoPollSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const queryKey = `${page}:${q}:${attempt}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void getDemoPolls({ page, page_size: pageSize, q })
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

  if (!loading && !failure.message && total === 0) {
    return null;
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="dashboard-board demo-polls" data-testid="demo-polls">
      <div className="demo-polls-head">
        <h2 className="demo-polls-title">{t("dashboard.demoTitle")}</h2>
        <button
          type="button"
          className="polls-page-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t("dashboard.demoHide") : t("dashboard.demoShow")}
        </button>
      </div>
      {expanded ? (
        <>
          <div className="dashboard-search-wrap demo-polls-search">
            <input
              type="text"
              placeholder={t("dashboard.demoSearch")}
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              className="dashboard-search-input"
            />
          </div>
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
            ) : (
              items.map((poll) => <PollCard key={poll.fixture_key} poll={poll} />)
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
        </>
      ) : null}
    </section>
  );
}
