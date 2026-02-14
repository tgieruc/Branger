import { Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';

export default function ListsLayout() {
  const { signOut } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={signOut} style={{ marginRight: 4 }}>
            <Ionicons name="log-out-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Shopping Lists' }} />
      <Stack.Screen name="[id]" options={{ title: 'List' }} />
    </Stack>
  );
}
