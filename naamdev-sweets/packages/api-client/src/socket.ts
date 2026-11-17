import { io, type Socket } from "socket.io-client";
import type { ApiClient } from "./client";

/**
 * Connects to the realtime server. The API issues a short-lived socket token for the current
 * session; anonymous connections are allowed but only receive public events.
 */
export async function connectRealtime(api: ApiClient, url: string): Promise<Socket> {
  let token: string | undefined;
  try {
    token = (await api.get<{ token: string }>("/auth/socket-token")).token;
  } catch {
    token = undefined;
  }
  return io(url, { path: "/socket.io", transports: ["websocket", "polling"], auth: token ? { token } : {}, withCredentials: true, reconnectionDelayMax: 8000 });
}

export type { Socket };
