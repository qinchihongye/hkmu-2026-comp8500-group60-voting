import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useGuest } from "../features/poll-access/GuestProvider";
import { resolveShare, unlockPoll } from "../features/poll-access/api";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";

export function PollAccessPage() {
  const { t } = useI18n();
  const loadFailure = useFailure("error.shareMissing");
  const unlockFailure = useFailure("error.unlockFailed");
  const { setCause: setLoadCause } = loadFailure;
  const { setCause: setUnlockCause, clear: clearUnlock } = unlockFailure;
  const params = useParams();
  const navigate = useNavigate();
  const guest = useGuest();
  const shareCode = params.shareCode ?? "";
  const [pollId, setPollId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = unlockFailure.message ?? loadFailure.message;

  useEffect(() => {
    let cancelled = false;
    void resolveShare(shareCode)
      .then((entry) => {
        if (!cancelled) {
          setPollId(entry.poll_id);
          if (!entry.password_required) {
            navigate(`/s/${shareCode}`, { replace: true });
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadCause(caught);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, shareCode, setLoadCause]);

  async function submit() {
    if (pollId === null) {
      return;
    }
    setBusy(true);
    clearUnlock();
    try {
      await guest.ensureGuest();
      await unlockPoll(pollId, { share_code: shareCode, password });
      navigate(`/s/${shareCode}`, { replace: true });
    } catch (caught) {
      setUnlockCause(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-root view-root-narrow" style={{ paddingTop: 40 }}>
      <form
        className="view-card"
        data-testid="password-form"
        style={{ padding: 36 }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#eff6ff", color: "#1363df", display: "grid", placeItems: "center", fontSize: "1.75rem", margin: "0 auto 16px" }}>
            🔒
          </div>
          <h1 className="view-title" style={{ fontSize: "1.75rem" }}>{t("access.pageTitle")}</h1>
          <p className="view-subtitle" style={{ maxWidth: 440, margin: "0 auto" }}>
            {t("access.pageNote")}
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="access-passcode-input" style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, color: "#334155", marginBottom: 8 }}>
            {t("access.field")}
          </label>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              id="access-passcode-input"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("access.placeholder")}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 46px 12px 16px",
                borderRadius: 10,
                border: "1.5px solid #cbd5e1",
                fontSize: "1rem",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#1363df")}
              onBlur={(e) => (e.target.style.borderColor = "#cbd5e1")}
            />
            <button
              type="button"
              aria-label={showPassword ? t("common.hidePasscode") : t("common.showPasscode")}
              title={showPassword ? t("common.hidePasscode") : t("common.showPasscode")}
              onClick={() => setShowPassword((prev) => !prev)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 18 }}>
            <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: "0.9rem", fontWeight: 600 }}>{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          className="view-btn view-btn-primary"
          style={{ width: "100%", padding: "14px", fontSize: "1.05rem" }}
          disabled={busy || pollId === null || guest.guestStatus === "loading"}
        >
          {busy ? t("access.unlocking") : t("access.unlock")}
        </button>
      </form>
    </div>
  );
}
