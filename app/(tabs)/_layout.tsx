import React, { useEffect, useRef, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { getMe } from '../../lib/userCommunityApi';
import { checkAndHandleAppVersion, compareVersions, getCurrentAppVersion } from '../../lib/appVersion';
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
} from 'lucide-react-native';
import { View, TouchableOpacity, Text, AppState, Modal, Dimensions, Alert, Linking, Platform } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const APP_UPDATE_DISMISSED_VERSION_KEY = '@app_update_dismissed_version';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emit, eventBus } from '../../lib/eventBus';
import { useTheme } from '../../components/ThemeProvider';
import { useChatUnread } from '../../hooks/useChatUnread';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineTransportManager } from '../../lib/offlineTransport';
import { incrementOfflineUnread, clearAllOfflineUnread } from '../../lib/offlineUnread';
import { emitChatEvent } from '../../lib/chatEvents';
import { getAppRuntimeSettings } from '../../lib/adminSettingsApi';
import { DEFAULT_FEATURE_ENTITLEMENTS, getMyFeatureEntitlements } from '../../lib/featureEntitlementsApi';

export default function TabLayout() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [featureEntitlements, setFeatureEntitlements] = useState(DEFAULT_FEATURE_ENTITLEMENTS);
  const [loading, setLoading] = useState(true);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(true);
  const [showKampfireExploreMenu, setShowKampfireExploreMenu] =
    useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isKampfireTheme, scheme } = useTheme();
  const tabBarBackground = colors.tabBar;
  const tabBarBorderColor = colors.tabBarBorder;
  const tabBarActiveTint = colors.tabBarActive;
  const tabBarInactiveTint = colors.tabBarInactive;

  const checkRemoteAppUpdateNotice = async () => {
    try {
      if (__DEV__) console.log('[APP_UPDATE] Kontrol başladı');

      const settings = await getAppRuntimeSettings();
      const latestVersion = settings.appLatestVersion?.trim();
      const currentVersion = getCurrentAppVersion();
      const minimumVersion = settings.appMinSupportedVersion?.trim();
      const targetVersion = (() => {
        if (latestVersion && minimumVersion) {
          return compareVersions(latestVersion, minimumVersion) >= 0
            ? latestVersion
            : minimumVersion;
        }
        return latestVersion || minimumVersion || '';
      })();

      if (__DEV__) {
        console.log('[APP_UPDATE] Runtime settings:', JSON.stringify({
          currentVersion,
          latestVersion,
          minimumVersion,
          targetVersion,
          required: settings.appUpdateRequired,
          androidUrl: settings.appUpdateAndroidUrl,
          iosUrl: settings.appUpdateIosUrl,
        }));
      }

      if (!targetVersion) {
        if (__DEV__) console.log('[APP_UPDATE] app_latest_version/app_min_supported_version boş, bildirim gösterilmeyecek');
        return;
      }

      const versionCompare = compareVersions(targetVersion, currentVersion);
      const latestCompare = latestVersion ? compareVersions(latestVersion, currentVersion) : -1;
      const belowMinimum = !!minimumVersion && compareVersions(currentVersion, minimumVersion) < 0;
      // `Daha Sonra` seçeneğini yalnızca superadmin'in Zorunlu güncelleme ayarı belirler.
      // Minimum sürüm bilgi/karşılaştırma için kullanılır; required=false iken opsiyonel bildirim kalır.
      const forceUpdate = !!settings.appUpdateRequired;

      if (__DEV__) {
        console.log('[APP_UPDATE] Version compare:', JSON.stringify({
          latestMinusCurrent: latestCompare,
          targetMinusCurrent: versionCompare,
          belowMinimum,
          forceUpdate,
        }));
      }

      if (versionCompare <= 0 && !belowMinimum) {
        if (__DEV__) console.log('[APP_UPDATE] Yeni sürüm yok, bildirim gösterilmeyecek');
        return;
      }

      const dismissedVersion = await AsyncStorage.getItem(APP_UPDATE_DISMISSED_VERSION_KEY);
      if (__DEV__) console.log('[APP_UPDATE] dismissedVersion:', dismissedVersion, 'forceUpdate:', forceUpdate);
      if (!forceUpdate && dismissedVersion === targetVersion) {
        if (__DEV__) console.log('[APP_UPDATE] Bu sürüm daha önce ertelenmiş, bildirim gösterilmeyecek');
        return;
      }

      const normalizeStoreUrl = (value: string) => {
        const match = String(value || '').match(/https?:\/\/[^\s\]\)"']+/);
        return match ? match[0] : '';
      };
      const storeUrl = normalizeStoreUrl(
        Platform.OS === 'ios'
          ? settings.appUpdateIosUrl
          : settings.appUpdateAndroidUrl,
      );
      const message = settings.appUpdateMessage?.trim() ||
        `Kamp Defterim'in ${targetVersion} sürümü hazır. Daha iyi performans ve yeni özellikler için güncelleyin.`;

      const openStore = () => {
        if (storeUrl) {
          Linking.openURL(storeUrl).catch(() => {
            Alert.alert('Bağlantı açılamadı', 'Mağaza bağlantısı açılamadı. Lütfen daha sonra tekrar deneyin.');
          });
        }
      };

      const buttons = forceUpdate
        ? [
            {
              text: 'Güncelle',
              onPress: openStore,
              style: 'default' as const,
            },
          ]
        : [
            {
              text: 'Daha Sonra',
              style: 'cancel' as const,
              onPress: () => AsyncStorage.setItem(APP_UPDATE_DISMISSED_VERSION_KEY, targetVersion).catch(() => {}),
            },
            {
              text: 'Güncelle',
              onPress: openStore,
              style: 'default' as const,
            },
          ];

      if (__DEV__) console.log('[APP_UPDATE] Alert gösteriliyor');
      Alert.alert(
        forceUpdate ? 'Güncelleme gerekli' : 'Yeni sürüm mevcut',
        `${message}\n\nMevcut sürüm: ${currentVersion}\nYeni sürüm: ${targetVersion}`,
        buttons,
        { cancelable: !forceUpdate },
      );
    } catch (error) {
      if (__DEV__) console.warn('[APP_UPDATE] Sürüm kontrolü yapılamadı:', error);
    }
  };

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
      if (__DEV__) console.log('[APP_UPDATE] Kontrol zamanlayıcıya alındı');
      setTimeout(() => {
        checkRemoteAppUpdateNotice();
      }, 800);
      try {
        await getDatabase().init();
      } catch (e) {
        console.warn('Veritabanı başlatılamadı:', e);
      }

      // Quick cached read to avoid blocking UI when offline
      try {
        const cached = await SecureStore.getItemAsync('localUser');
        if (cached) {
          try {
            const u = JSON.parse(cached);
            const role = u?.role || u?.user?.role || null;
            const premium = !!(u?.is_premium || u?.isPremium || u?.offline_enabled || u?.user?.offline_enabled);
            setUserRole(role);
            setIsPremium(premium);
            try {
              await AsyncStorage.setItem('@cached_is_premium', premium ? '1' : '0');
              await AsyncStorage.setItem('@cached_user_role', role || '');
            } catch {}
          } catch (e) {
            // ignore parse errors
          }
        } else {
          // Fallback to simple cached flags if exist
          try {
            const cachedPremium = await AsyncStorage.getItem('@cached_is_premium');
            const cachedRole = await AsyncStorage.getItem('@cached_user_role');
            if (cachedPremium !== null || cachedRole !== null) {
              setIsPremium(cachedPremium === '1');
              setUserRole(cachedRole || null);
            }
          } catch {}
        }
      } catch (e) {
        console.warn('[TabLayout] cached read hata:', e);
      }

      // Allow UI to render immediately using cached values
      setLoading(false);

      // Now try to refresh remote data only when online
      try {
        const Network = await import('expo-network');
        const state = await Network.getNetworkStateAsync();
        const online = !!(state.isConnected && state.isInternetReachable);
        if (online) {
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
              const entitlements = await getMyFeatureEntitlements();
              setFeatureEntitlements(entitlements);
            } catch {
              setFeatureEntitlements(DEFAULT_FEATURE_ENTITLEMENTS);
            }
            try {
              await AsyncStorage.setItem('@cached_is_premium', premium ? '1' : '0');
              await AsyncStorage.setItem('@cached_user_role', role || '');
            } catch {
              /* ignore */
            }
          } catch (e) {
            // remote fetch failed - keep cached values
            if (__DEV__) console.warn('[TabLayout] remote getMe hata:', e);
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[TabLayout] network check hata:', e);
        try {
          const cachedPremium = await AsyncStorage.getItem('@cached_is_premium');
          const cachedRole = await AsyncStorage.getItem('@cached_user_role');
          setIsPremium(cachedPremium === '1');
          setUserRole(cachedRole || null);
        } catch (err) {
          setUserRole(null);
          setIsPremium(false);
        }
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
  const hasAnnouncementsAccess = isPremium || featureEntitlements.announcements.enabled;
  const hasChecklistAccess = isPremium || featureEntitlements.checklist.enabled;
  const hasChatAccess = isPremium || featureEntitlements.chat.enabled;
  const hasOfflineModeAccess = isPremium || featureEntitlements.offline_mode.enabled;

  const startOfflineTransport = async () => {
    if (!hasOfflineModeAccess) return;
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
  }, [hasOfflineModeAccess]);

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
  }, [isConnected, hasOfflineModeAccess]);

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


  useEffect(() => {
    const entitlementHandler = (entitlements: any) => {
      if (entitlements) setFeatureEntitlements(entitlements);
    };
    const userHandler = async (updatedUser: any) => {
      if (!updatedUser) return;
      const role = updatedUser?.role || updatedUser?.user?.role || null;
      const premium = !!(
        updatedUser?.is_premium ||
        updatedUser?.isPremium ||
        updatedUser?.offline_enabled ||
        updatedUser?.user?.is_premium ||
        updatedUser?.user?.isPremium ||
        updatedUser?.user?.offline_enabled
      );
      setUserRole(role);
      setIsPremium(premium);
      try {
        await AsyncStorage.setItem('@cached_is_premium', premium ? '1' : '0');
        await AsyncStorage.setItem('@cached_user_role', role || '');
      } catch {}
    };
    eventBus.on('featureEntitlements:updated', entitlementHandler);
    eventBus.on('user:updated', userHandler);
    return () => {
      eventBus.off('featureEntitlements:updated', entitlementHandler);
      eventBus.off('user:updated', userHandler);
    };
  }, []);

  const [planCount, setPlanCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const SAVED_PLANS_KEY = 'campPlannerSavedPlans';
    const makeStorageKey = (key: string, userId?: string | null) => (userId ? `${key}:${userId}` : key);
    const loadPlanCount = async () => {
      try {
        let uid = '';
        const cached = await SecureStore.getItemAsync('localUser');
        if (cached) {
          try { const u = JSON.parse(cached); uid = String(u?.id ?? u?.user_id ?? ''); } catch (e) { uid = '' }
        }
        const key = makeStorageKey(SAVED_PLANS_KEY, uid || undefined);
        let savedRaw = await AsyncStorage.getItem(key);
        if (!savedRaw) savedRaw = await AsyncStorage.getItem(SAVED_PLANS_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (!cancelled) setPlanCount(Array.isArray(parsed) ? parsed.length : 0);
        } else {
          if (!cancelled) setPlanCount(0);
        }
      } catch (e) {
        if (!cancelled) setPlanCount(0);
      }
    };
    loadPlanCount();
    const handler = () => loadPlanCount();
    eventBus.on('camp-planner:updated', handler);
    return () => { cancelled = true; eventBus.off('camp-planner:updated', handler); };
  }, []);

  const tabScreens = [
    { name: 'index', label: 'Harita', icon: Map, disabled: false },
    {
      name: 'announcements',
      label: 'Duyurular',
      icon: Bell,
      disabled: !hasAnnouncementsAccess || !isInitialSyncComplete,
    },
    {
      name: 'checklist',
      label: 'Checklist',
      icon: CheckSquare,
      disabled: !hasChecklistAccess,
    },
    { name: 'favorites', label: 'Favoriler', icon: Heart, disabled: false },
    {
      name: 'new',
      label: 'Sohbet',
      icon: MessageCircle,
      disabled: !hasChatAccess,
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

  const handleKampfireExploreAction = (action: 'tent' | 'chat') => {
    setShowKampfireExploreMenu(false);
    if (action === 'tent') {
      router.push('/' as any);
      setTimeout(() => emit('kampfire:openTentSetup'), 150);
      return;
    }
    if (!hasChatAccess) {
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
            paddingTop: isKampfireTheme ? 10 : 8,
            paddingBottom: insets.bottom + (isKampfireTheme ? 12 : 8),
            height: (isKampfireTheme ? 84 : 70) + insets.bottom,
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
          const displayLabel = isKampfireExploreTab ? 'Keşfet' : tab.label;
          const IconComponent = isKampfireExploreTab ? Compass : tab.icon;
          const resolvedDisabled =
            isKampfireTheme && tab.name === 'announcements'
              ? false
              : tab.disabled;

          return (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                href: undefined,
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
                      marginTop: 4,
                    }}
                  >
                    {displayLabel}
                  </Text>
                ),
                tabBarIcon: ({ color, size, focused }) => (
                  <View
                    style={{
                      position: 'relative',
                      width: isKampfireTheme ? 34 : undefined,
                      height: isKampfireTheme ? 34 : undefined,
                      borderRadius: isKampfireTheme ? 17 : undefined,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        isKampfireTheme && focused
                          ? colors.primaryLight
                          : 'transparent',
                      borderWidth: 0,
                      borderColor: 'transparent',
                      shadowColor:
                        isKampfireTheme && focused ? colors.accent : 'transparent',
                      shadowOpacity: isKampfireTheme && focused ? 0.3 : 0,
                      shadowRadius: isKampfireTheme && focused ? 10 : 0,
                      elevation: isKampfireTheme && focused ? 6 : 0,
                    }}
                  >
                    <IconComponent
                      color={resolvedDisabled ? colors.muted : color}
                      size={size}
                      style={{ opacity: resolvedDisabled ? 0.5 : 1 }}
                    />
                    {tab.name === 'new' &&
                      (personalUnread > 0 || communityUnread > 0) && (
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
                tabBarButton: ({ children, onPress, accessibilityState }) =>
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
                      onPress={(e) => {
                        if (isKampfireExploreTab) {
                          setShowKampfireExploreMenu(true);
                          return;
                        }
                        onPress?.(e);
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

      {/* Floating center Planla removed — moved into Keşfet menu */}

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
              backgroundColor: 'rgba(0,0,0,0.12)',
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: 14,
                right: 14,
                bottom: (isKampfireTheme ? 84 : 70) + insets.bottom + 12,
              }}
            >
              <View
                style={{
                  width: 0,
                  height: 0,
                  backgroundColor: 'transparent',
                  borderStyle: 'solid',
                  borderLeftWidth: 10,
                  borderRightWidth: 10,
                  borderTopWidth: 10,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderTopColor: scheme === 'dark' ? 'rgba(18, 22, 18, 0.98)' : 'rgba(255, 253, 249, 0.98)',
                  position: 'absolute',
                  bottom: -10,
                  left: (SCREEN_WIDTH / 6) * 1 + (SCREEN_WIDTH / 12) - 24,
                }}
              />
              <View
                style={{
                  borderRadius: 22,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.border,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.28,
                  shadowRadius: 20,
                  elevation: 18,
                }}
              >
                <View
                  style={{
                    backgroundColor: scheme === 'dark' ? 'rgba(18, 22, 18, 0.98)' : 'rgba(255, 253, 249, 0.98)',
                    padding: 4,
                  }}
                >
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 42,
                    }}
                    onPress={() => handleKampfireExploreAction('tent')}
                  >
                    <Compass size={16} color={colors.primary} />
                    <Text
                      style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }}
                    >
                      Çadır / Karavan Yönü Neresi Olmalı?
                    </Text>
                  </TouchableOpacity>
                  <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.3, marginHorizontal: 12 }} />
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 42,
                    }}
                    onPress={() => {
                      setShowKampfireExploreMenu(false);
                      router.push('/camp-plan' as any);
                    }}
                  >
                    <Plus size={16} color={colors.primary} />
                    <Text
                      style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }}
                    >
                      Kamp Planla
                    </Text>
                    {planCount > 0 && (
                      <View
                        style={{
                          marginLeft: 8,
                          minWidth: 26,
                          height: 20,
                          borderRadius: 12,
                          paddingHorizontal: 6,
                          backgroundColor: colors.danger,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{planCount > 99 ? '99+' : String(planCount)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}
