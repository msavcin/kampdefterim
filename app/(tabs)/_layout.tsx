import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { getMe } from '../../lib/userCommunityApi';
import { checkAndHandleAppVersion } from '../../lib/appVersion';
import { getDatabase } from '../../lib/database';
import { Map, Heart, User, SquareCheck as CheckSquare, Bell, Crown } from 'lucide-react-native';
import { View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { emit } from '../../lib/eventBus';
import { useTheme } from '../../components/ThemeProvider';

export default function TabLayout() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(true); // Default true, false ise duyurular disabled
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
      } catch {
        setUserRole(null);
      } finally {
        setLoading(false);
      }
      
      // Initial sync durumunu kontrol et
      const checkInitialSync = async () => {
        const syncComplete = await SecureStore.getItemAsync('isInitialSyncComplete');
        setIsInitialSyncComplete(syncComplete === 'true');
      };
      await checkInitialSync();

      // SecureStore değişikliklerini dinle (polling ile)
      const interval = setInterval(async () => {
        const syncComplete = await SecureStore.getItemAsync('isInitialSyncComplete');
        setIsInitialSyncComplete(syncComplete === 'true');
      }, 1000);

      return () => clearInterval(interval);
    })();
  }, []);

  // Guest ise erişilemeyen sekmeler
  const guestDisabled = userRole === 'guest';

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
      name: 'profile',
      label: 'Profil',
      icon: User,
      disabled: false,
    },
  ];

  if (loading) return null;

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
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      {tabScreens.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={{
                color: tab.disabled ? '#d1d5db' : color,
                opacity: tab.disabled ? 0.5 : 1,
                fontWeight: '600',
                fontSize: 12,
                marginTop: 4,
              }}>
                {tab.label}
              </Text>
            ),
            tabBarIcon: ({ color, size }) => (
              <View style={{ position: 'relative' }}>
                <tab.icon color={tab.disabled ? colors.muted : color} size={size} style={{ opacity: tab.disabled ? 0.5 : 1 }} />
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
                    // Guest kullanıcı için disabled tab'lara tıklandığında premium sayfasına yönlendir
                    if (guestDisabled && (tab.name === 'announcements' || tab.name === 'checklist')) {
                      router.push('/premium' as any);
                    }
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