// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(null),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
  multiSet: jest.fn().mockResolvedValue(null),
  multiGet: jest.fn().mockResolvedValue([]),
  multiRemove: jest.fn().mockResolvedValue(null),
  getAllKeys: jest.fn().mockResolvedValue([]),
  clear: jest.fn().mockResolvedValue(null),
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => ({
  default: {
    call: jest.fn(),
    createAnimatedComponent: (component: unknown) => component,
    addWhitelistedNativeProps: jest.fn(),
    addWhitelistedUIProps: jest.fn(),
  },
  useSharedValue: jest.fn().mockReturnValue({ value: 0 }),
  useAnimatedStyle: jest.fn().mockReturnValue({}),
  useDerivedValue: jest.fn().mockReturnValue({ value: 0 }),
  useAnimatedScrollHandler: jest.fn(),
  withTiming: jest.fn((value) => value),
  withSpring: jest.fn((value) => value),
  withDelay: jest.fn((_, value) => value),
  withSequence: jest.fn((...values) => values[values.length - 1]),
  Easing: { linear: jest.fn(), ease: jest.fn(), bezier: jest.fn() },
  FadeIn: { duration: jest.fn().mockReturnValue({}) },
  FadeOut: { duration: jest.fn().mockReturnValue({}) },
  Layout: {},
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock expo-image
jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// Mock theme provider
jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn().mockReturnValue({
    preference: 'system',
    setPreference: jest.fn(),
    colorScheme: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
