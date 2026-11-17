"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { localized, translate, type Locale, type TranslationKey } from "@naamdev/shared/i18n";

interface I18nCtx {
  locale: Locale;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  L: (obj: object, field: string) => string;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    document.cookie = `nd_lang=${l}; path=/; max-age=31536000; samesite=lax`;
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
