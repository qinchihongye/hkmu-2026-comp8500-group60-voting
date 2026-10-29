import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { useI18n } from "../../i18n/LocaleProvider";
import type { OptionResult, PollResults } from "../../lib/api-types";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeHover(onChange: () => void) {
  if (typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia(HOVER_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function hoverSnapshot() {
  if (typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia(HOVER_QUERY).matches;
}

function RoundingNote() {
  const { t } = useI18n();
  const hoverCapable = useSyncExternalStore(subscribeHover, hoverSnapshot, () => true);
  const [open, setOpen] = useState(false);
  const noteId = useId();

  useEffect(() => {
    if (hoverCapable || !open) {
      return undefined;
    }
    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && event.currentTarget instanceof Document) {
        const note = document.getElementById(noteId)?.parentElement;
        if (note && !note.contains(target)) {
          setOpen(false);
        }
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [hoverCapable, noteId, open]);

  return (
    <div
      className="results-note"
      onMouseEnter={() => {
        if (hoverCapable) {
          setOpen(true);
        }
      }}
      onMouseLeave={() => {
        if (hoverCapable) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="results-note-button"
        aria-label={t("results.noteLabel")}
        aria-expanded={open}
        aria-controls={noteId}
        onClick={() => {
          if (!hoverCapable) {
            setOpen((current) => !current);
          }
        }}
        onFocus={() => {
          if (hoverCapable) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          if (hoverCapable) {
            setOpen(false);
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7.5v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="16.8" r="1.1" fill="currentColor" />
        </svg>
      </button>
      <p id={noteId} className={`results-note-pop${open ? " open" : ""}`} role="tooltip">
        {t("results.note")}
      </p>
    </div>
  );
}

const SLICE_COLORS = [
  "#1363df",
  "#0f766e",
  "#b45309",
  "#6d28d9",
  "#be185d",
  "#0e7490",
  "#4d7c0f",
  "#c2410c",
  "#4338ca",
  "#475569",
];

const PIE_CENTER = 100;
const PIE_RADIUS = 78;

function sliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length] ?? SLICE_COLORS[0]!;
}

function sliceWeights(options: OptionResult[]): number[] {
  const percentages = options.map((option) => Math.max(0, option.percentage));
  if (percentages.some((value) => value > 0)) {
    return percentages;
  }
  return options.map((option) => Math.max(0, option.count));
}

function piePoint(angle: number, radius: number): { x: number; y: number } {
  return {
    x: PIE_CENTER + radius * Math.cos(angle),
    y: PIE_CENTER + radius * Math.sin(angle),
  };
}

function slicePath(start: number, end: number): string {
  const sweep = end - start;
  if (sweep <= 0 || sweep >= Math.PI * 2 - 1e-6) {
    return "";
  }
  const from = piePoint(start, PIE_RADIUS);
  const to = piePoint(end, PIE_RADIUS);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${PIE_CENTER} ${PIE_CENTER} L ${from.x} ${from.y} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${large} 1 ${to.x} ${to.y} Z`;
}

function buildSlices(options: OptionResult[]) {
  const weights = sliceWeights(options);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const slices = options.reduce<Array<{ option: OptionResult; index: number; start: number; end: number; sweep: number }>>(
    (items, option, index) => {
      const sweep = total > 0 ? (weights[index]! / total) * Math.PI * 2 : 0;
      const start = items.length === 0 ? -Math.PI / 2 : items[items.length - 1]!.end;
      items.push({ option, index, start, end: start + sweep, sweep });
      return items;
    },
    [],
  );
  return { total, slices };
}

function ResultsPie({ options }: { options: OptionResult[] }) {
  const { t } = useI18n();
  const { total, slices } = buildSlices(options);
  const summary = options.map((option) => `${option.label} ${option.percentage.toFixed(2)}%`).join(t("results.separator"));
  const fullSlice = slices.find((slice) => slice.sweep >= Math.PI * 2 - 1e-6);

  return (
    <div className="results-pie-card">
      <div className="results-pie-heading">
        <p className="results-pie-caption">{t("results.percentage")}</p>
        <RoundingNote />
      </div>
      {total <= 0 ? (
        <svg className="results-pie" viewBox="0 0 200 200" role="img" aria-label={t("results.empty")}>
          <circle cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
        </svg>
      ) : (
        <svg className="results-pie" viewBox="0 0 200 200" role="img" aria-label={summary}>
          {fullSlice ? (
            <circle cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} fill={sliceColor(fullSlice.index)} />
          ) : (
            slices.map((slice) => {
              const path = slicePath(slice.start, slice.end);
              if (path === "") {
                return null;
              }
              return <path key={slice.option.option_id} d={path} fill={sliceColor(slice.index)} />;
            })
          )}
          {slices.map((slice) => {
            if (slice.sweep < Math.PI * 2 * 0.12) {
              return null;
            }
            const labelRadius = slice.sweep >= Math.PI * 2 - 1e-6 ? 0 : PIE_RADIUS * 0.62;
            const point = piePoint((slice.start + slice.end) / 2, labelRadius);
            return (
              <text
                key={`label-${slice.option.option_id}`}
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="results-pie-label"
              >
                {slice.option.percentage.toFixed(2)}%
              </text>
            );
          })}
        </svg>
      )}
      <ul className="results-pie-legend">
        {options.map((option, index) => (
          <li key={option.option_id}>
            <span className="results-swatch" style={{ background: sliceColor(index) }} aria-hidden="true" />
            <span>{option.label}</span>
            <strong>{option.percentage.toFixed(2)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultsPanel({ results }: { results: PollResults }) {
  const { t } = useI18n();
  const leaders = new Set(results.winner_option_ids);
  return (
    <section className="view-card" data-testid="results">
      <div className="view-card-header">
        <h2 className="view-card-title">
          {results.is_final ? t("results.finalTitle") : t("results.liveTitle")}
        </h2>
      </div>

      {!results.is_final ? (
        <p className="view-subtitle" style={{ marginBottom: 16 }}>
          {t("results.liveNote")}
        </p>
      ) : null}

      <div className="results-summary-strip">
        <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
          {t("results.ballots", { count: results.total_votes })}
        </strong>
        <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
          {t("results.selections", { count: results.total_selections })}
        </strong>
      </div>

      <div className="results-split">
        <div className="saas-table-card results-table-card">
          <table className="saas-table">
            <thead>
              <tr>
                <th>{t("results.option")}</th>
                <th>{t("results.votes")}</th>
              </tr>
            </thead>
            <tbody>
              {results.options.map((option, index) => (
                <tr key={option.option_id}>
                  <td>
                    <span className="results-swatch" style={{ background: sliceColor(index) }} aria-hidden="true" />
                    <strong>{option.label}</strong>
                    {leaders.has(option.option_id) ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 9999,
                          background: "#eff6ff",
                          color: "#1363df",
                          border: "1px solid #bfdbfe",
                          marginLeft: 8,
                          letterSpacing: "0.03em",
                        }}
                      >
                        {results.is_final ? t("results.winner") : t("results.leading")}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{option.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ResultsPie options={results.options} />
      </div>
    </section>
  );
}

