import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { useColors } from '@/hooks/useColors';
import ConfirmDialog from '@/components/ConfirmDialog';
import { shadow } from '@/constants/theme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const colors = useColors();
  const router = useRouter();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [controlWidth, setControlWidth] = useState(0);

  const themeIndex = THEME_OPTIONS.findIndex((o) => o.value === preference);

  const indicatorStyle = useAnimatedStyle(() => {
    if (controlWidth === 0) return {};
    const segWidth = (controlWidth - 4) / THEME_OPTIONS.length;
    return {
      width: segWidth,
      transform: [{ translateX: withTiming(themeIndex * segWidth, { duration: 200 }) }],
    };
  });

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* Account Section */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>ACCOUNT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Email</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{user?.email}</Text>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/(tabs)/settings/change-password')}
            accessibilityLabel="Change password"
            accessibilityRole="button"
          >
            <Ionicons name="key-outline" size={20} color={colors.primary} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.chevron} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* Appearance Section */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <View style={styles.segmentRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
            <View
              style={[styles.segmentControl, { backgroundColor: colors.backgroundSecondary }]}
              onLayout={(e) => setControlWidth(e.nativeEvent.layout.width)}
            >
              <Animated.View
                style={[
                  styles.segmentIndicator,
                  { backgroundColor: colors.card },
                  indicatorStyle,
                ]}
              />
              {THEME_OPTIONS.map((option) => {
                const selected = preference === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.segmentButton}
                    onPress={() => setPreference(option.value)}
                    accessibilityLabel={`Theme: ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: colors.textSecondary },
                        selected && { color: colors.text, fontWeight: '600' },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Actions Section */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>ACTIONS</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setLogoutVisible(true)}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={logoutVisible}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive={false}
        onConfirm={() => { setLogoutVisible(false); signOut(); }}
        onCancel={() => setLogoutVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: {
    marginRight: 10,
  },
  rowLabel: {
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  rowValue: {
    fontSize: 16,
    marginLeft: 'auto',
    flexShrink: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  segmentControl: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    position: 'relative',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 6,
    ...shadow(1, 2, 0.1),
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
  },
});
