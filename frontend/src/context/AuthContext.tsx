import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, apiRequest, onUnauthorized, tokenStore } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { Permission, SessionUser } from '@/lib/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  replaceToken: (token: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, []);

  const refreshProfile = useCallback(async () => {
    const res = await api.get<{ user: SessionUser }>('/auth/me');
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  // Restore session on load
  useEffect(() => {
    if (!tokenStore.get()) return;
    refreshProfile().catch(() => clearSession());
  }, [refreshProfile, clearSession]);

  // Any 401 from the API (expired token, deactivated account...) ends the session.
  useEffect(() => {
    onUnauthorized(() => {
      if (statusRef.current === 'authenticated') setSessionExpired(true);
      clearSession();
    });
    return () => onUnauthorized(null);
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRedirect: true,
    });
    tokenStore.set(res.token);
    queryClient.clear();
    setUser(res.user);
    setSessionExpired(false);
    setStatus('authenticated');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST', body: {}, skipAuthRedirect: true });
    } catch {
      /* ignore - token may already be invalid */
    }
    setSessionExpired(false);
    clearSession();
  }, [clearSession]);

  const can = useCallback((p: Permission) => !!user?.permissions.includes(p), [user]);
  const replaceToken = useCallback((token: string) => tokenStore.set(token), []);

  const value = useMemo(
    () => ({ status, user, sessionExpired, login, logout, can, replaceToken, refreshProfile }),
    [status, user, sessionExpired, login, logout, can, replaceToken, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
