import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) return setReady(true);
    api.get('/auth/me')
      .then((r) => setAdmin(r.data))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setAdmin(null);
    window.addEventListener('ble:logout', onLogout);
    return () => window.removeEventListener('ble:logout', onLogout);
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    tokenStore.set(data.token);
    setAdmin(data.admin);
    return data.admin;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setAdmin(null);
  }, []);

  return <AuthContext.Provider value={{ admin, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
