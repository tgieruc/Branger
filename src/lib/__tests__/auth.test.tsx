import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase');

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: null },
    error: null,
  });
  (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
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
});

describe('useAuth', () => {
  it('throws when used outside of AuthProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      'useAuth must be used within AuthProvider',
    );

    consoleError.mockRestore();
  });

  it('signIn calls supabase.auth.signInWithPassword', async () => {
    function SignInTest() {
      const { signIn } = useAuth();
      React.useEffect(() => {
        signIn('test@example.com', 'password123');
      }, []);
      return null;
    }

    render(
      <AuthProvider>
        <SignInTest />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('signUp calls supabase.auth.signUp', async () => {
    function SignUpTest() {
      const { signUp } = useAuth();
      React.useEffect(() => {
        signUp('new@example.com', 'newpass123');
      }, []);
      return null;
    }

    render(
      <AuthProvider>
        <SignUpTest />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'newpass123',
      });
    });
  });

  it('signOut calls supabase.auth.signOut', async () => {
    function SignOutTest() {
      const { signOut } = useAuth();
      React.useEffect(() => {
        signOut();
      }, []);
      return null;
    }

    render(
      <AuthProvider>
        <SignOutTest />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });
});
