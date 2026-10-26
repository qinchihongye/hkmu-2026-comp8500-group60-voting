import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";

import { explain } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";
import { defaultPollWindow, hongKongParts, hongKongToIso, isBeforeCurrentHongKongMinute } from "../../lib/time";
import type { PollWriteBody } from "../../lib/api-types";
import type { PollFormValue } from "./types";
import "./PollForm.css";

function updateTime(event: ChangeEvent<HTMLInputElement>, previous: string, apply: (time: string) => void) {
  const field = event.currentTarget;
  const next = field.value;
  apply(next);
  const minute = next.length >= 5 ? next.slice(3, 5) : "";
  const previousMinute = previous.length >= 5 ? previous.slice(3, 5) : "";
  // 只在分钟变化后失焦。浏览器时间下拉会随之关闭；只改小时时保持打开。
  if (minute !== "" && minute !== previousMinute) {
    window.setTimeout(() => field.blur(), 0);
  }
}

function validate(value: PollFormValue, mode: "create" | "edit", now = new Date()): MessageKey | null {
  const title = value.title.trim();
  if (title.length < 1 || title.length > 120) {
    return "form.error.titleLength";
  }
  if (value.description.trim().length > 2000) {
    return "form.error.descriptionLength";
  }
  const labels = value.options.map((item) => item.trim()).filter((item) => item.length > 0);
  if (labels.length < 2 || labels.length > 10) {
    return "form.error.optionCount";
  }
  if (new Set(labels).size !== labels.length) {
    return "form.error.optionDuplicate";
  }
  if (labels.some((item) => item.length > 200)) {
    return "form.error.optionLength";
  }
  if (value.visibility === "PRIVATE") {
    const password = value.accessPassword;
    if (mode === "create" && password.length === 0) {
      return "form.error.passcodeRequired";
    }
    if (password.length > 0 && (password.length < 8 || password.length > 128)) {
      return "form.error.passcodeLength";
    }
  }
  try {
    const starts = new Date(hongKongToIso(value.startsDate, value.startsTime));
    const ends = new Date(hongKongToIso(value.endsDate, value.endsTime));
    if (mode === "create" && isBeforeCurrentHongKongMinute(value.startsDate, value.startsTime, now)) {
      return "form.error.startPast";
    }
    if (!(ends.getTime() > starts.getTime())) {
      return "form.error.endOrder";
    }
  } catch {
    return "form.error.timeFormat";
  }
  return null;
}

export function toPollBody(value: PollFormValue): PollWriteBody {
  const description = value.description.trim();
  return {
    title: value.title.trim(),
    description: description.length > 0 ? description : null,
    starts_at: hongKongToIso(value.startsDate, value.startsTime),
    ends_at: hongKongToIso(value.endsDate, value.endsTime),
    identity_mode: value.identityMode,
    visibility: value.visibility,
    access_password: value.visibility === "PRIVATE" && value.accessPassword.length > 0 ? value.accessPassword : null,
    options: value.options.map((label) => label.trim()).filter((label) => label.length > 0).map((label) => ({ label })),
  };
}

