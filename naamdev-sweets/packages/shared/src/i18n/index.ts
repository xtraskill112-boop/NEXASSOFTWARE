import { en, type Dictionary } from "./en";
import { hi } from "./hi";

export type Locale = "en" | "hi";
export const LOCALES: Locale[] = ["en", "hi"];
export const dictionaries: Record<Locale, Dictionary> = { en, hi };
export type { Dictionary };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = { [K in keyof T]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T];
export type TranslationKey = Paths<Dictionary>;

export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? en;
  const resolve = (d: unknown) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], d);
  let value = (resolve(dict) ?? resolve(en) ?? key) as string;
  if (vars) for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
  return value;
}

/** Pick the localized variant of a content field, e.g. localized(product, "name", "hi"). */
export function localized(obj: object, field: string, locale: Locale): string {
  const o = obj as Record<string, unknown>;
  if (locale === "hi") {
    const hiVal = o[`${field}Hi`];
    if (typeof hiVal === "string" && hiVal.trim()) return hiVal;
  }
  return String(o[field] ?? "");
}
