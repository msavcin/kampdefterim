
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { getMe } from '../../lib/userCommunityApi';
import { checkAndHandleAppVersion } from '../../lib/appVersion';
import { getDatabase } from '../../lib/database';
import { Map, Heart, User, SquareCheck as CheckSquare, Bell } from 'lucide-react-native';
import { View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabLayout() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(true); // Default true, false ise duyurular disabled
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      // Uygulama ilk açılış veya güncelleme ise veritabanını temizle
      await checkAndHandleAppVersion(async () => {
        // Artık veritabanı silme veya drop işlemi yapılmıyor.
      });
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
        const syncComplete = await AsyncStorage.getItem('isInitialSyncComplete');
        setIsInitialSyncComplete(syncComplete === 'true');
      };
      await checkInitialSync();
      
      // AsyncStorage değişikliklerini dinle (polling ile)
      const interval = setInterval(async () => {
        const syncComplete = await AsyncStorage.getItem('isInitialSyncComplete');
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
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          height: 70 + insets.bottom,
        },
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#6b7280',
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
              <tab.icon color={tab.disabled ? '#000000ff' : color} size={size} style={{ opacity: tab.disabled ? 0.5 : 1 }} />
            ),
            tabBarButton: ({ children, onPress, accessibilityState }) => (
              tab.disabled ? (
                <View style={{ flex: 1, opacity: 0.9, alignItems: 'center', justifyContent: 'center' }}>
                  {children}
                </View>
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