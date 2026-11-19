"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { localized, translate, type Locale, type TranslationKey } from "@naamdev/shared/i18n";

interface I18nCtx {
  locale: Locale;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  L: (obj: object, field: string) => string;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<I18nCtx | null>(null);

const LANG_KEY = "nd_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  // The chosen language is remembered in this browser (the shop is static, so there's no server to ask).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LANG_KEY) === "hi") {
        setLocaleState("hi");
        document.documentElement.lang = "hi";
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setLocale = useCallback((l: Locale) => {
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = l;
    setLocaleState(l);
  }, []);
  const value = useMemo<I18nCtx>(
    () => ({
      locale,
      t: (key, vars) => translate(locale, key, vars),
      L: (obj, field) => localized(obj, field, locale),
      setLocale,
    }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
