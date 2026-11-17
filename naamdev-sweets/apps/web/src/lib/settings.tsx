"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { PublicSettings } from "@naamdev/api-client";

const Ctx = createContext<PublicSettings | null>(null);
export function SettingsProvider({ value, children }: { value: PublicSettings | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSettings = () => useContext(Ctx);
