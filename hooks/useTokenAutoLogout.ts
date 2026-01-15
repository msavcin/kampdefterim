import { useEffect, useRef } from 'react';
import { getToken, removeToken } from '../lib/auth';
import { useRouter } from 'expo-router';
import { jwtDecode } from 'jwt-decode';
import { AppState, AppStateStatus } from 'react-native';

// TEST MODU: true yaparsanız token 30 saniye sonra otomatik sona erer
const TEST_MODE = false;
const TEST_TIMEOUT_SECONDS = 30;

export default function useTokenAutoLogout() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerRef = useRef(router);
  const checkingRef = useRef(false);

  // Router'ı ref'te güncelle
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    async function checkToken() {
      // Eğer zaten kontrol yapılıyorsa, tekrar etme
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const token = await getToken();
        
        // Token yoksa kontrol etmeye gerek yok
        if (!token) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          return;
        }

        try {
          const decoded: any = jwtDecode(token);
          if (decoded && decoded.exp) {
            const now = Date.now() / 1000;
            let expiresIn = decoded.exp - now;

            // TEST MODU: Token süresini zorla kısalt
            if (TEST_MODE) {
              expiresIn = TEST_TIMEOUT_SECONDS;
              if (__DEV__) console.log(`[TOKEN - TEST MODU] Token ${TEST_TIMEOUT_SECONDS} saniye sonra otomatik sona erecek`);
            } else {
              if (__DEV__) console.log(`[TOKEN] Token süre kontrolü: ${Math.floor(expiresIn / 60)} dakika kaldı`);
            }

            if (expiresIn <= 0) {
              console.log('[TOKEN] Token süresi dolmuş, çıkış yapılıyor');
              await removeToken();
              routerRef.current.replace('/(auth)/login');
              return;
            }

            // Mevcut timeout'u temizle
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }

            // Yeni timeout oluştur
            timeoutRef.current = setTimeout(async () => {
              console.log('[TOKEN] Token süresi doldu, otomatik çıkış yapılıyor');
              await removeToken();
              routerRef.current.replace('/(auth)/login');
            }, expiresIn * 1000);
          }
        } catch (e) {
          console.error('[TOKEN] Token decode hatası, çıkış yapılıyor:', e);
          await removeToken();
          routerRef.current.replace('/(auth)/login');
        }
      } finally {
        checkingRef.current = false;
      }
    }

    // İlk kontrol
    checkToken();

    // AppState değişikliklerini dinle (uygulama ön plana geldiğinde kontrol et)
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        if (__DEV__) console.log('[TOKEN] Uygulama ön plana geldi, token kontrol ediliyor');
        checkToken();
      }
    });

    // Her 5 dakikada bir periyodik kontrol (1 dakikadan 5 dakikaya çıkarıldı)
    const interval = setInterval(() => {
      checkToken();
    }, 300000); // 5 dakika

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      clearInterval(interval);
      subscription.remove();
    };
  }, []); // Dependency array boş - sadece bir kez mount
}
