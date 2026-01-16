// Expo managed workflow için NetInfo bağımlılığı olmadan network durumu

import { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { syncPendingChanges } from '@/lib/syncPendingChanges';

export function useNetworkStatus(onOnline?: () => void) {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const onOnlineRef = useRef(onOnline);
  const lastStateRef = useRef<boolean | null>(null);

  // Ağ durumunu kontrol eden fonksiyon
  const checkNetwork = async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      setIsConnected(!!state.isConnected && !!state.isInternetReachable);
      if (__DEV__) console.log('[DEBUG][NetInfo][expo-network] Durum:', state);
      if (!!state.isConnected && !!state.isInternetReachable && lastStateRef.current === false && typeof onOnlineRef.current === 'function') {
        onOnlineRef.current();
      }
      lastStateRef.current = !!state.isConnected && !!state.isInternetReachable;
      // Online olduysa pending değişiklikleri sync et
      if (!!state.isConnected && !!state.isInternetReachable) {
        syncPendingChanges();
      }
    } catch (e) {
      setIsConnected(true); // Hata olursa online varsay
    }
  };

  useEffect(() => {
    onOnlineRef.current = onOnline;
  }, [onOnline]);


  useEffect(() => {
    checkNetwork();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkNetwork();
      }
    });

    // 15 saniyede bir network kontrolü (daha hızlı offline/online algılama)
    const interval = setInterval(() => {
      checkNetwork();
    }, 15000); // 15 saniye

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  return isConnected;
}
