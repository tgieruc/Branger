import { Text, View, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { useColors } from '@/hooks/useColors';

type Props = {
  size?: number;
  showTagline?: boolean;
};

export function BrangerLogo({ size = 48, showTagline = false }: Props) {
  const colors = useColors();
  const [fontsLoaded] = useFonts({
    'DMSerifDisplay': require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.wordmark, { fontSize: size, color: colors.text }]}>
        bran<Text style={{ color: colors.primary }}>ger</Text>
      </Text>
      {showTagline && (
        <Text style={[styles.tagline, { color: colors.textTertiary, fontSize: size * 0.18 }]}>
          MEAL PLANNING · AI RECIPES
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: 'DMSerifDisplay',
    letterSpacing: -1,
  },
  tagline: {
    letterSpacing: 3,
    marginTop: -2,
  },
});
