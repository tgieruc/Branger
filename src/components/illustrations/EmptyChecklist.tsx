import Svg, { Rect, Line } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function EmptyChecklist({ size = 80 }: { size?: number }) {
  const colors = useColors();
  const primary = colors.primary;
  const muted = colors.textTertiary;

  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Clipboard */}
      <Rect x="15" y="12" width="50" height="60" rx="5" stroke={muted} strokeWidth="2" fill="none" opacity={0.4} />
      {/* Clipboard clip */}
      <Rect x="28" y="8" width="24" height="10" rx="3" fill={primary} opacity={0.6} />
      {/* Empty lines */}
      <Line x1="25" y1="32" x2="55" y2="32" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <Line x1="25" y1="44" x2="50" y2="44" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <Line x1="25" y1="56" x2="45" y2="56" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
    </Svg>
  );
}
