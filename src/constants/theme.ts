/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#5C7A00';  // darkened lime for contrast on white
const tintColorDark = '#D4ED6E';   // lime

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
    primary: '#D4ED6E',       // lime — button backgrounds
    primaryText: '#5C7A00',   // dark lime — text links, inline actions
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
    buttonText: '#1A1A2E',    // navy on lime buttons
    addToListBg: '#f4f8e4',   // lime tint
    addToListBorder: '#d4e8a0',
    checkedText: '#bbb',
    chevron: '#ccc',
    searchBarBg: '#fff',
    inputAreaBg: '#fafafa',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#a1a1a6',
    textTertiary: '#8e8e93',
    background: '#0F1117',          // void
    backgroundSecondary: '#1A1A2E', // navy deep
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: '#D4ED6E',             // lime
    primaryText: '#D4ED6E',         // lime on dark = good contrast
    danger: '#ff453a',
    success: '#30d158',
    aiPurple: '#5E5CE6',
    border: '#2a2a4a',              // navy-tinted
    borderLight: '#1e1e3a',
    card: '#1A1A2E',                // navy deep
    inputBorder: '#2a2a4a',
    inputBackground: '#16213E',     // navy mid
    placeholder: '#636366',
    modalOverlay: 'rgba(0,0,0,0.7)',
    modalBackground: '#1A1A2E',
    offlineBannerBg: '#332d00',
    offlineBannerText: '#ffd60a',
    tabBarBackground: '#0F1117',    // void
    tabBarBorder: '#2a2a4a',
    headerBackground: '#0F1117',    // void
    headerText: '#ECEDEE',
    shadow: '#000',
    cancelButton: '#16213E',        // navy mid
    cancelText: '#ECEDEE',
    buttonText: '#1A1A2E',          // navy on lime
    addToListBg: '#1a2a1a',         // lime-tinted dark
    addToListBorder: '#2a3a1a',
    checkedText: '#636366',
    chevron: '#3a3a5a',
    searchBarBg: '#1A1A2E',
    inputAreaBg: '#1A1A2E',
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
