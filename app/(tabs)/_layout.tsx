import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { getMe } from '../../lib/userCommunityApi';
import { checkAndHandleAppVersion } from '../../lib/appVersion';
import { getDatabase } from '../../lib/database';
import { Map, Heart, User, SquareCheck as CheckSquare, Bell, Crown, MessageCircle } from 'lucide-react-native';
import { View, TouchableOpacity, Text, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emit } from '../../lib/eventBus';
import { useTheme } from '../../components/ThemeProvider';
import { useChatUnread } from '../../hooks/useChatUnread';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineTransportManager } from '../../lib/offlineTransport';
import { incrementOfflineUnread, clearAllOfflineUnread } from '../../lib/offlineUnread';
import { emitChatEvent } from '../../lib/chatEvents';

export default function TabLayout() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    (async () => {
      // Uygulama ilk açılış veya güncelleme ise hasInitialSync flag'ini sıfırla (full sync tetiklenir)
      const wasUpdated = await checkAndHandleAppVersion(async () => {
        console.log('[APP_VERSION] Versiyon güncellendi, hasInitialSync flag\'i sıfırlanıyor...');
        await SecureStore.deleteItemAsync('hasInitialSync');
        await SecureStore.deleteItemAsync('isInitialSyncComplete');
        console.log('[APP_VERSION] Full sync tetiklenecek');
      });
      
      // Version gücellendiyse hemen full sync tetikle (EventBus ile)
      if (wasUpdated) {
        console.log('[APP_VERSION] EventBus ile version_updated event\'i gönderiliyor...');
        emit('version_updated');
      }
      try {
        await getDatabase().init();
      } catch (e) {
        console.warn('Veritabanı başlatılamadı:', e);
      }
      try {
        const me = await getMe();
        const role = me?.role || (me?.user?.role ?? null);
        const premium = !!(me?.is_premium || me?.user?.is_premium || me?.offline_enabled || me?.user?.offline_enabled);
        setUserRole(role);
        setIsPremium(premium);
        // Offline kullanım için cache'e kaydet
        try {
          await AsyncStorage.setItem('@cached_is_premium', premium ? '1' : '0');
          await AsyncStorage.setItem('@cached_user_role', role || '');
        } catch { /* ignore */ }
      } catch {
        // Offline/hata durumunda cache'den oku
        try {
          const cachedPremium = await AsyncStorage.getItem('@cached_is_premium');
          const cachedRole = await AsyncStorage.getItem('@cached_user_role');
          setIsPremium(cachedPremium === '1');
          setUserRole(cachedRole || null);
        } catch {
          setUserRole(null);
          setIsPremium(false);
        }
      } finally {
        setLoading(false);
      }
      // İlk açılışta sync durumunu kontrol et
      const syncFlag = await SecureStore.getItemAsync('isInitialSyncComplete');
      setIsInitialSyncComplete(syncFlag === 'true');
    })();
  }, []);

  // Full sync tamamlanana kadar polling ile kontrol et
  useEffect(() => {
    if (isInitialSyncComplete) return;
    const interval = setInterval(async () => {
      const flag = await SecureStore.getItemAsync('isInitialSyncComplete');
      if (flag === 'true') {
        setIsInitialSyncComplete(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isInitialSyncComplete]);

  // ─── Global Offline Transport Lifecycle ─────────────────────────────────
  // Transport, sohbet ekranı açık olmasa da arka planda çalışır.
  const isConnected = useNetworkStatus();
  const prevConnectedRef = useRef<boolean | null>(null);

  // Transport başlatıcı yardımcısı
  const startOfflineTransport = async () => {
    if (offlineTransportManager.isActive) return;
    try {
      let uid = '', uname = '';
      const cached = await SecureStore.getItemAsync('localUser');
      if (cached) {
        const u = JSON.parse(cached);
        uid   = String(u?.id ?? u?.user_id ?? '');
        uname = String(u?.name ?? u?.username ?? u?.full_name ?? '');
      }
      if (!uid) {
        const me = await getMe().catch(() => null);
        if (me) {
          uid   = String(me?.id ?? me?.user_id ?? '');
          uname = String(me?.name ?? me?.username ?? me?.full_name ?? '');
        }
      }
      if (uid) await offlineTransportManager.start(uid, uname);
    } catch (e) {
      console.warn('[TabLayout] offline transport start hatası:', e);
    }
  };

  // Uygulama mount'ta hemen ağ durumunu kontrol et; offline ise transport'u bekletme
  useEffect(() => {
    (async () => {
      try {
        const Network = await import('expo-network');
        const state = await Network.getNetworkStateAsync();
        const online = !!(state.isConnected && state.isInternetReachable);
        if (!online && !offlineTransportManager.isActive) {
          startOfflineTransport();
        }
      } catch { /* ignore — useNetworkStatus polling devralır */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Network değişiminde transport başlat/durdur
  useEffect(() => {
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      // İlk render: offline ise transportʼı hemen başlat
      if (!isConnected) startOfflineTransport();
      return;
    }
    const wasOffline = !prevConnectedRef.current;
    prevConnectedRef.current = isConnected;

    if (!isConnected && !offlineTransportManager.isActive) {
      // Online → Offline: transport başlat
      startOfflineTransport();
    } else if (isConnected && wasOffline) {
      // Offline → Online: transport durdur + offline unreadʼı sıfırla (sunucu canonical state)
      offlineTransportManager.stop().catch(() => {});
      clearAllOfflineUnread().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Uygulama ön plana döndüğünde offline ise subnet scan'i hemen tetikle
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && offlineTransportManager.isActive) {
        offlineTransportManager.triggerSubnetScan();
      }
    });
    return () => sub.remove();
  }, []);

  // Gelen peer mesajlarını global olarak dinle — badge için unread say
  useEffect(() => {
    const unsub = offlineTransportManager.onMessage((msg) => {
      // Kendi mesajlarımızı sayma (transport zaten filtreler ama ekstra güvence)
      incrementOfflineUnread(msg.conversationId).catch(() => {});
      emitChatEvent({
        type: 'offline_message_received',
        payload: { conversationId: msg.conversationId },
      });
    });
    return unsub;
  }, []);

  // Guest ise erişilemeyen sekmeler
  const guestDisabled = userRole === 'guest';
  const { personalUnread, communityUnread } = useChatUnread();

  // Sekme yapılandırması
  const tabScreens = [
    {
      name: 'index',
      label: 'Harita',
      icon: Map,
      disabled: false,
    },
    {
      name: 'announcements',
      label: 'Duyurular',
      icon: Bell,
      disabled: guestDisabled || !isInitialSyncComplete,
    },
    {
      name: 'checklist',
      label: 'Checklist',
      icon: CheckSquare,
      disabled: guestDisabled,
    },
    {
      name: 'favorites',
      label: 'Favoriler',
      icon: Heart,
      disabled: false,
    },
    {
      name: 'new',
      label: 'Sohbet',
      icon: MessageCircle,
      disabled: guestDisabled || !isPremium,
    },
    {
      name: 'profile',
      label: 'Profil',
      icon: User,
      disabled: false,
    },
  ];

  if (loading) return null;

  const tabLabelStyle = {
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: 4,
    lineHeight: 16,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          height: 70 + insets.bottom,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: tabLabelStyle,
      }}
    >
      {tabScreens.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarLabel: ({ color }) => (
              <Text allowFontScaling={false} style={{
                ...tabLabelStyle,
                color: tab.disabled ? '#d1d5db' : color,
                opacity: tab.disabled ? 0.5 : 1,
              }}>
                {tab.label}
              </Text>
            ),
            tabBarIcon: ({ color, size }) => (
              <View style={{ position: 'relative' }}>
                <tab.icon color={tab.disabled ? colors.muted : color} size={size} style={{ opacity: tab.disabled ? 0.5 : 1 }} />
                {tab.name === 'new' && (personalUnread > 0 || communityUnread > 0) && (
                  <>
                    {communityUnread > 0 && (
                      <View style={{
                        position: 'absolute',
                        top: -10,
                        right: -6,
                        width: 10,
                        height: 10,
                        borderRadius: 6,
                        backgroundColor: colors.info,
                        borderWidth: 1,
                        borderColor: colors.tabBar,
                        zIndex: 2,
                      }} />
                    )}
                    {personalUnread > 0 && (
                      <View style={{
                        position: 'absolute',
                        top: -0,
                        right: -6,
                        width: 10,
                        height: 10,
                        borderRadius: 6,
                        backgroundColor: colors.danger,
                        borderWidth: 1,
                        borderColor: colors.tabBar,
                        zIndex: 1,
                      }} />
                    )}
                  </>
                )}
                {/* Premium olmayan kullanıcılar için disabled tab'larda Premium badge */}
                {tab.disabled && !isPremium && tab.name !== 'index' && tab.name !== 'favorites' && tab.name !== 'profile' && (
                  <TouchableOpacity
                    onPress={() => router.push('/premium' as any)}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      backgroundColor: colors.primary,
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: colors.tabBar,
                    }}
                  >
                    <Crown size={12} color="#fff" fill="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            ),
            tabBarButton: ({ children, onPress, accessibilityState }) => (
                tab.disabled ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    // Non-premium kullanıcılar için belirli disabled tab'lara tıklandığında premium sayfasına yönlendir
                    if (!isPremium && (tab.name === 'announcements' || tab.name === 'checklist' || tab.name === 'new')) {
                      router.push('/premium' as any);
                      return;
                    }
                    // diğer disabled türlerinde pasif bırak
                  }}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ flex: 1, opacity: 0.9, alignItems: 'center', justifyContent: 'center' }}>
                    {children}
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onPress}
                  accessibilityState={accessibilityState}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  {children}
                </TouchableOpacity>
              )
            ),
          }}
        />
      ))}
    </Tabs>
  );
}