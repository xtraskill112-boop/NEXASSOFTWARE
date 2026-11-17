"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { connectRealtime, type Socket } from "@naamdev/api-client";
import { SOCKET_EVENTS } from "@naamdev/shared";
import { api, SOCKET_URL } from "./api";
import { useAuth } from "./auth";

interface RealtimeCtx {
  socket: Socket | null;
  unread: number;
  setUnread: (n: number) => void;
}
const Ctx = createContext<RealtimeCtx>({ socket: null, unread: 0, setUnread: () => undefined });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unread, setUnread] = useState(0);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get<{ unread: number }>("/account/notifications", { query: { pageSize: 1 } }).then((r) => setUnread(r.unread)).catch(() => undefined);
    connectRealtime(api, SOCKET_URL).then((s) => {
      if (cancelled) return s.disconnect();
      ref.current = s;
      setSocket(s);
      s.on(SOCKET_EVENTS.notification, (n: { title: string; body: string }) => {
        setUnread((u) => u + 1);
        toast(n.title, { description: n.body, icon: "🔔" });
      });
    });
    return () => {
      cancelled = true;
      ref.current?.disconnect();
      ref.current = null;
      setSocket(null);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ socket, unread, setUnread }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
