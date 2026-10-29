import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { ModeTags, StatusTag } from "../../components/StatusTag";
import { useFailure } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import { ApiCode } from "../../lib/api-codes";
import { isApiClientError } from "../../lib/api-error";
import type { PollDetail, PollResults, VoteReceipt } from "../../lib/api-types";
import { formatHongKong } from "../../lib/time";
import { unlockPoll } from "../poll-access/api";
import { useGuest } from "../poll-access/GuestProvider";
import type { PollAccessView } from "../poll-access/usePollAccess";
import { castVote, getPoll, getResults } from "./api";
import { BallotForm } from "./BallotForm";
import { ResultsPanel } from "./ResultsPanel";

function InlinePasscodeForm({
  pollId,
  shareCode,
  onUnlocked,
}: {
  pollId: number;
  shareCode: string;
  onUnlocked: () => void;
}) {
  const { t } = useI18n();
  const guest = useGuest();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const failure = useFailure("error.unlockFailed");
  const { setCause, clear } = failure;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password.trim() || busy) {
      return;
    }
    setBusy(true);
    clear();
    try {
      await guest.ensureGuest();
      await unlockPoll(pollId, { share_code: shareCode, password });
      onUnlocked();
    } catch (caught) {
      setCause(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 360, margin: "16px auto 0", textAlign: "left" }}>
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="inline-passcode-input"
          style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}
        >
          {t("access.field")}
        </label>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <input
            id="inline-passcode-input"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("access.placeholder")}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 42px 10px 14px",
              borderRadius: 10,
              border: failure.message ? "1.5px solid #ef4444" : "1.5px solid #cbd5e1",
              fontSize: "0.95rem",
              outline: "none",
              boxSizing: "border-box",
            }}
            disabled={busy}
          />
          <button
            type="button"
            aria-label={showPassword ? t("common.hidePasscode") : t("common.showPasscode")}
            onClick={() => setShowPassword((prev) => !prev)}
            style={{
              position: "absolute",
              right: 10,
              background: "none",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "#64748b",
              display: "grid",
              placeItems: "center",
            }}
          >
            {showPassword ? "👁️" : "👁️‍🗨️"}
          </button>
        </div>
        {failure.message ? (
          <p role="alert" style={{ margin: "6px 0 0 0", color: "#dc2626", fontSize: "0.82rem", fontWeight: 600 }}>
            {failure.message}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="view-btn view-btn-primary"
        disabled={busy || !password.trim()}
        style={{ width: "100%", padding: "10px", fontSize: "0.95rem", justifyContent: "center" }}
      >
        {busy ? t("access.unlocking") : t("access.unlock")}
      </button>
    </form>
  );
}

