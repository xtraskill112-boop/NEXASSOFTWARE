import type { Server } from "socket.io";

let io: Server | null = null;
export const setIo = (server: Server) => (io = server);
export const getIo = () => io;

export const rooms = {
  user: (id: string) => `user:${id}`,
  order: (id: string) => `order:${id}`,
  partner: (id: string) => `partner:${id}`,
  staff: "staff",
};

export function emitTo(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}
