import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function RecipesLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Recipes' }} />
      <Stack.Screen name="create" options={{ title: 'New Recipe' }} />
      <Stack.Screen name="[id]" options={{ title: 'Recipe' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Recipe' }} />
    </Stack>
  );
}
