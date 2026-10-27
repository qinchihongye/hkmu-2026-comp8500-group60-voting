import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ResultsPanel } from "../features/polls/ResultsPanel";
import { getResults } from "../features/polls/api";
import { resolveShare } from "../features/poll-access/api";
import { I18nError, useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { ApiCode } from "../lib/api-codes";
import { isApiClientError } from "../lib/api-error";
import type { PollResults } from "../lib/api-types";

export function PollResultPage() {
  const { t } = useI18n();
  const failure = useFailure("error.resultsLoad");
  const { setCause, clear } = failure;
  const params = useParams();
  const [results, setResults] = useState<PollResults | null>(null);
  const [loading, setLoading] = useState(true);
  const shareCode = params.shareCode;
  const queryKey = `${params.id ?? ""}:${shareCode ?? ""}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
    setResults(null);
    clear();
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pollId = shareCode ? (await resolveShare(shareCode)).poll_id : Number(params.id);
        const next = await getResults(pollId);
        if (!cancelled) {
          setResults(next);
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
  }, [params.id, shareCode, setCause, clear]);

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
            <Link to="/public-polls" className="view-btn view-btn-secondary" style={{ textDecoration: "none" }}>
              {t("resultPage.plaza")}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return results ? (
    <div className="view-root">
      <div style={{ marginBottom: 16 }}>
        <Link to={shareCode ? `/s/${shareCode}` : `/polls/${params.id}`} className="view-btn view-btn-secondary" style={{ padding: "8px 16px", fontSize: "0.88rem", textDecoration: "none" }}>
          {t("resultPage.back")}
        </Link>
      </div>
      <ResultsPanel results={results} />
    </div>
  ) : null;
}
