import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { AuthProvider, useAuth } from '../lib/auth';
import { NetInfoProvider } from '../lib/net-info';
import { ThemeProvider } from '../lib/theme';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const url = Linking.useURL();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inPublicRoute = segments[0] === 'share';
    const inListJoin = segments[0] === 'list';
    const inResetFlow = segments[0] === 'reset-password' || segments[0] === 'forgot-password';

    if (!session && inAuthGroup) {
      router.replace('/login');
    } else if (session && !inAuthGroup && !inPublicRoute && !inListJoin && !inResetFlow) {
      AsyncStorage.getItem('pendingListJoin').then((pendingId) => {
        if (pendingId) {
          AsyncStorage.removeItem('pendingListJoin');
          router.replace(`/list/${pendingId}` as any);
        } else {
          router.replace('/(tabs)/recipes');
        }
      });
    }
  }, [session, loading, segments, router]);

  // Handle deep links for password reset on native
  // Supabase redirects to branger://reset-password#access_token=...&refresh_token=...
  useEffect(() => {
    if (!url) return;

    const parsed = Linking.parse(url);
    if (parsed.path !== 'reset-password') return;

    // Supabase puts tokens in the hash fragment, not query params
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return;

    const hashParams = new URLSearchParams(url.substring(hashIndex + 1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      router.replace({
        pathname: '/reset-password',
        params: { access_token: accessToken, refresh_token: refreshToken },
      });
    }
  }, [url, router]);

  if (loading) return null;

  return <>{children}</>;
}

function OTAUpdater() {
  useEffect(() => {
    if (__DEV__) return;

    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Silent fail — OTA check is best-effort
      }
    });

    return () => subscription.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NetInfoProvider>
          <OTAUpdater />
          <AuthGuard>
            <Slot />
          </AuthGuard>
        </NetInfoProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
