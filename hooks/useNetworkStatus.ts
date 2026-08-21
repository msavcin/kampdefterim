// Expo managed workflow için NetInfo bağımlılığı olmadan network durumu

import { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { syncPendingChanges } from '@/lib/syncPendingChanges';
import { API_URL } from '@/lib/config';

// Android'de isInternetReachable çoğunlukla null döner (OS seviyesinde belirsiz).
// Hotspot WiFi'sine bağlıyken de isConnected=true olur ama internet erişimi yoktur.
// Bu fonksiyon gerçek internet erişimini doğrulamak için API'ye HEAD isteği atar.
const probeInternet = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), 1500); // Timeout 1.5 saniye
    const res = await fetch(`${API_URL}/users/me`, { method: 'HEAD', signal: controller.signal, cache: 'no-cache' });
    clearTimeout(timerId);
    // Ağ katmanı yanıt verdiyse (401 dahil) gerçek internet var.
    // Captive portal HTML 200 de gelebilir; yine de host'a ulaşılmıştır.
    return res.status > 0;
  } catch {
    return false;
  }
};

export function useNetworkStatus(onOnline?: () => void) {
  // null: henüz bilinmiyor. Hotspot'ta WiFi varken internet yoktur;
  // bilinmeyen durumu online saymak premium kullanıcıyı "Premium Ol"a düşürür.
  const [_isConnected, setIsConnected] = useState<boolean | null>(null);
  const isConnected = _isConnected ?? false;
  const onOnlineRef = useRef(onOnline);
  const lastStateRef = useRef<boolean | null>(null);
  // Probe'u çok sık çalıştırmamak için son probe zamanını takip et
  const lastProbeRef = useRef<number>(0);

  // Ağ durumunu kontrol eden fonksiyon
  const checkNetwork = async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      console.log('[NetInfo] Network durumu:', state);

      let connected: boolean;
      if (!state.isConnected) {
        // WiFi/hücresel bağlantı yok — kesinlikle offline
        console.log('[NetInfo] Bağlantı yok, offline');
        connected = false;
      } else {
        // Bağlantı var - gerçek internet erişimini kontrol et
        // Android'de isInternetReachable güvenilir değil, her zaman probe yap
        const now = Date.now();
        const timeSinceLastProbe = now - lastProbeRef.current;
        
        // İlk kez veya 2 saniye geçtiyse probe yap
        if (timeSinceLastProbe === now || timeSinceLastProbe >= 2000) {
          lastProbeRef.current = now;
          console.log('[NetInfo] Gerçek internet kontrolü yapılıyor...');
          connected = await probeInternet();
          console.log('[NetInfo] İnternet kontrolü sonucu:', connected);
        } else {
          // Son durumu kullan
          connected = lastStateRef.current ?? false;
          console.log('[NetInfo] Son durum kullanılıyor:', connected);
        }
      }

      setIsConnected(connected);
      // Sadece offline -> online geçişinde callback çağır ve sync yap
      if (connected && lastStateRef.current === false) {
        if (typeof onOnlineRef.current === 'function') {
          onOnlineRef.current();
        }
        // Sadece offline'dan online'a geçişte sync et (her network kontrolünde değil!)
        syncPendingChanges();
      }
      lastStateRef.current = connected;
    } catch (e) {
      console.log('[NetInfo] Kontrol hatası:', e);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    onOnlineRef.current = onOnline;
  }, [onOnline]);


  useEffect(() => {
    checkNetwork();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Uygulama ön plana geldiğinde probe süresi sıfırlanır — hemen kontrol edilebilsin
        lastProbeRef.current = 0;
        checkNetwork();
      }
    });

    // 2 saniyede bir network kontrolü (hotspot → gerçek internet geçişini hızlı yakala)
    const interval = setInterval(() => {
      lastProbeRef.current = 0;
      checkNetwork();
    }, 2000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  return isConnected;
}
