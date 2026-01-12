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

  useEffect(() => {
    async function checkToken() {
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
            console.log(`[TOKEN - TEST MODU] Token ${TEST_TIMEOUT_SECONDS} saniye sonra otomatik sona erecek`);
          } else {
            console.log(`[TOKEN] Token süre kontrolü: ${Math.floor(expiresIn / 60)} dakika kaldı`);
          }

          if (expiresIn <= 0) {
            console.log('[TOKEN] Token süresi dolmuş, çıkış yapılıyor');
            await removeToken();
            router.replace('/(auth)/login');
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
            router.replace('/(auth)/login');
          }, expiresIn * 1000);
        }
      } catch (e) {
        console.error('[TOKEN] Token decode hatası, çıkış yapılıyor:', e);
        await removeToken();
        router.replace('/(auth)/login');
      }
    }

    // İlk kontrol
    checkToken();

    // AppState değişikliklerini dinle (uygulama ön plana geldiğinde kontrol et)
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[TOKEN] Uygulama ön plana geldi, token kontrol ediliyor');
        checkToken();
      }
    });

    // Her 1 dakikada bir periyodik kontrol
    const interval = setInterval(() => {
      checkToken();
    }, 60000); // 60 saniye

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      clearInterval(interval);
      subscription.remove();
    };
  }, [router]);
}
