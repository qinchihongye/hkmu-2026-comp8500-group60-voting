import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { translate, type Locale, type MessageKey } from "./messages";

const STORAGE_KEY = "voting_locale";

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh" || stored === "zh-TW") {
      return stored;
    }
  } catch {
    // 浏览器拒绝读取时使用英文默认值。
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);

  useEffect(() => {
    document.documentElement.lang =
      locale === "zh" ? "zh-Hans" : locale === "zh-TW" ? "zh-Hant" : "en";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 无法写入时仍切换当前页面的语言。
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return value;
}
