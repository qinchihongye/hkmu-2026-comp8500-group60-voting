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
const PIE_RADIUS = 76;
const INNER_RADIUS = 46;

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
  const outerFrom = piePoint(start, PIE_RADIUS);
  const outerTo = piePoint(end, PIE_RADIUS);
  const innerFrom = piePoint(end, INNER_RADIUS);
  const innerTo = piePoint(start, INNER_RADIUS);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${outerFrom.x} ${outerFrom.y} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${large} 1 ${outerTo.x} ${outerTo.y} L ${innerFrom.x} ${innerFrom.y} A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${large} 0 ${innerTo.x} ${innerTo.y} Z`;
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

interface ResultsPieProps {
  options: OptionResult[];
  activeIndex: number | null;
  onHoverIndex: (index: number | null) => void;
  pinnedIndex: number | null;
  onPinIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

function ResultsPie({
  options,
  activeIndex,
  onHoverIndex,
  pinnedIndex,
  onPinIndex,
}: ResultsPieProps) {
  const { t } = useI18n();
  const { total, slices } = buildSlices(options);
  const summary = options.map((option) => `${option.label} ${option.percentage.toFixed(2)}%`).join(t("results.separator"));
  const fullSlice = slices.find((slice) => slice.sweep >= Math.PI * 2 - 1e-6);

  const containerRef = useRef<HTMLDivElement>(null);

  const activeSlice = activeIndex !== null ? slices[activeIndex] ?? (fullSlice?.index === activeIndex ? fullSlice : null) : null;

  useEffect(() => {
    if (pinnedIndex === null) {
      return undefined;
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onPinIndex(null);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [pinnedIndex, onPinIndex]);

  return (
    <div className="results-pie-card">
      <div className="results-pie-heading">
        <p className="results-pie-caption">{t("results.percentage")}</p>
        <RoundingNote />
      </div>
      {total <= 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
          <svg
            className="results-pie"
            viewBox="0 0 200 200"
            role="img"
            aria-label={t("results.empty")}
            style={{ margin: "auto", display: "block" }}
          >
            <circle cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          </svg>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 280,
            padding: "16px 0",
          }}
        >
          <div
            ref={containerRef}
            className="results-pie-wrap"
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              margin: "auto",
            }}
            onMouseLeave={() => onHoverIndex(null)}
          >
            {/* Stationary Hover Indicator Badge */}
            <div
              style={{
                height: 36,
                position: "relative",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              {activeSlice ? (
                <div
                  className="results-pie-tooltip"
                  data-testid="pie-tooltip"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(15, 23, 42, 0.92)",
                    backdropFilter: "blur(4px)",
                    color: "#ffffff",
                    padding: "5px 14px",
                    borderRadius: "9999px",
                    fontSize: "0.8rem",
                    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.16)",
                    whiteSpace: "nowrap",
                    maxWidth: "92%",
                    lineHeight: 1.35,
                    zIndex: 2,
                  }}
                >
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
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 130,
                      fontWeight: 600,
                    }}
                  >
                    {activeSlice.option.label}
                  </span>
                  <span style={{ color: "#94a3b8" }}>·</span>
                  <strong style={{ color: "#38bdf8", fontWeight: 700 }}>
                    {activeSlice.option.percentage.toFixed(2)}%
                  </strong>
                  <span style={{ color: "#cbd5e1", fontSize: "0.75rem" }}>
                    ({activeSlice.option.count} {t("results.votes").toLowerCase()})
                  </span>
                </div>
              ) : null}
            </div>

            <svg
              className="results-pie"
              viewBox="0 0 200 200"
              role="img"
              aria-label={summary}
              style={{ overflow: "visible", width: "min(100%, 220px)", height: "auto", display: "block" }}
            >
              {fullSlice ? (
                <circle
                  cx={PIE_CENTER}
                  cy={PIE_CENTER}
                  r={(PIE_RADIUS + INNER_RADIUS) / 2}
                  fill="none"
                  stroke={sliceColor(fullSlice.index)}
                  strokeWidth={PIE_RADIUS - INNER_RADIUS}
                  style={{
                    cursor: "pointer",
                    transition: "opacity 0.18s ease, stroke-width 0.18s ease",
                    filter: activeIndex === fullSlice.index ? "drop-shadow(0 2px 8px rgba(0,0,0,0.18))" : "none",
                  }}
                  onMouseEnter={() => onHoverIndex(fullSlice.index)}
                  onClick={() => onPinIndex((prev) => (prev === fullSlice.index ? null : fullSlice.index))}
                />
              ) : (
                slices.map((slice) => {
                  const path = slicePath(slice.start, slice.end);
                  if (path === "") {
                    return null;
                  }
                  const isHovered = activeIndex === slice.index;

                  return (
                    <path
                      key={slice.option.option_id}
                      d={path}
                      fill={sliceColor(slice.index)}
                      stroke={isHovered ? "#ffffff" : "none"}
                      strokeWidth={isHovered ? 2.5 : 0}
                      style={{
                        cursor: "pointer",
                        transition: "opacity 0.18s ease, stroke-width 0.18s ease",
                        opacity: activeIndex === null || isHovered ? 1 : 0.65,
                        filter: isHovered ? "drop-shadow(0 2px 8px rgba(0,0,0,0.22))" : "none",
                      }}
                      onMouseEnter={() => onHoverIndex(slice.index)}
                      onClick={() => onPinIndex((prev) => (prev === slice.index ? null : slice.index))}
                    />
                  );
                })
              )}
              {slices.map((slice) => {
                if (slice.sweep < Math.PI * 2 * 0.15 || slice.option.percentage < 15) {
                  return null;
                }
                const midAngle = (slice.start + slice.end) / 2;
                const labelRadius = (PIE_RADIUS + INNER_RADIUS) / 2;
                const point = piePoint(midAngle, labelRadius);
                return (
                  <text
                    key={`label-${slice.option.option_id}`}
                    x={point.x}
                    y={point.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="results-pie-label"
                    style={{
                      pointerEvents: "none",
                      fill: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 800,
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
                    }}
                  >
                    {Math.round(slice.option.percentage)}%
                  </text>
                );
              })}
              {/* Center Label for Donut Chart */}
              <g className="results-donut-center" pointerEvents="none">
                <text
                  x={PIE_CENTER}
                  y={PIE_CENTER - 3}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#0f172a"
                  fontSize="18"
                  fontWeight="800"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {options.reduce((sum, o) => sum + o.count, 0)}
                </text>
                <text
                  x={PIE_CENTER}
                  y={PIE_CENTER + 15}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#64748b"
                  fontSize="10"
                  fontWeight="700"
                  letterSpacing="0.06em"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {t("results.votes").toUpperCase()}
                </text>
              </g>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResultsPanel({ results }: { results: PollResults }) {
  const { t } = useI18n();
  const leaders = new Set(results.winner_option_ids);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const activeIndex = hoveredIndex ?? pinnedIndex;

  const sortedOptions = [...results.options].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.percentage - a.percentage;
  });

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
                <th style={{ width: "52%" }}>{t("results.option")}</th>
                <th style={{ textAlign: "right", width: "18%", whiteSpace: "nowrap" }}>{t("results.votes")}</th>
                <th style={{ textAlign: "right", width: "30%", whiteSpace: "nowrap" }}>{t("results.percentageCol")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedOptions.map((option, index) => {
                const isRowActive = activeIndex === index;
                return (
                  <tr
                    key={option.option_id}
                    style={{
                      backgroundColor: isRowActive ? "#f1f5f9" : undefined,
                      transition: "background-color 0.15s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => setPinnedIndex((prev) => (prev === index ? null : index))}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                        <span className="results-swatch" style={{ background: sliceColor(index), flexShrink: 0 }} aria-hidden="true" />
                        <strong
                          className="results-option-text"
                          title={option.label}
                        >
                          {option.label}
                        </strong>
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
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {results.is_final ? t("results.winner") : t("results.leading")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{option.count}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#475569" }}>
                      <div>{option.percentage.toFixed(2)}%</div>
                      <div
                        style={{
                          width: "100%",
                          minWidth: 54,
                          height: 4,
                          background: "#f1f5f9",
                          borderRadius: 9999,
                          marginTop: 4,
                          overflow: "hidden",
                        }}
                        aria-hidden="true"
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, option.percentage))}%`,
                            height: "100%",
                            background: sliceColor(index),
                            borderRadius: 9999,
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ResultsPie
          options={sortedOptions}
          activeIndex={activeIndex}
          onHoverIndex={setHoveredIndex}
          pinnedIndex={pinnedIndex}
          onPinIndex={setPinnedIndex}
        />
      </div>
    </section>
  );
}

