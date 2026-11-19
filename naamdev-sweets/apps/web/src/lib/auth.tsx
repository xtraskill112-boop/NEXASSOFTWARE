"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Me } from "@naamdev/api-client";
import { onFirebaseUser, signOutFirebase } from "@naamdev/api-client/firebase";
import { api, errorMessage } from "./api";

interface AuthCtx {
  /** undefined while loading; null when signed out (or signed in without a profile yet). */
  user: Me | null | undefined;
  /** Signed in with Firebase but the NAAMDEV profile isn't created yet. */
  needsProfile: boolean;
  firebaseEmail: string | null;
  refresh: () => Promise<Me | null>;
  setUser: (u: Me | null) => void;
  logout: () => Promise<void>;
  wishlist: Set<string>;
  toggleWishlist: (productId: string, name?: string) => Promise<void>;
  requireLogin: (next?: string) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const router = useRouter();
  const uidRef = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me | null; needsProfile?: boolean; email?: string | null }>("/auth/me");
      setUser(r.user);
      setNeedsProfile(!r.user && !!r.needsProfile);
      return r.user;
    } catch {
      setUser(null);
      setNeedsProfile(false);
      return null;
    }
  }, []);

  // Firebase restores the saved sign-in on load and refreshes the ID token hourly.
  useEffect(
    () =>
      onFirebaseUser((fb) => {
        setFirebaseEmail(fb?.email ?? null);
        const uid = fb?.uid ?? null;
        if (uid === uidRef.current) return;
        uidRef.current = uid;
        if (!uid) {
          setUser(null);
          setNeedsProfile(false);
          return;
        }
        void refresh();
      }),
    [refresh],
  );

  useEffect(() => {
    if (!user) {
      setWishlist(new Set());
      return;
    }
    api.get<{ productIds: string[] }>("/account/wishlist").then((r) => setWishlist(new Set(r.productIds))).catch(() => undefined);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const requireLogin = useCallback(
    (next?: string) => {
      if (user) return true;
      router.push(`/login?next=${encodeURIComponent(next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"))}`);
      return false;
    },
    [user, router],
  );

  const toggleWishlist = useCallback(
    async (productId: string, name?: string) => {
      if (!requireLogin()) return;
      const has = wishlist.has(productId);
      setWishlist((s) => {
        const n = new Set(s);
        if (has) n.delete(productId);
        else n.add(productId);
        return n;
      });
      try {
        if (has) await api.del(`/account/wishlist/${productId}`);
        else {
          await api.post(`/account/wishlist/${productId}`);
          toast.success(`${name ?? "Item"} saved to your wishlist`, { icon: "❤️" });
        }
      } catch (err) {
        setWishlist((s) => {
          const n = new Set(s);
          if (has) n.add(productId);
          else n.delete(productId);
          return n;
        });
        toast.error(errorMessage(err));
      }
    },
    [wishlist, requireLogin],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    await signOutFirebase().catch(() => undefined);
    setUser(null);
    setNeedsProfile(false);
    router.push("/");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ user, needsProfile, firebaseEmail, refresh, setUser, logout, wishlist, toggleWishlist, requireLogin }),
    [user, needsProfile, firebaseEmail, refresh, logout, wishlist, toggleWishlist, requireLogin],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
