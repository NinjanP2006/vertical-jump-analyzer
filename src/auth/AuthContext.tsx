import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentUser, handleRedirectCallback, login, logout, type AuthUser } from './cognito';
import { isAuthConfigured } from './config';
import { AuthCtx } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAuthConfigured) {
        // Complete a hosted-UI redirect if we just came back from one, then read the session.
        await handleRedirectCallback().catch(() => undefined);
        if (!cancelled) setUser(getCurrentUser());
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, loading, configured: isAuthConfigured, login: () => void login(), logout }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
