import { Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';

export default function RecipesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Recipes' }} />
      <Stack.Screen name="create" options={{ title: 'New Recipe' }} />
      <Stack.Screen name="[id]" options={{ title: 'Recipe' }} />
    </Stack>
  );
}
