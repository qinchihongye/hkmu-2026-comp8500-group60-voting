import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { explain } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";
import { defaultPollWindow, hongKongParts, hongKongToIso, isBeforeCurrentHongKongMinute } from "../../lib/time";
import type { PollWriteBody } from "../../lib/api-types";
import type { PollFormValue } from "./types";
import "./PollForm.css";

const MAX_VOTE_LIMIT = 100_000;
const SLIDER_STEPS = 1000;

function valueToSlider(value: number | null): number {
  if (value === null || value < 1) {
    return 0;
  }
  const ratio = Math.log(value) / Math.log(MAX_VOTE_LIMIT);
  return Math.round(1 + Math.min(1, Math.max(0, ratio)) * (SLIDER_STEPS - 1));
}

function sliderToValue(position: number): number | null {
  if (position <= 0) {
    return null;
  }
  const ratio = (position - 1) / (SLIDER_STEPS - 1);
  const raw = Math.round(Math.exp(ratio * Math.log(MAX_VOTE_LIMIT)));
  return Math.min(MAX_VOTE_LIMIT, Math.max(1, raw));
}

function limitFromText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_VOTE_LIMIT) {
    return null;
  }
  return parsed;
}

function canChooseMultiple(options: string[]): boolean {
  const labels = options.map((item) => item.trim()).filter((item) => item.length > 0);
  return (
    labels.length >= 3 &&
    labels.length <= 10 &&
    new Set(labels).size === labels.length &&
    labels.every((item) => item.length <= 200)
  );
}

