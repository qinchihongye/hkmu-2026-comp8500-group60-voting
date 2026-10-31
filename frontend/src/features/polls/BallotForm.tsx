import { useState } from "react";
import { Link } from "react-router-dom";

import { ConfirmVoteModal } from "../../components/ConfirmVoteModal";
import { explain } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";
import { ApiCode } from "../../lib/api-codes";
import { isApiClientError } from "../../lib/api-error";
import type { PollDetail, VoteReceipt } from "../../lib/api-types";
import { formatHongKong } from "../../lib/time";
import type { GuestStatus } from "../poll-access/types";
import type { BallotPhase } from "./types";

function shouldRecover(error: unknown): boolean {
  return (
    isApiClientError(error) &&
    (error.kind === "network" ||
      error.kind === "parse" ||
      error.code === ApiCode.SUBMISSION_STATUS_UNKNOWN ||
      error.code === ApiCode.ALREADY_VOTED)
  );
}

function orderedOptions(poll: PollDetail) {
  return poll.options.slice().sort((left, right) => left.position - right.position);
}

function orderedSelection(poll: PollDetail, selectedIds: number[]): number[] {
  const chosen = new Set(selectedIds);
  return orderedOptions(poll)
    .filter((option) => chosen.has(option.id))
    .map((option) => option.id);
}

