import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall, apiJson, storeTokens, clearTokens, getServerUrl, setServerUrl, getUserFromToken, getWsUrl } from '../api';

// Mock global fetch
const mockFetch = jest.fn();
const originalFetch = global.fetch;

// Helper to create a JWT-like token with exp claim
function createMockToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  global.fetch = mockFetch;
  // Reset module-level caches by clearing tokens and setting a fresh server URL
  await clearTokens();
  await setServerUrl('');
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('Server URL', () => {
  test('setServerUrl strips trailing slash', async () => {
    await setServerUrl('https://example.com/');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@server_url', 'https://example.com');
  });

  test('getServerUrl returns cached value', async () => {
    await setServerUrl('https://example.com');
    const url = await getServerUrl();
    expect(url).toBe('https://example.com');
  });
});

describe('Token management', () => {
  test('storeTokens saves to AsyncStorage', async () => {
    await storeTokens('access-123', 'refresh-456');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@access_token', 'access-123');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@refresh_token', 'refresh-456');
  });

  test('clearTokens removes from AsyncStorage', async () => {
    await clearTokens();
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['@access_token', '@refresh_token']);
  });
});

describe('getUserFromToken', () => {
  test('extracts user info from JWT payload', () => {
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    const user = getUserFromToken(token);
    expect(user).toEqual({ id: 'user-1', email: 'test@test.com', is_admin: false });
  });

  test('returns null for invalid token', () => {
    expect(getUserFromToken('invalid')).toBeNull();
  });
});

describe('apiCall', () => {
  test('adds Authorization header when authenticated', async () => {
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await setServerUrl('https://api.test.com');
    await storeTokens(token, 'refresh-tok');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await apiCall('/api/recipes/');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/recipes/',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': `Bearer ${token}`,
        }),
      }),
    );
  });

  test('does not add auth header when requireAuth is false', async () => {
    await setServerUrl('https://api.test.com');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await apiCall('/api/share/abc', {}, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/share/abc',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'Authorization': expect.anything(),
        }),
      }),
    );
  });

  test('sets Content-Type to application/json by default', async () => {
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await setServerUrl('https://api.test.com');
    await storeTokens(token, 'refresh-tok');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await apiCall('/api/recipes/');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/recipes/',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  test('retries with refreshed token on 401', async () => {
    const expiredToken = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    const newToken = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await setServerUrl('https://api.test.com');
    await storeTokens(expiredToken, 'refresh-tok');

    // First call returns 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    // Refresh call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ access_token: newToken, refresh_token: 'new-refresh' }),
    });
    // Retry call succeeds
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const resp = await apiCall('/api/recipes/');

    expect(resp.status).toBe(200);
    // Should have made 3 fetch calls: original, refresh, retry
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('apiJson', () => {
  test('returns parsed JSON on success', async () => {
    await setServerUrl('https://api.test.com');
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await storeTokens(token, 'refresh-tok');
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ id: '1', title: 'Pasta' }),
    });

    const result = await apiJson('/api/recipes/1');
    expect(result.data).toEqual({ id: '1', title: 'Pasta' });
    expect(result.error).toBeNull();
  });

  test('returns error on failure', async () => {
    await setServerUrl('https://api.test.com');
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await storeTokens(token, 'refresh-tok');
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 404,
      json: async () => ({ detail: 'Not found' }),
    });

    const result = await apiJson('/api/recipes/999');
    expect(result.data).toBeNull();
    expect(result.error).toBe('Not found');
    expect(result.status).toBe(404);
  });

  test('handles 204 No Content', async () => {
    await setServerUrl('https://api.test.com');
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await storeTokens(token, 'refresh-tok');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await apiJson('/api/recipes/1');
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
    expect(result.status).toBe(204);
  });

  test('handles network error', async () => {
    await setServerUrl('https://api.test.com');
    const token = createMockToken({ sub: 'user-1', email: 'test@test.com', is_admin: false, exp: 9999999999 });
    await storeTokens(token, 'refresh-tok');
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await apiJson('/api/recipes/1');
    expect(result.data).toBeNull();
    expect(result.error).toBe('Network error');
    expect(result.status).toBe(0);
  });
});

describe('getWsUrl', () => {
  test('converts http to ws', async () => {
    await setServerUrl('http://api.test.com');
    const wsUrl = await getWsUrl();
    expect(wsUrl).toBe('ws://api.test.com');
  });

  test('converts https to wss', async () => {
    await setServerUrl('https://api.test.com');
    const wsUrl = await getWsUrl();
    expect(wsUrl).toBe('wss://api.test.com');
  });
});
