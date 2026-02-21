import Svg, { Path, Rect, Line } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function EmptyShoppingBag({ size = 140 }: { size?: number }) {
  const colors = useColors();
  const primary = colors.primary;
  const muted = colors.textTertiary;
  const bg = colors.backgroundSecondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 140 140" fill="none">
      {/* Bag body */}
      <Path d="M30 50 L30 115 C30 119 33 122 37 122 L103 122 C107 122 110 119 110 115 L110 50 Z" fill={bg} stroke={muted} strokeWidth="2" />
      {/* Bag handle */}
      <Path d="M50 50 L50 35 C50 25 60 18 70 18 C80 18 90 25 90 35 L90 50" stroke={primary} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Checklist lines */}
      <Rect x="45" y="65" width="10" height="10" rx="2" stroke={primary} strokeWidth="1.5" fill="none" />
      <Line x1="62" y1="70" x2="95" y2="70" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <Rect x="45" y="85" width="10" height="10" rx="2" stroke={primary} strokeWidth="1.5" fill="none" />
      <Line x1="62" y1="90" x2="90" y2="90" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <Rect x="45" y="105" width="10" height="10" rx="2" stroke={muted} strokeWidth="1.5" fill="none" opacity={0.3} />
      <Line x1="62" y1="110" x2="85" y2="110" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
    </Svg>
  );
}