export function BallotForm({
  poll,
  guestReady,
  guestStatus = guestReady ? "ready" : "loading",
  onRetryGuest,
  loginHref,
  onCast,
  onRecover,
}: {
  poll: PollDetail;
  guestReady: boolean;
  guestStatus?: GuestStatus;
  onRetryGuest?: () => Promise<void>;
  loginHref?: string;
  onCast: (optionIds: number[]) => Promise<VoteReceipt>;
  onRecover: () => Promise<PollDetail | null>;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pollKey, setPollKey] = useState(poll.id);
  const [phase, setPhase] = useState<BallotPhase>(poll.has_voted ? "success" : "idle");
  const [receipt, setReceipt] = useState<VoteReceipt | null>(poll.receipt);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  let activeIds = selectedIds;
  if (pollKey !== poll.id) {
    activeIds = [];
    setPollKey(poll.id);
    setSelectedIds([]);
    setPhase(poll.has_voted ? "success" : "idle");
    setReceipt(poll.receipt);
    setNotice(null);
    setFailure(null);
    setBusy(false);
  }
  const { t } = useI18n();
  const multiple = poll.selection_mode === "MULTIPLE";
  const selectedOptionIds = orderedSelection(poll, activeIds);
  const selectedLabels = orderedOptions(poll)
    .filter((option) => selectedOptionIds.includes(option.id))
    .map((option) => option.label);
  const message = notice ? t(notice) : failure ? explain(failure, "error.voteFailed", t) : null;
  const locked = busy || phase === "confirming" || phase === "submitting" || !poll.can_vote || !guestReady || Boolean(loginHref);

  async function recover(fallback: MessageKey) {
    const detail = await onRecover();
    if (detail?.has_voted && detail.receipt) {
      setReceipt(detail.receipt);
      setPhase("success");
      setFailure(null);
      setNotice("ballot.recovered");
      return;
    }
    setPhase("unknown");
    setFailure(null);
    setNotice(fallback);
  }

  function toggle(optionId: number) {
    if (locked) {
      return;
    }
    setSelectedIds((current) => {
      if (!multiple) {
        return [optionId];
      }
      return current.includes(optionId) ? current.filter((item) => item !== optionId) : [...current, optionId];
    });
  }

  async function submit() {
    if (selectedOptionIds.length === 0 || busy || !poll.can_vote) {
      return;
    }
    setBusy(true);
    setPhase("submitting");
    try {
      const next = await onCast(selectedOptionIds);
      setReceipt(next);
      setPhase("success");
      setNotice(null);
      setFailure(null);
    } catch (error) {
      if (shouldRecover(error)) {
        const fallback: MessageKey =
          isApiClientError(error) && error.code === ApiCode.ALREADY_VOTED
            ? "error.alreadyVoted"
            : "ballot.notFound";
        try {
          await recover(fallback);
        } catch {
          setPhase("unknown");
          setFailure(null);
          setNotice("ballot.notFound");
        }
      } else {
        setPhase("error");
        setNotice(null);
        setFailure(error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-card" data-testid="ballot">
      <div className="view-card-header">
        <div>
          <h2 className="view-card-title">{t("ballot.title")}</h2>
        </div>
      </div>

      {poll.identity_mode === "ANONYMOUS" ? (
        <p className="view-subtitle" style={{ marginBottom: 16 }}>
          {t("ballot.anonymous")}
        </p>
      ) : (
        <p className="view-subtitle" style={{ marginBottom: 16 }}>
          {t("ballot.named")}
        </p>
      )}

      {loginHref ? (
        <div style={{ padding: "12px 18px", background: "#eff6ff", borderRadius: 12, marginBottom: 18, border: "1px solid #bfdbfe" }}>
          <Link to={loginHref} style={{ fontWeight: 700, color: "#1363df", textDecoration: "none" }}>
            {t("ballot.signIn")}
          </Link>
        </div>
      ) : null}

      {guestStatus === "loading" ? (
        <div style={{ padding: "10px 16px", background: "#fffbeb", borderRadius: 10, border: "1px solid #fef3c7", color: "#b45309", marginBottom: 16, fontWeight: 600, fontSize: "0.9rem" }}>
          {t("ballot.preparing")}
        </div>
      ) : null}
      {(guestStatus === "missing" || guestStatus === "expired") ? (
        <div style={{ padding: "10px 16px", background: "#fffbeb", borderRadius: 10, border: "1px solid #fef3c7", color: "#b45309", marginBottom: 16, fontWeight: 600, fontSize: "0.9rem" }}>
          <p style={{ margin: "0 0 10px 0" }}>
            {guestStatus === "expired" ? t("ballot.guestExpired") : t("ballot.guestFailed")}
          </p>
          {onRetryGuest && phase !== "unknown" ? (
            <button
              type="button"
              className="view-btn view-btn-secondary"
              onClick={() => {
                void onRetryGuest().catch(() => undefined);
              }}
            >
              {t("ballot.retryGuest")}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "success" && receipt ? (
        <div data-testid="receipt" className="receipt-card">
          <div className="receipt-header">
            <div className="receipt-seal">✓</div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#065f46" }}>
                {t("ballot.recorded")}
              </h3>
              {message ? (
                <p style={{ margin: "2px 0 0", fontSize: "0.88rem", color: "#047857" }}>{message}</p>
              ) : null}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: "0.85rem", color: "#065f46", fontWeight: 600 }}>{t("ballot.receipt")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              <span className="receipt-id-box" style={{ margin: 0 }}>{receipt.receipt_id}</span>
              <button
                type="button"
                className={`receipt-copy-btn ${copied ? "copied" : ""}`}
                aria-label={copied ? t("common.copied") : t("common.copy")}
                onClick={() => {
                  if (!receipt.receipt_id) return;
                  void navigator.clipboard.writeText(receipt.receipt_id).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? (
                  <>
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{t("common.copied")}</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>{t("common.copy")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#047857" }}>
            {t("ballot.submitted", { time: formatHongKong(receipt.submitted_at), zone: t("common.hkt") })}
          </p>
        </div>
      ) : (
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="view-subtitle" style={{ fontWeight: 700, color: "#334155", marginBottom: 14 }}>
            {multiple ? t("ballot.chooseMultiple") : t("ballot.choose")}
          </legend>
          <div className="ballot-options-grid">
            {orderedOptions(poll).map((option, index) => {
                const isSelected = selectedOptionIds.includes(option.id);
                const letter = String.fromCharCode(65 + (index % 26));
                return (
                  <label
                    key={option.id}
                    className={`ballot-option-tile ${isSelected ? "selected" : ""} ${multiple ? "is-multiple" : ""}`}
                  >
                    <div className="ballot-option-radio-dot" aria-hidden="true">
                      <div className="ballot-option-radio-inner" />
                    </div>

                    <div className="ballot-option-left">
                      <span className="ballot-option-letter" aria-hidden="true">
                        {letter}
                      </span>
                      <input
                        id={`opt-${option.id}`}
                        type={multiple ? "checkbox" : "radio"}
                        name={`option-${poll.id}`}
                        value={option.id}
                        checked={isSelected}
                        disabled={locked}
                        onChange={() => toggle(option.id)}
                        style={{
                          position: "absolute",
                          opacity: 0,
                          width: 1,
                          height: 1,
                        }}
                      />
                      <span
                        className="ballot-option-text"
                        style={{
                          cursor: locked ? "default" : "pointer",
                          margin: 0,
                          fontSize: "1.05rem",
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? "#1363df" : "#1e293b",
                        }}
                      >
                        {option.label}
                      </span>
                    </div>
                  </label>
                );
              })}
          </div>
        </fieldset>
      )}

      {phase !== "success" ? (
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button
            type="button"
            className="view-btn view-btn-primary"
            data-testid="vote-submit"
            disabled={!guestReady || selectedOptionIds.length === 0 || busy || !poll.can_vote || Boolean(loginHref)}
            onClick={() => {
              if (selectedOptionIds.length === 0 || busy || !poll.can_vote) {
                return;
              }
              setPhase("confirming");
            }}
            style={{ width: "100%", padding: "14px 24px", fontSize: "1.05rem" }}
          >
            {busy ? t("ballot.submitting") : t("ballot.submit")}
          </button>
        </div>
      ) : null}

      {phase === "unknown" ? (
        <div data-testid="unknown-status" style={{ marginTop: 20, padding: 18, background: "#fffbeb", borderRadius: 14, border: "1px solid #fef3c7" }}>
          <p style={{ margin: "0 0 12px 0", color: "#92400e", fontWeight: 600 }}>{message}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="view-btn view-btn-secondary"
              onClick={() => {
                void recover("ballot.notFound");
              }}
            >
              {t("ballot.checkAgain")}
            </button>
            <button
              type="button"
              className="view-btn view-btn-primary"
              onClick={() => {
                setNotice(null);
                setFailure(null);
                setPhase("confirming");
              }}
            >
              {t("ballot.submitAgain")}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "error" && message ? (
        <div style={{ marginTop: 16, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 10, border: "1px solid #fecaca" }}>
          <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{message}</p>
        </div>
      ) : null}

      <ConfirmVoteModal
        open={phase === "confirming" || phase === "submitting"}
        optionLabels={selectedLabels}
        busy={busy}
        onCancel={() => setPhase("idle")}
        onConfirm={() => {
          void submit();
        }}
      />
    </div>
  );
}
