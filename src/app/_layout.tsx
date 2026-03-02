import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { AuthProvider, useAuth } from '../lib/auth';
import { NetInfoProvider } from '../lib/net-info';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/Toast';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inPublicRoute = segments[0] === 'share' || segments[0] === 'oauth';
    const inListJoin = segments[0] === 'list';
    const inResetFlow = segments[0] === 'reset-password' || segments[0] === 'forgot-password';

    if (!session && inAuthGroup) {
      router.replace('/login');
    } else if (session && !inAuthGroup && !inPublicRoute && !inListJoin && !inResetFlow) {
      AsyncStorage.multiGet(['oauth_return_url', 'pendingListJoin']).then(([[, oauthUrl], [, pendingId]]) => {
        if (oauthUrl) {
          AsyncStorage.removeItem('oauth_return_url');
          router.replace(oauthUrl as any);
        } else if (pendingId) {
          AsyncStorage.removeItem('pendingListJoin');
          router.replace(`/list/${pendingId}` as any);
        } else {
          router.replace('/(tabs)/recipes');
        }
      });
    }
  }, [session, loading, segments, router]);

  // Handle deep links for password reset on native
  // With PKCE flow, the auth-callback edge function redirects to
  // branger://reset-password?code=xxx (query params, not hash fragments)
  // Expo Router automatically parses query params into useLocalSearchParams,
  // so no manual parsing is needed here.

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
          Alert.alert(
            'Update Available',
            'A new version has been downloaded. Restart now?',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Restart', onPress: () => Updates.reloadAsync() },
            ]
          );
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
          <ToastProvider>
            <OTAUpdater />
            <AuthGuard>
              <Slot />
            </AuthGuard>
            <ToastContainer />
          </ToastProvider>
        </NetInfoProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
