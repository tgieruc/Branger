import React, { createContext, useContext } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';

const NetInfoContext = createContext<boolean>(true);

export function NetInfoProvider({ children }: { children: React.ReactNode }) {
  const netInfo = useNetInfo();
  const isOnline = netInfo.isConnected !== false;

  return (
    <NetInfoContext.Provider value={isOnline}>
      {children}
    </NetInfoContext.Provider>
  );
}

export function useIsOnline(): boolean {
  return useContext(NetInfoContext);
}
