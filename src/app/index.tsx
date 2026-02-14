import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ActivityIndicator, View } from 'react-native';

export default function IndexScreen() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)/recipes" />;
  }

  return <Redirect href="/login" />;
}
