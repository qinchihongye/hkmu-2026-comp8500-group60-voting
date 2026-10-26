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

export function BallotForm({
  poll,
  guestReady,
  loginHref,
  onCast,
  onRecover,
}: {
  poll: PollDetail;
  guestReady: boolean;
  loginHref?: string;
  onCast: (optionId: number) => Promise<VoteReceipt>;
  onRecover: () => Promise<PollDetail | null>;
}) {
  const [optionId, setOptionId] = useState<number | null>(null);
  const [phase, setPhase] = useState<BallotPhase>(poll.has_voted ? "success" : "idle");
  const [receipt, setReceipt] = useState<VoteReceipt | null>(poll.receipt);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  const selected = poll.options.find((option) => option.id === optionId) ?? null;
  const message = notice ? t(notice) : failure ? explain(failure, "error.voteFailed", t) : null;

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

  async function submit() {
    if (optionId === null || busy) {
      return;
    }
    setBusy(true);
    setPhase("submitting");
    try {
      const next = await onCast(optionId);
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

      {!guestReady ? (
        <div style={{ padding: "10px 16px", background: "#fffbeb", borderRadius: 10, border: "1px solid #fef3c7", color: "#b45309", marginBottom: 16, fontWeight: 600, fontSize: "0.9rem" }}>
          {t("ballot.preparing")}
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
            <br />
            <span className="receipt-id-box">{receipt.receipt_id}</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#047857" }}>
            {t("ballot.submitted", { time: formatHongKong(receipt.submitted_at), zone: t("common.hkt") })}
          </p>
        </div>
      ) : (
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="view-subtitle" style={{ fontWeight: 700, color: "#334155", marginBottom: 14 }}>
            {t("ballot.choose")}
          </legend>
          <div className="ballot-options-grid">
            {poll.options
              .slice()
              .sort((left, right) => left.position - right.position)
              .map((option, index) => {
                const isSelected = optionId === option.id;
                const letter = String.fromCharCode(65 + (index % 26));
                return (
                  <div
                    key={option.id}
                    className={`ballot-option-tile ${isSelected ? "selected" : ""}`}
                    onClick={() => setOptionId(option.id)}
                  >
                    <div className="ballot-option-left">
                      <span className="ballot-option-letter" aria-hidden="true">
                        {letter}
                      </span>
                      <label
                        htmlFor={`opt-${option.id}`}
                        style={{
                          cursor: "pointer",
                          margin: 0,
                          fontSize: "1.05rem",
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? "#1363df" : "#1e293b",
                        }}
                      >
                        <input
                          id={`opt-${option.id}`}
                          type="radio"
                          name={`option-${poll.id}`}
                          value={option.id}
                          checked={isSelected}
                          onChange={() => setOptionId(option.id)}
                          style={{
                            position: "absolute",
                            opacity: 0,
                            cursor: "pointer",
                            width: 20,
                            height: 20,
                          }}
                        />
                        {option.label}
                      </label>
                    </div>

                    <div className="ballot-option-radio-dot">
                      <div className="ballot-option-radio-inner" />
                    </div>
                  </div>
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
            disabled={!guestReady || optionId === null || busy || Boolean(loginHref)}
            onClick={() => setPhase("confirming")}
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
        open={phase === "confirming"}
        optionLabel={selected?.label ?? ""}
        busy={busy}
        onCancel={() => setPhase("idle")}
        onConfirm={() => {
          void submit();
        }}
      />
    </div>
  );
}
