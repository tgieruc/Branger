import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function EmptyCookbook({ size = 140 }: { size?: number }) {
  const colors = useColors();
  const primary = colors.primary;
  const muted = colors.textTertiary;
  const bg = colors.backgroundSecondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 140 140" fill="none">
      {/* Book body */}
      <Rect x="25" y="30" width="90" height="85" rx="6" fill={bg} stroke={muted} strokeWidth="2" />
      {/* Book spine */}
      <Rect x="25" y="30" width="12" height="85" rx="3" fill={primary} opacity={0.8} />
      {/* Page lines */}
      <Path d="M50 55 L100 55" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      <Path d="M50 67 L95 67" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      <Path d="M50 79 L90 79" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      <Path d="M50 91 L85 91" stroke={muted} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      {/* Steam curves */}
      <G opacity={0.5}>
        <Path d="M65 25 C65 18, 72 18, 72 12" stroke={primary} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Path d="M78 28 C78 20, 85 20, 85 14" stroke={primary} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Path d="M91 25 C91 18, 98 18, 98 12" stroke={primary} strokeWidth="2" strokeLinecap="round" fill="none" />
      </G>
      {/* Sparkle dots */}
      <Circle cx="55" cy="18" r="2" fill={primary} opacity={0.3} />
      <Circle cx="105" cy="22" r="1.5" fill={primary} opacity={0.3} />
    </Svg>
  );
}
