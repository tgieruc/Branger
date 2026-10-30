import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { BrangerLogo } from '@/components/BrangerLogo';

export default function ListsLayout() {
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
      <Stack.Screen name="[id]" options={{ title: 'List' }} />
    </Stack>
  );
}
