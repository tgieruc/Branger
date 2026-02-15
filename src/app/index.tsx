import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ActivityIndicator, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function IndexScreen() {
  const { session, loading } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)/recipes" />;
  }

  return <Redirect href="/login" />;
}
