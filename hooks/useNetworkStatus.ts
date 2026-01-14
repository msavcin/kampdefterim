// useNetworkStatus.ts
import { useEffect, useState, useRef } from 'react';
import { syncPendingChanges } from '@/lib/syncPendingChanges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Global sync flag - tüm hook instance'ları arasında paylaşılır
let globalSyncInProgress = false;
let lastSyncTimestamp = 0; // Son sync zamanını sakla

// Global network state - tüm instance'lar aynı durumu görsün
let globalNetworkState: boolean | null = null;
let globalStateListeners: Set<(state: boolean) => void> = new Set();

// Global network listener - sadece bir kez başlatılır
let globalUnsubscribe: (() => void) | null = null;

function startGlobalNetworkListener() {
  if (globalUnsubscribe) return; // Zaten başlatılmış
  
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastState: boolean | null = null;
  
  const handleNetworkChange = async (state: any) => {
    const connected = !!state.isConnected;
    
    // Debounce: Hızlı değişimleri filtrele
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(async () => {
      // State gerçekten değiştiyse güncelle
      if (lastState !== connected) {
        if (__DEV__) console.log('[DEBUG][NetInfo] Network durumu değişti:', connected ? 'Online' : 'Offline');
        lastState = connected;
        globalNetworkState = connected;
        
        // Tüm listener'ları bilgilendir
        globalStateListeners.forEach(listener => {
          try {
            listener(connected);
          } catch (e) {
            if (__DEV__) console.warn('[NetInfo] Listener error:', e);
          }
        });
        
        // Online olduğunda sync tetikle
        if (connected) {
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
          } catch (e) {
            if (__DEV__) console.log('[DEBUG][NetInfo] syncPendingChanges tetiklenirken hata:', e);
          } finally {
            globalSyncInProgress = false;
          }
        }
      }
    }, 300); // 300ms debounce (500ms'den daha hızlı tepki)
  };
  
  globalUnsubscribe = NetInfo.addEventListener(handleNetworkChange);
  
  // İlk durumu fetch et
  NetInfo.fetch().then(state => {
    const connected = !!state.isConnected;
    if (__DEV__) console.log('[DEBUG][NetInfo] İlk ağ durumu:', connected ? 'Online' : 'Offline');
    lastState = connected;
    globalNetworkState = connected;
    
    // İlk durumu tüm listener'lara bildir
    globalStateListeners.forEach(listener => {
      try {
        listener(connected);
      } catch (e) {
        if (__DEV__) console.warn('[NetInfo] Initial listener error:', e);
      }
    });
  });
}

// Opsiyonel: online olduğunda callback tetiklenebilir
export function useNetworkStatus(onOnline?: () => void) {
  const [isConnected, setIsConnected] = useState(globalNetworkState ?? true);
  const onOnlineRef = useRef(onOnline);
  const lastStateRef = useRef<boolean | null>(null);
  
  // Callback ref'i güncelle ama effect'i yeniden tetikleme
  useEffect(() => {
    onOnlineRef.current = onOnline;
  }, [onOnline]);

  useEffect(() => {
    // Global listener'ı başlat (sadece bir kez)
    startGlobalNetworkListener();
    
    // Bu instance için state listener ekle
    const stateListener = (connected: boolean) => {
      setIsConnected(connected);
      
      // Online olduğunda ve önceden offline ise callback tetikle
      if (connected && lastStateRef.current === false && typeof onOnlineRef.current === 'function') {
        onOnlineRef.current();
      }
      
      lastStateRef.current = connected;
    };
    
    globalStateListeners.add(stateListener);
    
    // Mevcut global state varsa hemen uygula
    if (globalNetworkState !== null) {
      setIsConnected(globalNetworkState);
      lastStateRef.current = globalNetworkState;
    }
    
    return () => {
      globalStateListeners.delete(stateListener);
    };
  }, []);
  
  return isConnected;
}
