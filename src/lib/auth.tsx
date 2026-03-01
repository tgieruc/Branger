import { createContext, useContext, useEffect, useState } from 'react';
import { apiJson, storeTokens, clearTokens, getAccessToken, getUserFromToken, getServerUrl } from '@/lib/api';
import { clearAllCache } from '@/lib/cache';

export type User = {
  id: string;
  email: string;
  is_admin: boolean;
};

type AuthContextType = {
  session: string | null;
  user: User | null;
  loading: boolean;
  serverConfigured: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverConfigured, setServerConfigured] = useState(false);

  useEffect(() => {
    const loadAuth = async () => {
      // Check if server URL is configured
      const serverUrl = await getServerUrl();
      if (!serverUrl) {
        setServerConfigured(false);
        setLoading(false);
        return;
      }
      setServerConfigured(true);

      // Try to load stored token
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const userInfo = getUserFromToken(token);
      if (userInfo) {
        setSession(token);
        setUser(userInfo);
      }
      setLoading(false);
    };

    loadAuth();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { data, error } = await apiJson<{ access_token: string; refresh_token: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false,
    );
    if (error) return { error: new Error(error) };
    if (data) {
      await storeTokens(data.access_token, data.refresh_token);
      const userInfo = getUserFromToken(data.access_token);
      setSession(data.access_token);
      setUser(userInfo);
    }
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await apiJson<{ access_token: string; refresh_token: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false,
    );
    if (error) return { error: new Error(error) };
    if (data) {
      await storeTokens(data.access_token, data.refresh_token);
      const userInfo = getUserFromToken(data.access_token);
      setSession(data.access_token);
      setUser(userInfo);
    }
    return { error: null };
  };

  const signOut = async () => {
    await clearTokens();
    await clearAllCache();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, loading, serverConfigured, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
