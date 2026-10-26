import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n/LocaleProvider";
import type { Locale } from "../i18n/messages";

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: "en", label: "English" },
  { locale: "zh", label: "中文" },
];

export function AuthLocaleMenu({ layout = "popover" }: { layout?: "popover" | "inline" }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((item) => item.locale === locale) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(next: Locale) {
    if (next !== locale) {
      setLocale(next);
    }
    setOpen(false);
  }

  return (
    <div className={layout === "inline" ? "auth-locale auth-locale-inline" : "auth-locale"} ref={rootRef}>
      <button
        type="button"
        className="auth-locale-trigger"
        aria-label={t("locale.group")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c2.6 2.7 3.9 5.8 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.8-3.9-9s1.3-6.3 3.9-9z" />
        </svg>
        <span>{current.label}</span>
        <svg className="auth-locale-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? (
        <div className="auth-locale-menu" role="listbox" aria-label={t("locale.group")}>
          {OPTIONS.map((item) => (
            <button
              key={item.locale}
              type="button"
              role="option"
              aria-selected={item.locale === locale}
              onClick={() => choose(item.locale)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
