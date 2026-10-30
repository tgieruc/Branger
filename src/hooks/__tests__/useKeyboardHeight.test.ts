import { renderHook, act } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

describe('useKeyboardHeight', () => {
  let listeners: Record<string, (e?: any) => void>;

  beforeEach(() => {
    listeners = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: any) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 0 initially', () => {
    const { result } = renderHook(() => useKeyboardHeight());
    expect(result.current).toBe(0);
  });

  it('updates height when keyboard shows on Android', () => {
    (Platform as any).OS = 'android';

    const { result } = renderHook(() => useKeyboardHeight());

    act(() => {
      listeners['keyboardDidShow']?.({ endCoordinates: { height: 300 } });
    });

    expect(result.current).toBe(300);
  });

  it('resets height when keyboard hides on Android', () => {
    (Platform as any).OS = 'android';

    const { result } = renderHook(() => useKeyboardHeight());

    act(() => {
      listeners['keyboardDidShow']?.({ endCoordinates: { height: 300 } });
    });
    expect(result.current).toBe(300);

    act(() => {
      listeners['keyboardDidHide']?.();
    });
    expect(result.current).toBe(0);
  });

  it('uses keyboardWillShow/Hide on iOS', () => {
    (Platform as any).OS = 'ios';

    renderHook(() => useKeyboardHeight());

    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardWillShow', expect.any(Function));
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardWillHide', expect.any(Function));
  });

  it('uses keyboardDidShow/Hide on Android', () => {
    (Platform as any).OS = 'android';

    renderHook(() => useKeyboardHeight());

    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
  });

  it('cleans up listeners on unmount', () => {
    const removeMock = jest.fn();
    (Keyboard.addListener as jest.Mock).mockImplementation(() => ({ remove: removeMock }));

    const { unmount } = renderHook(() => useKeyboardHeight());
    unmount();

    expect(removeMock).toHaveBeenCalledTimes(2);
  });
});
