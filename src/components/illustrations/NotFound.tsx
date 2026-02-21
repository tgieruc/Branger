import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function NotFound({ size = 120 }: { size?: number }) {
  const colors = useColors();
  const muted = colors.textTertiary;
  const bg = colors.backgroundSecondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* Plate */}
      <Ellipse cx="60" cy="70" rx="45" ry="12" fill={bg} stroke={muted} strokeWidth="2" />
      <Ellipse cx="60" cy="65" rx="45" ry="12" fill={bg} stroke={muted} strokeWidth="2" />
      {/* Question mark */}
      <Path
        d="M52 40 C52 30, 68 30, 68 40 C68 48, 60 47, 60 55"
        stroke={muted}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
      <Circle cx="60" cy="62" r="2" fill={muted} opacity={0.6} />
    </Svg>
  );
}
