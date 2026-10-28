import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import { getPollTextImportCapabilities, parsePollText } from "./api";
import type { PollParseIssue, PollTextFields } from "../../lib/api-types";
import "./PollTextImport.css";

type PollTextImportProps = {
  onApply: (fields: PollTextFields, issues: PollParseIssue[]) => void;
};

type FeedbackState = {
  type: "success" | "error" | "warning";
  message: string;
};

export function PollTextImport({ onApply }: PollTextImportProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    getPollTextImportCapabilities()
      .then((cap) => {
        if (active) {
          setEnabled(cap.enabled);
        }
      })
      .catch(() => {
        if (active) {
          setEnabled(false);
        }
      });
    return () => {
      active = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (enabled === false || enabled === null) {
    return null;
  }

  function handleClear() {
    setText("");
    setFeedback(null);
  }

  async function handleParseAndFill() {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setFeedback(null);

    try {
      const result = await parsePollText(trimmed, controller.signal);
      const issues = result.issues || [];
      const hasNoContent = issues.some((i) => i.code === "NO_POLL_CONTENT");
      const hasMultiplePolls = issues.some((i) => i.code === "MULTIPLE_POLLS");
      const hasTimeConflict = issues.some((i) => i.code === "TIME_RANGE_CONFLICT");

      if (hasNoContent) {
        setFeedback({
          type: "error",
          message: t("form.importNoContent"),
        });
        return;
      }

      if (hasMultiplePolls) {
        setFeedback({
          type: "error",
          message: t("form.importMultiplePolls"),
        });
        return;
      }

      onApply(result.fields, issues);

      if (hasTimeConflict) {
        setFeedback({
          type: "warning",
          message: `${t("form.importSuccess")} (${t("form.importTimeConflict")})`,
        });
      } else {
        setFeedback({
          type: "success",
          message: t("form.importSuccess"),
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const msg = err instanceof Error ? err.message : t("form.importFailed");
      setFeedback({
        type: "error",
        message: msg || t("form.importFailed"),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="poll-import-card">
      <div
        className="poll-import-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <span className="poll-import-title">{t("form.importFromText")}</span>
        <span className="poll-import-toggle">
          {open ? t("form.importCollapse") : t("form.importExpand")}
        </span>
      </div>

      {open ? (
        <div className="poll-import-body">
          <p className="poll-import-hint">{t("form.importHint")}</p>
          <textarea
            className="poll-import-textarea"
            value={text}
            placeholder={t("form.importPlaceholder")}
            onChange={(e) => {
              setText(e.target.value);
              if (feedback) setFeedback(null);
            }}
            disabled={loading}
          />

          <div className="poll-import-actions">
            <button
              type="button"
              className="poll-import-btn-clear"
              onClick={handleClear}
              disabled={loading || !text}
            >
              {t("form.importClear")}
            </button>
            <button
              type="button"
              className="poll-import-btn-submit"
              onClick={handleParseAndFill}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <span>{t("form.importParsing")}</span>
              ) : (
                <span>{t("form.importParseAndFill")}</span>
              )}
            </button>
          </div>

          {feedback ? (
            <div
              role="alert"
              className={`poll-import-feedback is-${feedback.type}`}
            >
              <span>{feedback.type === "success" ? "✅" : feedback.type === "warning" ? "⚠️" : "❌"}</span>
              <span>{feedback.message}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
