import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { exportPollResultsToExcel } from "../features/polls/export-excel";
import { getPoll, getResults } from "../features/polls/api";
import { ResultsPanel } from "../features/polls/ResultsPanel";
import { ShareCardModal } from "../features/polls/ShareCardModal";
import { resolveShare } from "../features/poll-access/api";
import { I18nError, useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { ApiCode } from "../lib/api-codes";
import { isApiClientError } from "../lib/api-error";
import type { PollDetail, PollResults } from "../lib/api-types";

export function PollResultPage() {
  const { locale, t } = useI18n();
  const failure = useFailure("error.resultsLoad");
  const { setCause, clear } = failure;
  const params = useParams();
  const [results, setResults] = useState<PollResults | null>(null);
  const [pollDetail, setPollDetail] = useState<PollDetail | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const shareCode = params.shareCode;
  const queryKey = `${params.id ?? ""}:${shareCode ?? ""}:${reloadTick}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
    setResults(null);
    clear();
  }

  const refresh = () => setReloadTick((tick) => tick + 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pollId = shareCode ? (await resolveShare(shareCode)).poll_id : Number(params.id);
        const [next, poll] = await Promise.all([
          getResults(pollId),
          getPoll(pollId).catch(() => null),
        ]);
        if (!cancelled) {
          setResults(next);
          setPollDetail(poll);
          clear();
        }
      } catch (caught) {
        if (cancelled) {
          return;
        }
        if (isApiClientError(caught) && caught.code === ApiCode.RESULTS_NOT_AVAILABLE) {
          setCause(new I18nError("error.resultsHidden"));
        } else if (isApiClientError(caught) && caught.code === ApiCode.UNAUTHENTICATED) {
          setCause(new I18nError("error.resultsLogin"));
        } else {
          setCause(caught);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, shareCode, reloadTick, setCause, clear]);

  if (loading) {
    return (
      <div className="view-root" style={{ padding: "40px 0", textAlign: "center" }}>
        <p role="status" style={{ color: "#64748b", fontWeight: 600 }}>{t("common.loading")}</p>
      </div>
    );
  }
  if (failure.message) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card" style={{ textAlign: "center", padding: "36px 24px" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fef2f2", color: "#dc2626", display: "grid", placeItems: "center", fontSize: "1.6rem", margin: "0 auto 16px" }}>
            ⚠️
          </div>
          <h1 className="view-title" style={{ fontSize: "1.5rem", marginBottom: 12 }}>{failure.message}</h1>
          <p className="view-subtitle" style={{ marginBottom: 20 }}>
            {shareCode ? t("resultPage.privateHint") : t("resultPage.hiddenHint")}
          </p>
          {shareCode ? (
            <Link to={`/s/${shareCode}`} className="view-btn view-btn-primary" style={{ textDecoration: "none" }}>
              {t("resultPage.back")}
            </Link>
          ) : (
            <Link to="/overview" className="view-btn view-btn-secondary" style={{ textDecoration: "none" }}>
              {t("resultPage.plaza")}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return results ? (
    <div className="view-root">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <Link to={shareCode ? `/s/${shareCode}` : `/polls/${params.id}`} className="view-btn view-btn-secondary" style={{ padding: "8px 16px", fontSize: "0.88rem", textDecoration: "none" }}>
          {t("resultPage.back")}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {results.is_final ? (
            <>
              {/* Share PNG Card Button */}
              <button
                type="button"
                className="view-btn view-btn-primary"
                onClick={() => setShareModalOpen(true)}
                style={{ padding: "8px 16px", fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                data-testid="share-image-btn"
              >
                <span>🖼️</span>
                <span>{t("resultPage.shareImage")}</span>
              </button>

              {/* Export Excel Button */}
              <button
                type="button"
                className="view-btn view-btn-secondary"
                onClick={() => exportPollResultsToExcel(results, pollDetail, locale)}
                style={{ padding: "8px 16px", fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                data-testid="export-excel-btn"
              >
                <span>📊</span>
                <span>{t("resultPage.exportExcel")}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="view-btn view-btn-secondary"
                onClick={refresh}
                style={{ padding: "8px 16px", fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>🔄</span>
                <span>{t("common.refresh")}</span>
              </button>
              <button
                type="button"
                className="view-btn view-btn-secondary"
                onClick={() => exportPollResultsToExcel(results, pollDetail, locale)}
                style={{ padding: "8px 16px", fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                data-testid="export-excel-btn"
              >
                <span>📊</span>
                <span>{t("resultPage.exportExcel")}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <header className="view-header" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              background: results.is_final ? "#f1f5f9" : "#ecfdf5",
              color: results.is_final ? "#475569" : "#059669",
              border: `1px solid ${results.is_final ? "#e2e8f0" : "#a7f3d0"}`
            }}
          >
            {results.is_final ? t("results.finalTitle") : t("results.liveTitle")}
          </span>
          <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 500 }}>
            {t("results.updatedAt", {
              time: new Date(results.server_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
            })}
          </span>
        </div>
        <h1 className="view-title" style={{ fontSize: "1.75rem", marginBottom: 6 }}>
          {results.poll_title || t("results.titleFallback")}
        </h1>
      </header>

      <ResultsPanel results={results} />

      {shareModalOpen && (
        <ShareCardModal
          results={results}
          pollDetail={pollDetail}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </div>
  ) : null;
}
