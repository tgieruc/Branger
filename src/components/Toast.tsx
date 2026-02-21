import { StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/lib/toast';
import { useColors } from '@/hooks/useColors';

const TYPE_COLORS = {
  success: { light: '#34c759', dark: '#30d158' },
  error: { light: '#ff3b30', dark: '#ff453a' },
  info: { light: '#007AFF', dark: '#0A84FF' },
};

export function ToastContainer() {
  const { toasts } = useToast();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDark = colors.background === '#000';

  return (
    <>
      {toasts.map((toast) => (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(300)}
          exiting={FadeOutUp.duration(200)}
          style={[
            styles.toast,
            { top: insets.top + 8 },
            { backgroundColor: isDark ? TYPE_COLORS[toast.type].dark : TYPE_COLORS[toast.type].light },
          ]}
        >
          <Animated.Text style={styles.toastText}>{toast.text}</Animated.Text>
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    zIndex: 9999,
    alignItems: 'center',
    maxWidth: 600,
    alignSelf: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
