import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = '@server_url';
const ACCESS_TOKEN_KEY = '@access_token';
const REFRESH_TOKEN_KEY = '@refresh_token';

let cachedServerUrl: string = '';
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;

// Server URL management
export async function getServerUrl(): Promise<string> {
  if (!cachedServerUrl) {
    cachedServerUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) || '';
  }
  return cachedServerUrl;
}

export async function setServerUrl(url: string): Promise<void> {
  cachedServerUrl = url.replace(/\/$/, '');
  await AsyncStorage.setItem(SERVER_URL_KEY, cachedServerUrl);
}

// Token management
export async function getAccessToken(): Promise<string | null> {
  if (!cachedAccessToken) {
    cachedAccessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return cachedAccessToken;
}

export async function storeTokens(access: string, refresh: string): Promise<void> {
  cachedAccessToken = access;
  cachedRefreshToken = refresh;
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

// JWT decode helper (no verification, just payload extraction)
function decodeJwtPayload(token: string): { exp: number; sub: string; email: string; is_admin: boolean } | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp - Date.now() / 1000 < 60;
}

// Token refresh
async function refreshAccessToken(): Promise<string | null> {
  if (!cachedRefreshToken) {
    cachedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  }
  if (!cachedRefreshToken) return null;

  const base = await getServerUrl();
  try {
    const resp = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: cachedRefreshToken }),
    });
    if (!resp.ok) {
      await clearTokens();
      return null;
    }
    const data = await resp.json();
    await storeTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

// Get user info from stored token
export function getUserFromToken(token: string): { id: string; email: string; is_admin: boolean } | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, is_admin: payload.is_admin };
}

// Main API call function
export async function apiCall(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<Response> {
  const base = await getServerUrl();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Only set Content-Type for non-FormData bodies
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (requireAuth) {
    let token = await getAccessToken();
    if (token && isTokenExpiringSoon(token)) {
      token = await refreshAccessToken();
    }
    if (!token) {
      token = await refreshAccessToken();
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const resp = await fetch(`${base}${path}`, { ...options, headers });

  // If 401 and we have auth, try refresh once
  if (resp.status === 401 && requireAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(`${base}${path}`, { ...options, headers });
    }
  }

  return resp;
}

// Helper for JSON API calls
export async function apiJson<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const resp = await apiCall(path, options, requireAuth);
    if (resp.status === 204) {
      return { data: null, error: null, status: 204 };
    }
    const body = await resp.json();
    if (!resp.ok) {
      return { data: null, error: body.detail || 'Request failed', status: resp.status };
    }
    return { data: body as T, error: null, status: resp.status };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Network error';
    return { data: null, error: message, status: 0 };
  }
}

// WebSocket URL helper
export async function getWsUrl(): Promise<string> {
  const base = await getServerUrl();
  return base.replace(/^http/, 'ws');
}
