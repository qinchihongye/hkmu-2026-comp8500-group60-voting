import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { explain } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";
import { defaultPollWindow, hongKongParts, hongKongToIso, isBeforeCurrentHongKongMinute, isoToHongKongParts } from "../../lib/time";
import type { PollTextFields, PollWriteBody } from "../../lib/api-types";
import type { PollFormValue } from "./types";
import { PollTextImport } from "./PollTextImport";
import "./PollForm.css";

const MAX_VOTE_LIMIT = 100_000;
const SLIDER_STEPS = 1000;

function valueToSlider(value: number | null): number {
  if (value === null || value < 1) {
    return 0;
  }
  if (value <= 10) {
    return Math.round(20 + ((value - 1) / 9) * 180);
  }
  if (value <= 50) {
    return Math.round(200 + ((value - 10) / 40) * 200);
  }
  if (value <= 100) {
    return Math.round(400 + ((value - 50) / 50) * 200);
  }
  if (value <= 1000) {
    const ratio = Math.log10(value / 100);
    return Math.round(600 + ratio * 200);
  }
  const ratio = Math.min(2, Math.max(0, Math.log10(value / 1000))) / 2;
  return Math.round(800 + ratio * 200);
}

function sliderToValue(position: number): number | null {
  if (position <= 10) {
    return null;
  }
  if (position <= 200) {
    const ratio = (position - 20) / 180;
    return Math.min(10, Math.max(1, Math.round(1 + ratio * 9)));
  }
  if (position <= 400) {
    const ratio = (position - 200) / 200;
    return Math.min(50, Math.max(10, Math.round(10 + ratio * 40)));
  }
  if (position <= 600) {
    const ratio = (position - 400) / 200;
    return Math.min(100, Math.max(50, Math.round(50 + ratio * 50)));
  }
  if (position <= 800) {
    const ratio = (position - 600) / 200;
    const raw = Math.round(100 * Math.pow(10, ratio));
    return Math.min(1000, Math.max(100, raw));
  }
  const ratio = (position - 800) / 200;
  const raw = Math.round(1000 * Math.pow(100, ratio));
  return Math.min(MAX_VOTE_LIMIT, Math.max(1000, raw));
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
    allow_live_results: value.allowLiveResults,
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
  const [justReachedThree, setJustReachedThree] = useState(false);
  const prevOptionCountRef = useRef(opened.options.length);

  useEffect(() => {
    if (prevOptionCountRef.current < 3 && value.options.length >= 3) {
      setJustReachedThree(true);
      const timer = setTimeout(() => {
        setJustReachedThree(false);
      }, 1000);
      prevOptionCountRef.current = value.options.length;
      return () => clearTimeout(timer);
    }
    prevOptionCountRef.current = value.options.length;
  }, [value.options.length]);
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

  function handleApplyParsedFields(fields: PollTextFields) {
    const next: Partial<PollFormValue> = {};
    if (fields.title) {
      next.title = fields.title;
    }
    if (fields.description !== undefined && fields.description !== null) {
      next.description = fields.description;
    }
    if (fields.options && fields.options.length > 0) {
      next.options = fields.options.map((opt) => opt.label);
    }
    if (fields.starts_at) {
      const parts = isoToHongKongParts(fields.starts_at);
      next.startsDate = parts.date;
      next.startsTime = parts.time;
    }
    if (fields.ends_at) {
      const parts = isoToHongKongParts(fields.ends_at);
      next.endsDate = parts.date;
      next.endsTime = parts.time;
    }
    const resolvedOptions = next.options ?? value.options;
    if (fields.selection_mode) {
      if (fields.selection_mode === "MULTIPLE" && canChooseMultiple(resolvedOptions)) {
        next.selectionMode = "MULTIPLE";
      } else {
        next.selectionMode = "SINGLE";
      }
    } else if (value.selectionMode === "MULTIPLE" && !canChooseMultiple(resolvedOptions)) {
      next.selectionMode = "SINGLE";
      setSingleNotice(true);
    }
    patch(next);
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
        {mode === "create" ? (
          <PollTextImport onApply={handleApplyParsedFields} />
        ) : null}

        {/* ================= SECTION 1: GENERAL INFO ================= */}
        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span className="poll-section-icon" aria-hidden="true" style={{ display: "inline-flex", color: "#2563eb" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </span>
            <span>{t("form.general")}</span>
          </h2>

          {/* Title Field */}
          <div className="poll-form-field">
            <label htmlFor="poll-title" className="poll-form-label">
              <span>{t("form.title")}</span>
              <span className="poll-form-label-hint">{value.title.length}/120</span>
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
            <span className="poll-section-icon" aria-hidden="true" style={{ display: "inline-flex", color: "#64748b" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" x2="20" y1="21" y2="21"/>
                <line x1="4" x2="20" y1="3" y2="3"/>
                <line x1="4" x2="20" y1="12" y2="12"/>
                <circle cx="9" cy="12" r="3"/>
                <circle cx="15" cy="3" r="3"/>
                <circle cx="15" cy="21" r="3"/>
              </svg>
            </span>
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

            <div className="poll-setting-card poll-setting-card-limit">
              <div className="poll-limit-card-header">
                <span className="poll-setting-name">{t("form.voteLimit")}</span>
                <span className={`poll-limit-status-pill ${numericLimit === null ? "is-unlimited" : "is-limited"}`}>
                  <span className="poll-limit-status-dot" />
                  {numericLimit === null ? t("polls.unlimitedBallots") : `${numericLimit} ${t("form.voteUnit")}`}
                </span>
              </div>

              <div className="poll-limit-control-row">
                <div className="poll-limit-capsule">
                  <button
                    type="button"
                    className="poll-step-btn"
                    aria-label={t("form.decreaseLimit")}
                    disabled={numericLimit === null}
                    onClick={() => stepLimit(-1)}
                  >
                    −
                  </button>

                  <div className="poll-limit-input-wrap">
                    <input
                      className={`poll-limit-input ${limitText.length > 5 ? "is-long" : ""} ${limitText.trim() === "" ? "is-empty" : ""}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={t("form.ballotLimit")}
                      value={limitText}
                      placeholder={t("form.unlimited")}
                      onChange={(event) => changeLimit(event.target.value)}
                      onBlur={blurLimit}
                      onKeyDown={onLimitKey}
                    />
                    {limitText.trim() !== "" ? (
                      <span className="poll-limit-unit">{t("form.voteUnit")}</span>
                    ) : null}
                  </div>

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

                <div className="poll-limit-presets">
                  {[10, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`poll-preset-btn ${numericLimit === preset ? "is-active" : ""}`}
                      onClick={() => applyLimit(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="poll-limit-slider-container">
                <div className="poll-limit-track">
                  <div className="poll-limit-rail" />
                  {sliderPercent > 0 ? (
                    <div className="poll-limit-fill" style={{ width: `${sliderPercent}%` }} />
                  ) : null}
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

                <div className="poll-limit-ticks" aria-hidden="true">
                  <span
                    role="presentation"
                    onClick={() => applyLimit(null)}
                    className={`poll-limit-tick-label ${numericLimit === null ? "is-active" : ""}`}
                    style={{ left: "0%" }}
                  >
                    {t("polls.unlimitedBallots")}
                  </span>
                  <span
                    role="presentation"
                    onClick={() => applyLimit(10)}
                    className={`poll-limit-tick-label ${numericLimit === 10 ? "is-active" : ""}`}
                    style={{ left: "20%" }}
                  >
                    10
                  </span>
                  <span
                    role="presentation"
                    onClick={() => applyLimit(50)}
                    className={`poll-limit-tick-label ${numericLimit === 50 ? "is-active" : ""}`}
                    style={{ left: "40%" }}
                  >
                    50
                  </span>
                  <span
                    role="presentation"
                    onClick={() => applyLimit(100)}
                    className={`poll-limit-tick-label ${numericLimit === 100 ? "is-active" : ""}`}
                    style={{ left: "60%" }}
                  >
                    100
                  </span>
                  <span
                    role="presentation"
                    onClick={() => applyLimit(1000)}
                    className={`poll-limit-tick-label ${numericLimit === 1000 ? "is-active" : ""}`}
                    style={{ left: "80%" }}
                  >
                    1k
                  </span>
                  <span
                    role="presentation"
                    onClick={() => applyLimit(100000)}
                    className={`poll-limit-tick-label ${numericLimit === 100000 ? "is-active" : ""}`}
                    style={{ left: "100%" }}
                  >
                    100k
                  </span>
                </div>
              </div>
            </div>

            <div className="poll-setting-card">
              <span className="poll-setting-name">{t("form.liveResults")}</span>
              <div className="poll-switch-row">
                <SettingMark
                  active={!value.allowLiveResults}
                  icon="🔒"
                  label={t("form.liveHidden")}
                  onClick={() => patch({ allowLiveResults: false })}
                />
                <input
                  className="poll-switch"
                  type="checkbox"
                  role="switch"
                  aria-label={t("form.liveResults")}
                  checked={value.allowLiveResults}
                  onChange={(event) => patch({ allowLiveResults: event.target.checked })}
                />
                <SettingMark
                  active={value.allowLiveResults}
                  icon="📊"
                  label={t("form.liveVisible")}
                  onClick={() => patch({ allowLiveResults: true })}
                />
              </div>
              <p className="poll-setting-hint">{t("form.liveHint")}</p>
            </div>
          </div>
        </section>

        {/* ================= SECTION 3: SCHEDULE ================= */}
        <section className="poll-form-section">
          <h2 className="poll-section-title">
            <span className="poll-section-icon" aria-hidden="true" style={{ display: "inline-flex", color: "#0d9488" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
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
          <div className="poll-options-heading">
            <h2 className="poll-section-title">
              <span className="poll-section-icon" aria-hidden="true" style={{ display: "inline-flex", color: "#7c3aed" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  <path d="m9 11 3 3L22 4"/>
                </svg>
              </span>
              <span>{t("form.options")}</span>
            </h2>
            <div
              className={`poll-segment poll-segment-compact ${value.options.length < 3 ? "is-hidden" : "is-visible"} ${justReachedThree ? "is-flashing" : ""}`}
              role="radiogroup"
              aria-label={t("form.selectionMode")}
            >
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
          </div>

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
                  <span aria-hidden="true" style={{ fontSize: "1.15rem", lineHeight: 1 }}>🗑️</span>
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
            {singleNotice ? (
              <p className="poll-inline-status" role="status">{t("form.switchedSingle")}</p>
            ) : null}
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
    allowLiveResults: false,
    options: ["", ""],
    startsDate: window.startsDate,
    startsTime: window.startsTime,
    endsDate: window.endsDate,
    endsTime: window.endsTime,
  };
}
