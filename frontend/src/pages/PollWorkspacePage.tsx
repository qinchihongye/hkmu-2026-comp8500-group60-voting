import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ModeTags, StatusTag } from "../components/StatusTag";
import { closePoll, getOwnedPoll, getShareInfo, publishPoll } from "../features/creator/api";
import { SharePanel } from "../features/creator/SharePanel";
import { getResults } from "../features/polls/api";
import { ResultsPanel } from "../features/polls/ResultsPanel";
import { I18nError, useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { ApiCode } from "../lib/api-codes";
import { isApiClientError } from "../lib/api-error";
import { formatHongKong } from "../lib/time";
import type { ManagePollDetail, PollResults, ShareLink } from "../lib/api-types";

export function PollWorkspacePage() {
  const { t } = useI18n();
  const failure = useFailure("error.workspaceLoad");
  const { setCause, clear } = failure;
  const params = useParams();
  const pollId = Number(params.id);
  const [poll, setPoll] = useState<ManagePollDetail | null>(null);
  const [share, setShare] = useState<ShareLink | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((id: number) => {
    return getOwnedPoll(id).then(async (next) => {
      setPoll(next);
      if (next.lifecycle !== "DRAFT") {
        const link = await getShareInfo(id).catch(() => null);
        setShare(link);
      } else {
        setShare(null);
      }
      if (next.can_view_results) {
        const summary = await getResults(id).catch((caught: unknown) => {
          if (isApiClientError(caught) && caught.code === ApiCode.RESULTS_NOT_AVAILABLE) {
            return null;
          }
          throw caught;
        });
        setResults(summary);
      }
      clear();
    });
  }, [clear]);

  useEffect(() => {
    let cancelled = false;
    void load(pollId).catch((caught: unknown) => {
      if (!cancelled) {
        setCause(caught);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pollId, load, setCause]);

  async function act(kind: "publish" | "close") {
    if (!poll) {
      return;
    }
    setBusy(true);
    clear();
    try {
      const next = kind === "publish" ? await publishPoll(poll.id, poll.version) : await closePoll(poll.id, poll.version);
      setPoll(next);
      await load(next.id);
    } catch (caught) {
      setCause(isApiClientError(caught) ? caught : new I18nError("error.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (failure.message && !poll) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card" style={{ borderLeft: "4px solid #ef4444" }}>
          <p role="alert" style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>{failure.message}</p>
        </div>
      </div>
    );
  }
  if (!poll) {
    return (
      <div className="view-root" style={{ padding: "40px 0", textAlign: "center" }}>
        <p role="status" style={{ color: "#64748b", fontWeight: 600 }}>{t("common.loading")}</p>
      </div>
    );
  }
  return (
    <div className="view-root">
      <header className="view-header">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <StatusTag status={poll.effective_status} />
          <ModeTags identity={poll.identity_mode} visibility={poll.visibility} />
        </div>
        <h1 className="view-title">{poll.title}</h1>
        {poll.description ? <p className="view-subtitle">{poll.description}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 12, fontSize: "0.88rem", color: "#64748b" }}>
          <span>{formatHongKong(poll.starts_at)} {t("common.to")} {formatHongKong(poll.ends_at)}</span>
          <span>{t("workspace.version", { version: poll.version })}</span>
          {poll.has_access_password ? <span>{t("workspace.passcodeSet")}</span> : null}
        </div>
      </header>

      <div className="view-card">
        <div className="view-card-header">
          <div>
            <h2 className="view-card-title">{t("workspace.options")}</h2>
          </div>
          <span className="view-badge">{poll.options.length} {t("workspace.options")}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
          {poll.options
            .slice()
            .sort((left, right) => left.position - right.position)
            .map((option, index) => {
              const letter = String.fromCharCode(65 + (index % 26));
              return (
                <div
                  key={option.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "#e2e8f0",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "0.82rem",
                      fontWeight: 800,
                      color: "#475569",
                    }}
                  >
                    {letter}
                  </span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#1e293b" }}>{option.label}</span>
                </div>
              );
            })}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
          {poll.can_manage && poll.lifecycle === "DRAFT" ? (
            <Link
              to={`/my-polls/${poll.id}/edit`}
              className="view-btn view-btn-secondary"
              style={{ textDecoration: "none" }}
            >
              {t("workspace.editDraft")}
            </Link>
          ) : null}

          {poll.can_manage && poll.lifecycle === "DRAFT" ? (
            <button
              type="button"
              className="view-btn view-btn-primary"
              data-testid="publish"
              disabled={busy}
              onClick={() => void act("publish")}
            >
              {t("workspace.publish")}
            </button>
          ) : null}

          {poll.can_manage && poll.lifecycle === "PUBLISHED" ? (
            <button
              type="button"
              className="view-btn view-btn-secondary"
              style={{ borderColor: "#fecaca", color: "#dc2626" }}
              data-testid="close"
              disabled={busy}
              onClick={() => void act("close")}
            >
              {t("workspace.close")}
            </button>
          ) : null}
        </div>

        {failure.message ? (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
            <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: "0.9rem", fontWeight: 600 }}>{failure.message}</p>
          </div>
        ) : null}

        {poll.lifecycle === "DRAFT" ? (
          <p className="view-subtitle" style={{ fontSize: "0.88rem", marginTop: 16, color: "#92400e" }}>
            {t("workspace.publishFirst")}
          </p>
        ) : null}
      </div>

      {share ? (
        <SharePanel shareUrl={share.share_url} requiresPassword={share.requires_password} requiresLogin={share.requires_login} />
      ) : null}

      {results ? <ResultsPanel results={results} /> : null}
    </div>
  );
}
