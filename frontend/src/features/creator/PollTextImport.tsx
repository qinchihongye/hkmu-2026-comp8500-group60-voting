import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import { getPollTextImportCapabilities, parsePollText } from "./api";
import { JsonPreviewModal } from "./JsonPreviewModal";
import type { PollParseIssue, PollTextFields, PollTextParseResult } from "../../lib/api-types";
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
  const [cachedResult, setCachedResult] = useState<PollTextParseResult | null>(null);
  const [cachedText, setCachedText] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);
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
    setCachedResult(null);
    setCachedText("");
  }

  async function fetchParse(trimmed: string): Promise<PollTextParseResult | null> {
    if (cachedResult && cachedText === trimmed) {
      return cachedResult;
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
      setCachedResult(result);
      setCachedText(trimmed);
      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
      const msg = err instanceof Error ? err.message : t("form.importFailed");
      setFeedback({
        type: "error",
        message: msg || t("form.importFailed"),
      });
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handlePreviewJson() {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const result = await fetchParse(trimmed);
    if (!result) return;

    const issues = result.issues || [];
    const hasNoContent = issues.some((i) => i.code === "NO_POLL_CONTENT");
    const hasMultiplePolls = issues.some((i) => i.code === "MULTIPLE_POLLS");

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

    setShowJsonModal(true);
  }

  async function handleParseAndFill() {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const result = await fetchParse(trimmed);
    if (!result) return;

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
              className="poll-import-btn-preview"
              data-testid="poll-import-btn-preview"
              onClick={handlePreviewJson}
              disabled={loading || !text.trim()}
              title={t("form.importPreviewJson")}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span>{t("form.importPreviewJson")}</span>
            </button>
            <button
              type="button"
              className="poll-import-btn-submit"
              data-testid="poll-import-btn-submit"
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

      <JsonPreviewModal
        open={showJsonModal}
        data={cachedResult}
        onClose={() => setShowJsonModal(false)}
        onApply={() => {
          if (cachedResult) {
            setShowJsonModal(false);
            const issues = cachedResult.issues || [];
            const hasTimeConflict = issues.some((i) => i.code === "TIME_RANGE_CONFLICT");
            onApply(cachedResult.fields, issues);
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
          }
        }}
      />
    </div>
  );
}
