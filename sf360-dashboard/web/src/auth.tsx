import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "./firebase";
import { api } from "./api";
import type { AppInfo } from "./types";

type State =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "unverified"; user: User }
  | { phase: "denied"; user: User; message: string }
  | { phase: "error"; user: User; message: string }
  | { phase: "ready"; user: User; info: AppInfo };

interface AuthContextValue {
  state: State;
  recheck: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  const evaluate = useCallback(async (user: User | null) => {
    if (!user) return setState({ phase: "signed-out" });
    if (!user.emailVerified) return setState({ phase: "unverified", user });
    try {
      // The server checks the allow-list; Firestore rules check it again for every read.
      const info = await api.appInfo({});
      setState({ phase: "ready", user, info });
    } catch (err) {
      if (err instanceof FirebaseError && err.code === "functions/permission-denied") {
        setState({ phase: "denied", user, message: err.message });
      } else if (err instanceof FirebaseError && err.code === "functions/failed-precondition") {
        setState({ phase: "unverified", user });
      } else {
        setState({ phase: "error", user, message: err instanceof Error ? err.message : String(err) });
      }
    }
  }, []);

  useEffect(() => onIdTokenChanged(auth, (u) => void evaluate(u)), [evaluate]);

  const recheck = useCallback(async () => {
    const u = auth.currentUser;
    if (u) {
      await u.reload();
      await u.getIdToken(true);
    }
    await evaluate(auth.currentUser);
  }, [evaluate]);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return <AuthContext.Provider value={{ state, recheck, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Only valid inside the signed-in part of the app. */
export function useAppInfo(): AppInfo {
  const { state } = useAuth();
  if (state.phase !== "ready") throw new Error("useAppInfo before sign-in");
  return state.info;
}
