import { useTheme } from '@/lib/theme';
import { Colors } from '@/constants/theme';

export function useColors() {
  const { colorScheme } = useTheme();
  return Colors[colorScheme];
}
