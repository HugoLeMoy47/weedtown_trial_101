import { useState, useEffect, useContext, createContext } from 'react';
import api from '../services/api';

const TOKEN_KEY = 'weedtown_token';

export const authContext = createContext(null);

export function useAuth() {
  return useContext(authContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restaurar sesión al montar si hay token guardado
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then(res => setUser(res.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const loginWithToken = async (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    const res = await api.get('/auth/me');
    setUser(res.data);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <authContext.Provider value={{ user, setUser, loading, loginWithToken, logout }}>
      {children}
    </authContext.Provider>
  );
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
