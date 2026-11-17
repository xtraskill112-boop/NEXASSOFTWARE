"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address } from "@naamdev/api-client";
import { api } from "./api";
import { useAuth } from "./auth";
import { savedLocation, type SavedLocation } from "./storage";

interface LocationCtx {
  location: SavedLocation | null;
  checkPincode: (pincode: string) => Promise<SavedLocation>;
  setLocation: (l: SavedLocation) => void;
}
const Ctx = createContext<LocationCtx | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location, setLoc] = useState<SavedLocation | null>(null);

  useEffect(() => setLoc(savedLocation.get()), []);

  const checkPincode = useCallback(async (pincode: string) => {
    const r = await api.get<{ serviceable: boolean; area?: string | null; city?: string | null; etaMinutes?: number }>("/catalog/delivery-estimate", { query: { pincode } });
    return { pincode, serviceable: r.serviceable, area: r.area ?? null, city: r.city ?? null, etaMinutes: r.etaMinutes };
  }, []);

  const setLocation = useCallback((l: SavedLocation) => {
    savedLocation.set(l);
    setLoc(l);
  }, []);

  // Signed-in customers default to their default address.
  useEffect(() => {
    if (!user || savedLocation.get()) return;
    api.get<{ addresses: Address[] }>("/account/addresses").then(async (r) => {
      const def = r.addresses.find((a) => a.isDefault) ?? r.addresses[0];
      if (def) setLocation(await checkPincode(def.pincode).catch(() => ({ pincode: def.pincode, area: def.line2, city: def.city, serviceable: !!def.serviceable })));
    }).catch(() => undefined);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ location, checkPincode, setLocation }}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLocation outside provider");
  return c;
}