export function PollForm({
  initial,
  mode,
  busy = false,
  serverError,
  now,
  onSubmit,
}: {
  initial: PollFormValue;
  mode: "create" | "edit";
  busy?: boolean;
  serverError?: string | null;
  now?: Date;
  onSubmit: (body: PollWriteBody) => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const clock = now ?? new Date();
  const shownError = errorKey ? t(errorKey) : failure ? explain(failure, "error.saveFailed", t) : serverError;
  const current = hongKongParts(clock);

  function patch(partial: Partial<PollFormValue>) {
    setValue((current) => ({ ...current, ...partial }));
  }

  async function submit() {
    const nextError = validate(value, mode, now ?? new Date());
    if (nextError) {
      setFailure(null);
      setErrorKey(nextError);
      return;
    }
    setErrorKey(null);
    setFailure(null);
    try {
      await onSubmit(toPollBody(value));
    } catch (caught) {
      setErrorKey(null);
      setFailure(caught);
    }
  }

  return (
    <div className="poll-form-wrapper">
      {/* Page Header */}
      <div className="poll-form-header">
        <h1 className="poll-form-title">
          {mode === "create" ? t("form.createTitle") : t("form.editTitle")}
        </h1>
      </div>

      <form
        className="poll-form-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {/* ================= SECTION 1: GENERAL INFO ================= */}
        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span>📝</span>
            <span>{t("form.general")}</span>
          </h2>

          {/* Title Field */}
          <div className="poll-form-field">
            <label htmlFor="poll-title" className="poll-form-label">
              <span>{t("form.title")}</span>
              <span className="poll-form-label-hint">{value.title.length}/120</span>
              <span className="sr-only">{t("form.title")}</span>
            </label>
            <input
              id="poll-title"
              aria-label={t("form.title")}
              className="poll-form-input"
              value={value.title}
              maxLength={120}
              placeholder={t("form.titleHint")}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>

          {/* Description Field */}
          <div className="poll-form-field">
            <label htmlFor="poll-description" className="poll-form-label">
              <span>{t("form.description")}</span>
              <span className="poll-form-label-hint">{value.description.length}/2000</span>
            </label>
            <textarea
              id="poll-description"
              className="poll-form-textarea"
              rows={3}
              value={value.description}
              maxLength={2000}
              placeholder={t("form.descriptionHint")}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </div>
        </section>

        {/* ================= SECTION 2: IDENTITY & VISIBILITY CONFIG ================= */}
        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span>⚙️</span>
            <span>{t("form.settings")}</span>
          </h2>

          {/* Identity Mode Selection */}
          <div className="poll-form-field">
            <span className="poll-form-label">{t("form.identity")}</span>
            <div className="poll-config-grid">
              {/* Named Ballot */}
              <label
                htmlFor="id-named"
                className={`poll-config-card ${value.identityMode === "NAMED" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  id="id-named"
                  name="identity"
                  aria-label={t("identity.named")}
                  className="poll-native-radio"
                  checked={value.identityMode === "NAMED"}
                  onChange={() => patch({ identityMode: "NAMED" })}
                />
                <span className="sr-only">{t("identity.named")}</span>
                <div className="poll-config-card-header">
                  <div className="poll-config-icon-title">
                    <span className="poll-config-icon">👤</span>
                    <span className="poll-config-title">{t("identity.named")}</span>
                  </div>
                  <div className="poll-config-radio-dot">
                    <div className="poll-config-radio-inner" />
                  </div>
                </div>
                <p className="poll-config-desc">
                  {t("form.named")}
                </p>
              </label>

              {/* Anonymous Ballot */}
              <label
                htmlFor="id-anon"
                className={`poll-config-card ${value.identityMode === "ANONYMOUS" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  id="id-anon"
                  name="identity"
                  aria-label={t("identity.anonymous")}
                  className="poll-native-radio"
                  checked={value.identityMode === "ANONYMOUS"}
                  onChange={() => patch({ identityMode: "ANONYMOUS" })}
                />
                <span className="sr-only">{t("identity.anonymous")}</span>
                <div className="poll-config-card-header">
                  <div className="poll-config-icon-title">
                    <span className="poll-config-icon">🛡️</span>
                    <span className="poll-config-title">{t("identity.anonymous")}</span>
                  </div>
                  <div className="poll-config-radio-dot">
                    <div className="poll-config-radio-inner" />
                  </div>
                </div>
                <p className="poll-config-desc">
                  {t("form.anonymous")}
                </p>
              </label>
            </div>
          </div>

          {/* Visibility Selection */}
          <div className="poll-form-field">
            <span className="poll-form-label">{t("form.visibility")}</span>
            <div className="poll-config-grid">
              {/* Public Poll */}
              <label
                htmlFor="vis-pub"
                className={`poll-config-card ${value.visibility === "PUBLIC" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  id="vis-pub"
                  name="visibility"
                  aria-label={t("visibility.public")}
                  className="poll-native-radio"
                  checked={value.visibility === "PUBLIC"}
                  onChange={() => patch({ visibility: "PUBLIC", accessPassword: "" })}
                />
                <span className="sr-only">{t("visibility.public")}</span>
                <div className="poll-config-card-header">
                  <div className="poll-config-icon-title">
                    <span className="poll-config-icon">🌐</span>
                    <span className="poll-config-title">{t("visibility.public")}</span>
                  </div>
                  <div className="poll-config-radio-dot">
                    <div className="poll-config-radio-inner" />
                  </div>
                </div>
                <p className="poll-config-desc">
                  {t("form.public")}
                </p>
              </label>

              {/* Private Poll */}
              <label
                htmlFor="vis-priv"
                className={`poll-config-card ${value.visibility === "PRIVATE" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  id="vis-priv"
                  name="visibility"
                  aria-label={t("visibility.private")}
                  className="poll-native-radio"
                  checked={value.visibility === "PRIVATE"}
                  onChange={() => patch({ visibility: "PRIVATE" })}
                />
                <span className="sr-only">{t("visibility.private")}</span>
                <div className="poll-config-card-header">
                  <div className="poll-config-icon-title">
                    <span className="poll-config-icon">🔒</span>
                    <span className="poll-config-title">{t("visibility.private")}</span>
                  </div>
                  <div className="poll-config-radio-dot">
                    <div className="poll-config-radio-inner" />
                  </div>
                </div>
                <p className="poll-config-desc">
                  {t("form.private")}
                </p>
              </label>
            </div>

            {/* Passcode Field for Private Poll */}
            {value.visibility === "PRIVATE" ? (
              <div className="poll-passcode-box">
                <label htmlFor="poll-passcode" className="poll-passcode-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>{t("form.passcode")}</span>
                </label>
                <input
                  id="poll-passcode"
                  data-testid="access-password"
                  type="password"
                  autoComplete="new-password"
                  className="poll-form-input"
                  style={{ background: "#ffffff" }}
                  value={value.accessPassword}
                  onChange={(event) => patch({ accessPassword: event.target.value })}
                  placeholder={mode === "edit" ? t("form.passcodeEdit") : t("form.passcodeCreate")}
                />
              </div>
            ) : null}
          </div>
        </section>

        {/* ================= SECTION 3: SCHEDULE ================= */}
        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span>🕒</span>
            <span>{t("form.schedule")}</span>
          </h2>

          <div className="poll-schedule-grid">
            {/* Starts At */}
            <div className="poll-schedule-item">
              <span className="poll-form-label">{t("form.starts")}</span>
              <div className="poll-time-inputs">
                <input
                  type="date"
                  aria-label={t("form.startDate")}
                  min={mode === "create" ? current.date : undefined}
                  value={value.startsDate}
                  onChange={(event) => patch({ startsDate: event.target.value })}
                />
                <input
                  type="time"
                  aria-label={t("form.startTime")}
                  min={mode === "create" && value.startsDate === current.date ? current.time : undefined}
                  value={value.startsTime}
                  onChange={(event) => updateTime(event, value.startsTime, (startsTime) => patch({ startsTime }))}
                />
              </div>
            </div>

            {/* Ends At */}
            <div className="poll-schedule-item">
              <span className="poll-form-label">{t("form.ends")}</span>
              <div className="poll-time-inputs">
                <input
                  type="date"
                  aria-label={t("form.endDate")}
                  value={value.endsDate}
                  onChange={(event) => patch({ endsDate: event.target.value })}
                />
                <input
                  type="time"
                  aria-label={t("form.endTime")}
                  value={value.endsTime}
                  onChange={(event) => updateTime(event, value.endsTime, (endsTime) => patch({ endsTime }))}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ================= SECTION 4: OPTIONS ================= */}
        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span>🗳️</span>
            <span>{t("form.options")}</span>
          </h2>

          <div className="poll-options-list">
            {value.options.map((option, index) => (
              <div className="poll-option-row" key={index}>
                <span className="poll-option-index">{t("form.option", { n: index + 1 })}</span>
                <div className="poll-option-input-wrap">
                  <input
                    id={`poll-option-${index}`}
                    aria-label={t("form.option", { n: index + 1 })}
                    className="poll-form-input"
                    value={option}
                    placeholder={t("form.optionHint")}
                    onChange={(event) => {
                      const options = value.options.slice();
                      options[index] = event.target.value;
                      patch({ options });
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="poll-option-remove-btn"
                  title={t("common.removeOption", { n: index + 1 })}
                  aria-label={t("common.removeOption", { n: index + 1 })}
                  disabled={value.options.length <= 2}
                  onClick={() => patch({ options: value.options.filter((_, item) => item !== index) })}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}

            <button
              type="button"
              className="poll-add-option-btn"
              disabled={value.options.length >= 10}
              onClick={() => patch({ options: [...value.options, ""] })}
            >
              <span>+</span>
              <span>{t("form.addOption", { n: value.options.length })}</span>
            </button>
          </div>
        </section>

        {/* Error Banner */}
        {shownError ? (
          <div role="alert" className="poll-error-banner">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{shownError}</span>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="poll-actions-bar">
          <Link to="/my-polls" className="poll-cancel-btn">
            {t("common.cancel")}
          </Link>
          <button
            type="submit"
            data-testid="save-poll"
            disabled={busy}
            className="poll-submit-btn"
          >
            {busy ? t("common.saving") : mode === "create" ? t("form.saveDraft") : t("form.updateDraft")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function emptyPollForm(now = new Date()): PollFormValue {
  const window = defaultPollWindow(now);
  return {
    title: "",
    description: "",
    identityMode: "NAMED",
    visibility: "PUBLIC",
    accessPassword: "",
    options: ["", ""],
    startsDate: window.startsDate,
    startsTime: window.startsTime,
    endsDate: window.endsDate,
    endsTime: window.endsTime,
  };
}
