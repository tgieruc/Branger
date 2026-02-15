import { useState } from 'react';
import { Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function RecipesLayout() {
  const { signOut } = useAuth();
  const [logoutVisible, setLogoutVisible] = useState(false);

  return (
    <>
      <Stack
        screenOptions={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setLogoutVisible(true)}
              style={{ marginRight: 4 }}
              accessibilityLabel="Sign out"
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Recipes' }} />
        <Stack.Screen name="create" options={{ title: 'New Recipe' }} />
        <Stack.Screen name="[id]" options={{ title: 'Recipe' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit Recipe' }} />
      </Stack>
      <ConfirmDialog
        visible={logoutVisible}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        onConfirm={() => { setLogoutVisible(false); signOut(); }}
        onCancel={() => setLogoutVisible(false)}
      />
    </>
  );
}
