import { useEffect, useRef, useState } from "react";

import { useI18n } from "../../i18n/LocaleProvider";
import type { PollSortBy } from "../../lib/api-types";

interface PollSortDropdownProps {
  value: PollSortBy;
  onChange: (value: PollSortBy) => void;
}

export function PollSortDropdown({ value, onChange }: PollSortDropdownProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options: Array<{ key: PollSortBy; icon: string; label: string }> = [
    { key: "popularity", icon: "🔥", label: t("polls.sortPopularity") },
    { key: "ends_at", icon: "⏳", label: t("polls.sortEndsAt") },
    { key: "starts_at", icon: "🚀", label: t("polls.sortStartsAt") },
    { key: "created_at", icon: "🆕", label: t("polls.sortCreatedAt") },
  ];

  const currentOption = options.find((opt) => opt.key === value) ?? options[3];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="polls-sort-wrap" ref={containerRef}>
      <button
        type="button"
        className={`polls-sort-btn ${open ? "open" : ""}`}
        aria-label={`${t("polls.sortBy")}: ${currentOption.label}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="polls-sort-icon"
        >
          <path d="M3 6h18M6 12h12m-9 6h6" />
        </svg>
        <span className="polls-sort-text">
          <span className="polls-sort-label-prefix">{t("polls.sortLabel")}: </span>
          <strong className="polls-sort-val">{currentOption.label}</strong>
        </span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="polls-sort-chevron"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="polls-sort-menu" role="menu" aria-label={t("polls.sortBy")}>
          {options.map((option) => {
            const isSelected = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                className={`polls-sort-item ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
              >
                <span className="polls-sort-item-label">
                  <span className="polls-sort-item-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span>{option.label}</span>
                </span>
                {isSelected ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="#1363df"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

