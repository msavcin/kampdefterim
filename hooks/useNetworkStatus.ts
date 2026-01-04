// useNetworkStatus.ts
import { useEffect, useState, useRef } from 'react';
import { syncPendingChanges } from '@/lib/syncPendingChanges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';


// Opsiyonel: online olduğunda callback tetiklenebilir
export function useNetworkStatus(onOnline?: () => void) {
  const [isConnected, setIsConnected] = useState(true);
  const isSyncingRef = useRef(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async state => {
      console.log('[DEBUG][NetInfo] Ağ durumu değişti! isConnected:', state.isConnected);
      setIsConnected(!!state.isConnected);
      if (state.isConnected) {
        if (isSyncingRef.current) {
          console.log('[DEBUG][NetInfo] Sync zaten çalışıyor, yeni sync başlatılmayacak.');
          return;
        }
        isSyncingRef.current = true;
        try {
          // Kullanıcı id'sini localden oku
          const localUserStr = await AsyncStorage.getItem('localUser');
          let userId = undefined;
          if (localUserStr) {
            const user = JSON.parse(localUserStr);
            userId = user?.id;
          }
          await syncPendingChanges(userId);
          console.log('[DEBUG][NetInfo] Online oldu, syncPendingChanges tetiklendi!');
          if (typeof onOnline === 'function') {
            onOnline();
          }
        } catch (e) {
          console.log('[DEBUG][NetInfo] syncPendingChanges tetiklenirken hata:', e);
        } finally {
          isSyncingRef.current = false;
        }
      }
    });
    NetInfo.fetch().then(state => {
      console.log('[DEBUG][NetInfo] İlk ağ durumu:', state.isConnected);
      setIsConnected(!!state.isConnected);
    });
    return () => unsubscribe();
  }, [onOnline]);
  return isConnected;
}