function withSingleChoice(value: PollFormValue): PollFormValue {
  if (value.selectionMode === "MULTIPLE" && !canChooseMultiple(value.options)) {
    return { ...value, selectionMode: "SINGLE" };
  }
  return value;
}

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
  if (value.voteLimit !== null && limitFromText(String(value.voteLimit)) !== value.voteLimit) {
    return "form.error.voteLimit";
  }
  if (value.visibility === "PRIVATE") {
    const password = value.accessPassword;
    if (mode === "create" && password.length === 0) {
      return "form.error.passcodeRequired";
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
    vote_limit: value.voteLimit,
    selection_mode: value.selectionMode,
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
  const opened = withSingleChoice(initial);
  const [value, setValue] = useState(opened);
  const [limitText, setLimitText] = useState(opened.voteLimit === null ? "" : String(opened.voteLimit));
  const [singleNotice, setSingleNotice] = useState(opened.selectionMode !== initial.selectionMode);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const locked = busy || submitting;
  const clock = now ?? new Date();
  const shownError = errorKey ? t(errorKey) : failure ? explain(failure, "error.saveFailed", t) : serverError;
  const current = hongKongParts(clock);
  const multipleReady = canChooseMultiple(value.options);
  const numericLimit = limitFromText(limitText);
  const sliderPosition = valueToSlider(value.voteLimit);
  const sliderPercent = value.voteLimit === null ? 0 : (sliderPosition / SLIDER_STEPS) * 100;

  function patch(partial: Partial<PollFormValue>) {
    setValue((current) => ({ ...current, ...partial }));
  }

  function clearLimitError() {
    setErrorKey((current) => (current === "form.error.voteLimit" ? null : current));
  }

  function commitOptions(options: string[]) {
    if (value.selectionMode === "MULTIPLE" && !canChooseMultiple(options)) {
      setSingleNotice(true);
      patch({ options, selectionMode: "SINGLE" });
      return;
    }
    patch({ options });
  }

  function applyLimit(next: number | null) {
    setLimitText(next === null ? "" : String(next));
    patch({ voteLimit: next });
    clearLimitError();
  }

  function changeLimit(text: string) {
    setLimitText(text);
    if (text.trim() === "") {
      patch({ voteLimit: null });
      clearLimitError();
      return;
    }
    const parsed = limitFromText(text);
    if (parsed !== null) {
      patch({ voteLimit: parsed });
      clearLimitError();
    }
  }

  function stepLimit(delta: number) {
    if (numericLimit === null) {
      if (delta > 0) {
        applyLimit(1);
      }
      return;
    }
    const next = numericLimit + delta;
    if (next < 1) {
      applyLimit(null);
      return;
    }
    applyLimit(Math.min(MAX_VOTE_LIMIT, next));
  }

  function blurLimit() {
    if (limitText.trim() === "") {
      applyLimit(null);
      return;
    }
    const parsed = limitFromText(limitText);
    if (parsed === null) {
      setFailure(null);
      setErrorKey("form.error.voteLimit");
      return;
    }
    applyLimit(parsed);
  }

  function onLimitKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepLimit(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      stepLimit(-1);
    }
  }

  async function submit() {
    let voteLimit: number | null = null;
    if (limitText.trim() !== "") {
      const parsed = limitFromText(limitText);
      if (parsed === null) {
        setFailure(null);
        setErrorKey("form.error.voteLimit");
        return;
      }
      voteLimit = parsed;
    }
    const next = { ...value, voteLimit };
    const nextError = validate(next, mode, now ?? new Date());
    if (nextError) {
      setFailure(null);
      setErrorKey(nextError);
      return;
    }
    if (busy || submittingRef.current) {
      return;
    }
    setValue(next);
    setErrorKey(null);
    setFailure(null);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(toPollBody(next));
    } catch (caught) {
      setErrorKey(null);
      setFailure(caught);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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

        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span>⚙️</span>
            <span>{t("form.settings")}</span>
          </h2>
          <div className="poll-settings-grid">
            <div className="poll-setting-card">
              <span className="poll-setting-name">{t("form.identity")}</span>
              <div className="poll-switch-row">
                <SettingMark
                  active={value.identityMode === "NAMED"}
                  icon="👤"
                  label={t("identity.named")}
                  onClick={() => patch({ identityMode: "NAMED" })}
                />
                <input
                  className="poll-switch"
                  type="checkbox"
                  role="switch"
                  aria-label={t("form.anonymousVoting")}
                  checked={value.identityMode === "ANONYMOUS"}
                  onChange={(event) => patch({ identityMode: event.target.checked ? "ANONYMOUS" : "NAMED" })}
                />
                <SettingMark
                  active={value.identityMode === "ANONYMOUS"}
                  icon="🎭"
                  label={t("identity.anonymous")}
                  onClick={() => patch({ identityMode: "ANONYMOUS" })}
                />
              </div>
            </div>

            <div className="poll-setting-card">
              <span className="poll-setting-name">{t("form.visibility")}</span>
              <div className="poll-switch-row">
                <SettingMark
                  active={value.visibility === "PUBLIC"}
                  icon="🌐"
                  label={t("visibility.public")}
                  onClick={() => patch({ visibility: "PUBLIC", accessPassword: "" })}
                />
                <input
                  className="poll-switch"
                  type="checkbox"
                  role="switch"
                  aria-label={t("form.privatePoll")}
                  checked={value.visibility === "PRIVATE"}
                  onChange={(event) => {
                    if (event.target.checked) {
                      patch({ visibility: "PRIVATE" });
                      return;
                    }
                    patch({ visibility: "PUBLIC", accessPassword: "" });
                  }}
                />
                <SettingMark
                  active={value.visibility === "PRIVATE"}
                  icon="🔒"
                  label={t("visibility.private")}
                  onClick={() => patch({ visibility: "PRIVATE" })}
                />
              </div>
            </div>

            {/* Full-width Passcode Banner (Only when Private) */}
            {value.visibility === "PRIVATE" ? (
              <div className="poll-passcode-banner">
                <div className="poll-passcode-banner-header">
                  <span className="poll-passcode-banner-icon" aria-hidden="true">🔒</span>
                  <label htmlFor="poll-passcode" className="poll-passcode-banner-label">
                    {t("form.passcode")}
                  </label>
                </div>
                <input
                  id="poll-passcode"
                  data-testid="access-password"
                  type="password"
                  autoComplete="new-password"
                  className="poll-passcode-banner-input"
                  value={value.accessPassword}
                  onChange={(event) => patch({ accessPassword: event.target.value })}
                  placeholder={mode === "edit" ? t("form.passcodeEdit") : undefined}
                />
              </div>
            ) : null}

            <div className="poll-setting-card">
              <div className="poll-setting-card-top">
                <span className="poll-setting-name">
                  {t("form.voteLimit")}
                </span>
                <div className="poll-limit-entry">
                  <div className="poll-limit-input-wrap">
                    <input
                      className={limitText.length > 5 ? "poll-limit-input is-long" : "poll-limit-input"}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={t("form.ballotLimit")}
                      value={limitText}
                      placeholder="∞"
                      onChange={(event) => changeLimit(event.target.value)}
                      onBlur={blurLimit}
                      onKeyDown={onLimitKey}
                    />
                    <span className="poll-limit-unit">
                      {limitText.trim() === "" ? t("form.unlimited") : t("form.voteUnit")}
                    </span>
                  </div>
                  <div className="poll-limit-stepper">
                    <button
                      type="button"
                      className="poll-step-btn"
                      aria-label={t("form.decreaseLimit")}
                      disabled={numericLimit === null}
                      onClick={() => stepLimit(-1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="poll-step-btn"
                      aria-label={t("form.increaseLimit")}
                      disabled={numericLimit === MAX_VOTE_LIMIT}
                      onClick={() => stepLimit(1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="poll-limit-track">
                <div className="poll-limit-rail" />
                {sliderPercent > 0 ? <div className="poll-limit-fill" style={{ width: `${sliderPercent}%` }} /> : null}
                <span
                  className="poll-limit-thumb"
                  style={{ left: `clamp(9px, ${sliderPercent}%, calc(100% - 9px))` }}
                  aria-hidden="true"
                />
                <input
                  className="poll-limit-range"
                  type="range"
                  min={0}
                  max={SLIDER_STEPS}
                  step={1}
                  value={sliderPosition}
                  aria-label={t("form.limitSlider")}
                  onChange={(event) => applyLimit(sliderToValue(Number(event.target.value)))}
                />
              </div>
            </div>

            <div className="poll-setting-card">
              <span className="poll-setting-name" id="poll-selection-label">
                {t("form.selectionMode")}
              </span>
              <div className="poll-segment" role="radiogroup" aria-labelledby="poll-selection-label">
                <label className="poll-segment-option">
                  <input
                    className="poll-segment-input"
                    type="radio"
                    name="selection-mode"
                    aria-label={t("form.single")}
                    checked={value.selectionMode === "SINGLE"}
                    onChange={() => patch({ selectionMode: "SINGLE" })}
                  />
                  <span className="poll-segment-copy">
                    <span>{t("form.single")}</span>
                  </span>
                </label>
                <label className={multipleReady ? "poll-segment-option" : "poll-segment-option is-disabled"}>
                  <input
                    className="poll-segment-input"
                    type="radio"
                    name="selection-mode"
                    aria-label={t("form.multiple")}
                    disabled={!multipleReady}
                    checked={value.selectionMode === "MULTIPLE"}
                    onChange={() => {
                      setSingleNotice(false);
                      patch({ selectionMode: "MULTIPLE" });
                    }}
                  />
                  <span className="poll-segment-copy">
                    <span>{t("form.multiple")}</span>
                  </span>
                </label>
              </div>
              {singleNotice ? (
                <p className="poll-inline-status" role="status">{t("form.switchedSingle")}</p>
              ) : null}
            </div>
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
                      commitOptions(options);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="poll-option-remove-btn"
                  title={t("common.removeOption", { n: index + 1 })}
                  aria-label={t("common.removeOption", { n: index + 1 })}
                  disabled={value.options.length <= 2}
                  onClick={() => commitOptions(value.options.filter((_, item) => item !== index))}
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
            disabled={locked}
            className="poll-submit-btn"
          >
            {locked ? t("common.saving") : mode === "create" ? t("form.saveDraft") : t("form.updateDraft")}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingMark({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "poll-switch-side is-active" : "poll-switch-side"}
      onClick={onClick}
    >
      [{icon} {label}]
    </button>
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
    voteLimit: null,
    selectionMode: "SINGLE",
    options: ["", ""],
    startsDate: window.startsDate,
    startsTime: window.startsTime,
    endsDate: window.endsDate,
    endsTime: window.endsTime,
  };
}
