import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';
import { navigate } from './router.jsx';

/**
 * Session state and authentication provider.
 *
 * Access token is maintained in-memory only.
 * Rotating refresh token is stored in localStorage.
 * On application boot, if a refresh token exists, a silent refresh is performed to rehydrate the session.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => tokenStore.readSession());
  const [booting, setBooting] = useState(() => Boolean(tokenStore.getRefreshToken()));

  useEffect(() => {
    let cancelled = false;
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) {
      setBooting(false);
      return () => {};
    }

    api.auth
      .refresh({ refreshToken })
      .then((authResponse) => {
        if (cancelled) return null;
        tokenStore.setAccessToken(authResponse.token);
        if (authResponse.refreshToken) {
          tokenStore.setRefreshToken(authResponse.refreshToken);
        }
        return api.auth.me();
      })
      .then((fresh) => {
        if (cancelled || !fresh) return;
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
    tokenStore.setAccessToken(authResponse.token);
    if (authResponse.refreshToken) {
      tokenStore.setRefreshToken(authResponse.refreshToken);
    }
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

  const logout = useCallback(async (destination = '/login') => {
    const refreshToken = tokenStore.getRefreshToken();
    if (refreshToken) {
      try {
        await api.auth.logout({ refreshToken });
      } catch {
        /* ignore network failure on logout */
      }
    }
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
