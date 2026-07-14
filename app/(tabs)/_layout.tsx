import React, { useEffect, useRef, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { getMe } from '../../lib/userCommunityApi';
import { checkAndHandleAppVersion } from '../../lib/appVersion';
import { getDatabase } from '../../lib/database';
import {
  Map,
  Heart,
  User,
  SquareCheck as CheckSquare,
  Bell,
  Crown,
  MessageCircle,
  Compass,
  Plus,
  Calendar,
} from 'lucide-react-native';
import { View, TouchableOpacity, Text, AppState, Modal } from 'react-native';
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
  const [showKampfireExploreMenu, setShowKampfireExploreMenu] =
    useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isKampfireTheme } = useTheme();
  const tabBarBackground = isKampfireTheme ? '#0E1210' : colors.tabBar;
  const tabBarBorderColor = isKampfireTheme
    ? 'rgba(212,175,106,0.08)'
    : colors.tabBarBorder;
  const tabBarActiveTint = isKampfireTheme ? '#D4AF6A' : colors.tabBarActive;
  const tabBarInactiveTint = isKampfireTheme
    ? '#8A7348'
    : colors.tabBarInactive;

  useEffect(() => {
    (async () => {
      const wasUpdated = await checkAndHandleAppVersion(async () => {
        console.log(
          "[APP_VERSION] Versiyon güncellendi, hasInitialSync flag'i sıfırlanıyor...",
        );
        await SecureStore.deleteItemAsync('hasInitialSync');
        await SecureStore.deleteItemAsync('isInitialSyncComplete');
        console.log('[APP_VERSION] Full sync tetiklenecek');
      });

      if (wasUpdated) {
        console.log(
          "[APP_VERSION] EventBus ile version_updated event'i gönderiliyor...",
        );
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
        const premium = !!(
          me?.is_premium ||
          me?.user?.is_premium ||
          me?.offline_enabled ||
          me?.user?.offline_enabled
        );
        setUserRole(role);
        setIsPremium(premium);
        try {
          await AsyncStorage.setItem('@cached_is_premium', premium ? '1' : '0');
          await AsyncStorage.setItem('@cached_user_role', role || '');
        } catch {
          /* ignore */
        }
      } catch {
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
      const syncFlag = await SecureStore.getItemAsync('isInitialSyncComplete');
      setIsInitialSyncComplete(syncFlag === 'true');
    })();
  }, []);

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

  const isConnected = useNetworkStatus();
  const prevConnectedRef = useRef<boolean | null>(null);

  const startOfflineTransport = async () => {
    if (offlineTransportManager.isActive) return;
    try {
      let uid = '';
      let uname = '';
      const cached = await SecureStore.getItemAsync('localUser');
      if (cached) {
        const u = JSON.parse(cached);
        uid = String(u?.id ?? u?.user_id ?? '');
        uname = String(u?.name ?? u?.username ?? u?.full_name ?? '');
      }
      if (!uid) {
        const me = await getMe().catch(() => null);
        if (me) {
          uid = String(me?.id ?? me?.user_id ?? '');
          uname = String(me?.name ?? me?.username ?? me?.full_name ?? '');
        }
      }
      if (uid) await offlineTransportManager.start(uid, uname);
    } catch (e) {
      console.warn('[TabLayout] offline transport start hatası:', e);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const Network = await import('expo-network');
        const state = await Network.getNetworkStateAsync();
        const online = !!(state.isConnected && state.isInternetReachable);
        if (!online && !offlineTransportManager.isActive) {
          startOfflineTransport();
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      if (!isConnected) startOfflineTransport();
      return;
    }
    const wasOffline = !prevConnectedRef.current;
    prevConnectedRef.current = isConnected;

    if (!isConnected && !offlineTransportManager.isActive) {
      startOfflineTransport();
    } else if (isConnected && wasOffline) {
      offlineTransportManager.stop().catch(() => {});
      clearAllOfflineUnread().catch(() => {});
    }
  }, [isConnected]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && offlineTransportManager.isActive) {
        offlineTransportManager.triggerSubnetScan();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsub = offlineTransportManager.onMessage((msg) => {
      incrementOfflineUnread(msg.conversationId).catch(() => {});
      emitChatEvent({
        type: 'offline_message_received',
        payload: { conversationId: msg.conversationId },
      });
    });
    return unsub;
  }, []);

  const guestDisabled = userRole === 'guest';
  const { personalUnread, communityUnread } = useChatUnread();

  const tabScreens = [
    { name: 'index', label: 'Harita', icon: Map, disabled: false },
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
    { name: 'favorites', label: 'Favoriler', icon: Heart, disabled: false },
    {
      name: 'new',
      label: 'Sohbet',
      icon: MessageCircle,
      disabled: guestDisabled || !isPremium,
    },
    { name: 'profile', label: 'Profil', icon: User, disabled: false },
  ] as const;

  if (loading) return null;

  const tabLabelStyle = {
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: 4,
    lineHeight: 16,
  };

  const handleKampfireExploreAction = (action: 'plan' | 'tent' | 'chat') => {
    setShowKampfireExploreMenu(false);
    if (action === 'plan') {
      router.push('/camp-plan' as any);
      return;
    }
    if (action === 'tent') {
      router.push('/' as any);
      setTimeout(() => emit('kampfire:openTentSetup'), 150);
      return;
    }
    if (!isPremium) {
      router.push('/premium' as any);
      return;
    }
    router.push('/new' as any);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: tabBarBackground,
            borderTopWidth: 1,
            borderTopColor: tabBarBorderColor,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
            height: 70 + insets.bottom,
            shadowColor: '#000000',
            shadowOpacity: isKampfireTheme ? 0.34 : 0.08,
            shadowRadius: isKampfireTheme ? 18 : 8,
            elevation: isKampfireTheme ? 24 : 8,
          },
          tabBarActiveTintColor: tabBarActiveTint,
          tabBarInactiveTintColor: tabBarInactiveTint,
          tabBarLabelStyle: tabLabelStyle,
        }}
      >
        {tabScreens.map((tab) => {
          const isKampfireExploreTab =
            isKampfireTheme && tab.name === 'announcements';
          const isKampfirePlanTab =
            isKampfireTheme && tab.name === 'checklist';
          const isHiddenInKampfire = isKampfireTheme && tab.name === 'new';
          const displayLabel = isKampfireExploreTab
            ? 'Keşfet'
            : isKampfirePlanTab
              ? 'Planla'
              : tab.label;
          const IconComponent = isKampfireExploreTab ? Compass : tab.icon;
          const resolvedDisabled =
            isKampfireTheme &&
            (tab.name === 'announcements' || tab.name === 'checklist')
              ? false
              : tab.disabled;

          return (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                tabBarLabel: ({ color, focused }) => (
                  <Text
                    allowFontScaling={false}
                    style={{
                      ...tabLabelStyle,
                      color: resolvedDisabled ? '#d1d5db' : color,
                      opacity: resolvedDisabled ? 0.5 : 1,
                      textShadowColor:
                        isKampfireTheme && focused
                          ? 'rgba(212,175,106,0.24)'
                          : 'transparent',
                      textShadowRadius: isKampfireTheme && focused ? 8 : 0,
                      marginTop: isKampfirePlanTab ? 2 : 4,
                    }}
                  >
                    {displayLabel}
                  </Text>
                ),
                tabBarIcon: ({ color, size, focused }) => (
                  <View
                    style={{
                      position: 'relative',
                      width: isKampfirePlanTab
                        ? 42
                        : isKampfireTheme
                          ? 34
                          : undefined,
                      height: isKampfirePlanTab
                        ? 42
                        : isKampfireTheme
                          ? 34
                          : undefined,
                      borderRadius: isKampfirePlanTab
                        ? 21
                        : isKampfireTheme
                          ? 17
                          : undefined,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isKampfirePlanTab
                        ? 'rgba(212,175,106,0.08)'
                        : isKampfireTheme && focused
                          ? 'rgba(212,175,106,0.08)'
                          : 'transparent',
                      borderWidth: isKampfirePlanTab ? 1 : 0,
                      borderColor: isKampfirePlanTab
                        ? 'rgba(212,175,106,0.14)'
                        : 'transparent',
                      shadowColor:
                        isKampfireTheme && (focused || isKampfirePlanTab)
                          ? '#D4AF6A'
                          : 'transparent',
                      shadowOpacity:
                        isKampfireTheme && (focused || isKampfirePlanTab)
                          ? 0.3
                          : 0,
                      shadowRadius:
                        isKampfireTheme && (focused || isKampfirePlanTab)
                          ? 10
                          : 0,
                      elevation:
                        isKampfireTheme && (focused || isKampfirePlanTab)
                          ? 6
                          : 0,
                    }}
                  >
                    {isKampfirePlanTab ? (
                      <Plus color="#D4AF6A" size={20} />
                    ) : (
                      <IconComponent
                        color={resolvedDisabled ? colors.muted : color}
                        size={size}
                        style={{ opacity: resolvedDisabled ? 0.5 : 1 }}
                      />
                    )}
                    {tab.name === 'new' &&
                      (personalUnread > 0 || communityUnread > 0) &&
                      !isHiddenInKampfire && (
                        <>
                          {communityUnread > 0 && (
                            <View
                              style={{
                                position: 'absolute',
                                top: -10,
                                right: -6,
                                width: 10,
                                height: 10,
                                borderRadius: 6,
                                backgroundColor: colors.info,
                                borderWidth: 1,
                                borderColor: tabBarBackground,
                                zIndex: 2,
                              }}
                            />
                          )}
                          {personalUnread > 0 && (
                            <View
                              style={{
                                position: 'absolute',
                                top: -0,
                                right: -6,
                                width: 10,
                                height: 10,
                                borderRadius: 6,
                                backgroundColor: colors.danger,
                                borderWidth: 1,
                                borderColor: tabBarBackground,
                                zIndex: 1,
                              }}
                            />
                          )}
                        </>
                      )}
                    {resolvedDisabled &&
                      !isPremium &&
                      tab.name !== 'index' &&
                      tab.name !== 'favorites' &&
                      tab.name !== 'profile' && (
                        <TouchableOpacity
                          onPress={() => router.push('/premium' as any)}
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -8,
                            backgroundColor: tabBarActiveTint,
                            borderRadius: 10,
                            width: 20,
                            height: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1.5,
                            borderColor: tabBarBackground,
                          }}
                        >
                          <Crown size={12} color="#fff" fill="#fff" />
                        </TouchableOpacity>
                      )}
                  </View>
                ),
                // If this tab should be hidden for kampfire theme, don't provide an href
                // and render no tab button so it doesn't conflict with custom tabBarButton behavior.
                tabBarButton: isHiddenInKampfire
                  ? () => null
                  : ({ children, onPress, accessibilityState }) =>
                      resolvedDisabled ? (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            if (
                              !isPremium &&
                              (tab.name === 'announcements' ||
                                tab.name === 'checklist' ||
                                tab.name === 'new')
                            ) {
                              router.push('/premium' as any);
                            }
                          }}
                          style={{
                            flex: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <View
                            style={{
                              flex: 1,
                              opacity: 0.9,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {children}
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            if (isKampfireExploreTab) {
                              setShowKampfireExploreMenu(true);
                              return;
                            }
                            if (isKampfirePlanTab) {
                              router.push('/camp-plan' as any);
                              return;
                            }
                            onPress?.();
                          }}
                          accessibilityState={accessibilityState}
                          style={{
                            flex: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {children}
                        </TouchableOpacity>
                      ),
              }}
            />
          );
        })}
      </Tabs>

      {isKampfireTheme && (
        <Modal
          visible={showKampfireExploreMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowKampfireExploreMenu(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowKampfireExploreMenu(false)}
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(0,0,0,0.22)',
            }}
          >
            <View
              style={{
                margin: 14,
                borderRadius: 22,
                backgroundColor: '#0E1210',
                borderWidth: 1,
                borderColor: 'rgba(212,175,106,0.14)',
                padding: 10,
              }}
            >
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                }}
                onPress={() => handleKampfireExploreAction('plan')}
              >
                <Calendar size={18} color="#D4AF6A" />
                <Text
                  style={{ color: '#F2EDE3', fontSize: 14, fontWeight: '600' }}
                >
                  Kamp Planla
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                }}
                onPress={() => handleKampfireExploreAction('tent')}
              >
                <Compass size={18} color="#D4AF6A" />
                <Text
                  style={{ color: '#F2EDE3', fontSize: 14, fontWeight: '600' }}
                >
                  Çadır / Karavan Yönü
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                }}
                onPress={() => handleKampfireExploreAction('chat')}
              >
                <MessageCircle size={18} color="#D4AF6A" />
                <Text
                  style={{ color: '#F2EDE3', fontSize: 14, fontWeight: '600' }}
                >
                  {isPremium ? 'Sohbet' : 'Sohbet · Premium'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}
