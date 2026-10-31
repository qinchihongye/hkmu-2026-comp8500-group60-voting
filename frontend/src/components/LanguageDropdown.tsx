import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n/LocaleProvider";
import type { Locale } from "../i18n/messages";

const LOCALES: { key: Locale; label: string; badge: string }[] = [
  { key: "en", label: "English", badge: "En" },
  { key: "zh", label: "简体中文", badge: "简" },
  { key: "zh-TW", label: "繁体中文", badge: "繁" },
];

export function LanguageDropdown() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = LOCALES.find((l) => l.key === locale) ?? LOCALES[0]!;

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
    <div className="topbar-lang-container" ref={containerRef}>
      <button
        type="button"
        className={`topbar-lang-trigger ${open ? "active" : ""}`}
        aria-label={t("locale.group")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="topbar-lang-badge">{current.badge}</span>
      </button>

      {open ? (
        <div className="topbar-lang-menu" role="listbox" aria-label={t("locale.group")}>
          {LOCALES.map((item) => {
            const isSelected = item.key === locale;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`topbar-lang-item ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  setLocale(item.key);
                  setOpen(false);
                }}
              >
                <span>{item.label}</span>
                {isSelected ? (
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
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

