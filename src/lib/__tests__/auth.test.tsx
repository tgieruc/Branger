import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { apiJson, storeTokens, clearTokens, getAccessToken, getUserFromToken, getServerUrl } from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('@/lib/cache', () => ({
  clearAllCache: jest.fn().mockResolvedValue(undefined),
}));

const mockUser = { id: 'user-1', email: 'test@example.com', is_admin: false };

beforeEach(() => {
  jest.clearAllMocks();
  (getServerUrl as jest.Mock).mockResolvedValue('https://api.test.com');
  (getAccessToken as jest.Mock).mockResolvedValue(null);
  (getUserFromToken as jest.Mock).mockReturnValue(null);
});

function TestConsumer() {
  const { loading, user } = useAuth();
  return <Text>{loading ? 'loading' : user ? 'logged-in' : 'logged-out'}</Text>;
}

describe('AuthProvider', () => {
  it('renders children', async () => {
    const { getByText } = render(
      <AuthProvider>
        <Text>child content</Text>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByText('child content')).toBeTruthy();
    });
  });

  it('provides auth context to children', async () => {
    const { getByText } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByText('logged-out')).toBeTruthy();
    });
  });

  it('loads user from stored token on mount', async () => {
    const mockToken = 'stored-access-token';
    (getAccessToken as jest.Mock).mockResolvedValue(mockToken);
    (getUserFromToken as jest.Mock).mockReturnValue(mockUser);

    const { getByText } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByText('logged-in')).toBeTruthy();
    });
  });

  it('sets serverConfigured to false when no server URL', async () => {
    (getServerUrl as jest.Mock).mockResolvedValue('');

    function ServerCheck() {
      const { serverConfigured, loading } = useAuth();
      return <Text>{loading ? 'loading' : serverConfigured ? 'configured' : 'not-configured'}</Text>;
    }

    const { getByText } = render(
      <AuthProvider>
        <ServerCheck />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByText('not-configured')).toBeTruthy();
    });
  });
});

describe('useAuth', () => {
  it('throws when used outside of AuthProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      'useAuth must be used within AuthProvider',
    );

    consoleError.mockRestore();
  });

  it('signIn calls login endpoint and stores tokens', async () => {
    const mockTokenData = { access_token: 'new-access', refresh_token: 'new-refresh' };
    (apiJson as jest.Mock).mockResolvedValue({ data: mockTokenData, error: null, status: 200 });
    (getUserFromToken as jest.Mock).mockReturnValue(mockUser);

    function SignInTest() {
      const { signIn } = useAuth();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { signIn('test@example.com', 'password123'); }, []);
      return null;
    }

    render(
      <AuthProvider>
        <SignInTest />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
        },
        false,
      );
      expect(storeTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
    });
  });

  it('signUp calls register endpoint and stores tokens', async () => {
    const mockTokenData = { access_token: 'new-access', refresh_token: 'new-refresh' };
    (apiJson as jest.Mock).mockResolvedValue({ data: mockTokenData, error: null, status: 200 });
    (getUserFromToken as jest.Mock).mockReturnValue(mockUser);

    function SignUpTest() {
      const { signUp } = useAuth();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { signUp('new@example.com', 'newpass123'); }, []);
      return null;
    }

    render(
      <AuthProvider>
        <SignUpTest />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'new@example.com', password: 'newpass123' }),
        },
        false,
      );
      expect(storeTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
    });
  });

  it('signOut clears tokens and cache', async () => {
    const { clearAllCache } = require('@/lib/cache');

    function SignOutTest() {
      const { signOut } = useAuth();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { signOut(); }, []);
      return null;
    }

    render(
      <AuthProvider>
        <SignOutTest />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(clearTokens).toHaveBeenCalled();
      expect(clearAllCache).toHaveBeenCalled();
    });
  });
});
