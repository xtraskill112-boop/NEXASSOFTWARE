"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Me } from "@naamdev/api-client";
import type { PermissionKey } from "@naamdev/shared";
import { api } from "./api";

interface Ctx {
  me: Me | null | undefined;
  can: (...p: PermissionKey[]) => boolean;
  canAny: (...p: PermissionKey[]) => boolean;
  setMe: (m: Me | null) => void;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const router = useRouter();
  useEffect(() => {
    api.get<{ user: Me | null }>("/auth/me").then((r) => setMe(r.user && r.user.role.isStaff ? r.user : null)).catch(() => setMe(null));
  }, []);
  const can = useCallback((...p: PermissionKey[]) => !!me && p.every((x) => me.permissions.includes(x)), [me]);
  const canAny = useCallback((...p: PermissionKey[]) => !!me && p.some((x) => me.permissions.includes(x)), [me]);
  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setMe(null);
    router.replace("/login");
  }, [router]);
  const value = useMemo(() => ({ me, can, canAny, setMe, logout }), [me, can, canAny, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAdmin() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAdmin outside provider");
  return c;
}
