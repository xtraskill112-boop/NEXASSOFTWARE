"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { CartView } from "@naamdev/api-client";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";

interface CartCtx {
  cart: CartView | null;
  loading: boolean;
  count: number;
  quantityOf: (variantId: string) => number;
  itemFor: (variantId: string) => CartView["items"][number] | undefined;
  add: (variantId: string, quantity?: number, name?: string) => Promise<boolean>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  update: (itemId: string, patch: { quantity?: number; variantId?: string; savedForLater?: boolean }) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: () => Promise<void>;
  refresh: () => Promise<void>;
  bump: number;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [bump, setBump] = useState(0);
  const inflight = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ cart: CartView }>("/cart");
      setCart(r.cart);
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the session changes (guest cart merges into the user's on login).
  useEffect(() => {
    if (user === undefined) return;
    void refresh();
  }, [user?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (fn: () => Promise<{ cart: CartView }>) => {
    inflight.current++;
    try {
      const r = await fn();
      setCart(r.cart);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      await refresh();
      return false;
    } finally {
      inflight.current--;
    }
  }, [refresh]);

  const itemFor = useCallback((variantId: string) => cart?.items.find((i) => i.variant.id === variantId), [cart]);
  const quantityOf = useCallback((variantId: string) => itemFor(variantId)?.quantity ?? 0, [itemFor]);

  const add = useCallback(
    async (variantId: string, quantity = 1, name?: string) => {
      const ok = await run(() => api.post("/cart/items", { variantId, quantity }));
      if (ok) {
        setBump((b) => b + 1);
        if (name) toast.success(`${name} added`, { icon: "🛍️", duration: 1600 });
      }
      return ok;
    },
    [run],
  );

  const update = useCallback(async (itemId: string, patch: { quantity?: number; variantId?: string; savedForLater?: boolean }) => {
    await run(() => api.patch(`/cart/items/${itemId}`, patch));
  }, [run]);

  const remove = useCallback(async (itemId: string) => {
    await run(() => api.del(`/cart/items/${itemId}`));
  }, [run]);

  const setQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      const item = itemFor(variantId);
      if (!item) {
        if (quantity > 0) await add(variantId, quantity);
        return;
      }
      // Optimistic update for snappy steppers.
      setCart((c) => (c ? { ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, quantity } : i)).filter((i) => i.quantity > 0) } : c));
      if (quantity <= 0) await remove(item.id);
      else await update(item.id, { quantity });
      if (quantity > item.quantity) setBump((b) => b + 1);
    },
    [itemFor, add, remove, update],
  );

  const applyCoupon = useCallback(async (code: string) => {
    try {
      const r = await api.post<{ cart: CartView }>("/cart/coupon", { code });
      setCart(r.cart);
      toast.success(`Coupon ${code.toUpperCase()} applied 🎉`);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  }, []);

  const removeCoupon = useCallback(async () => {
    await run(() => api.del("/cart/coupon"));
  }, [run]);

  const count = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const value = useMemo(
    () => ({ cart, loading, count, quantityOf, itemFor, add, setQuantity, update, remove, applyCoupon, removeCoupon, refresh, bump }),
    [cart, loading, count, quantityOf, itemFor, add, setQuantity, update, remove, applyCoupon, removeCoupon, refresh, bump],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside provider");
  return c;
}
