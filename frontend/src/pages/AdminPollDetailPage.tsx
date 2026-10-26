import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ModeTags, StatusTag } from "../components/StatusTag";
import { getAdminPoll } from "../features/admin/api";
import { getResults } from "../features/polls/api";
import { ResultsPanel } from "../features/polls/ResultsPanel";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import type { ManagePollDetail, PollResults } from "../lib/api-types";

export function AdminPollDetailPage() {
  const { t } = useI18n();
  const failure = useFailure("error.adminDetail");
  const { setCause, clear } = failure;
  const params = useParams();
  const pollId = Number(params.id);
  const [poll, setPoll] = useState<ManagePollDetail | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await getAdminPoll(pollId);
        const summary = next.can_view_results ? await getResults(pollId) : null;
        if (!cancelled) {
          setPoll(next);
          setResults(summary);
          clear();
        }
      } catch (caught) {
        if (!cancelled) {
          setCause(caught);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pollId, setCause, clear]);

  if (failure.message) {
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
        <p className="view-subtitle">{t("admin.creatorLine", { id: poll.creator_id, version: poll.version })}</p>
      </header>

      <div className="view-card">
        <div className="view-card-header">
          <div>
            <h2 className="view-card-title">{t("admin.options")}</h2>
          </div>
          <span className="view-badge">{poll.options.length} {t("admin.options")}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 20 }}>
          {poll.options.map((option, index) => {
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

        <div style={{ paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
          {poll.can_manage ? (
            <Link
              to={`/my-polls/${poll.id}`}
              className="view-btn view-btn-primary"
              style={{ textDecoration: "none" }}
            >
              {t("admin.openWorkspace")}
            </Link>
          ) : (
            <p className="view-subtitle" style={{ margin: 0, fontSize: "0.88rem" }}>
              {t("admin.notOwner")}
            </p>
          )}
        </div>
      </div>

      {results ? <ResultsPanel results={results} /> : null}
    </div>
  );
}
