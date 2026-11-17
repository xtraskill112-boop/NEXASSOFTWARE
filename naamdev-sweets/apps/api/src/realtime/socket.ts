import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { prisma } from "@naamdev/db";
import { SOCKET_EVENTS } from "@naamdev/shared";
import { allowedOrigins, env } from "../config/env";
import { logger } from "../lib/logger";
import { permissionsForRole } from "../middleware/auth";
import { rooms, setIo } from "./io";

export interface SocketClaims {
  sub: string;
  role: string;
  staff: boolean;
  partnerId?: string | null;
}

export function signSocketToken(claims: SocketClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: "12h", audience: "socket" });
}

export function initSocket(server: HttpServer) {
  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: allowedOrigins, credentials: true },
    pingInterval: 20_000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(); // anonymous sockets are allowed but join no private rooms
    try {
      socket.data.claims = jwt.verify(token, env.JWT_SECRET, { audience: "socket" }) as SocketClaims;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const claims = socket.data.claims as SocketClaims | undefined;
    if (claims) {
      socket.join(rooms.user(claims.sub));
      if (claims.partnerId) socket.join(rooms.partner(claims.partnerId));
      if (claims.staff) {
        const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { roleId: true } });
        const perms = user ? await permissionsForRole(user.roleId) : [];
        if (perms.includes("orders.view") || perms.includes("delivery.manage")) socket.join(rooms.staff);
        socket.data.perms = perms;
      }
    }

    socket.on(SOCKET_EVENTS.subscribeOrder, async (payload: { orderId?: string }, ack?: (r: unknown) => void) => {
      const orderId = typeof payload?.orderId === "string" ? payload.orderId : null;
      if (!claims || !orderId) return ack?.({ ok: false });
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, assignments: { select: { partnerId: true } } } });
      const allowed =
        !!order &&
        (order.userId === claims.sub ||
          (claims.staff && (socket.data.perms as string[] | undefined)?.includes("orders.view")) ||
          (!!claims.partnerId && order.assignments.some((a) => a.partnerId === claims.partnerId)));
      if (!allowed) return ack?.({ ok: false });
      socket.join(rooms.order(orderId));
      ack?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.unsubscribeOrder, (payload: { orderId?: string }) => {
      if (typeof payload?.orderId === "string") socket.leave(rooms.order(payload.orderId));
    });
  });

  setIo(io);
  logger.info("Socket.IO ready");
  return io;
}
