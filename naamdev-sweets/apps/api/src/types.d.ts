import type { User, Role, Session } from "@naamdev/db";

export type ClientApp = "web" | "admin" | "delivery";

export interface AuthContext {
  user: User & { role: Role };
  session: Session | null;
  permissions: string[];
  roleKey: string;
  partnerId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      clientApp: ClientApp;
      rawBody?: Buffer;
    }
  }
}

export {};
