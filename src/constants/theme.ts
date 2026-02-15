/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#666',
    textTertiary: '#888',
    background: '#fff',
    backgroundSecondary: '#f5f5f5',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    primary: '#007AFF',
    danger: '#ff3b30',
    success: '#34c759',
    aiPurple: '#5856D6',
    border: '#ccc',
    borderLight: '#eee',
    card: '#fff',
    inputBorder: '#ddd',
    inputBackground: '#fff',
    placeholder: '#999',
    modalOverlay: 'rgba(0,0,0,0.5)',
    modalBackground: '#fff',
    offlineBannerBg: '#fff3cd',
    offlineBannerText: '#856404',
    tabBarBackground: '#fff',
    tabBarBorder: '#ccc',
    headerBackground: '#fff',
    headerText: '#000',
    shadow: '#000',
    cancelButton: '#f0f0f0',
    cancelText: '#333',
    buttonText: '#fff',
    addToListBg: '#f0f7ff',
    addToListBorder: '#d0e4ff',
    checkedText: '#bbb',
    chevron: '#ccc',
    searchBarBg: '#fff',
    inputAreaBg: '#fafafa',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#a1a1a6',
    textTertiary: '#8e8e93',
    background: '#000',
    backgroundSecondary: '#1c1c1e',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: '#0A84FF',
    danger: '#ff453a',
    success: '#30d158',
    aiPurple: '#5E5CE6',
    border: '#38383a',
    borderLight: '#2c2c2e',
    card: '#1c1c1e',
    inputBorder: '#38383a',
    inputBackground: '#1c1c1e',
    placeholder: '#636366',
    modalOverlay: 'rgba(0,0,0,0.7)',
    modalBackground: '#2c2c2e',
    offlineBannerBg: '#332d00',
    offlineBannerText: '#ffd60a',
    tabBarBackground: '#1c1c1e',
    tabBarBorder: '#38383a',
    headerBackground: '#1c1c1e',
    headerText: '#ECEDEE',
    shadow: '#000',
    cancelButton: '#3a3a3c',
    cancelText: '#ECEDEE',
    buttonText: '#fff',
    addToListBg: '#1a2a3a',
    addToListBorder: '#1a3a5c',
    checkedText: '#636366',
    chevron: '#48484a',
    searchBarBg: '#1c1c1e',
    inputAreaBg: '#1c1c1e',
  },
};

export function shadow(offsetY: number, radius: number, opacity: number) {
  if (Platform.OS === 'web') {
    return { boxShadow: `0px ${offsetY}px ${radius}px rgba(0,0,0,${opacity})` } as any;
  }
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation: Math.round(offsetY * 2),
  };
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