export function ParticipationPanel({
  access,
  resultsHref,
}: {
  access: PollAccessView;
  resultsHref: string;
}) {
  const { t } = useI18n();
  const guest = useGuest();
  const location = useLocation();
  const params = useParams();
  const detail = access.detail;
  const [kept, setKept] = useState<{ pollId: number; receipt: VoteReceipt } | null>(null);
  const keptReceipt = detail && kept?.pollId === detail.id ? kept.receipt : null;
  const next = `${location.pathname}${location.search}`;
  const startKey = detail ? `${detail.id}:${detail.starts_at}` : "";
  const startsAt = detail?.starts_at ?? null;
  const pollStatus = detail?.effective_status ?? null;
  const serverTime = detail?.server_time ?? null;
  const reloadAccess = access.reload;
  const refreshedStart = useRef<string | null>(null);
  useEffect(() => {
    if (pollStatus !== "SCHEDULED" || startsAt === null || serverTime === null) {
      return;
    }
    const startMs = Date.parse(startsAt);
    const serverMs = Date.parse(serverTime);
    if (Number.isNaN(startMs) || Number.isNaN(serverMs)) {
      return;
    }
    const delay = startMs - serverMs;
    if (delay <= 0) {
      if (refreshedStart.current === startKey) {
        return;
      }
      refreshedStart.current = startKey;
      reloadAccess();
      return;
    }
    const timer = window.setTimeout(() => {
      refreshedStart.current = startKey;
      reloadAccess();
    }, Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [pollStatus, startsAt, serverTime, startKey, reloadAccess]);
  if (access.phase === "access_loading") {
    return (
      <div className="view-root" style={{ padding: "40px 0", textAlign: "center" }}>
        <p role="status" style={{ color: "#64748b", fontWeight: 600 }}>{t("access.loading")}</p>
      </div>
    );
  }
  if (
    access.phase === "access_failed" ||
    (access.error && access.phase !== "password_required" && access.phase !== "login_required")
  ) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card" style={{ borderLeft: "4px solid #ef4444" }}>
          <h2 style={{ margin: "0 0 8px 0", color: "#dc2626" }}>{t("access.loadFailed")}</h2>
          <p role="alert" style={{ margin: "0 0 16px 0", color: "#64748b" }}>{access.error ?? t("error.pollLoad")}</p>
          <button type="button" className="view-btn view-btn-secondary" onClick={() => access.reload()}>
            {t("access.retry")}
          </button>
        </div>
      </div>
    );
  }
  if (access.phase === "login_required") {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 40 }}>
        <div className="view-card" style={{ textAlign: "center", padding: "40px 28px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#eff6ff", color: "#1363df", display: "grid", placeItems: "center", fontSize: "1.75rem", margin: "0 auto 16px" }}>
            👤
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 10px 0", color: "#0f172a" }}>{t("access.signInTitle")}</h1>
          <p className="view-subtitle" style={{ maxWidth: 460, margin: "0 auto 24px" }}>
            {access.accountExpired ? t("access.sessionExpired") : t("access.namedLogin")}
          </p>
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="view-btn view-btn-primary" style={{ padding: "12px 28px", textDecoration: "none" }}>
            {t("access.signInReturn")}
          </Link>
        </div>
      </div>
    );
  }
  if (access.phase === "password_required") {
    const pollId = access.entry?.poll_id;
    const shareCode = params.shareCode ?? (detail?.passcode_entry_path?.replace("/s/", "").replace("/access", "") ?? "");
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 40 }}>
        <div className="view-card" style={{ textAlign: "center", padding: "40px 28px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef3c7", color: "#d97706", display: "grid", placeItems: "center", fontSize: "1.75rem", margin: "0 auto 16px" }}>
            🔒
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 10px 0", color: "#0f172a" }}>{t("access.passcodeTitle")}</h1>
          <p className="view-subtitle" style={{ maxWidth: 460, margin: "0 auto 16px" }}>
            {access.grantExpired ? t("access.grantExpired") : t("access.locked")}
          </p>
          {access.entry ? (
            <div style={{ display: "inline-flex", justifyContent: "center", marginBottom: 12 }}>
              <ModeTags identity={access.entry.identity_mode} visibility={access.entry.visibility} />
            </div>
          ) : null}
          {pollId && shareCode ? (
            <InlinePasscodeForm
              pollId={pollId}
              shareCode={shareCode}
              onUnlocked={access.reload}
            />
          ) : null}
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card">
          <p role="alert" style={{ margin: 0, color: "#64748b" }}>{access.error ?? t("error.pollLoad")}</p>
        </div>
      </div>
    );
  }
  const loginHref =
    detail.identity_mode === "NAMED" && access.phase !== "voted" && access.phase !== "ready"
      ? `/login?next=${encodeURIComponent(next)}`
      : undefined;
  return (
    <div className="view-root">
      <header className="view-header">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <StatusTag status={detail.effective_status} />
          <ModeTags identity={detail.identity_mode} visibility={detail.visibility} />
        </div>
        <h1 className="view-title">{detail.title}</h1>
        {detail.description ? <p className="view-subtitle">{detail.description}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 12 }}>
          <span style={{ fontSize: "0.88rem", color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
            {formatHongKong(detail.starts_at)} {t("common.to")} {formatHongKong(detail.ends_at)} ({t("common.hkt")})
          </span>
          {detail.effective_status === "SCHEDULED" ? (
            <span style={{ fontSize: "0.88rem", color: "#d97706", fontWeight: 600 }}>{t("access.notStarted")}</span>
          ) : null}
          {detail.effective_status === "CLOSED" ? (
            <span style={{ fontSize: "0.88rem", color: "#dc2626", fontWeight: 600 }}>{t("access.ended")}</span>
          ) : null}
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        {detail.effective_status !== "CLOSED" && detail.can_view_results ? (
          <Link to={resultsHref} className="view-btn view-btn-secondary" style={{ textDecoration: "none" }}>
            {t("access.viewResults")}
          </Link>
        ) : null}
        {detail.can_manage ? (
          <Link to={`/my-polls/${detail.id}`} className="view-btn view-btn-secondary" style={{ textDecoration: "none" }}>
            {t("access.workspace")}
          </Link>
        ) : null}
      </div>

      {access.phase === "submission_unknown" && detail.effective_status === "CLOSED" ? (
        <div data-testid="unknown-status">
          <p>{t("access.notFound")}</p>
          <button type="button" className="view-btn view-btn-secondary" onClick={() => access.reload()}>
            {t("ballot.checkAgain")}
          </button>
        </div>
      ) : null}
      {detail.passcode_entry_path && !detail.has_voted && (detail.effective_status !== "CLOSED" || !detail.can_view_results) ? (
        <div style={{ padding: "12px 18px", background: "#fef3c7", borderRadius: 12, border: "1px solid #fde68a", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#92400e", fontWeight: 600 }}>{t("access.voteLocked")}</span>
          <Link to={detail.passcode_entry_path} className="view-btn view-btn-primary" style={{ padding: "8px 18px", fontSize: "0.9rem", textDecoration: "none" }}>
            {t("access.enterPasscode")}
          </Link>
        </div>
      ) : null}
      {detail.effective_status === "CLOSED" ? (
        <ClosedPollBody detail={detail} receipt={detail.receipt ?? keptReceipt} />
      ) : (
        <BallotForm
          poll={detail}
          guestReady={guest.guestStatus === "ready"}
          guestStatus={guest.guestStatus}
          onRetryGuest={
            access.phase === "submission_unknown"
              ? undefined
              : async () => {
                  await guest.ensureGuest();
                }
          }
          loginHref={loginHref}
          onCast={async (optionIds) => {
            try {
              const receipt = await castVote(detail.id, optionIds);
              setKept({ pollId: detail.id, receipt });
              access.clearUnknown();
              access.reload();
              return receipt;
            } catch (error) {
              if (isApiClientError(error) && error.code === ApiCode.POLL_CAPACITY_REACHED) {
                access.reload();
              }
              throw error;
            }
          }}
          onRecover={async () => {
            try {
              const next = await getPoll(detail.id);
              if (next.receipt) {
                setKept({ pollId: detail.id, receipt: next.receipt });
                access.clearUnknown();
              } else {
                access.markUnknown();
              }
              access.reload();
              return next;
            } catch {
              access.markUnknown();
              return null;
            }
          }}
        />
      )}
    </div>
  );
}

function ClosedPollBody({ detail, receipt }: { detail: PollDetail; receipt: VoteReceipt | null }) {
  const { t } = useI18n();
  return (
    <>
      {receipt ? (
        <p data-testid="closed-receipt" className="view-subtitle" style={{ marginBottom: 16 }}>
          {t("ballot.recorded")}
          {" · "}
          {t("ballot.receipt")} {receipt.receipt_id}
          {" · "}
          {t("ballot.submitted", { time: formatHongKong(receipt.submitted_at), zone: t("common.hkt") })}
        </p>
      ) : null}
      {detail.can_view_results ? <FinalResults pollId={detail.id} /> : null}
    </>
  );
}

function FinalResults({ pollId }: { pollId: number }) {
  const failure = useFailure("error.resultsLoad");
  const { setCause, clear } = failure;
  const [results, setResults] = useState<PollResults | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getResults(pollId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setResults(next);
        clear();
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setCause(caught);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pollId, setCause, clear]);

  if (failure.message) {
    return <p role="alert">{failure.message}</p>;
  }
  return results ? <ResultsPanel results={results} /> : null;
}
