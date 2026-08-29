import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';
import { navigate } from './router.jsx';

/**
 * Session state.
 *
 * The token and a cached copy of the session are kept in localStorage so a refresh does not bounce
 * the operator back to the login screen. On boot we still re-validate against `GET /auth/me`, so a
 * revoked or expired token is caught immediately rather than on the first real action.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => tokenStore.readSession());
  const [booting, setBooting] = useState(() => Boolean(tokenStore.read()));

  useEffect(() => {
    let cancelled = false;
    if (!tokenStore.read()) {
      setBooting(false);
      return () => {};
    }
    api.auth
      .me()
      .then((fresh) => {
        if (cancelled) return;
        setSession(fresh);
        tokenStore.writeSession(fresh);
      })
      .catch(() => {
        if (cancelled) return;
        tokenStore.clear();
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback((authResponse) => {
    tokenStore.write(authResponse.token);
    const next = { user: authResponse.user, business: authResponse.business };
    tokenStore.writeSession(next);
    setSession(next);
    return next;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const response = await api.auth.login({ email: email.trim().toLowerCase(), password });
      return adopt(response);
    },
    [adopt],
  );

  const register = useCallback(
    async (form) => {
      const response = await api.auth.register(form);
      return adopt(response);
    },
    [adopt],
  );

  const logout = useCallback((destination = '/login') => {
    tokenStore.clear();
    setSession(null);
    navigate(destination, { replace: true });
  }, []);

  const value = useMemo(() => {
    const role = session?.user?.role || null;
    return {
      session,
      booting,
      user: session?.user || null,
      business: session?.business || null,
      role,
      isAuthenticated: Boolean(session),
      isAgent: role === 'AGENT',
      canManage: role === 'OWNER' || role === 'MANAGER',
      isOwner: role === 'OWNER',
      login,
      register,
      logout,
      refresh: async () => {
        const fresh = await api.auth.me();
        setSession(fresh);
        tokenStore.writeSession(fresh);
        return fresh;
      },
    };
  }, [session, booting, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
