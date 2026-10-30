const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
  setParams: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
};

export const useRouter = jest.fn().mockReturnValue(mockRouter);

export const useLocalSearchParams = jest.fn().mockReturnValue({});

export const useSegments = jest.fn().mockReturnValue([]);

export const usePathname = jest.fn().mockReturnValue('/');

export const useGlobalSearchParams = jest.fn().mockReturnValue({});

export const Link = jest.fn().mockImplementation(({ children }) => children);

export const Redirect = jest.fn().mockImplementation(() => null);

export const Stack = Object.assign(
  jest.fn().mockImplementation(({ children }: any) => children),
  { Screen: jest.fn().mockImplementation(() => null) },
);

export const Tabs = Object.assign(
  jest.fn().mockImplementation(({ children }: any) => children),
  { Screen: jest.fn().mockImplementation(() => null) },
);

export const Slot = jest.fn().mockImplementation(() => null);

export default {
  useRouter,
  useLocalSearchParams,
  useSegments,
  usePathname,
  useGlobalSearchParams,
  Link,
  Redirect,
  Stack,
  Tabs,
  Slot,
};
