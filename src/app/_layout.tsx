import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/auth';
import { NetInfoProvider } from '../lib/net-info';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inPublicRoute = segments[0] === 'share';

    if (!session && inAuthGroup) {
      router.replace('/login');
    } else if (session && !inAuthGroup && !inPublicRoute) {
      router.replace('/(tabs)/recipes');
    }
  }, [session, loading, segments, router]);

  if (loading) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NetInfoProvider>
        <AuthGuard>
          <Slot />
        </AuthGuard>
      </NetInfoProvider>
    </AuthProvider>
  );
}
