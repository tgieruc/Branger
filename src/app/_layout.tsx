import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { AuthProvider, useAuth } from '../lib/auth';
import { NetInfoProvider } from '../lib/net-info';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/Toast';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, serverConfigured } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inPublicRoute = segments[0] === 'share';
    const inListJoin = segments[0] === 'list';
    const inServerSetup = segments[0] === 'server-setup';

    // If server is not configured, redirect to server setup
    if (!serverConfigured && !inServerSetup && !inPublicRoute) {
      router.replace('/server-setup');
      return;
    }

    if (!session && inAuthGroup) {
      router.replace('/login');
    } else if (session && !inAuthGroup && !inPublicRoute && !inListJoin && !inServerSetup) {
      AsyncStorage.getItem('pendingListJoin').then((pendingId) => {
        if (pendingId) {
          AsyncStorage.removeItem('pendingListJoin');
          router.replace(`/list/${pendingId}` as any);
        } else {
          router.replace('/(tabs)/recipes');
        }
      });
    }
  }, [session, loading, segments, router, serverConfigured]);

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
