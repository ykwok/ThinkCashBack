'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiClientError } from './api';
import type { Credentials } from './types';

const TOKEN_KEY = 'tcb_token';
// Fresh credentials live in sessionStorage only: cleared when the tab closes,
// never written to localStorage and never logged.
const CREDS_KEY = 'tcb_fresh_credentials';

interface AuthState {
  token: string | null;
  /** True until the initial token read from storage has completed. */
  initializing: boolean;
  /** Plaintext credentials from a first login / device registration, shown once. */
  freshCredentials: Credentials | null;
  login: (code: string) => Promise<void>;
  logout: () => void;
  setFreshCredentials: (creds: Credentials | null) => void;
  dismissCredentials: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readCreds(): Credentials | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [freshCredentials, setFreshState] = useState<Credentials | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setFreshState(readCreds());
    setInitializing(false);
  }, []);

  const setFreshCredentials = useCallback((creds: Credentials | null) => {
    setFreshState(creds);
    if (typeof window === 'undefined') return;
    if (creds) window.sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    else window.sessionStorage.removeItem(CREDS_KEY);
  }, []);

  const dismissCredentials = useCallback(() => {
    setFreshCredentials(null);
  }, [setFreshCredentials]);

  const login = useCallback(
    async (code: string) => {
      const result = await api.authGithub(code.trim());
      window.localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      // Present only on first login; persist for the credentials reveal.
      setFreshCredentials(result.credentials);
    },
    [setFreshCredentials],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(CREDS_KEY);
    setToken(null);
    setFreshState(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      initializing,
      freshCredentials,
      login,
      logout,
      setFreshCredentials,
      dismissCredentials,
    }),
    [token, initializing, freshCredentials, login, logout, setFreshCredentials, dismissCredentials],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { ApiClientError };
