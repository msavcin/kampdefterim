// useNetworkStatus.ts
import { useEffect, useState, useRef } from 'react';
import { syncPendingChanges } from '@/lib/syncPendingChanges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Global sync flag - tüm hook instance'ları arasında paylaşılır
let globalSyncInProgress = false;
let globalDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastNetworkState: boolean | null = null;
let globalHasInitialized = false; // İlk fetch sadece bir kez yapılsın
let lastSyncTimestamp = 0; // Son sync zamanını sakla (중복 방지)

// Opsiyonel: online olduğunda callback tetiklenebilir
export function useNetworkStatus(onOnline?: () => void) {
  const [isConnected, setIsConnected] = useState(true);
  const onOnlineRef = useRef(onOnline);
  
  // Callback ref'i güncelle ama effect'i yeniden tetikleme
  useEffect(() => {
    onOnlineRef.current = onOnline;
  }, [onOnline]);

  useEffect(() => {
    const handleNetworkChange = async (state: any) => {
      const connected = !!state.isConnected;
      
      // Debounce: Aynı state tekrar ediyorsa ve çok kısa sürede geliyorsa ignore et
      if (lastNetworkState === connected && globalDebounceTimer) {
        return;
      }
      
      // Debounce timer'ı temizle ve yenisini başlat
      if (globalDebounceTimer) {
        clearTimeout(globalDebounceTimer);
      }
      
      globalDebounceTimer = setTimeout(async () => {
        lastNetworkState = connected;
        setIsConnected(connected);
        
        if (connected) {
          // Global sync flag kontrolü + son sync'ten beri geçen süre
          const timeSinceLastSync = Date.now() - lastSyncTimestamp;
          if (globalSyncInProgress || timeSinceLastSync < 5000) {
            if (__DEV__) console.log('[DEBUG][NetInfo] Sync atlandı (devam ediyor veya son 5sn içinde yapıldı)');
            return;
          }
          
          globalSyncInProgress = true;
          lastSyncTimestamp = Date.now();
          try {
            // Kullanıcı id'sini localden oku
            const localUserStr = await AsyncStorage.getItem('localUser');
            let userId = undefined;
            if (localUserStr) {
              const user = JSON.parse(localUserStr);
              userId = user?.id;
            }
            await syncPendingChanges(userId);
            if (__DEV__) console.log('[DEBUG][NetInfo] Online oldu, syncPendingChanges tetiklendi!');
            if (typeof onOnlineRef.current === 'function') {
              onOnlineRef.current();
            }
          } catch (e) {
            if (__DEV__) console.log('[DEBUG][NetInfo] syncPendingChanges tetiklenirken hata:', e);
          } finally {
            globalSyncInProgress = false;
          }
        }
      }, 500); // 500ms debounce
    };

    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
    
    // İlk ağ durumunu sadece bir kez fetch et (global flag ile)
    if (!globalHasInitialized) {
      globalHasInitialized = true;
      NetInfo.fetch().then(state => {
        if (__DEV__) console.log('[DEBUG][NetInfo] İlk ağ durumu:', state.isConnected);
        lastNetworkState = !!state.isConnected;
        setIsConnected(!!state.isConnected);
      });
    } else {
      // Global state'i kullan
      if (lastNetworkState !== null) {
        setIsConnected(lastNetworkState);
      }
    }
    
    return () => {
      unsubscribe();
      if (globalDebounceTimer) {
        clearTimeout(globalDebounceTimer);
        globalDebounceTimer = null;
      }
    };
  }, []); // Dependency array'den onOnline kaldırıldı
  
  return isConnected;
}
