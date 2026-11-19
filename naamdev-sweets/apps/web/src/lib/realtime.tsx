"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { watchLive } from "@naamdev/api-client/firebase";
import { api } from "./api";
import { useAuth } from "./auth";

interface RealtimeCtx {
  unread: number;
  setUnread: (n: number) => void;
}
const Ctx = createContext<RealtimeCtx>({ unread: 0, setUnread: () => undefined });

/** New in-app notifications arrive through the user's Firestore live document. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    api.get<{ unread: number }>("/account/notifications", { query: { pageSize: 1 } }).then((r) => setUnread(r.unread)).catch(() => undefined);
    let seen: number | null = null;
    return watchLive("liveUsers", user.id, (data) => {
      const version = Number(data?.version ?? 0);
      if (seen !== null && version > seen) {
        const last = data?.last as { title?: string; body?: string } | undefined;
        setUnread((u) => u + 1);
        if (last?.title) toast(last.title, { description: last.body, icon: "🔔" });
      }
      seen = version;
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ unread, setUnread }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);

/** Re-runs `onChange` whenever the order's live signal changes (status, rider position). */
export function useOrderLive(orderId: string | null | undefined, onChange: (data: Record<string, unknown> | null) => void) {
  const { user } = useAuth();
  useEffect(() => {
    if (!orderId || !user) return;
    let first = true;
    return watchLive("liveOrders", orderId, (data) => {
      if (first) {
        first = false;
        return;
      }
      onChange(data);
    });
  }, [orderId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
