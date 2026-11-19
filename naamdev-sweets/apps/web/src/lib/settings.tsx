"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicSettings } from "@naamdev/api-client";
import { api } from "./api";

const KEY = "nd_settings";
const Ctx = createContext<PublicSettings | null>(null);

/** Shop settings (delivery fees, store profile, announcement…), cached for fast repeat visits. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PublicSettings | null>(null);
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(KEY);
      if (cached) setValue(JSON.parse(cached) as PublicSettings);
    } catch {
      /* storage unavailable */
    }
    api
      .get<PublicSettings>("/public/settings")
      .then((s) => {
        setValue(s);
        try {
          window.localStorage.setItem(KEY, JSON.stringify(s));
        } catch {
          /* storage unavailable */
        }
      })
      .catch(() => undefined);
  }, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSettings = () => useContext(Ctx);
