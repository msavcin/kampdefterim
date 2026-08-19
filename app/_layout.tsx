import { useEffect, useRef, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import useTokenAutoLogout from '@/hooks/useTokenAutoLogout';
import { View, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ThemeProvider from '../components/ThemeProvider';
import { isLoggedIn } from '../lib/auth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { offlineTransportManager } from '@/lib/offlineTransport';
import { getMe } from '@/lib/userCommunityApi';
import { emitChatEvent } from '@/lib/chatEvents';
import { hydrateCampingTypesFromCache, syncCampingTypes } from '@/lib/campingTypesApi';
import * as SecureStore from 'expo-secure-store';

export default function RootLayout() {
  useFrameworkReady();
  useTokenAutoLogout();
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState<null | 'login' | 'tabs'>(null);
  const isConnected = useNetworkStatus();
  const prevConnectedRef = useRef<boolean | null>(null);

  // Kamp türleri uygulama açılışında önce lokal cache'den yüklenir; online ise sunucuyla eşitlenir.
  useEffect(() => {
    (async () => {
      await hydrateCampingTypesFromCache();
      if (isConnected) await syncCampingTypes();
    })().catch((error) => console.warn('[Layout] kamp türleri başlatılamadı:', error));
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    syncCampingTypes().catch((error) => console.warn('[Layout] kamp türleri online sync hatası:', error));
  }, [isConnected]);

  // ─── Global offline → online kurtarma ──────────────────────────────────────
  // Bağlantı geri geldiğinde, hangi ekranda olunursa olsun bekleyen
  // offline mesajları sunucuya iletir ve transport'u durdurur.
  useEffect(() => {
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      return;
    }
    const wasOffline = !prevConnectedRef.current;
    prevConnectedRef.current = isConnected;
    if (!isConnected || !wasOffline) return;

    (async () => {
      try {
        // Kullanıcı ID'sini bul: önce SecureStore, sonra API
        let userId = '';
        try {
          const cached = await SecureStore.getItemAsync('localUser');
          if (cached) {
            const u = JSON.parse(cached);
            userId = String(u?.id ?? u?.user_id ?? '');
          }
        } catch { /* ignore */ }
        if (!userId) {
          const me = await getMe().catch(() => null);
          if (me) userId = String(me?.id ?? me?.user_id ?? '');
        }
        // Bekleyen mesajları sunucuya ilet
        await offlineTransportManager.syncPendingToServer(userId || undefined);
        // Transport'u durdur (artık online)
        await offlineTransportManager.stop();
        // Chat ekranlarına sync tamamlandığını bildir
        emitChatEvent({ type: 'offline_sync_complete' });
        console.log('[Layout] offline→online recovery tamamlandı');
      } catch (e) {
        console.warn('[Layout] online recovery hatası:', e);
      }
    })();
  }, [isConnected]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const logged = await isLoggedIn();
        const isAuthRoute = segments[0] === '(auth)';
        const isLogoutRoute = (segments as string[])[1] === 'logout';
        if (!logged && !isAuthRoute) {
          if (!isConnected) {
            try {
              Alert.alert('Uyarı', 'Offline modun aktif olabilmesi için giriş yapmış olmanız gerekmektedir.');
            } catch (e) {
              console.warn('[Layout] Alert gösterilemedi:', e);
            }
          }
          setShouldRedirect('login');
        } else if (logged && isAuthRoute && !isLogoutRoute) {
          setShouldRedirect('tabs');
        } else {
          setShouldRedirect(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setChecked(true);
      }
    }
    checkAuth();
  }, [segments]);

  useEffect(() => {
    if (!checked) return;
    if (shouldRedirect === 'login') {
      router.replace('/(auth)/login');
    } else if (shouldRedirect === 'tabs') {
      router.replace('/(tabs)');
    }
  }, [checked, shouldRedirect]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
            <Slot />
          </SafeAreaView>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
