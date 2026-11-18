import type { Role, User, WithId } from "@naamdev/db";

export type ClientApp = "web" | "admin" | "delivery";

export interface AuthContext {
  user: WithId<User> & { role: WithId<Role> };
  permissions: string[];
  roleKey: string;
  /** For delivery partners: their uid (partners/{uid}); otherwise null. */
  partnerId: string | null;
  /** Firebase ID token claims (email, email_verified, auth_time …). */
  token: { email?: string; email_verified?: boolean; auth_time: number; iat: number };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** Signed-in Firebase user who has no NAAMDEV profile yet (just signed up). */
      firebaseUser?: { uid: string; email: string | null; emailVerified: boolean; name: string | null };
      clientApp: ClientApp;
      rawBody?: Buffer;
    }
  }
}

export {};
