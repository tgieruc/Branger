import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { BrangerLogo } from '@/components/BrangerLogo';

export default function RecipesLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerTitle: () => <BrangerLogo size={24} /> }} />
      <Stack.Screen name="create" options={{ title: 'New Recipe' }} />
      <Stack.Screen name="[id]" options={{ title: 'Recipe' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Recipe' }} />
    </Stack>
  );
}
