import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

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

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeIndex = hoveredIndex ?? pinnedIndex;
  const activeSlice = activeIndex !== null ? slices[activeIndex] ?? (fullSlice?.index === activeIndex ? fullSlice : null) : null;

  useEffect(() => {
    if (pinnedIndex === null) {
      return undefined;
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPinnedIndex(null);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [pinnedIndex]);

  function updateTooltipPosition(event: React.MouseEvent<SVGElement>) {
    if (!containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setTooltipPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  return (
    <div className="results-pie-card">
      <div className="results-pie-heading">
        <p className="results-pie-caption">{t("results.percentage")}</p>
        <RoundingNote />
      </div>
      {total <= 0 ? (
        <svg
          className="results-pie"
          viewBox="0 0 200 200"
          role="img"
          aria-label={t("results.empty")}
          style={{ margin: "auto", display: "block" }}
        >
          <circle cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
        </svg>
      ) : (
        <div
          ref={containerRef}
          className="results-pie-wrap"
          style={{ position: "relative", display: "block", width: "min(100%, 220px)", margin: "auto" }}
          onMouseLeave={() => {
            setHoveredIndex(null);
            setTooltipPos(null);
          }}
        >
          <svg
            className="results-pie"
            viewBox="0 0 200 200"
            role="img"
            aria-label={summary}
            style={{ overflow: "visible", width: "100%", height: "auto", display: "block" }}
          >
            {fullSlice ? (
              <circle
                cx={PIE_CENTER}
                cy={PIE_CENTER}
                r={PIE_RADIUS}
                fill={sliceColor(fullSlice.index)}
                style={{
                  cursor: "pointer",
                  transition: "opacity 0.2s ease, stroke-width 0.2s ease",
                  stroke: activeIndex === fullSlice.index ? "#ffffff" : "none",
                  strokeWidth: activeIndex === fullSlice.index ? 3 : 0,
                }}
                onMouseEnter={(e) => {
                  setHoveredIndex(fullSlice.index);
                  updateTooltipPosition(e);
                }}
                onMouseMove={updateTooltipPosition}
                onClick={(e) => {
                  updateTooltipPosition(e);
                  setPinnedIndex((prev) => (prev === fullSlice.index ? null : fullSlice.index));
                }}
              />
            ) : (
              slices.map((slice) => {
                const path = slicePath(slice.start, slice.end);
                if (path === "") {
                  return null;
                }
                const isHovered = activeIndex === slice.index;
                const midAngle = (slice.start + slice.end) / 2;
                const offset = isHovered ? 4 : 0;
                const tx = Math.cos(midAngle) * offset;
                const ty = Math.sin(midAngle) * offset;

                return (
                  <path
                    key={slice.option.option_id}
                    d={path}
                    fill={sliceColor(slice.index)}
                    stroke={isHovered ? "#ffffff" : "none"}
                    strokeWidth={isHovered ? 2.5 : 0}
                    style={{
                      cursor: "pointer",
                      transform: `translate(${tx}px, ${ty}px)`,
                      transition: "transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, stroke-width 0.18s ease",
                      opacity: activeIndex === null || isHovered ? 1 : 0.65,
                      filter: isHovered ? "drop-shadow(0 3px 6px rgba(0,0,0,0.18))" : "none",
                    }}
                    onMouseEnter={(e) => {
                      setHoveredIndex(slice.index);
                      updateTooltipPosition(e);
                    }}
                    onMouseMove={updateTooltipPosition}
                    onClick={(e) => {
                      updateTooltipPosition(e);
                      setPinnedIndex((prev) => (prev === slice.index ? null : slice.index));
                    }}
                  />
                );
              })
            )}
            {slices.map((slice) => {
              if (slice.sweep < Math.PI * 2 * 0.12) {
                return null;
              }
              const isHovered = activeIndex === slice.index;
              const midAngle = (slice.start + slice.end) / 2;
              const offset = isHovered ? 4 : 0;
              const labelRadius = slice.sweep >= Math.PI * 2 - 1e-6 ? 0 : PIE_RADIUS * 0.62;
              const point = piePoint(midAngle, labelRadius);
              return (
                <text
                  key={`label-${slice.option.option_id}`}
                  x={point.x + Math.cos(midAngle) * offset}
                  y={point.y + Math.sin(midAngle) * offset}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="results-pie-label"
                  style={{
                    pointerEvents: "none",
                    transition: "transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {slice.option.percentage.toFixed(2)}%
                </text>
              );
            })}
          </svg>

          {/* Floating Tooltip */}
          {activeSlice ? (
            <div
              className="results-pie-tooltip"
              data-testid="pie-tooltip"
              style={{
                position: "absolute",
                left: tooltipPos ? `${tooltipPos.x}px` : "50%",
                top: tooltipPos ? `${tooltipPos.y - 12}px` : "50%",
                transform: tooltipPos ? "translate(-50%, -100%)" : "translate(-50%, -50%)",
                background: "rgba(15, 23, 42, 0.94)",
                backdropFilter: "blur(4px)",
                color: "#ffffff",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                boxShadow: "0 4px 14px rgba(15, 23, 42, 0.25)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 10,
                lineHeight: 1.35,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: sliceColor(activeSlice.index),
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span>{activeSlice.option.label}</span>
              </div>
              <div style={{ color: "#cbd5e1", marginTop: 3, fontSize: "0.78rem" }}>
                <strong style={{ color: "#ffffff", fontSize: "0.85rem" }}>
                  {activeSlice.option.percentage.toFixed(2)}%
                </strong>
                {" · "}
                {activeSlice.option.count} {t("results.votes").toLowerCase()}
              </div>
            </div>
          ) : null}
        </div>
      )}
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
                <th style={{ textAlign: "right" }}>{t("results.votes")}</th>
                <th style={{ textAlign: "right" }}>{t("results.percentageCol")}</th>
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
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{option.count}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#475569" }}>
                    {option.percentage.toFixed(2)}%
                  </td>
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

