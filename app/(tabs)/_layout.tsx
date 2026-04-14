import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { getMe } from '../../lib/userCommunityApi';
import { checkAndHandleAppVersion } from '../../lib/appVersion';
import { getDatabase } from '../../lib/database';
import { Map, Heart, User, SquareCheck as CheckSquare, Bell, Crown, MessageCircle } from 'lucide-react-native';
import { View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emit } from '../../lib/eventBus';
import { useTheme } from '../../components/ThemeProvider';
import { useChatUnread } from '../../hooks/useChatUnread';

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
        setUserRole(me?.role || (me?.user?.role ?? null));
        setIsPremium(!!(me?.is_premium || me?.user?.is_premium || me?.offline_enabled || me?.user?.offline_enabled));
      } catch {
        setUserRole(null);
        setIsPremium(false);
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

  // Guest ise erişilemeyen sekmeler
  const guestDisabled = userRole === 'guest';
  const { unread } = useChatUnread();

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
      disabled: false,
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
                {tab.name === 'new' && unread > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 10,
                    height: 10,
                    borderRadius: 6,
                    backgroundColor: '#ef4444',
                    borderWidth: 1,
                    borderColor: colors.tabBar,
                  }} />
                )}
                {/* Guest kullanıcı için disabled tab'larda Premium badge */}
                {guestDisabled && tab.disabled && tab.name !== 'index' && tab.name !== 'favorites' && tab.name !== 'profile' && (
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
                    // Guest veya non-premium kullanıcı için disabled tab'lara tıklandığında premium sayfasına yönlendir (özellikle sohbet)
                    if (tab.name === 'announcements' || tab.name === 'checklist') {
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