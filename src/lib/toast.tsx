import { createContext, useContext, useCallback, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

type ToastMessage = {
  id: number;
  text: string;
  type: ToastType;
};

type ToastContextValue = {
  toasts: ToastMessage[];
  show: (text: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  show: () => {},
});

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
