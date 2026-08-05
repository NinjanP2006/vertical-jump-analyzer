import { createContext, useContext } from 'react';
import type { AuthUser } from './cognito';

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Whether Cognito env is present — false means accounts are simply unavailable. */
  configured: boolean;
  login: () => void;
  logout: () => void;
}

export const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
