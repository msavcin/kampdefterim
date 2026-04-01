import * as SecureStore from 'expo-secure-store';
import { setLargeItemAsync, getLargeItemAsync, setLastKnownLocationAsync, getLastKnownLocationAsync } from '../../lib/largeStorage';
// İki koordinat arası mesafe (metre cinsinden) hesaplama
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000; // Dünya yarıçapı (metre)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

import { campingTypes, getCampingTypeLabel, getCampingAreaBgColor } from '../../lib/categories';
import { filterCampingAreasByUser } from '../../lib/accessControl';
import React, { useState, useEffect, useRef, useMemo } from 'react';

import LocationPermissionModal from '../../components/LocationPermissionModal';
import HelpModal from '../../components/HelpModal';
import GuestInfoModal from '../../components/GuestInfoModal';

import { Svg, Path } from 'react-native-svg';
import { Modal } from 'react-native';
import CampingAreaSearchBar from '../../components/CampingAreaSearchBar';
import CampingAreaListView from '../../components/CampingAreaListView';
import CampingAreaFilters from '../../components/CampingAreaFilters';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
// Offline senkronizasyon ikonu react-native-svg ile
function OfflineSyncIcon({ width = 18, height = 18, color = '#010101' }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 208.63 208.31" fill="none">
      <Path
        fill={color}
        d="M199.64.12c6.59-1.07,11.07,5.3,7.96,11.21l-44.45,44.69c4.67,6.22,7.73,13.47,8.95,21.17,24.53,7.36,39.89,30.72,35.9,56.34-3.35,21.52-21.8,38.74-43.34,41.27-40.04.86-80.25.64-120.31.1l-32.43,32.19c-7.26,4.36-15.16-3.93-9.99-10.92L196.5,1.62c.82-.75,2.06-1.33,3.15-1.5Z"
      />
      <Path
        fill={color}
        d="M136.76,40.24L15.88,161.36c-.51.22-3.44-2.9-3.96-3.5-24.03-27.27-9.69-70.94,24.65-80.43,2.14-15.4,11.06-29.5,24.55-37.28,12.38-7.14,27.04-8.67,40.66-4.24,2.44.79,11.73,5.96,12.42,5.98,1.01.04,5.72-1.72,7.57-2.01,5.1-.79,9.92-.49,14.98.34Z"
      />
    </Svg>
  );
}
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import BlurOverlay from '../../components/BlurOverlay';
import { getSVGIcon } from '../icons/svgIcons';
import { syncAll } from '@/lib/syncManager';
import { checkSubscriptionStatus, refreshSubscriptionStatus } from '@/lib/iapManager';
import * as Location from 'expo-location';
import { listAnnouncements } from '@/lib/announcementApi';
import { initSmartCache } from '@/lib/smartOfflineCache';
import { getValilikIdFromProvinceName, getProvinceFromDistrict } from '@/lib/provinceMap';
// If getValilikIdFromProvinceName is the default export, use:
// import getValilikIdFromProvinceName from '@/lib/provinceMap';
// Or, if it is not exported at all, you need to export it from '@/lib/provinceMap.ts'
import { getProvinceFromOSM } from '../../lib/osmReverseGeocode';
import { getMe, listCommunityMembers } from '@/lib/userCommunityApi';
import { API_URL } from '@/lib/config';
import { UserPlus } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { on as onEvent, off as offEvent, emit as emitEvent } from '@/lib/eventBus';
import { eventBus } from '@/lib/eventBus';
import { Animated, Easing, AppState } from 'react-native';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MapPin, Filter, Navigation, Plus, Calendar, RefreshCw, Loader2, Binoculars, LocateFixed, List, Map, X, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { useCampingAreas } from '@/hooks/useCampingAreas';
import AddCampingAreaModal from '@/components/AddCampingAreaModal';
import type { MarkerType } from '../icons/svgIcons';
import CampingAreaDetailModal from '@/components/CampingAreaDetailModal';
import EditCampingAreaModal from '@/components/EditCampingAreaModal';
import { getDatabase } from '@/lib/database';
import { getToken } from '@/lib/auth';
import type { CampingArea } from '@/lib/database';
import { Alert, ToastAndroid, Platform } from 'react-native';
import { getCachedTile, cacheTile, precacheTilesForRegion, precacheRegionWithRadius } from '@/lib/mapTileCache';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
    // Son sorgulanan konumu saklamak için ref
    const lastQueriedLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
    // AppState'te alınan en son konum bilgisi (lokasyon butonu için hızlı erişim)
    const lastKnownLocationRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const navigation = useNavigation();

  // Swipe-back gesture ve geri tuşunu devre dışı bırak
  useFocusEffect(
    React.useCallback(() => {
      if (navigation && navigation.setOptions) {
        navigation.setOptions({ gestureEnabled: false });
      }
      
      // Android geri tuşunu engelle
      const onBackPress = () => {
        return true; // true döndürerek geri tuşunu engelle
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => backHandler.remove();
    }, [navigation])
  );

  // Router hook
  const router = useRouter();

  // Component mount durumunu takip etmek için ref
  const isMounted = useRef(true);
  const timeoutRefs = useRef<number[]>([]);
  const routerRef = useRef(router);
  
  // Router ref'ini güncelle
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  
  // Sync progress tracking
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, isLoading: false });
  const isFullSyncInProgressRef = useRef(false); // Ref kullan, state closure problemi için
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Tüm timeout'ları temizle
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current = [];
    };
  }, []);
  // WebView ref
  const webViewRef = useRef<WebView>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const refreshDataRef = useRef<(() => void) | null>(null);
  const appStateTimeoutRef = useRef<number | null>(null);
  // Harita WebView'ı yeniden render etmek için bir key
  const [mapKey, setMapKey] = useState(0);
  
  // mapKey değiştiğinde WebView ready state'ini sıfırla
  useEffect(() => {
    setIsWebViewReady(false);
  }, [mapKey]);
  
  // Güvenli WebView injection helper fonksiyonu
  const safeInjectJavaScript = (script: string, errorContext = 'WebView') => {
    if (!isMounted.current) {
      if (__DEV__) console.warn(`[${errorContext}] Component unmounted, injection iptal edildi`);
      return false;
    }
    if (!webViewRef.current) {
      if (__DEV__) console.warn(`[${errorContext}] WebView ref yok, injection iptal edildi`);
      return false;
    }
    if (!isWebViewReady) {
      if (__DEV__) console.warn(`[${errorContext}] WebView hazır değil, injection iptal edildi`);
      return false;
    }
    try {
      webViewRef.current.injectJavaScript(script);
      return true;
    } catch (error) {
      console.error(`[${errorContext}] Injection hatası:`, error);
      return false;
    }
  };
  
  // Görünüm modu: 'map', 'list' veya 'search'
  const [viewMode, setViewMode] = useState<'map' | 'list' | 'search'>('map');
  // Bildirim kaynaklı özel kamp alanları (ör. paylaşılanlar) - listede öncelikli gösterim için
  const [notificationCampingAreas, setNotificationCampingAreas] = useState<any[] | null>(null);
  // View mode preference yükle/kaydet helper'ları
  useEffect(() => {
    (async () => {
      try {
        const pref = await SecureStore.getItemAsync('camp_view_mode');
        if (pref === 'map' || pref === 'list') {
          if (isMounted.current) setViewMode(pref as 'map' | 'list');
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const changeViewMode = async (mode: 'map' | 'list' | 'search') => {
    if (!isMounted.current) return;
    setViewMode(mode);
    try {
      if (mode === 'map' || mode === 'list') {
        await SecureStore.setItemAsync('camp_view_mode', mode);
      }
    } catch (e) {
      // ignore storage errors
    }
  };
  // Video reklam aç/kapa kontrolü
  // ...existing code...
  // useTokenAutoLogout kaldırıldı: Token login sonrası otomatik silinmeyecek
  // Yardım modalı (sadece ilk açılışta göster)
  const [helpVisible, setHelpVisible] = useState(false);
  // Modal zincirleme kontrolü
  const [pendingShowPermissionModal, setPendingShowPermissionModal] = useState(false);
  const [pendingShowGuestModal, setPendingShowGuestModal] = useState(false);
  
  // Kullanıcı ve topluluk üyeliği state'leri
  const [user, setUser] = useState<any>(null);
  const [communityMember, setCommunityMember] = useState<any>(null);
  
  // Kamp planı taslağı gösterge
  const [hasDraftPlan, setHasDraftPlan] = useState(false);
  // Kaydedilmiş plan sayısı (rozet için)
  const [planCount, setPlanCount] = useState<number>(0);

  // Konum izni uyarı modalı ve durumu (ilk kez true olduğunda işlemleri başlat)
  const [locationPermissionModalVisible, setLocationPermissionModalVisible] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [userDismissedPermissionModal, setUserDismissedPermissionModal] = useState(false);
  const hasStartedOperationsRef = useRef(false); // İşlemler bir kez başlatılır
  
  // Misafir kullanıcı bilgilendirme modalı
  const [guestInfoModalVisible, setGuestInfoModalVisible] = useState(false);
  
  // İlk mount'ta sistem konum iznini kontrol et (sadece kontrol, native izin ekranı açılmaz)
  useEffect(() => {
    const checkInitialPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const granted = status === 'granted';
        setHasLocationPermission(granted);
      } catch (error) {
        setHasLocationPermission(false);
      }
    };
    checkInitialPermission();
  }, []);
  
  // Kamp planı taslağı kontrolü ve geri bildirim
  useEffect(() => {
    const loadDraftAndSaved = async () => {
      try {
        const draftRaw = await AsyncStorage.getItem('campPlannerDraft');
        setHasDraftPlan(!!draftRaw);
      } catch {
        setHasDraftPlan(false);
      }

      try {
        const savedRaw = await AsyncStorage.getItem('campPlannerSavedPlans');
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          setPlanCount(Array.isArray(parsed) ? parsed.length : 0);
        } else {
          setPlanCount(0);
        }
      } catch {
        setPlanCount(0);
      }
    };

    const handleUpdate = () => {
      loadDraftAndSaved();
    };

    loadDraftAndSaved();
    eventBus.on('camp-planner:updated', handleUpdate);

    // Camp-plan'dan gelen açma isteği: kamp türü filtresi ve lokasyon ile haritayı aç
    const handleOpenFromCampPlan = (payload: any) => {
      try {
        const campType = payload?.campType;
        const location = payload?.location;
        // Save previous state so we can restore when user closes plan mode
        prevSelectedTagsRef.current = selectedTags;
        prevMapMoveQueryRef.current = mapMoveQuery;
        if (campType) {
          setSelectedTags([campType]);
        }
        if (location && location.latitude && location.longitude) {
          setMapMoveQuery({ latitude: location.latitude, longitude: location.longitude });
        }
        // Harita plan görüntüleme için location picker banner kapat, fakat seçme modu aktif et
        setIsLocationPickerMode(false);
        setSelectForPlanMode(true);
        try { eventBus.emit('camp-plan:modeActive', { active: true, campType }); } catch {}
        setViewMode('map');
        // Hemen filtreleri ve veriyi yenile (selectedTags güncellemesi sonrası)
        try {
          if (refreshDataRef.current && typeof refreshDataRef.current === 'function') {
            refreshDataRef.current();
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.warn('[MapScreen] camp-plan open handler hata', e);
      }
    };
    eventBus.on('camp-plan:openMap', handleOpenFromCampPlan);

    // Eğer camp-plan tarafından pending payload yazıldıysa (event kaçırıldıysa) onu oku
    (async () => {
      try {
        const pending = await AsyncStorage.getItem('campPlanPendingOpen');
        if (pending) {
          const parsed = JSON.parse(pending);
          if (parsed) {
            handleOpenFromCampPlan(parsed);
            await AsyncStorage.removeItem('campPlanPendingOpen');
          }
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      eventBus.off('camp-planner:updated', handleUpdate);
      eventBus.off('camp-plan:openMap', handleOpenFromCampPlan);
    };
  }, []);

  // Konum izni verilmediyse modal sadece ilk açılışta ve gerekli durumlarda açılsın
  useEffect(() => {
    (async () => {
      if (!isMounted.current) return;
      
      // hasLocationPermission henüz kontrol edilmediyse bekle
      if (hasLocationPermission === null) return;
      
      console.log('[PERMISSION MODAL CHECK] Başlangıç:', { 
        userDismissedPermissionModal, 
        hasLocationPermission, 
        isPremium: user?.offline_enabled 
      });
      
      // Kullanıcı daha önce modalı kapattıysa tekrar açma
      if (userDismissedPermissionModal) {
        console.log('[PERMISSION MODAL CHECK] userDismissedPermissionModal true, atlanıyor');
        return;
      }
      
      // "Bir daha hatırlatma" seçeneğini kontrol et
      const doNotShow = await SecureStore.getItemAsync('doNotShowLocationPermissionModal');
      if (doNotShow === 'true') {
        console.log('[PERMISSION MODAL CHECK] doNotShow flag aktif, atlanıyor');
        return;
      }
      
      // Konum izni kontrolü (premium kullanıcılar için background izin kaldırıldı)
      const showModal = !hasLocationPermission;
      console.log('[PERMISSION MODAL CHECK] Konum izni durumu - hasLocationPermission:', hasLocationPermission, 'showModal:', showModal);
      
      // Eğer help modal açıksa, permission modalı beklet
      if (showModal && helpVisible) {
        console.log('[PERMISSION MODAL CHECK] Help modal açık, permission modalı bekletiliyor');
        setPendingShowPermissionModal(true);
        setLocationPermissionModalVisible(false);
      } else if (showModal && !helpVisible) {
        // HelpModal kapalı ve modal açılmalı
        console.log('[PERMISSION MODAL CHECK] Modal açılıyor');
        setLocationPermissionModalVisible(true);
      } else {
        // Modal açılmamalı
        console.log('[PERMISSION MODAL CHECK] Modal kapalı kalacak');
        setLocationPermissionModalVisible(false);
      }
    })();
  }, [hasLocationPermission, user, helpVisible, userDismissedPermissionModal]);
  
  // AppState değişikliklerini dinle (sistem ayarlarından dönüşte)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && isMounted.current) {
        console.log('[AppState] Uygulama aktif, izin durumu kontrol ediliyor');
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          const granted = status === 'granted';
          
          // Sadece izin durumu değiştiyse state'i güncelle
          if (granted !== hasLocationPermission) {
            setHasLocationPermission(granted);
            
            // İzin verildiğinde modalı kapat ve flag'i sıfırla
            if (granted) {
              setUserDismissedPermissionModal(false);
              setLocationPermissionModalVisible(false);
            } else if (!userDismissedPermissionModal) {
              // İzin kaldırıldıysa ve kullanıcı daha önce reddetmediyse modalı aç
              const doNotShow = await SecureStore.getItemAsync('doNotShowLocationPermissionModal');
              if (doNotShow !== 'true') {
                setLocationPermissionModalVisible(true);
              }
            }
          }
        } catch (error) {
          console.error('[AppState] İzin kontrolü hatası:', error);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [hasLocationPermission, userDismissedPermissionModal]);
  
  // HelpModal kapandığında, permission modal açılması gerekiyorsa aç (modal animasyonları sonrası için gecikme ile)
  useEffect(() => {
    if (!helpVisible && pendingShowPermissionModal) {
      // Modal animasyonunun ve render cleanup'larının tamamlanması için 500ms bekle
      const timeout = setTimeout(async () => {
        if (!isMounted.current) return;
        
        setPendingShowPermissionModal(false);
        
        // LocationPermissionModal açılmalı mı kontrol et
        const shouldShowLocationModal = !hasLocationPermission && !userDismissedPermissionModal;
        
        if (shouldShowLocationModal) {
          setLocationPermissionModalVisible(true);
        } else if (user?.role === 'guest') {
          // LocationPermissionModal açılmayacak ama guest kullanıcıysa guest modalını aç
          try {
            const doNotShowGuest = await SecureStore.getItemAsync('doNotShowGuestInfoModal');
            if (doNotShowGuest !== 'true') {
              setTimeout(() => {
                if (isMounted.current) {
                  setGuestInfoModalVisible(true);
                }
              }, 500);
            }
          } catch (e) {
            console.error('[GUEST MODAL] SecureStore hatası:', e);
          }
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [helpVisible, pendingShowPermissionModal, hasLocationPermission, userDismissedPermissionModal, user]);
  
  // LocationPermissionModal kapandığında, guest modal açılması gerekiyorsa aç (modal animasyonları sonrası için gecikme ile)
  useEffect(() => {
    if (!locationPermissionModalVisible && pendingShowGuestModal) {
      // Modal animasyonunun ve render cleanup'larının tamamlanması için 500ms bekle
      const timeout = setTimeout(() => {
        if (isMounted.current) {
          setGuestInfoModalVisible(true);
          setPendingShowGuestModal(false);
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [locationPermissionModalVisible, pendingShowGuestModal]);

  // Profil sayfasından konum izni verildiğinde haritayı güncelle
  useEffect(() => {
    let permissionTimeoutId: number | null = null;

    const handleLocationPermissionFromProfile = async () => {
      if (!isMounted.current) return;
      
      console.log('[LocationPermission] Profil sayfasından event alındı');
      try {
        // Konum izinlerini kontrol et
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status === 'granted') {
          if (!isMounted.current) return;
          setHasLocationPermission(true);
          
          // Haritayı kullanıcının konumuna döndür
          setMapMoveQuery(null);
          
          // Konumu al ve haritayı ortala
          permissionTimeoutId = setTimeout(async () => {
            if (!isMounted.current) return;
            
            try {
              // getCurrentLocation hook'ını çağır - location state'i güncellenecek
              await getCurrentLocation();
              
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              const { latitude, longitude } = location.coords;
              console.log('[LocationPermission] Konum alındı:', latitude, longitude);
              
              if (!isMounted.current) return;
              setMapCenter({ latitude, longitude });
              
              // WebView'a haritayı ortala komutu gönder
              safeInjectJavaScript(`
                if (window.map) {
                  window.map.setView([${latitude}, ${longitude}], 13);
                }
                true;
              `, 'LocationPermission');
              
              // Yakındaki kamp alanlarını güncelle
              if (refreshDataRef.current && isMounted.current && typeof refreshDataRef.current === 'function') {
                try {
                  refreshDataRef.current();
                } catch (refreshError) {
                  console.error('[LocationPermission] Refresh hatası:', refreshError);
                }
              }
            } catch (error) {
              console.error('[LocationPermission] Konum alma hatası:', error);
            }
          }, 500) as unknown as number;
          
          if (permissionTimeoutId) {
            timeoutRefs.current.push(permissionTimeoutId);
          }
        } else {
          // İzin kaldırıldı
          if (!isMounted.current) return;
          setHasLocationPermission(false);
          console.log('[LocationPermission] Konum izni kaldırıldı');
        }
      } catch (error) {
        console.error('[LocationPermission] Event işleme hatası:', error);
        if (!isMounted.current) return;
        // Hata durumunda izin durumunu güncelle
        try {
          const foreground = await Location.getForegroundPermissionsAsync();
          setHasLocationPermission(foreground.status === 'granted');
        } catch (fallbackError) {
          console.error('[LocationPermission] Fallback izin kontrolü hatası:', fallbackError);
        }
      }
    };

    onEvent('locationPermissionGranted', handleLocationPermissionFromProfile);

    return () => {
      offEvent('locationPermissionGranted', handleLocationPermissionFromProfile);
      if (permissionTimeoutId) {
        clearTimeout(permissionTimeoutId);
      }
    };
  }, []);
  
  useEffect(() => {
    (async () => {
      try {
        const seen = await SecureStore.getItemAsync('helpModalSeen');
        if (!seen && isMounted.current) {
          setHelpVisible(true);
          await SecureStore.setItemAsync('helpModalSeen', '1');
        }
      } catch {}
    })();
    // Cleanup gerekmez
  }, []);
  // Tüm kamp alanları arama için state
  const [searchAllAreas, setSearchAllAreas] = useState<CampingArea[]>([]);
  const [searchSelectedArea, setSearchSelectedArea] = useState(null);
  const isConnected = useNetworkStatus();
  // Duyurular ve checklist arka plan fetch fonksiyonları
  // Yeni duyuru bildirimi için localde gösterilen duyuru id'lerini sakla
  const fetchAnnouncementsSilently = async (router: any, skipNotification = false) => {
    const functionStartTime = Date.now();
    // Eğer zaten fetch ediliyorsa tekrarı atla
    if (isFetchingAnnouncementsRef.current) {
      if (__DEV__) console.log('[ANNOUNCEMENT] fetchAnnouncementsSilently: Zaten devam eden işlem var, atlanıyor');
      return;
    }
    isFetchingAnnouncementsRef.current = true;
    if (__DEV__) console.log('[ANNOUNCEMENT] fetchAnnouncementsSilently BAŞLADI, skipNotification:', skipNotification, 'isFullSyncInProgressRef:', isFullSyncInProgressRef.current);
    try {
      // Önce kullanıcı bilgisini al (topluluk filtrelemesi için gerekli)
      const user = await getMe();
      
      // Localde gösterilen duyuru id'lerini al
      const shownAnnouncementIdsStr = await getLargeItemAsync('shownAnnouncementIds');
      const shownAnnouncementIds = shownAnnouncementIdsStr ? JSON.parse(shownAnnouncementIdsStr) : [];
      const isFirstLaunch = shownAnnouncementIds.length === 0;
      const db = getDatabase();

      // İlk açılış mantığı
      if (isFirstLaunch) {
        // Hiç senkronizasyon yapılmış mı kontrol et
        const hasInitialSync = await SecureStore.getItemAsync('hasInitialSync');
        const isInitialSyncComplete = await SecureStore.getItemAsync('isInitialSyncComplete');
        
        // Hiç senkronizasyon yapılmamışsa veya devam ediyorsa bildirim gösterme
        if (!hasInitialSync || isInitialSyncComplete !== 'true' || isFullSyncInProgressRef.current) {
          if (__DEV__) console.log('[ANNOUNCEMENT] İlk açılış - Senkronizasyon henüz tamamlanmadı, bildirim atlanıyor');
          return;
        }

        // İlk açılışta bildirim gösterme
        // Duyurular announcements ekranına gidildiğinde gösterilecek
        if (__DEV__) console.log('[ANNOUNCEMENT] İlk açılış - Bildirim announcements ekranından gösterilecek');
        return;
      }

      // Valilik ID değişkenini tanımla (ilk açılış sonrası kullanılacak)
      let matchedValilikIdLocal: any = null;
      
      // Cache'den valilik_id'yi oku
      try {
        const cachedValilikId = await SecureStore.getItemAsync('matchedValilikId');
        if (cachedValilikId) {
          matchedValilikIdLocal = cachedValilikId;
          if (__DEV__) console.log('[ANNOUNCEMENT] Cache\'den valilik ID alındı:', matchedValilikIdLocal);
        }
      } catch (err) {
        if (__DEV__) console.log('[ANNOUNCEMENT] Cache okuma hatası:', err?.message);
      }

      // Lokal duyuruları kontrol et (yeni local duyuru varsa hemen göster)
      if (__DEV__) console.log('[ANNOUNCEMENT] Lokal duyurular çekiliyor (hızlı kontrol)...');
      const dbStartTime = Date.now();
      const allAnnouncementsLocal = await db.listAnnouncementsLocal({ onlyActive: true });
      const dbDuration = Date.now() - dbStartTime;
      if (__DEV__) console.log(`[ANNOUNCEMENT] Lokal duyurular çekildi (hızlı kontrol: ${dbDuration}ms, ${Array.isArray(allAnnouncementsLocal) ? allAnnouncementsLocal.length : 0} kayıt)`);

      // Eğer daha önce ilk açılışta alınan matchedValilikIdLocal varsa kullan, yoksa null kalacak ve filtre uygulanmayacak
      let filteredLocalAnnouncements = allAnnouncementsLocal;
      if (Array.isArray(allAnnouncementsLocal)) {
        filteredLocalAnnouncements = allAnnouncementsLocal.filter(a => {
          // Topluluk duyuruları: sadece kullanıcının topluluğuna ait olanlar (konum olmadan da göster)
          if (a.community_id !== 0) {
            return user?.community_id && String(a.community_id) === String(user.community_id);
          }
          // Valilik duyuruları: sadece konum varsa ve mevcut valilik_id'ye ait olanlar
          if (a.community_id === 0 && matchedValilikIdLocal) {
            return String(a.valilik_id) === String(matchedValilikIdLocal);
          }
          return false;
        });
      }

      const newAnnouncementsLocal = Array.isArray(filteredLocalAnnouncements)
        ? filteredLocalAnnouncements.filter((a: any) => !shownAnnouncementIds.includes(a.id))
        : [];

      if (Array.isArray(newAnnouncementsLocal) && newAnnouncementsLocal.length > 0 && !skipNotification && !isFullSyncInProgressRef.current) {
        if (__DEV__) console.log('[ANNOUNCEMENT] Lokal yeni duyuru bulundu, gösteriliyor (hızlı yol):', newAnnouncementsLocal.length);
        const updatedIds = [...shownAnnouncementIds, ...newAnnouncementsLocal.map(a => a.id)];
        await setLargeItemAsync('shownAnnouncementIds', JSON.stringify(updatedIds));
        addToNotificationQueue([{
          id: newAnnouncementsLocal[0].id,
          type: 'announcement',
          message: `Okunmamış ${newAnnouncementsLocal.length} yeni duyurunuz var!`,
          goto: () => router.push('/announcements'),
        }], 'announcement');
        return;
      }

      // Localde yeni yoksa, daha detaylı kontrol: konum ve API
      if (__DEV__) console.log(`[ANNOUNCEMENT] Kullanıcı bilgisi hazır (community_id: ${user?.community_id})`);

      // Konum bilgisini al ve valilik_id bul — sadece cache'de yoksa
      if (!matchedValilikIdLocal) {
        try {
          const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 2000));
          const location = await Promise.race([locationPromise, timeoutPromise]) as any;
          if (location && location.coords) {
            const provinceName = await getProvinceFromOSM(location.coords.latitude, location.coords.longitude);
            if (provinceName) {
              const { getValilikIdFromProvinceName } = require('@/lib/provinceMap');
              // getValilikIdFromProvinceName fonksiyonu: il adı → valilik_id, ilçe → il → valilik_id fallback'i yapar
              matchedValilikIdLocal = getValilikIdFromProvinceName(provinceName);
              if (matchedValilikIdLocal) {
                await SecureStore.setItemAsync('matchedValilikId', String(matchedValilikIdLocal));
                if (__DEV__) console.log('[ANNOUNCEMENT] Konum servisi:', provinceName, ' → Valilik ID kaydedildi:', matchedValilikIdLocal);
              }
            }
          }
        } catch (err) {
          if (__DEV__) console.log('[ANNOUNCEMENT] Konum servisi timeout/hata (devam ediliyor):', err?.message);
        }
      }

      // Aktif duyuruları local DB'den tekrar al (valilik ve topluluk filtresi uygulanacak)
      if (__DEV__) console.log('[ANNOUNCEMENT] Lokal duyurular tekrar çekiliyor (filtre uygulanacak)...');
      let allAnnouncements = await db.listAnnouncementsLocal({ onlyActive: true });
      if (Array.isArray(allAnnouncements)) {
        // Valilik ve topluluk filtresi uygula
        allAnnouncements = allAnnouncements.filter(a => {
          // Topluluk duyuruları: sadece kullanıcının topluluğuna ait olanlar (konum olmadan da göster)
          if (a.community_id !== 0) {
            return user?.community_id && String(a.community_id) === String(user.community_id);
          }
          // Valilik duyuruları: sadece konum varsa ve mevcut valilik_id'ye ait olanlar
          if (a.community_id === 0 && matchedValilikIdLocal) {
            return String(a.valilik_id) === String(matchedValilikIdLocal);
          }
          return false;
        });
      }
      // Yeni duyuruları local'den hesapla (henüz API'ye gerek yoksa bu hızlı yol kullanılır)
      let newAnnouncements: any[] = Array.isArray(allAnnouncements)
        ? allAnnouncements.filter((a: any) => !shownAnnouncementIds.includes(a.id))
        : [];

      // OFFLINE MODDA API ÇAĞRISI YAPILMAZ, fallback yok!
      if (!isConnected && !(user?.offline_enabled)) {
        // Bildirim göster (full sync sırasında değil)
        if (Array.isArray(newAnnouncements) && newAnnouncements.length > 0 && !skipNotification && !isFullSyncInProgressRef.current) {
          const updatedIds = [...shownAnnouncementIds, ...newAnnouncements.map(a => a.id)];
          await setLargeItemAsync('shownAnnouncementIds', JSON.stringify(updatedIds));
          addToNotificationQueue([{
            id: newAnnouncements[0].id,
            type: 'announcement',
            message: `Okunmamış ${Array.isArray(newAnnouncements) ? newAnnouncements.length : 0} yeni duyurunuz var!`,
            goto: () => router.push('/announcements'),
          }], 'announcement');
        }
        return;
      }

      // ONLINE veya premium ise eski API fallback devam etsin
      if (!Array.isArray(allAnnouncements) || allAnnouncements.length === 0) {
        try {
          if (__DEV__) console.log('[ANNOUNCEMENT] API çağrısı başlatılıyor...');
          const apiStartTime = Date.now();
          // Hem valilik duyurularını (community_id=0) hem de topluluk duyurularını çek
          const promises = [listAnnouncements(0)]; // Valilik duyuruları
          if (user?.community_id && user.community_id !== 0) {
            promises.push(listAnnouncements(user.community_id)); // Topluluk duyuruları
          }
          // API çağrısına timeout ekle (3 saniye)
          const apiPromise = Promise.all(promises);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), 3000)
          );
          const results = await Promise.race([apiPromise, timeoutPromise]) as any[];
          const apiDuration = Date.now() - apiStartTime;
          if (__DEV__) console.log(`[ANNOUNCEMENT] API çağrısı tamamlandı (${apiDuration}ms)`);
          allAnnouncements = ([] as any[]).concat(...results);
          // Duplicate id'leri filtrele
          const seen = new Set();
          allAnnouncements = allAnnouncements.filter((a: any) => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          });
        } catch (e) {
          if (__DEV__) console.log('[ANNOUNCEMENT] API çağrısı hatası:', e?.message);
          console.warn('Duyurular fetch hatası:', e);
          allAnnouncements = [];
        }
        // Yeni gelen duyuruları bul (API'den çekilenler için)
        // Valilik ve topluluk filtresi uygula
        if (Array.isArray(allAnnouncements)) {
          allAnnouncements = allAnnouncements.filter(a => {
            // Topluluk duyuruları: sadece kullanıcının topluluğuna ait olanlar (konum olmadan da göster)
            if (a.community_id !== 0) {
              return user?.community_id && String(a.community_id) === String(user.community_id);
            }
            // Valilik duyuruları: sadece konum varsa ve mevcut valilik_id'ye ait olanlar
            if (a.community_id === 0 && matchedValilikIdLocal) {
              return String(a.valilik_id) === String(matchedValilikIdLocal);
            }
            return false;
          });
        }
        // API'den gelen duyuruların logu
        const apiValilikAnnouncements = allAnnouncements.filter(a => a.community_id === 0);
        const apiCommunityAnnouncements = allAnnouncements.filter(a => a.community_id !== 0);
        // API'den sonra yeni (gösterilmemiş) duyuruların logu
        newAnnouncements = Array.isArray(allAnnouncements)
          ? allAnnouncements.filter((a: any) => !shownAnnouncementIds.includes(a.id))
          : [];
      }
      if (Array.isArray(newAnnouncements) && newAnnouncements.length > 0 && !skipNotification && !isFullSyncInProgressRef.current) {
        // Yeni duyuru id'lerini hemen kaydet
        const updatedIds = [...shownAnnouncementIds, ...newAnnouncements.map(a => a.id)];
        await setLargeItemAsync('shownAnnouncementIds', JSON.stringify(updatedIds));
        
        // Bildirim göster (full sync sırasında değil)
        addToNotificationQueue([{
          id: newAnnouncements[0].id,
          type: 'announcement',
          message: `Okunmamış ${Array.isArray(newAnnouncements) ? newAnnouncements.length : 0} yeni duyurunuz var!`,
          goto: () => router.push('/announcements'),
        }], 'announcement');
        return;
      }
    } catch (e) {
      if (__DEV__) console.warn('Duyuru bildirim fetch hatası:', e);
    } finally {
      isFetchingAnnouncementsRef.current = false;
      const functionDuration = Date.now() - functionStartTime;
      if (__DEV__) console.log(`[ANNOUNCEMENT] fetchAnnouncementsSilently TAMAMLANDI (Toplam: ${functionDuration}ms)`);
    }
  };

  // Checklist arka plan fetch fonksiyonu kaldırıldı. Checklist işlemleri için custom hook veya context kullanılmalı.
  // Bildirim alanı için state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationIndex, setNotificationIndex] = useState(0);
  const [showNotificationBar, setShowNotificationBar] = useState(false);
  const notificationBarAnim = useRef(new Animated.Value(1)).current;
  // Bildirim barı cleanup için timer referansları
  // React Native'de setTimeout/setInterval number döndürür
  const notificationTimeoutRef = useRef<number | null>(null);
  const notificationIntervalRef = useRef<number | null>(null);
  // Bildirim kuyruğu (üst üste binmeyi önlemek için)
  const notificationQueueRef = useRef<{notifications: any[], type: string}[]>([]);
  const isShowingNotificationRef = useRef(false);
  // Full sync sırasında biriken bildirimler (sync bitince gösterilecek)
  const pendingNotificationsAfterSyncRef = useRef<{notifications: any[], type: string}[]>([]);
  
  // Kuyruğa bildirim ekle
  const addToNotificationQueue = (notifs: any[], type: string) => {
    if (!Array.isArray(notifs) || notifs.length === 0) return;
    
    if (__DEV__) console.log(`[NOTIFICATION QUEUE] ${type} bildirimi kuyruğa eklendi (${notifs.length} adet)`);
    notificationQueueRef.current.push({ notifications: notifs, type });
    
    // Eğer şu anda gösterim yapılmıyorsa, hemen göster
    if (!isShowingNotificationRef.current && !showNotificationBar) {
      showNextNotification();
    }
  };
  
  // Full sync tamamlandığında bekleyen bildirimleri kuyruğa boşalt
  const flushPendingNotifications = () => {
    const pending = pendingNotificationsAfterSyncRef.current;
    if (pending.length === 0) return;
    pendingNotificationsAfterSyncRef.current = [];
    if (__DEV__) console.log(`[NOTIFICATION QUEUE] Full sync sonrası ${pending.length} bekleyen bildirim kuyruğa ekleniyor`);
    for (const item of pending) {
      addToNotificationQueue(item.notifications, item.type);
    }
  };

  // Kuyruktan sonraki bildirimi göster
  const showNextNotification = () => {
    if (notificationQueueRef.current.length === 0) {
      isShowingNotificationRef.current = false;
      if (__DEV__) console.log('[NOTIFICATION QUEUE] Kuyruk boş');
      return;
    }
    
    const next = notificationQueueRef.current.shift();
    if (!next) {
      isShowingNotificationRef.current = false;
      return;
    }
    
    if (__DEV__) console.log(`[NOTIFICATION QUEUE] Sonraki bildirim gösteriliyor: ${next.type} (${next.notifications.length} adet)`);
    isShowingNotificationRef.current = true;
    setNotifications(next.notifications);
    setNotificationIndex(0);
    setShowNotificationBar(true);
  };
  // Bildirim geçiş animasyonu için
  useEffect(() => {
    if (Array.isArray(notifications) && notifications.length > 1) {
      Animated.timing(notificationBarAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    } else {
      notificationBarAnim.setValue(1);
    }
  }, [notificationIndex, Array.isArray(notifications) ? notifications.length : 0]);

  // Bildirimleri sırayla göstermek için timer
  useEffect(() => {
    if (showNotificationBar && Array.isArray(notifications) && notifications.length > 0) {
      let currentIndex = 0;
      setNotificationIndex(0);
      notificationBarAnim.setValue(1);
      if (Array.isArray(notifications) && notifications.length > 1) {
        notificationIntervalRef.current = setInterval(() => {
          Animated.timing(notificationBarAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }).start(() => {
            currentIndex = (currentIndex + 1) % (Array.isArray(notifications) ? notifications.length : 1);
            if (isMounted.current) setNotificationIndex(currentIndex);
            Animated.timing(notificationBarAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.ease),
            }).start();
          });
        }, 2000);
      }
      notificationTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) setShowNotificationBar(false);
      }, 10000);
      return () => {
        if (notificationIntervalRef.current) clearInterval(notificationIntervalRef.current);
        if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
      };
    }
    return undefined;
  }, [showNotificationBar, Array.isArray(notifications) ? notifications.length : 0]);

  // Bar açıldığında animasyonla opacity 1'e geçiş
  useEffect(() => {
    if (showNotificationBar) {
      Animated.timing(notificationBarAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    } else {
      notificationBarAnim.setValue(0);
      // Bildirim barı kapandığında kuyruktan sonraki bildirimi göster
      if (isShowingNotificationRef.current) {
        // Kısa bir gecikme ile sonraki bildirimi göster (animasyon için)
        const timeoutId = setTimeout(() => {
          if (isMounted.current) {
            showNextNotification();
          }
        }, 500);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [showNotificationBar]);

  // Mevcut konuma odaklanma fonksiyonu
  const handleShowCurrentLocation = async () => {
    try {
      if (!isMounted.current) return;
      
      // Konum izni kontrolü
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[DEBUG] Konum izni yok');
        return;
      }
      
      // Önce cache'lenmiş konumu kullan (varsa ve güncel ise - son 10 dakika içinde)
      const cachedLocation = lastKnownLocationRef.current;
      const now = Date.now();
      const CACHE_VALIDITY_MS = 600000; // 10 dakika
      
      if (cachedLocation && (now - cachedLocation.timestamp) < CACHE_VALIDITY_MS) {
        // Cache'lenmiş konum güncel, hemen kullan
        const { latitude, longitude } = cachedLocation;
        console.log('[DEBUG] Cache\'ten konum kullanılıyor:', latitude, longitude);
        
        if (!isMounted.current) return;
        
        // Haritayı kullanıcının konumuna döndür
        setMapMoveQuery(null);
        setMapCenter({ latitude, longitude });
        
        // WebView'a haritayı ortala komutu hemen gönder
        if (isMounted.current) {
          safeInjectJavaScript(`
            if (typeof map !== 'undefined') {
              map.setView([${latitude}, ${longitude}], 13);
            }
            true;
          `, 'DEBUG');
        }
        
        // Arka planda fresh location al ve güncelle
        setTimeout(async () => {
          try {
            const freshLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            
            if (!isMounted.current) return;
            
            const freshLat = freshLocation.coords.latitude;
            const freshLng = freshLocation.coords.longitude;
            
            // Cache'i güncelle
            const cacheValue = {
              latitude: freshLat,
              longitude: freshLng,
              timestamp: Date.now(),
            };
            lastKnownLocationRef.current = cacheValue;
            setLastKnownLocationAsync(freshLat, freshLng).catch((err) => {
              if (__DEV__) console.warn('[LOCATION] lastKnownLocation kaydedilemedi:', err);
            });
            
            // Eğer konum önemli ölçüde değiştiyse (>50m) haritayı güncelle
            const distance = getDistanceMeters(latitude, longitude, freshLat, freshLng);
            if (distance > 50) {
              console.log('[DEBUG] Konum değişti (', distance.toFixed(0), 'm), harita güncelleniyor');
              setMapCenter({ latitude: freshLat, longitude: freshLng });
              if (isMounted.current) {
                safeInjectJavaScript(`
                  if (typeof map !== 'undefined') {
                    map.setView([${freshLat}, ${freshLng}], 13);
                  }
                  true;
                `, 'DEBUG');
              }
            }
            
            // getCurrentLocation hook'ını çağırarak location state'i güncelle
            await getCurrentLocation();
            
            // Kamp alanlarını yenile
            if (refreshDataRef.current && typeof refreshDataRef.current === 'function') {
              await refreshDataRef.current();
            }
          } catch (error) {
            console.error('[DEBUG] Arka plan konum güncelleme hatası:', error);
          }
        }, 100); // Kısa gecikme ile arka planda güncelle
        
        return; // Cache'lenmiş konum kullanıldı, fonksiyondan çık
      }
      
      // Cache yok veya eski, fresh location al
      try {
        console.log('[DEBUG] Fresh konum alınıyor...');
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        if (!isMounted.current) return;
        
        const { latitude, longitude } = currentLocation.coords;
        console.log('[DEBUG] Güncel konum:', latitude, longitude);
        
        // Cache'i güncelle
        const cacheValue = {
          latitude,
          longitude,
          timestamp: Date.now(),
        };
        lastKnownLocationRef.current = cacheValue;
        setLastKnownLocationAsync(latitude, longitude).catch((err) => {
          if (__DEV__) console.warn('[LOCATION] lastKnownLocation kaydedilemedi:', err);
        });
        
        // Haritayı kullanıcının konumuna döndür
        setMapMoveQuery(null);
        setMapCenter({ latitude, longitude });
        // WebView'a haritayı ortala komutu hemen gönder
        if (isMounted.current) {
          safeInjectJavaScript(`
            if (typeof map !== 'undefined') {
              map.setView([${latitude}, ${longitude}], 13);
            }
            true;
          `, 'DEBUG');
        }
        
        // getCurrentLocation hook'ını çağırarak location state'i güncelle
        await getCurrentLocation();
        
        // Kamp alanlarını yenile
        if (refreshDataRef.current && typeof refreshDataRef.current === 'function') {
          await refreshDataRef.current();
        }
      } catch (error) {
        console.error('[DEBUG] Konum alma hatası:', error);
      }
    } catch (e) {
      console.error('[DEBUG] handleShowCurrentLocation hatası:', e);
    }
  };
  const [showSyncBanner, setShowSyncBanner] = useState(false);
    // DEBUG: Veritabanındaki tags/type dağılımını logla (sadece ana kamp türleri)
    useEffect(() => {
      (async () => {
        try {
          const allAreas = await getDatabase().getAllCampingAreas();
          // Sadece tags içindeki ana kamp türlerine bak
          const typeDist: Record<string, number> = {};
          allAreas.forEach(area => {
            let types: string[] = [];
            if (area.tags && typeof area.tags === 'string' && typeof (area.tags as string).trim === 'function' && (area.tags as string).trim() !== '') {
              try {
                const parsed = JSON.parse(area.tags);
                if (typeof parsed === 'object' && parsed !== null) {
                  if (Array.isArray(parsed)) {
                    types = parsed;
                  } else if (typeof parsed.type === 'string') {
                    types = [parsed.type];
                  } else if (Array.isArray(parsed.type)) {
                    types = parsed.type;
                  }
                }
              } catch {
                // Eğer virgüllü string ise split et
                if (typeof area.tags === 'string' && typeof (area.tags as string).split === 'function') {
                  types = (area.tags as string).split(',').map(t => t.trim());
                }
              }
            } else if (area.tags && typeof area.tags === 'object' && area.tags !== null) {
              if (Array.isArray(area.tags)) {
                types = area.tags;
              } else if (typeof area.tags.type === 'string') {
                types = [area.tags.type];
              } else if (Array.isArray(area.tags.type)) {
                types = area.tags.type;
              }
            } else if (typeof area.type === 'string') {
              types = [area.type];
            }
            // Sadece ana kamp türlerini say (merkezi kategori yönetiminden)
            const validTypes = types.filter(t => campingTypes.some(ct => ct.id === t));
            validTypes.forEach(t => {
              typeDist[t] = (typeDist[t] || 0) + 1;
            });
          });
        } catch (e){}
      })();
    }, []);
  // Online olduğunda merkezi sync fonksiyonunu tetikle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isMounted.current) return;
      if (isConnected) {
        const token = await getToken();
        if (!isMounted.current) return;
        if (token) {
          // İlk full sync henüz tamamlanmamışsa syncAll'u atla
          // (initial sync useEffect progress bar ile bunu halledecek)
          const hasInitialSync = await SecureStore.getItemAsync('hasInitialSync');
          if (!hasInitialSync) {
            if (__DEV__) console.log('[SYNC][isConnected] hasInitialSync yok, syncAll atlanıyor - initial sync useEffect bunu halledecek');
            return;
          }
          // Konum kontrolü - değişmişse haritayı güncelle
          try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (!isMounted.current) return;
            if (status === 'granted') {
              const newLocation = await Location.getCurrentPositionAsync({});
              if (!isMounted.current) return;
              if (newLocation && newLocation.coords) {
                // Mevcut konum ile yeni konum arasında anlamlı fark varsa (>0.01 derece ~1km)
                if (location && (Math.abs(location.coords.latitude - newLocation.coords.latitude) > 0.01 || 
                    Math.abs(location.coords.longitude - newLocation.coords.longitude) > 0.01)) {
                  setMapMoveQuery(null); // Haritayı yeni konuma döndür
                }
              }
            }
          } catch (e) {
            console.warn('[SYNC] Konum kontrolü hatası:', e);
          }
          if (cancelled || !isMounted.current) return;
          const user = await getMe();
          if (cancelled || !isMounted.current) return;
          if (__DEV__) console.log('[DEBUG][PROGRESS] Sync başlıyor...');
          setSyncProgress({ current: 0, total: 0, isLoading: true });
          await syncAll({ 
            userId: user?.id,
            onProgress: (current, total) => {
              if (!isMounted.current) return;
              if (__DEV__) console.log('[DEBUG][PROGRESS] Progress güncellendi:', current, '/', total);
              setSyncProgress({ current, total, isLoading: true });
            }
          });
          if (!isMounted.current) return;
          if (__DEV__) console.log('[DEBUG][PROGRESS] Sync tamamlandı');
          setSyncProgress({ current: 0, total: 0, isLoading: false });
        } else {
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  // Harici tetiklemeden (örn. Profil'den) ilk full sync başlatma
  useEffect(() => {
    const handler = async () => {
      try {
        if (!isConnected) {
          if (__DEV__) console.log('[trigger:initialFullSync] Çevrimdışı, atlanıyor');
          return;
        }
        if (isSyncingRef.current) {
          if (__DEV__) console.log('[trigger:initialFullSync] Zaten sync çalışıyor, atlanıyor');
          return;
        }
        isSyncingRef.current = true;
        isFullSyncInProgressRef.current = true;
        await SecureStore.setItemAsync('isInitialSyncComplete', 'false');
        setSyncProgress({ current: 0, total: 0, isLoading: true });

        const dbInst = getDatabase();
        const count = await dbInst.fetchAndStoreCampingAreasFromAPI(undefined, {
          forceFull: true,
          userId: user?.id !== undefined ? String(user.id) : undefined,
          onProgress: (current: number, total: number) => {
            if (__DEV__) console.log('[trigger:initialFullSync] progress', current, total);
            setSyncProgress({ current, total, isLoading: true });
          }
        });

        await SecureStore.setItemAsync('hasInitialSync', 'true');
        await SecureStore.setItemAsync('isInitialSyncComplete', 'true');
        isFullSyncInProgressRef.current = false;
        setSyncProgress({ current: 0, total: 0, isLoading: false });
        flushPendingNotifications();
        if (__DEV__) console.log('[trigger:initialFullSync] tamamlandı, kayıt sayısı:', count);
      } catch (e) {
        console.error('[trigger:initialFullSync] hata:', e);
        isFullSyncInProgressRef.current = false;
        setSyncProgress({ current: 0, total: 0, isLoading: false });
      } finally {
        isSyncingRef.current = false;
      }
    };
    onEvent('trigger:initialFullSync', handler);
    return () => offEvent('trigger:initialFullSync', handler);
  }, [isConnected, user?.id]);
  
  // Akıllı offline cache sistemi (WiFi'da otomatik favorileri cache'ler)
  // Sadece bir kez başlatılır (izin verildiğinde)
  useEffect(() => {
    // Zaten başlatıldıysa bir daha başlatma
    if (hasStartedOperationsRef.current) return;
    
    // Konum izni durumu belirsizken başlatma
    if (hasLocationPermission !== true) {
      if (__DEV__) console.log('[SmartCache] Konum izni yok/belirsiz, cache başlatılmıyor');
      return;
    }
    
    // İlk kez izin verildi, işlemleri başlat
    hasStartedOperationsRef.current = true;
    
    let unsubscribe: (() => void) | null = null;
    
    // Permission onaylandıktan sonra kademeli başlat (modal conflict önleme)
    const timer = setTimeout(() => {
      console.log('[SmartCache] Otomatik cache sistemi başlatılıyor...');
      
      // Smart cache'i başlat (WiFi'da favori yerler otomatik cache'lenir)
      unsubscribe = initSmartCache({
        maxRegions: 5,
        radiusPerRegion: 10,
        onlyWiFi: true,
        silent: true,
      });
    }, 1000); // Modal kapandıktan 1 saniye sonra başlat
    
    return () => {
      clearTimeout(timer);
      if (unsubscribe) {
        unsubscribe();
        console.log('[SmartCache] Otomatik cache sistemi durduruldu');
      }
    };
  }, [hasLocationPermission]); // Permission true olduğunda tetiklenir, sonra ref sayesinde tekrar çalışmaz
  
  // ...existing code...

  // Arkadaş sayısını logla
  useEffect(() => {
    if (user && Array.isArray(user.friends)) {
    }
  }, [user?.friends]);

  useEffect(() => {
    // Kullanıcı ve community_members rolünü ve arkadaş listesini çek
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setUser(null);
          setCommunityMember(null);
          return;
        }
        const userData = await getMe(); // users tablosu (isPremium, offline_enabled, offline_radius_km içerir)
        
        // Offline ayarlarını logla
        if (__DEV__) {
          console.log('[User] ✅ Offline ayarları:', {
            isPremium: userData?.isPremium,
            offline_enabled: userData?.offline_enabled,
            offline_radius_km: userData?.offline_radius_km
          });
        }
        
        // Arkadaş listesini ayrıca çek
        let friends = [];
        try {
          const res = await fetch(`${API_URL}/friendships/list`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (Array.isArray(data)) friends = data;
        } catch (e) {
          friends = [];
        }
        // Abonelik durumunu backend'den kontrol et — önce refresh (Google Play canlı sorgu), sonra status oku
        // isPremium tek doğru kaynak (subscription_is_active AND expiresAt > now); offline_enabled fall-back
        let resolvedOfflineEnabled = userData?.isPremium ?? userData?.offline_enabled;
        let resolvedOfflineRadiusKm = userData?.offline_radius_km;
        try {
          // Refresh: backend'in Google Play API'yi sorgulamasını ve DB'yi güncellemesini sağla
          await refreshSubscriptionStatus();
        } catch (_) {}
        try {
          const subStatus = await checkSubscriptionStatus();
          console.log('[User] getMe offline_enabled:', userData?.offline_enabled, '| /status yanıtı:', JSON.stringify(subStatus));
          if (subStatus !== null) {
            // /subscriptions/status endpoint'i kesin cevap verdiyse onu kullan
            const prevOffline = resolvedOfflineEnabled;
            resolvedOfflineEnabled = subStatus.offlineEnabled ?? subStatus.isActive ?? resolvedOfflineEnabled;
            resolvedOfflineRadiusKm = subStatus.offlineRadiusKm ?? resolvedOfflineRadiusKm;
            if (prevOffline !== resolvedOfflineEnabled) {
              console.warn(`[User] offline_enabled düzeltildi: ${prevOffline} → ${resolvedOfflineEnabled} (isActive=${subStatus.isActive}, offlineEnabled=${subStatus.offlineEnabled})`);
            }
            eventBus.emit('subscription:statusUpdated', subStatus);
          } else {
            // null döndü: endpoint erişilemedi veya abonelik kaydı yok — getMe değerini koru
            console.warn('[User] /subscriptions/status null döndü — getMe değeri korunuyor (offline_enabled=' + resolvedOfflineEnabled + ')');
          }
        } catch (subErr) {
          console.warn('[User] checkSubscriptionStatus hatası (yoksayıldı):', subErr);
        }

        const mergedUser = {
          ...userData,
          friends,
          offline_enabled: resolvedOfflineEnabled,
          offline_radius_km: resolvedOfflineRadiusKm,
        };
        setUser(mergedUser);
        
        // Kullanıcı bilgilerini cache'le (offline kullanım için)
        if (userData) {
          try {
            await SecureStore.setItemAsync('cachedUserData', JSON.stringify({
              community_id: userData.community_id,
              role: userData.role,
              offline_enabled: resolvedOfflineEnabled,
              offline_radius_km: resolvedOfflineRadiusKm,
              id: userData.id
            }));
            console.log('[User] Kullanıcı bilgileri cache\'lendi (offline için)');
          } catch (cacheErr) {
            console.warn('[User] Cache yazma hatası:', cacheErr);
          }
        }
        
        if (userData?.id) {
          console.log('[DEBUG] Aktif kullanıcı ID (owner_id):', userData.id);
        }
        if (userData && userData.community_id && userData.id) {
          // Sadece aktif üyelik varsa communityMember'ı set et
          const members = await listCommunityMembers(userData.community_id);
          const myMembership = Array.isArray(members) ? members.find((m: any) => m.user_id === userData.id) : null;
          const status = myMembership?.status || myMembership?.member_status;
          if (myMembership && status === 'active') {
            setCommunityMember(myMembership);
          } else {
            setCommunityMember(null);
          }
        } else {
          setCommunityMember(null);
        }
      } catch (e) {
        console.warn('[User] getMe() hatası, offline modda cache\'den okuyalım:', e?.message);
        
        // Offline modda cache'den oku
        try {
          const cachedData = await SecureStore.getItemAsync('cachedUserData');
          if (cachedData) {
            const userData = JSON.parse(cachedData);
            setUser(userData);
            console.log('[User] Cache\'den kullanıcı bilgileri alındı (offline):', userData);
          } else {
            setUser(null);
          }
        } catch (cacheErr) {
          console.warn('[User] Cache okuma hatası:', cacheErr);
          setUser(null);
        }
        
        setCommunityMember(null);
      }
    })();
  }, []);

  // Arkadaşlık isteği ve checklist paylaşım bildirimlerini çek
  useEffect(() => {
    (async () => {
      try {
        // Arkadaşlık istekleri
        const token = await getToken();
        let friendNotifs: any[] = [];
        if (token) {
          const res = await fetch(`${API_URL}/friendships/requests`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          const shownIdsStr = await getLargeItemAsync('shownFriendRequestIds');
          const shownIds = shownIdsStr ? JSON.parse(shownIdsStr) : [];
          const newRequests = Array.isArray(data)
            ? data.filter((req: any) => !shownIds.includes(req.id))
            : [];
          if (Array.isArray(newRequests) && newRequests.length > 0) {
            friendNotifs = newRequests.map((req: any) => ({
              id: req.id,
              type: 'friend_request',
              message: `${req.username || 'Bir kullanıcı'} size arkadaşlık isteği gönderdi!`,
              goto: () => router.push('/profile'),
            }));
            await setLargeItemAsync('shownFriendRequestIds', JSON.stringify([...shownIds, ...newRequests.map(r => r.id)]));
          }
        }

        // Checklist paylaşım bildirimleri
        let checklistNotifs: any[] = [];
        if (token && user?.id) {
          try {
            const sharedUrl = `${API_URL}/checklst_shares/shared?shared_with_user_id=${user.id}`;
            const res = await fetch(sharedUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            // Her paylaşım kaydının id'sini kontrol et
            const shownSharedStr = await getLargeItemAsync('shownSharedChecklistIds');
            const shownSharedIds = shownSharedStr ? JSON.parse(shownSharedStr) : [];
            // Sadece yeni (gösterilmemiş) paylaşımlar
            const newShares = Array.isArray(data)
              ? data.filter((share: any) => !shownSharedIds.includes(share.id))
              : [];
            if (Array.isArray(newShares) && newShares.length > 0) {
              checklistNotifs = [
                {
                  id: newShares[0].id,
                  type: 'checklist_share',
                  message: `Seninle paylaşılan ${newShares.length} yeni checklist var!`,
                  goto: () => router.push('/checklist'),
                },
              ];
              // Gösterilenleri kaydet
              await setLargeItemAsync('shownSharedChecklistIds', JSON.stringify([...shownSharedIds, ...newShares.map(s => s.id)]));
            }
          } catch (e) {
            console.warn('[Checklist Notification] Hata:', e);
          }
        }


        // Kamp alanı paylaşım bildirimleri
        let campingAreaNotifs: any[] = [];
        if (token && user?.id) {
          try {
            // Tüm kamp alanlarını çek
            const allAreas = await getDatabase().getAllCampingAreas();
            // Kullanıcıya paylaşılan (arkadaş veya topluluk ile) kamp alanlarını filtrele
            const sharedWithMe = allAreas.filter((area: any) => {
              // Kendi alanlarını hariç tut
              if (String(area.owner_id) === String(user.id)) return false;
              
              // Arkadaş paylaşımları kontrolü
              let friendList: string[] = [];
              if (area.friend_user_ids) {
                friendList = Array.isArray(area.friend_user_ids) 
                  ? area.friend_user_ids 
                  : (typeof area.friend_user_ids === 'string' ? JSON.parse(area.friend_user_ids) : []);
              }
              const isSharedWithFriend = friendList.some((id: any) => String(id) === String(user.id));
              
              // Topluluk paylaşımı kontrolü
              const isSharedWithCommunity = area.community_id && String(area.community_id) === String(user.community_id);
              
              return isSharedWithFriend || isSharedWithCommunity;
            });

            // Daha önce gösterilenleri kontrol et
            const shownCampingAreasStr = await getLargeItemAsync('shownSharedCampingAreaIds');
            const shownCampingAreaIds = shownCampingAreasStr ? JSON.parse(shownCampingAreasStr) : [];
            
            // Son 7 gün içinde oluşturulan/güncellenen ve daha önce gösterilmeyen alanlar
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const newSharedAreas = sharedWithMe.filter((area: any) => {
              const isNew = !shownCampingAreaIds.includes(area.id);
              const createdAt = new Date(area.created_at || area.updated_at);
              const isRecent = createdAt >= sevenDaysAgo;
              return isNew && isRecent;
            });

            if (newSharedAreas.length > 0) {
              const firstArea = newSharedAreas[0];
              campingAreaNotifs = [
                {
                  id: firstArea.id,
                  type: 'camping_area_share',
                  message: `${newSharedAreas.length} yeni kamp alanı seninle paylaşıldı!`,
                  areaData: firstArea,
                  goto: () => {
                    // Eğer birden fazla paylaşılan alan varsa, liste görünümünde sadece bu alanları göster
                    if (newSharedAreas.length > 1) {
                      if (isMounted.current) {
                        setNotificationCampingAreas(newSharedAreas);
                        changeViewMode('list');
                      }
                      return;
                    }
                    // Tek alan varsa mevcut davranışı koru: haritaya geç ve marker'a odaklan
                    if (isMounted.current) changeViewMode('map');
                    const lat = (firstArea as any).latitude;
                    const lng = (firstArea as any).longitude;
                    if (lat && lng) {
                      const timeoutId1 = setTimeout(() => {
                        if (!isMounted.current) return;
                        setMapCenter({ latitude: lat, longitude: lng });
                        setMapMoveQuery({ latitude: lat, longitude: lng });
                        const timeoutId2 = setTimeout(() => {
                          if (!isMounted.current) return;
                          safeInjectJavaScript(`
                            if (window.openMarkerPopup) {
                              window.openMarkerPopup(${lat}, ${lng});
                            }
                            true;
                          `, 'MarkerPopup');
                        }, 800);
                        timeoutRefs.current.push(timeoutId2);
                      }, 100);
                      timeoutRefs.current.push(timeoutId1);
                    }
                  },
                },
              ];
              // Gösterilenleri kaydet
              await setLargeItemAsync('shownSharedCampingAreaIds', JSON.stringify([...shownCampingAreaIds, ...newSharedAreas.map((a: any) => a.id)]));
            }
          } catch (e) {
            console.warn('[Camping Area Notification] Hata:', e);
          }
        }

        // Bildirimleri öncelik sırasıyla kuyruğa ekle (kamp alanı > checklist > arkadaşlık)
        // Full sync devam ediyorsa beklet, bitince göster
        const enqueueOrPend = (notifs: any[], type: string) => {
          if (!Array.isArray(notifs) || notifs.length === 0) return;
          if (isFullSyncInProgressRef.current) {
            pendingNotificationsAfterSyncRef.current.push({ notifications: notifs, type });
            if (__DEV__) console.log(`[NOTIFICATION QUEUE] Full sync devam ediyor, ${type} bildirimi bekletildi (${notifs.length} adet)`);
          } else {
            addToNotificationQueue(notifs, type);
          }
        };
        if (Array.isArray(campingAreaNotifs) && campingAreaNotifs.length > 0) {
          enqueueOrPend(campingAreaNotifs, 'camping_area_share');
        }
        if (Array.isArray(checklistNotifs) && checklistNotifs.length > 0) {
          enqueueOrPend(checklistNotifs, 'checklist_share');
        }
        if (Array.isArray(friendNotifs) && friendNotifs.length > 0) {
          enqueueOrPend(friendNotifs, 'friend_request');
        }
      } catch (e) {}
    })();
  }, [user]);

  // Yetki kontrolü
  const isSuperAdmin = user?.role === 'superadmin';
  const isCommunityLeader = communityMember?.role === 'leader';
  const canAddOrDelete = isSuperAdmin || isCommunityLeader;

  const [selectedCampingArea, setSelectedCampingArea] = useState<CampingArea | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLocationPickerMode, setIsLocationPickerMode] = useState(false);
  const [selectForPlanMode, setSelectForPlanMode] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  // Artık filtreler merkezi kategori yönetiminden geliyor
  const [selectedTags, setSelectedTags] = useState(campingTypes.map(t => t.id));

  // Refs to store previous filter/map state when entering camp-plan select mode
  const prevSelectedTagsRef = useRef<any[] | null>(null);
  const prevMapMoveQueryRef = useRef<any | null>(null);

  // Yeni filtreler - useMemo ile user state'ine bağlı olarak dinamik oluşturulur
  const FILTERS = useMemo(() => [
    { key: 'own', label: 'Kendi Kamp Alanlarım', visible: !!user?.id, disabled: false },
    { key: 'community', label: 'Topluluk Paylaşımları', visible: !!user?.community_id, disabled: !user?.community_id },
    { key: 'friend', label: 'Arkadaş Paylaşımları', visible: true, disabled: !(Array.isArray(user?.friends) && user.friends.length > 0) },
    { key: 'user', label: 'Kullanıcı Paylaşımları', visible: true, disabled: false },
    { key: 'system', label: 'KampDefterim Paylaşımları', visible: true, disabled: false },
  ], [user?.id, user?.community_id, user?.friends]);

  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  // FILTERS güncellendiğinde selectedFilters'ı yeniden initialize et
  useEffect(() => {
    setSelectedFilters(FILTERS.map(f => f.key));
  }, [FILTERS]);

  // Türkiye geneli filtre state'leri
  const [turkeyWideKeys, setTurkeyWideKeys] = useState<string[]>([]);
  const [turkeyWideAreas, setTurkeyWideAreas] = useState<CampingArea[]>([]);

  // Premium kullanıcı için own ve friend Tüm TR filtrelerini otomatik aktifleştir
  useEffect(() => {
    const isPrem = !!(user?.isPremium || user?.offline_enabled);
    if (!isPrem) {
      setTurkeyWideKeys(prev => prev.filter(k => k !== 'own' && k !== 'friend' && k !== 'community'));
    }
  }, [user?.isPremium, user?.offline_enabled]);

  // Türkiye geneli alanları DB'den çek (radius kısıtı olmadan)
  useEffect(() => {
    if (turkeyWideKeys.length === 0) {
      setTurkeyWideAreas([]);
      return;
    }
    (async () => {
      try {
        const allAreas = await getDatabase().getAllCampingAreas();
        const filtered = allAreas.filter(area => {
          if (turkeyWideKeys.includes('own') && user?.id && String(area.owner_id) === String(user.id)) return true;
          if (turkeyWideKeys.includes('community') && area.community_id && user?.community_id && String(area.community_id) === String(user.community_id)) return true;
          if (turkeyWideKeys.includes('friend') && Array.isArray(user?.friends) && user.friends.length > 0) {
            let friendList: any[] = [];
            try {
              friendList = Array.isArray(area.friend_user_ids)
                ? area.friend_user_ids
                : typeof area.friend_user_ids === 'string'
                  ? JSON.parse(area.friend_user_ids)
                  : [];
            } catch { friendList = []; }
            const userFriendIds = user.friends.map((f: any) => String(f.id));
            if (friendList.some((id: any) => userFriendIds.includes(String(id)))) return true;
          }
          return false;
        });
        setTurkeyWideAreas(filtered);
      } catch (e) {
        setTurkeyWideAreas([]);
      }
    })();
  }, [turkeyWideKeys, user?.id, user?.community_id, user?.friends]);

  // Offline modda Türkiye geneli filtreyi sıfırla
  useEffect(() => {
    if (!isConnected) {
      setTurkeyWideKeys([]);
      setTurkeyWideAreas([]);
    }
  }, [isConnected]);

  // Tüm TR aktifken 'user' ve 'system' filtrelerini devre dışı bırak / geri aç
  useEffect(() => {
    if (turkeyWideKeys.length > 0) {
      setSelectedFilters(prev => prev.filter(k => k !== 'user' && k !== 'system'));
    } else {
      // Tüm TR kapatılınca user ve system'ı geri ekle
      setSelectedFilters(prev => {
        const next = [...prev];
        if (!next.includes('user')) next.push('user');
        if (!next.includes('system')) next.push('system');
        return next;
      });
    }
  }, [turkeyWideKeys.length]);

  const [favorites, setFavorites] = useState<Set<string | number>>(new Set());
  // Harita merkezini ve buton state'ini tut
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMapMoveButton, setShowMapMoveButton] = useState(false);
  const [mapMoveQuery, setMapMoveQuery] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMapPopup, setShowMapPopup] = useState(false);

  // Sadece kullanıcıya ait private ve tüm public alanları kapsayacak şekilde sorgu

  // Varsayılan olarak konumdan başlat, harita hareket ettirilirse mapMoveQuery ile güncelle
  const { campingAreas, loading, error, location, refreshData, getCurrentLocation } = useCampingAreas({
    tags: selectedTags,
    radius: mapMoveQuery ? 20 : 30, // default 10 : 20
    latitude: mapMoveQuery ? mapMoveQuery.latitude : undefined,
    longitude: mapMoveQuery ? mapMoveQuery.longitude : undefined,
    currentUserId: user?.id ?? undefined,
    isSuperAdmin,
    hasLocationPermission, // Konum izni durumu (modal conflict önleme)
  });

  // refreshData'yı ref'te sakla (stale closure önleme)
  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

  // Harita senkronizasyonundan sonra da yeni duyuru bildirimi tetiklensin
  // Konum veya harita merkezi değiştiğinde de duyuruları güncelle
  useEffect(() => {
    // Konum izni durumu belirsiz/yok iken announcement fetch'i başlatma
    if (hasLocationPermission !== true) {
      if (__DEV__) console.log('[ANNOUNCEMENT] Konum izni yok/belirsiz, fetch başlatılmıyor');
      return;
    }
    // isConnected veya harita sync sonrası tetiklenebilir (full sync sırasında bildirim gösterme)
    // Konum değiştiğinde duyuruları da güncelle
    fetchAnnouncementsSilently(router, isFullSyncInProgressRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, mapMoveQuery?.latitude, mapMoveQuery?.longitude, location?.coords.latitude, location?.coords.longitude]);
  // hasLocationPermission dependency'de yok çünkü sadece guard olarak kullanılıyor

  // İlk açılışta veya konum değiştiğinde cache'i güncelle
  useEffect(() => {
    if (location?.coords && hasLocationPermission) {
      const nextLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: Date.now(),
      };
      lastKnownLocationRef.current = nextLocation;
      setLastKnownLocationAsync(nextLocation.latitude, nextLocation.longitude).catch((err) => {
        if (__DEV__) console.warn('[LOCATION] lastKnownLocation kaydedilemedi:', err);
      });
      if (__DEV__) console.log('[Location] Konum cache\'lendi:', location.coords.latitude, location.coords.longitude);
    }
  }, [location?.coords.latitude, location?.coords.longitude, hasLocationPermission]);

  // AppState listener: Uygulama arka plandan ön plana geldiğinde veri yenile
  useEffect(() => {
    let lastActiveTime = 0;
    const MIN_INTERVAL = 2000; // En az 2 saniye arayla tetiklenmesine izin ver
    
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isMounted.current) {
        const now = Date.now();
        
        // Çok sık tetiklenmeyi önle (debounce)
        if (now - lastActiveTime < MIN_INTERVAL) {
          if (__DEV__) console.log('[DEBUG] AppState tetikleme çok sık, atlanıyor');
          return;
        }
        
        lastActiveTime = now;
        if (__DEV__) console.log('[DEBUG] Uygulama ön plana geldi, veriler yenileniyor...');
        
        // Önceki timeout'u temizle
        if (appStateTimeoutRef.current) {
          clearTimeout(appStateTimeoutRef.current);
        }
        
        // WebView'in mount olmasını bekle, sonra refresh yap
        appStateTimeoutRef.current = setTimeout(async () => {
          if (!isMounted.current) return;
          
          // Konum kontrolü yap - değişmişse (1km'den fazla) veriyi yenile
          try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
              // Yeni konum al ve cache'le
              const newLocation = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              
              if (newLocation && newLocation.coords) {
                // Cache'i güncelle (lokasyon butonu için)
                lastKnownLocationRef.current = {
                  latitude: newLocation.coords.latitude,
                  longitude: newLocation.coords.longitude,
                  timestamp: Date.now(),
                };
                console.log('[AppState] Konum cache\'lendi:', newLocation.coords.latitude, newLocation.coords.longitude);
                
                // Mevcut konum ile karşılaştır
                if (location?.coords) {
                  const dist = getDistanceMeters(
                    location.coords.latitude,
                    location.coords.longitude,
                    newLocation.coords.latitude,
                    newLocation.coords.longitude
                  );
                  
                  if (dist > 1000) {
                    if (__DEV__) console.log('[AppState] Konum değişti:', dist.toFixed(0), 'metre, veri yenileniyor');
                    // getCurrentLocation hook'unu çağır
                    await getCurrentLocation();
                  } else if (__DEV__) {
                    console.log('[AppState] Konum değişmedi:', dist.toFixed(0), 'metre');
                  }
                }
              }
            }
          } catch (err) {
            if (__DEV__) console.warn('[AppState] Konum kontrol hatası:', err);
          }
          
          // Veri yenileme fonksiyonlarını tetikle (ref'ten al - stale closure önleme)
          if (refreshDataRef.current && typeof refreshDataRef.current === 'function') {
            try {
              refreshDataRef.current();
            } catch (err) {
              if (__DEV__) console.warn('[AppState] refreshData error:', err);
            }
          }
          
          // Abonelik durumunu yenile — Google Play canlı sorgusu + DB güncelleme + state senkronizasyonu
          if (isConnected) {
            try {
              await refreshSubscriptionStatus();
              const subStatus = await checkSubscriptionStatus();
              console.log('[AppState] Abonelik refresh sonucu:', JSON.stringify(subStatus));
              if (subStatus !== null) {
                const newOffline = subStatus.offlineEnabled ?? subStatus.isActive ?? false;
                setUser((prev: any) => {
                  if (!prev) return prev;
                  if (prev.offline_enabled === newOffline) return prev; // değişmediyse render tetikleme
                  console.warn(`[AppState] offline_enabled güncellendi: ${prev.offline_enabled} → ${newOffline}`);
                  const updated = { ...prev, offline_enabled: newOffline, offline_radius_km: subStatus.offlineRadiusKm ?? prev.offline_radius_km };
                  // Cache'i de senkronize et
                  SecureStore.setItemAsync('cachedUserData', JSON.stringify({
                    community_id: prev.community_id,
                    role: prev.role,
                    offline_enabled: newOffline,
                    offline_radius_km: subStatus.offlineRadiusKm ?? prev.offline_radius_km,
                    id: prev.id,
                  })).catch(() => {});
                  return updated;
                });
                eventBus.emit('subscription:statusUpdated', subStatus);
              }
            } catch (subErr) {
              if (__DEV__) console.warn('[AppState] Abonelik refresh hatası (yoksayıldı):', subErr);
            }
          }

          // Duyurular için delta sync yap (online ise)
          if (isConnected) {
            try {
              if (__DEV__) console.log('[AppState] Duyurular için delta sync başlatılıyor...');
              const db = getDatabase();
              await db.fetchAndStoreAnnouncementsFromAPI();
              if (__DEV__) console.log('[AppState] Duyurular delta sync tamamlandı');
              
              // announcements.tsx'i güncelleme event'i gönder
              eventBus.emit('announcements:updated');
              
              // Yeni duyuruları kontrol et ve bildirim göster
              fetchAnnouncementsSilently(routerRef.current, isFullSyncInProgressRef.current);
            } catch (err) {
              if (__DEV__) console.warn('[AppState] Duyuru delta sync hatası:', err);
            }

            // Kamp alanları için delta sync yap
            try {
              if (__DEV__) console.log('[AppState] Kamp alanları için delta sync başlatılıyor...');
              const dbInst = getDatabase();
              const count = await dbInst.fetchAndStoreCampingAreasFromAPI(undefined, { forceFull: false, userId: user?.id !== undefined ? String(user.id) : undefined });
              if (__DEV__) console.log('[AppState] Kamp alanları delta sync tamamlandı, güncellenen:', count);
              if (user?.id) { try { await dbInst.cleanupRevokedFriendAreas(String(user.id)); } catch {} }
              if (count && count > 0 && refreshDataRef.current && isMounted.current) {
                refreshDataRef.current();
              }
            } catch (err) {
              if (__DEV__) console.warn('[AppState] Kamp alanı delta sync hatası:', err);
            }
          } else {
            // Offline ise sadece local kontrol
            try {
              fetchAnnouncementsSilently(routerRef.current, isFullSyncInProgressRef.current);
            } catch (err) {
              if (__DEV__) console.warn('[AppState] fetchAnnouncements error:', err);
            }
          }
        }, 300); // 300ms gecikme ile WebView'in mount olmasını bekle
      }
    });

    return () => {
      subscription.remove();
      if (appStateTimeoutRef.current) {
        clearTimeout(appStateTimeoutRef.current);
      }
    };
  }, []); // Dependency array boş - router yerine ref kullan

  // İlk açılış duyuru bildirimi event'ini dinle (announcements ekranından gelir)
  useEffect(() => {
    const handler = (payload: any) => {
      if (__DEV__) console.log('[ANNOUNCEMENT][FIRST_LOAD] İlk açılış bildirimi alındı:', payload);
      try {
        const { count } = payload;
        if (count > 0) {
          addToNotificationQueue([{
            id: Date.now(), // Geçici ID
            type: 'announcement',
            message: `${count} yeni duyurunuz var!`,
            goto: () => router.push('/announcements'),
          }], 'announcement');
        }
      } catch (e) {
        if (__DEV__) console.warn('[ANNOUNCEMENT][FIRST_LOAD] Event işleme hatası:', e);
      }
    };
    onEvent('announcements:firstLoad', handler);
    return () => {
      offEvent('announcements:firstLoad', handler);
    };
  }, []);

  // Arka plandan/periodik sync sonrası yeni duyuru event'lerini dinle
  useEffect(() => {
    const handler = (payload: any) => {
      if (__DEV__) console.log('[ANNOUNCEMENT][EVENT] Yeni duyuru event alındı:', payload);
      try {
        fetchAnnouncementsSilently(routerRef.current, false);
      } catch (e) {
        if (__DEV__) console.warn('[ANNOUNCEMENT][EVENT] fetchAnnouncementsSilently hata:', e);
      }
    };
    onEvent('announcements:new', handler);
    return () => {
      offEvent('announcements:new', handler);
    };
  }, []);

  // Delta sync sonrası kamp alanı güncellemelerini dinle
  useEffect(() => {
    const handler = (payload: any) => {
      if (__DEV__) console.log('[CAMPING_AREAS][EVENT] Kamp alanları güncellendi, yenileniyor:', payload);
      try {
        if (refreshDataRef.current && isMounted.current && typeof refreshDataRef.current === 'function') {
          refreshDataRef.current();
        }
      } catch (e) {
        if (__DEV__) console.warn('[CAMPING_AREAS][EVENT] refreshData hata:', e);
      }
    };
    onEvent('campingAreas:updated', handler);
    return () => {
      offEvent('campingAreas:updated', handler);
    };
  }, []);

  // Versiyon güncellendiğinde full sync tetikle
  useEffect(() => {
    const handler = async () => {
      if (__DEV__) console.log('[VERSION_UPDATED] Event alındı, full sync başlatılıyor...');
      
      // Sync flag'lerini sıfırla
      hasInitialSyncRef.current = false;
      
      // Offline kontrolü
      if (!isConnected) {
        if (__DEV__) console.log('[VERSION_UPDATED] Offline, sync atlanıyor');
        return;
      }
      
      // Konum izni yoksa sync yapma
      if (hasLocationPermission !== true) {
        if (__DEV__) console.log('[VERSION_UPDATED] Konum izni yok, sync atlanıyor');
        return;
      }
      
      // Zaten sync devam ediyorsa bekle
      if (isSyncingRef.current) {
        if (__DEV__) console.log('[VERSION_UPDATED] Zaten sync devam ediyor, atlanıyor');
        return;
      }
      
      isSyncingRef.current = true;
      hasInitialSyncRef.current = true;
      
      try {
        const token = await getToken();
        if (!token) {
          if (__DEV__) console.log('[VERSION_UPDATED] Token yok, sync atlanıyor');
          isSyncingRef.current = false;
          return;
        }
        
        // Full sync başlat
        if (__DEV__) console.log('[VERSION_UPDATED] Full sync başlıyor...');
        isFullSyncInProgressRef.current = true;
        await SecureStore.setItemAsync('isInitialSyncComplete', 'false');
        setSyncProgress({ current: 0, total: 0, isLoading: true });
        
        const dbInst = getDatabase();
        const count = await dbInst.fetchAndStoreCampingAreasFromAPI(undefined, { 
          forceFull: true,
          userId: user?.id !== undefined ? String(user.id) : undefined,
          onProgress: (current, total) => {
            if (__DEV__) console.log('[VERSION_UPDATED][PROGRESS]:', current, '/', total);
            setSyncProgress({ current, total, isLoading: true });
          }
        });
        if (user?.id) { try { await dbInst.cleanupRevokedFriendAreas(String(user.id)); } catch {} }
        
        if (__DEV__) console.log('[VERSION_UPDATED] Full sync tamamlandı:', count, 'kayıt');
        await SecureStore.setItemAsync('hasInitialSync', 'true');
        await SecureStore.setItemAsync('isInitialSyncComplete', 'true');
        isFullSyncInProgressRef.current = false;
        setSyncProgress({ current: 0, total: 0, isLoading: false });
        // Full sync sırasında biriken bildirimleri göster
        flushPendingNotifications();
        
        await refreshData();
        fetchAnnouncementsSilently(router, false);
      } catch (err) {
        console.error('[VERSION_UPDATED] Sync hatası:', err);
        isFullSyncInProgressRef.current = false;
        setSyncProgress({ current: 0, total: 0, isLoading: false });
      } finally {
        isSyncingRef.current = false;
      }
    };
    
    onEvent('version_updated', handler);
    return () => {
      offEvent('version_updated', handler);
    };
  }, [hasLocationPermission]);

  // Premium abonelik satın alındığında full sync tetikle
  useEffect(() => {
    const handler = async () => {
      if (__DEV__) console.log('[PREMIUM] premium:subscribed alındı, kullanıcı bilgileri ve full sync güncelleniyor...');

      // 1. Kullanıcı profilini sunucudan taze çek (rol, offline_enabled vb. güncellenmiş olacak)
      try {
        const freshUser = await getMe();
        if (freshUser) {
          // Friends listesini koru
          setUser((prev: any) => ({ ...(prev ?? {}), ...freshUser }));
          // Cache'i güncelle
          await SecureStore.setItemAsync('cachedUserData', JSON.stringify({
            community_id: freshUser.community_id,
            role: freshUser.role,
            offline_enabled: freshUser.isPremium ?? freshUser.offline_enabled,
            offline_radius_km: freshUser.offline_radius_km,
            id: freshUser.id,
          }));
          if (__DEV__) console.log('[PREMIUM] Kullanıcı profili güncellendi — role:', freshUser.role, 'isPremium:', freshUser.isPremium, 'offline_enabled:', freshUser.offline_enabled);
        }
      } catch (e) {
        console.warn('[PREMIUM] getMe() hatası:', e);
      }

      if (!isConnected || hasLocationPermission !== true || isSyncingRef.current) return;

      isSyncingRef.current = true;
      hasInitialSyncRef.current = true;

      try {
        const token = await getToken();
        if (!token) { isSyncingRef.current = false; return; }

        isFullSyncInProgressRef.current = true;
        await SecureStore.setItemAsync('isInitialSyncComplete', 'false');
        setSyncProgress({ current: 0, total: 0, isLoading: true });

        const dbInst = getDatabase();
        const count = await dbInst.fetchAndStoreCampingAreasFromAPI(undefined, {
          forceFull: true,
          userId: user?.id !== undefined ? String(user.id) : undefined,
          onProgress: (current, total) => {
            setSyncProgress({ current, total, isLoading: true });
          },
        });
        if (user?.id) { try { await dbInst.cleanupRevokedFriendAreas(String(user.id)); } catch {} }

        await SecureStore.setItemAsync('hasInitialSync', 'true');
        await SecureStore.setItemAsync('isInitialSyncComplete', 'true');
        isFullSyncInProgressRef.current = false;
        setSyncProgress({ current: 0, total: 0, isLoading: false });
        flushPendingNotifications();
        await refreshData();
        fetchAnnouncementsSilently(router, false);

        if (__DEV__) console.log('[PREMIUM] Full sync tamamlandı:', count, 'kayıt');
      } catch (err) {
        console.error('[PREMIUM] Sync hatası:', err);
        isFullSyncInProgressRef.current = false;
        setSyncProgress({ current: 0, total: 0, isLoading: false });
      } finally {
        isSyncingRef.current = false;
      }
    };

    onEvent('premium:subscribed', handler);
    return () => {
      offEvent('premium:subscribed', handler);
    };
  }, [hasLocationPermission, isConnected]);

  // Konum izni durumunu kontrol et
  // Konum izni durumu sadece requestLocationPermission ile güncellenir

  // Ekran focus'a geldiğinde konum izni ve mesafe kontrolü yap
  useFocusEffect(
    React.useCallback(() => {
      // Sadece focus olduğunda mesafe kontrolü yapılacak, izin durumu değişmeyecek
      if (hasLocationPermission && hasInitialSyncRef.current) {
        let currentLat: number | undefined;
        let currentLng: number | undefined;
        if (mapMoveQuery) {
          currentLat = mapMoveQuery.latitude;
          currentLng = mapMoveQuery.longitude;
        } else if (location?.coords) {
          currentLat = location.coords.latitude;
          currentLng = location.coords.longitude;
        }
        if (currentLat !== undefined && currentLng !== undefined) {
          // Son sorgulanan konum varsa mesafe kontrolü yap
          if (lastQueriedLocationRef.current) {
            const dist = getDistanceMeters(
              lastQueriedLocationRef.current.latitude,
              lastQueriedLocationRef.current.longitude,
              currentLat,
              currentLng
            );
            // 100 metreden az değiştiyse sorgu yapma
            if (dist < 100) {
              if (__DEV__) console.log('[DEBUG] Focus - Konum anlamlı değişmedi, sorgu yapılmayacak:', dist.toFixed(2), 'metre');
              return;
            }
            if (__DEV__) console.log('[DEBUG] Focus - Konum değişti, yeni sorgu yapılacak:', dist.toFixed(2), 'metre');
          }
          // Konumu güncelle ve veriyi yenile
          lastQueriedLocationRef.current = { latitude: currentLat, longitude: currentLng };
          refreshData();
        }
      }
    }, [location, mapMoveQuery, hasLocationPermission])
  );

  // Guest kullanıcılar sadece kendi oluşturduğu kamp alanlarını görebilsin
  const isGuest = user?.role === 'guest';
  
  // Guest kullanıcının oluşturduğu kamp alanı sayısını hesapla
  const userCreatedAreasCount = useMemo(() => {
    if (!user?.id) return 0;
    return campingAreas.filter(area => String(area.owner_id) === String(user.id)).length;
  }, [campingAreas, user?.id]);
  
  const GUEST_LIMIT = 10;
  const remainingAreas = isGuest ? Math.max(0, GUEST_LIMIT - userCreatedAreasCount) : Infinity;
  const canAddMoreAreas = isGuest ? userCreatedAreasCount < GUEST_LIMIT : true;
  
  // filteredCampingAreas'ı memoize et - gereksiz re-render'ları önle
  const filteredCampingAreas = useMemo(() => {
    let filtered = filterCampingAreasByUser(campingAreas, user, isGuest);
    filtered = filtered.filter(area => {
      // Kendi kamp alanlarım
      if (!selectedFilters.includes('own') && String(area.owner_id) === String(user?.id)) return false;
      // Topluluk paylaşımları
      if (!selectedFilters.includes('community') && area.community_id && String(area.community_id) === String(user?.community_id)) return false;
      // Arkadaş paylaşımları
      if (!selectedFilters.includes('friend') && area.friend_user_ids && Array.isArray(user?.friends) && user.friends.length > 0) {
        const friendList = Array.isArray(area.friend_user_ids) ? area.friend_user_ids : (typeof area.friend_user_ids === 'string' ? JSON.parse(area.friend_user_ids) : []);
        const userFriendIds = user.friends.map((f: any) => String(f.id));
        if (friendList.some((id: any) => userFriendIds.includes(String(id)))) return false;
      }
      // Kullanıcı paylaşımları (public, owner_id DOLU olmalı)
      if (!selectedFilters.includes('user') && area.visibility === 'public' && area.owner_id) return false;
      // KampDefterim Paylaşımları (owner_id BOŞ olanlar)
      if (!selectedFilters.includes('system') && (!area.owner_id || area.owner_id === '')) return false;
      return true;
    });

    // Türkiye geneli alanları ekle (radius dışındaki alanlar, duplicate kontrolü ile)
    if (turkeyWideAreas.length > 0) {
      const existingIds = new Set(filtered.map((a: any) => String(a.id)));
      const accessFiltered = filterCampingAreasByUser(turkeyWideAreas, user, isGuest);
      for (const area of accessFiltered) {
        if (existingIds.has(String((area as any).id))) continue;

        // Kamp türü filtresini uygula (selectedTags)
        const rawTags = (area as any).tags;
        const areaType: string =
          (typeof rawTags === 'object' && rawTags !== null && rawTags.type)
            ? rawTags.type
            : (typeof rawTags === 'string' && (rawTags as string).trim() !== '')
              ? rawTags
              : (typeof (area as any).type === 'string' ? (area as any).type : '');
        if (selectedTags.length > 0 && areaType && !selectedTags.includes(areaType)) continue;

        // Seçili filtreyi kontrol et (sol checkbox)
        let include = false;
        if (turkeyWideKeys.includes('own') && selectedFilters.includes('own') && user?.id && String(area.owner_id) === String(user.id)) include = true;
        if (turkeyWideKeys.includes('community') && selectedFilters.includes('community') && area.community_id && user?.community_id && String(area.community_id) === String(user.community_id)) include = true;
        if (turkeyWideKeys.includes('friend') && selectedFilters.includes('friend') && Array.isArray(user?.friends) && user.friends.length > 0) {
          let friendList: any[] = [];
          try {
            friendList = Array.isArray(area.friend_user_ids)
              ? area.friend_user_ids
              : typeof area.friend_user_ids === 'string'
                ? JSON.parse(area.friend_user_ids)
                : [];
          } catch { friendList = []; }
          const userFriendIds = user.friends.map((f: any) => String(f.id));
          if (friendList.some((id: any) => userFriendIds.includes(String(id)))) include = true;
        }
        if (include) {
          existingIds.add(String((area as any).id));
          filtered.push(area);
        }
      }
    }

    return filtered;
  }, [campingAreas, user, isGuest, selectedFilters, selectedTags, turkeyWideAreas, turkeyWideKeys]);

  // Türkiye geneli filtre aktifken haritayı tüm markerları kapsayacak şekilde zoom out yap
  useEffect(() => {
    if (turkeyWideKeys.length === 0) return;
    if (!isWebViewReady) return;
    if (filteredCampingAreas.length === 0) return;
    const coords = filteredCampingAreas
      .filter(a => typeof a.latitude === 'number' && typeof a.longitude === 'number')
      .map(a => [a.latitude, a.longitude]);
    if (coords.length === 0) return;
    const script = `
      (function() {
        var coords = ${JSON.stringify(coords)};
        if (typeof map !== 'undefined' && coords.length > 0) {
          var bounds = L.latLngBounds(coords.map(function(c) { return [c[0], c[1]]; }));
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
      })();
      true;
    `;
    // WebView hazır olduktan sonra kısa gecikme ile enjekte et
    const t = setTimeout(() => {
      safeInjectJavaScript(script, 'TurkeyWideFitBounds');
    }, 400);
    return () => clearTimeout(t);
  }, [turkeyWideKeys, filteredCampingAreas, isWebViewReady]);

  // API senkronizasyonu sadece ilk mount'ta çalışsın
  const isSyncingRef = useRef(false);
  const hasInitialSyncRef = useRef(false);
  // Duyuru fetch işlemlerinin çakışmasını önlemek için ref
  const isFetchingAnnouncementsRef = useRef(false);
  
  // İlk açılışta API'dan senkronizasyon
  useEffect(() => {
    // Konum izni durumu belirsiz/yok iken senkronizasyon başlatma
    if (hasLocationPermission !== true) {
      if (__DEV__) console.log('[SYNC] Konum izni yok/belirsiz, ilk senkronizasyon başlatılmıyor');
      return;
    }
    
    if (hasInitialSyncRef.current) return;
    hasInitialSyncRef.current = true;
    
    // Permission onaylandıktan sonra kademeli başlat (500ms gecikme)
    const timer = setTimeout(() => {
      (async () => {
        await refreshData();
        // Duyurular full sync sonrasında fetch edilecek (ilk açılışta bildirim gösterme)
      // API senkronizasyonu
      if (isConnected) {
        if (isSyncingRef.current) {
          if (__DEV__) console.log('[SYNC] Zaten bir sync işlemi devam ediyor, tekrar başlatılmayacak.');
          return;
        }
        isSyncingRef.current = true;
        (async () => {
          try {
            const token = await getToken();
            if (!token) {
              if (__DEV__) console.log('Token yok, API çağrısı yapılmayacak.');
              isSyncingRef.current = false;
              return;
            }
            // Delta Sync: İlk açılışta forceFull: true, sonraki açılışlarda delta sync
            // hasInitialSync flag'ini kontrol et
            const hasInitialSync = await SecureStore.getItemAsync('hasInitialSync');
            const shouldForceFullSync = !hasInitialSync;
            
            if (__DEV__) console.log('[DEBUG][SYNC] hasInitialSync flag:', hasInitialSync, '| shouldForceFullSync:', shouldForceFullSync);
            
            if (shouldForceFullSync) {
              if (__DEV__) console.log('[DEBUG][PROGRESS] İLK FULL SYNC başlıyor...');
              isFullSyncInProgressRef.current = true; // Bildirimleri kapat
              await SecureStore.setItemAsync('isInitialSyncComplete', 'false'); // Duyurular tab'ını kapat
              setSyncProgress({ current: 0, total: 0, isLoading: true });
            } else {
              if (__DEV__) console.log('[DEBUG][SYNC] Delta sync yapılacak (full sync atlanıyor)');
            }
            
            const dbInst = getDatabase();
            const count = await dbInst.fetchAndStoreCampingAreasFromAPI(undefined, { 
              forceFull: shouldForceFullSync,
              userId: user?.id !== undefined ? String(user.id) : undefined,
              onProgress: shouldForceFullSync ? (current, total) => {
                if (__DEV__) console.log('[DEBUG][PROGRESS] Full sync progress:', current, '/', total);
                setSyncProgress({ current, total, isLoading: true });
              } : undefined
            });
            if (user?.id) { try { await dbInst.cleanupRevokedFriendAreas(String(user.id)); } catch {} }
            
            if (shouldForceFullSync) {
              if (__DEV__) console.log('[DEBUG][PROGRESS] Full sync tamamlandı:', count, 'kayıt');
              await SecureStore.setItemAsync('hasInitialSync', 'true');
              await SecureStore.setItemAsync('isInitialSyncComplete', 'true'); // Duyurular tab'ını aç
              isFullSyncInProgressRef.current = false; // Bildirimleri aç
              setSyncProgress({ current: 0, total: 0, isLoading: false });
              // Full sync sırasında biriken bildirimleri göster
              flushPendingNotifications();
              
              // İlk açılışta duyuru bildirimi göster
              try {
                const { getLargeItemAsync, setLargeItemAsync } = require('@/lib/largeStorage');
                const shownAnnouncementIdsStr = await getLargeItemAsync('shownAnnouncementIds');
                const isFirstAnnouncementLoad = !shownAnnouncementIdsStr || shownAnnouncementIdsStr === '[]';
                
                if (isFirstAnnouncementLoad) {
                  const db = getDatabase();
                  const localAnnouncements = (await db.listAnnouncementsLocal({ onlyActive: true })).filter((a: any) => a.deleted !== 1 && a.aktif !== 0);
                  
                  // Kullanıcı bilgisi al
                  const currentUser = await getMe();
                  
                  // matchedValilikId'yi al
                  let matchedValilikIdLocal: number | null = null;
                  try {
                    const storedValilikId = await SecureStore.getItemAsync('matchedValilikId');
                    if (storedValilikId) {
                      matchedValilikIdLocal = parseInt(storedValilikId);
                    }
                  } catch {}
                  
                  // Filtreleme (announcements.tsx ile aynı mantık)
                  let filtered = localAnnouncements;
                  if (currentUser?.role !== 'superadmin' && currentUser) {
                    filtered = localAnnouncements.filter((a: any) => {
                      // Genel duyurular (community_id === 0)
                      if (a.community_id === 0) {
                        // Eğer valilik_id eşleştirmesi varsa filtrele
                        if (matchedValilikIdLocal && a.valilik_id) {
                          return String(a.valilik_id) === String(matchedValilikIdLocal);
                        }
                        return true;
                      }
                      // Topluluk duyuruları
                      if (currentUser?.community_id && String(a.community_id) === String(currentUser.community_id)) return true;
                      return false;
                    });
                  }
                  
                  if (filtered.length > 0) {
                    // Tüm duyuru ID'lerini kaydet
                    const visibleIds = filtered.map(a => a.id);
                    await setLargeItemAsync('shownAnnouncementIds', JSON.stringify(visibleIds));
                    
                    // Bildirim göster
                    addToNotificationQueue([{
                      id: Date.now(),
                      type: 'announcement',
                      message: `${filtered.length} yeni duyurunuz var!`,
                      goto: () => router.push('/announcements'),
                    }], 'announcement');
                    
                    // announcements.tsx'i güncelleme event'i gönder
                    eventBus.emit('announcements:updated');
                    
                    if (__DEV__) console.log('[INITIAL_SYNC] İlk açılış bildirimi gösterildi:', filtered.length);
                  }
                }
              } catch (err) {
                if (__DEV__) console.warn('[INITIAL_SYNC] Duyuru bildirimi hatası:', err);
              }
            }
            
            if (__DEV__) console.log('API ile senkronize edilen kamp alanı sayısı:', count);
            await refreshData();
            // Harita sync sonrası duyuruları fetch et (valilik filtresi uygulanacak)
            fetchAnnouncementsSilently(router, false);
          } catch (err) {
            console.error('API veri çekme hatası:', err);
          } finally {
            isSyncingRef.current = false;
            // Hata durumunda da flag'i sıfırla
            if (isFullSyncInProgressRef.current) {
              isFullSyncInProgressRef.current = false;
            }
          }
        })();
      } else {
        if (__DEV__) console.log('Offline modda, API çağrısı yapılmayacak.');
      }
      })();
    }, 500); // Modal kapandıktan 500ms sonra başlat
    
    return () => clearTimeout(timer);
  }, [hasLocationPermission]); // Permission true olduğunda sync başlar, hasInitialSyncRef ile tekrar başlamaz

  // Konum değiştiğinde kontrol et ve gerekirse refreshData çağır
  useEffect(() => {
    if (!hasInitialSyncRef.current) return; // İlk mount'u bekle
    
    let currentLat: number | undefined;
    let currentLng: number | undefined;
    
    if (mapMoveQuery) {
      currentLat = mapMoveQuery.latitude;
      currentLng = mapMoveQuery.longitude;
    } else if (location?.coords) {
      currentLat = location.coords.latitude;
      currentLng = location.coords.longitude;
    }
    
    if (currentLat === undefined || currentLng === undefined) return;
    
    // Son sorgulanan konum varsa mesafe kontrolü yap
    if (lastQueriedLocationRef.current) {
      const dist = getDistanceMeters(
        lastQueriedLocationRef.current.latitude,
        lastQueriedLocationRef.current.longitude,
        currentLat,
        currentLng
      );
      
      // 1000 metreden az değiştiyse sorgu yapma
      if (dist < 1000) {
        if (__DEV__) console.log('[DEBUG] Konum anlamlı değişmedi, sorgu yapılmayacak:', dist.toFixed(2), 'metre');
        return;
      }
      if (__DEV__) console.log('[DEBUG] Konum değişti, yeni sorgu yapılacak:', dist.toFixed(2), 'metre');
    }
    
    // Konumu güncelle ve veriyi yenile
    lastQueriedLocationRef.current = { latitude: currentLat, longitude: currentLng };
    refreshData();
  }, [mapMoveQuery, location]);

  // Konum değiştiğinde valilik_id'yi güncelle (announcements için)
  useEffect(() => {
    if (!location?.coords) return;
    
    const updateValilikId = async () => {
      try {
        const provinceName = await getProvinceFromOSM(location.coords.latitude, location.coords.longitude);
        if (provinceName) {
          const { getValilikIdFromProvinceName } = require('@/lib/provinceMap');
          const newValilikId = getValilikIdFromProvinceName(provinceName);
          
          // Mevcut valilik_id'yi oku
          const storedValilikId = await SecureStore.getItemAsync('matchedValilikId');
          const storedValilikIdNum = storedValilikId ? parseInt(storedValilikId) : null;
          
          // Değiştiyse güncelle ve event bus ile bildir
          if (newValilikId && newValilikId !== storedValilikIdNum) {
            await SecureStore.setItemAsync('matchedValilikId', String(newValilikId));
            console.log('[VALILIK UPDATE] Konum:', provinceName, '→ Valilik ID:', storedValilikIdNum, '->', newValilikId);
            
            // Event bus ile duyuruları güncelleme sinyali gönder
            const { eventBus } = require('@/lib/eventBus');
            eventBus.emit('valilikIdChanged', newValilikId);
          }
        }
      } catch (error) {
        console.error('[VALILIK UPDATE] Hata:', error);
      }
    };
    
    updateValilikId();
  }, [location]);

  // Online modda konum değiştiğinde harita tile'larını ön-cache'le
  useEffect(() => {
    if (!isConnected || !location?.coords) return;
    
    // Arka planda tile'ları ön-cache'le
    const precacheTiles = async () => {
      try {
        // DEBUG: User state'ini kontrol et
        if (__DEV__) {
          console.log('[MapTileCache] 🔍 User State:', JSON.stringify({
            id: user?.id,
            email: user?.email,
            role: user?.role,
            offline_enabled: user?.offline_enabled,
            offline_radius_km: user?.offline_radius_km
          }, null, 2));
        }
        
        // Kullanıcının offline özelliğine sahip olup olmadığını kontrol et
        if (!user || !user.offline_enabled) {
          if (__DEV__) console.log('[MapTileCache] ❌ Kullanıcı offline özelliğine sahip değil, cache atlandı');
          return;
        }
        
        const lat = mapMoveQuery ? mapMoveQuery.latitude : location.coords.latitude;
        const lng = mapMoveQuery ? mapMoveQuery.longitude : location.coords.longitude;
        
        // Kullanıcının offline_radius_km değerini kullan (varsayılan 20 km)
        const radiusKm = user.offline_radius_km || 20;
        
        // Bölgeyi cache'le (çoklu zoom seviyelerinde)
        const result = await precacheRegionWithRadius(lat, lng, radiusKm);
        
        if (__DEV__) {
          if (result.alreadyCached) {
            console.log('[MapTileCache] Bölge zaten cache\'lenmiş, atlandı');
          } else if (result.totalTiles > 0) {
            console.log(`[MapTileCache] ${result.totalTiles} harita tile'ı ${radiusKm} km çapında cache'lendi`);
          }
        }
      } catch (error) {
        if (__DEV__) console.error('[MapTileCache] Ön-cache hatası:', error);
      }
    };
    
    // 2 saniye gecikme ile ön-cache başlat (performans için)
    const timeoutId = setTimeout(precacheTiles, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [isConnected, location, mapMoveQuery, user]);

  // Her 1 dakikada bir sessiz senkronizasyon
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (!isConnected) {
        if (__DEV__) console.log('[AUTO_SYNC] Offline, otomatik senkronizasyon atlanıyor.');
        return;
      }
      
      if (isSyncingRef.current) {
        if (__DEV__) console.log('[AUTO_SYNC] Zaten bir sync devam ediyor, atlanıyor.');
        return;
      }
      
      if (__DEV__) console.log('[AUTO_SYNC] Sessiz senkronizasyon başlatılıyor...');
      isSyncingRef.current = true;
      
      try {
        const token = await getToken();
        if (!token) {
          if (__DEV__) console.log('[AUTO_SYNC] Token yok, atlanıyor.');
          isSyncingRef.current = false;
          return;
        }
        
        const count = await getDatabase().fetchAndStoreCampingAreasFromAPI(undefined, { forceFull: false });
        if (__DEV__) console.log('[AUTO_SYNC] Senkronize edildi:', count, 'kamp alanı');
        
        // Duyurular için de delta sync
        try {
          const db = getDatabase();
          await db.fetchAndStoreAnnouncementsFromAPI();
          if (__DEV__) console.log('[AUTO_SYNC] Duyurular delta sync tamamlandı');
          
          // announcements.tsx'i güncelleme event'i gönder
          eventBus.emit('announcements:updated');
        } catch (err) {
          if (__DEV__) console.warn('[AUTO_SYNC] Duyuru delta sync hatası:', err);
        }
        
        // Sessizce veriyi güncelle (loading göstermeden)
        await refreshData();
        
        // Duyuruları kontrol et ve bildirim göster
        try {
          fetchAnnouncementsSilently(routerRef.current, false);
        } catch (err) {
          if (__DEV__) console.warn('[AUTO_SYNC] Duyuru fetch hatası:', err);
        }
      } catch (err) {
        if (__DEV__) console.error('[AUTO_SYNC] Hata:', err);
      } finally {
        isSyncingRef.current = false;
      }
    }, 600000); // 600 saniye = 10 dakika

    // Cleanup
    return () => clearInterval(syncInterval);
  }, [isConnected]);

  // Load favorites when component mounts
  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const favoriteAreas = await getDatabase().getFavorites();
  const favoriteIds = new Set(favoriteAreas.map(area => (area as any).id));
      setFavorites(favoriteIds);
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  useEffect(() => {
    // Debug info removed
  }, [location, campingAreas, loading, error, selectedTags]);

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const toggleCustomFilter = (key: string) => {
    setSelectedFilters(prev =>
      prev.includes(key)
        ? prev.filter(f => f !== key)
        : [...prev, key]
    );
  }

  const toggleTurkeyWide = (key: string) => {
    setTurkeyWideKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  }

  const toggleAllCampingTypes = () => {
    if (selectedTags.length === campingTypes.length) {
      // Tümü seçili, hepsini kaldır
      setSelectedTags([]);
    } else {
      // Tümünü seç
      setSelectedTags(campingTypes.map(t => t.id));
    }
  };;

  // Marker rengi: owner_id ve visibility'ye göre belirlenir
  const getMarkerColor = (area: { owner_id?: string | null, visibility?: string, type?: string }, isUserSubmitted: boolean) => {
    if (isUserSubmitted) {
      return '#000000ff'; // Kullanıcı alanları için sabit renk
    }
    // CampingAreaDetailModal ile aynı renk standardı
    return getCampingAreaBgColor(area);
  };

  // Private alanlar için superadmin'e özel ikon
  const getMarkerIcon = (type: string, isUserSubmitted: boolean, visibility?: string) => {
    if (isSuperAdmin) {
      if (visibility === 'private') {
        return getSVGIcon('private_campground');
      }
      if (visibility === 'community') {
        return getSVGIcon('shared_campground');
      }
    }
    // Diğer tüm kullanıcılar için type varsa ilgili ikon, yoksa default ikon döndür
    return getSVGIcon((type as MarkerType) || 'default');
  };

  const getTypeLabel = (type: string) => {
    return getCampingTypeLabel(type);
  };


  const generateMapHTML = () => {
    // Location null ise varsayılan konum kullan (Türkiye - Ankara)
    const defaultLocation = {
      coords: {
        latitude: 39.9251,
        longitude: 32.8375,
      }
    };
    // location null ise defaultLocation kullan, asla boş string dönme
    const currentLocation = (location && location.coords && typeof location.coords.latitude === 'number' && typeof location.coords.longitude === 'number') ? location : defaultLocation;

    // Guest kontrolü
    const isGuest = user?.role === 'guest';

  const markers = filteredCampingAreas.map(area => {
    // tags alanı string ise doğrudan kullan, obje ise type içinden al
    let tag = '';
    if (typeof area.tags === 'string' && (area.tags as string).trim() !== '') {
      tag = area.tags as string;
    } else if (typeof area.tags === 'object' && area.tags !== null && area.tags.type) {
      tag = area.tags.type;
    } else if (typeof area.type === 'string' && area.type.trim() !== '') {
      tag = area.type;
    }
    const isUserSubmitted = typeof area.tags === 'object' && area.tags?.user_submitted === 'yes';
    // Favori kontrolü: ID üzerinden
    const areaId = (area as any).id;
    const isFavorite = favorites.has(areaId);
    // Olanaklar için emoji ikon fonksiyonu
    const getAmenityIcon = (amenity) => {
      switch (amenity) {
        case 'tuvalet': return '🚻';
        case 'duş': return '🚿';
        case 'içme_suyu': return '💧';
        case 'elektrik': return '⚡';
        case 'wifi': return '📶';
        case 'market': return '🏪';
        case 'restoran': return '🍽️';
        case 'otopark': return '🅿️';
        case 'piknik_masası': return '🪑';
        case 'barbekü': return '🔥';
        case 'ateş_yeri': return '🔥';
        default: return '📍';
      }
    };
    // Kapak görseli: S3 linki varsa onu, yoksa file:// ile başlayan local URI'yi kullan
    let coverImage = '';
    if (Array.isArray(area.images) && area.images.length > 0) {
      // Önce S3 linki bul
      coverImage = area.images.find((img: string) => typeof img === 'string' && img.startsWith('http'));
      // S3 linki yoksa file:// ile başlayanı bul
      if (!coverImage) {
        coverImage = area.images.find((img: string) => typeof img === 'string' && img.startsWith('file://'));
      }
      // Hiçbiri yoksa ilkini kullan
      if (!coverImage) {
        coverImage = area.images[0];
      }
    }
    return {
      id: areaId,
      name: area.name ?? '', // Add name property for marker
      amenities: area.amenities,
      distance: area.distance_km ? `${area.distance_km.toFixed(1)} km` : '',
      isUserSubmitted,
      markerColor: getMarkerColor(area, isUserSubmitted),
      markerIcon: getMarkerIcon(tag, isUserSubmitted, area.visibility),
      typeLabel: getTypeLabel(tag),
      lat: (area as any).latitude,
      lng: (area as any).longitude,
      images: coverImage ? [coverImage] : [],
      isFavorite,
      getAmenityIcon,
    };
  });

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
  <script>
          window.API_URL = '${API_URL}';
        </script>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          .custom-popup {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          }
          .popup-title {
            font-weight: 600;
            color: #059669;
            margin-bottom: 8px;
          }
          .popup-type {
            background: #dcfce7;
            color: #059669;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            display: inline-block;
          }
          .location-picker-cursor {
            cursor: crosshair !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var isOffline = ${!isConnected};
          
          // Offline modda cache'lenmiş zoom seviyeleri: 9, 10, 11, 12, 13
          var mapOptions = {
            minZoom: isOffline ? 9 : 1,
            maxZoom: isOffline ? 13 : 18,
            zoomSnap: isOffline ? 1 : 0.5,
            zoomDelta: isOffline ? 1 : 1
          };
          
          var map = L.map('map', mapOptions).setView([${mapMoveQuery ? mapMoveQuery.latitude : currentLocation.coords.latitude}, ${mapMoveQuery ? mapMoveQuery.longitude : currentLocation.coords.longitude}], isOffline ? 12 : 14);
          var isLocationPickerMode = ${isLocationPickerMode};
          var selectForPlanMode = ${selectForPlanMode};
          var selectedLocationMarker = null;
          
          // Offline-aware tile layer
          var tileLayer;
          
          if (isOffline) {
            // Offline modda: Cache'den tile yükle
            // Custom tile layer class tanımla
            var OfflineTileLayer = L.TileLayer.extend({
              createTile: function(coords, done) {
                var tile = document.createElement('img');
                var requestId = coords.z + '_' + coords.x + '_' + coords.y;
                
                // Cache'den tile iste
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'requestCachedTile',
                    z: coords.z,
                    x: coords.x,
                    y: coords.y,
                    requestId: requestId
                  }));
                  
                  // Callback fonksiyonu
                  window['tileCacheCallback_' + requestId] = function(base64Data) {
                    if (base64Data) {
                      tile.src = base64Data;
                      if (done) done(null, tile);
                    } else {
                      // Cache'de yok, açık gri placeholder tile göster (256x256)
                      var canvas = document.createElement('canvas');
                      canvas.width = 256;
                      canvas.height = 256;
                      var ctx = canvas.getContext('2d');
                      ctx.fillStyle = '#e5e7eb';
                      ctx.fillRect(0, 0, 256, 256);
                      // Çapraz çizgiler çiz
                      ctx.strokeStyle = '#d1d5db';
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.moveTo(0, 0);
                      ctx.lineTo(256, 256);
                      ctx.moveTo(256, 0);
                      ctx.lineTo(0, 256);
                      ctx.stroke();
                      // Metin ekle
                      ctx.fillStyle = '#9ca3af';
                      ctx.font = '12px Arial';
                      ctx.textAlign = 'center';
                      ctx.fillText('Offline', 128, 120);
                      ctx.fillText('Cache yok', 128, 140);
                      tile.src = canvas.toDataURL();
                      if (done) done(null, tile);
                    }
                    delete window['tileCacheCallback_' + requestId];
                  };
                  
                  // Timeout - 1500ms sonra hala yanıt gelmezse placeholder
                  setTimeout(function() {
                    if (window['tileCacheCallback_' + requestId]) {
                      delete window['tileCacheCallback_' + requestId];
                      // Placeholder tile
                      var canvas = document.createElement('canvas');
                      canvas.width = 256;
                      canvas.height = 256;
                      var ctx = canvas.getContext('2d');
                      ctx.fillStyle = '#f3f4f6';
                      ctx.fillRect(0, 0, 256, 256);
                      ctx.strokeStyle = '#e5e7eb';
                      ctx.lineWidth = 1;
                      ctx.strokeRect(0, 0, 256, 256);
                      tile.src = canvas.toDataURL();
                      if (done) done(null, tile);
                    }
                  }, 1500);
                } else {
                  // ReactNativeWebView yok, placeholder
                  var canvas = document.createElement('canvas');
                  canvas.width = 256;
                  canvas.height = 256;
                  var ctx = canvas.getContext('2d');
                  ctx.fillStyle = '#f3f4f6';
                  ctx.fillRect(0, 0, 256, 256);
                  tile.src = canvas.toDataURL();
                  if (done) done(null, tile);
                }
                
                return tile;
              }
            });
            
            tileLayer = new OfflineTileLayer('', {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (Offline)',
              maxZoom: 13,
              minZoom: 9,
              bounds: null,
              keepBuffer: 2,
              updateWhenIdle: false,
              updateWhenZooming: false
            });
          } else {
            // Online modda: Backend proxy üzerinden yükle
            // Version parametresi ile backend cache bypass (CartoDB'ye geçiş için)
            tileLayer = L.tileLayer(window.API_URL + '/tiles/{z}/{x}/{y}.png?v=cartodb', {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
              errorTileUrl: '',
              maxZoom: 18,
              minZoom: 1
            });
            
            // Online modda - tile'ları cache'le
            tileLayer.on('tileload', function(e) {
              if (window.ReactNativeWebView && e.coords) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'cacheTile',
                  z: e.coords.z,
                  x: e.coords.x,
                  y: e.coords.y
                }));
              }
            });
          }
          
          tileLayer.addTo(map);

          // If opened from camp-plan selection mode, move zoom controls lower to avoid overlap 
          if (selectForPlanMode) {
            setTimeout(function() {
              try {
                var z = document.querySelector('.leaflet-control-zoom');
                if (z && z.style) {
                  z.style.top = '65px';
                  z.style.bottom = '0';
                  z.style.left = '0';
                  z.style.right = '12px';
                }
              } catch (e) { console.warn('zoom reposition error', e); }
            }, 300);
          }

          // Offline modda harita yüklendikten sonra tile'ları yenile
          if (isOffline) {
            map.whenReady(function() {
              setTimeout(function() {
                map.invalidateSize();
                // Tile layer'ı yeniden render et
                if (tileLayer && tileLayer.redraw) {
                  tileLayer.redraw();
                }
              }, 300);
            });
          }

          // Eğer harita üzerinde bir konum seçildiyse ve kamp alanı listeleniyorsa, harita zoomu tüm kamp alanlarını kapsayacak şekilde ayarlanır
          if (${mapMoveQuery ? 'true' : 'false'} && ${Array.isArray(markers) ? markers.length : 0} > 0) {
            var bounds = L.latLngBounds([
              ...${JSON.stringify(markers)}.map(function(m) { return [m.lat, m.lng]; })
            ]);
            map.fitBounds(bounds, { padding: [40, 40] });
          }

          // Harita hareketi sonrası merkez değişimini React Native'e bildir
          var lastCenter = map.getCenter();
          map.on('moveend', function() {
            var center = map.getCenter();
            // Küçük hareketleri atla
            if (Math.abs(center.lat - lastCenter.lat) > 0.0001 || Math.abs(center.lng - lastCenter.lng) > 0.0001) {
              lastCenter = center;
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'mapMoved',
                  latitude: center.lat,
                  longitude: center.lng
                }));
              }
            }
          });
          
          // Offline modda zoom seviyesi kontrolü
          if (isOffline) {
            var allowedZoomLevels = [9, 10, 11, 12, 13];
            map.on('zoomend', function() {
              var currentZoom = map.getZoom();
              // Eğer zoom seviyesi cache'lenmiş seviyelerde değilse, en yakın seviyeye dön
              if (!allowedZoomLevels.includes(currentZoom)) {
                var closestZoom = allowedZoomLevels.reduce(function(prev, curr) {
                  return Math.abs(curr - currentZoom) < Math.abs(prev - currentZoom) ? curr : prev;
                });
                map.setZoom(closestZoom, { animate: false });
              }
            });
          }

          // Location picker mode
          if (isLocationPickerMode) {
            map.getContainer().classList.add('location-picker-cursor');
            
            map.on('click', function(e) {
              var lat = e.latlng.lat;
              var lng = e.latlng.lng;
              
              console.log('Map clicked at:', lat, lng);
              
              // Remove previous marker
              if (selectedLocationMarker) {
                map.removeLayer(selectedLocationMarker);
              }
              
              // Add new marker (pure CSS pin - no SVG/quote escaping issues, works offline)
              selectedLocationMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                  className: '',
                  html: '<div style="position:relative;width:32px;height:42px;display:flex;justify-content:center;">' +
                        '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#ef4444;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);position:absolute;top:0;left:2px;"></div>' +
                        '<div style="width:6px;height:6px;border-radius:50%;background:#fff;position:absolute;top:11px;left:13px;"></div>' +
                        '</div>',
                  iconSize: [32, 42],
                  iconAnchor: [16, 42]
                })
              }).addTo(map);
              selectedLocationMarker.bindPopup('Seçilen konum: ' + lat.toFixed(6) + ', ' + lng.toFixed(6)).openPopup();
              
              // Send location to React Native
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'locationSelected',
                  latitude: lat,
                  longitude: lng
                }));
              } else {
                console.log('ReactNativeWebView not available, selected location:', lat, lng);
              }
            });
          } else {
            // Normal mode - remove any existing selected location marker
            if (selectedLocationMarker) {
              map.removeLayer(selectedLocationMarker);
              selectedLocationMarker = null;
            }
          }
          
          // Kullanıcı konumu
          L.marker([${currentLocation.coords.latitude}, ${currentLocation.coords.longitude}], {
            icon: L.divIcon({
              className: 'user-location',
              html: '<div style="background: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            })
          }).addTo(map).bindPopup('<div class="custom-popup"><div class="popup-title">Mevcut Konumunuz</div><button onclick="addCampingAreaHere()" style="margin-top: 8px; padding: 6px 12px; background: #059669; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">+ Buraya Kamp Alanı Ekle</button></div>');

          // Kamp alanları - sadece normal modda göster
          if (!isLocationPickerMode) {
            console.log('Adding ' + ${(Array.isArray(markers) ? markers.length : 0)} + ' markers to map');
            console.log('Markers data:', JSON.stringify(${JSON.stringify(markers)}, null, 2));

            // Marker referanslarını saklamak için dizi
            var markerRefs = [];

            ${markers.map((marker, idx) => `
            var marker${idx} = L.marker([${marker.lat}, ${marker.lng}], {
              icon: L.divIcon({
                className: 'camping-marker',
                html: '<div style="background: ${marker.markerColor}; color: white; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${marker.markerIcon}</div>',
                iconSize: [24, 24],
                iconAnchor: [14, 14]
              })
            }).addTo(map).bindPopup(\`
          <div class="custom-popup" style="display: flex; flex-direction: row; gap: 0; min-width: 320px; max-width: 380px; align-items: stretch;">
            <div style="position: relative; flex: 0 0 45%; width: 45%; min-width: 90px; max-width: 160px; aspect-ratio: 1/1; border-radius: 0; background: #f3f4f6; display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 0; padding: 0; left: 0; top: 0; border: none;">
              ${(marker.images && marker.images[0]) ? `<img src='${marker.images[0]}' alt='' style="width: 100%; height: 100%; object-fit: cover; border-radius: 0; display: block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;"><svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 137.5 137.5'><g><path fill='none' d='M0,125.17V0h137.5v137.5H0v-3.22l.26-.54h136.64l.33.54c-.21-.06-.5-.13-.54-.31-.27-1.29-.13-6.86,0-8.41l.54-.39c-.06.21-.14.52-.31.54-1.03.12-5.81.18-6.68,0l-.38-.54-.59.06c-18.63-30.16-37.18-60.35-55.64-90.57,5.23-9.02,10.59-17.99,16.09-26.9-.78-.59-6.46-4.27-6.82-4.09l-13.4,21.79c-.28.43-.79.36-1.18.13L54.31,3.58c-2.25,1.24-4.49,2.57-6.57,4.09l15.68,26.38.19.52c-18.36,30.21-36.83,60.37-55.44,90.49-1.2,1.03-6,.8-7.74.62l-.44-.49Z'/><path fill='#444444ff' d='M129.86,125.17l-55.76-90.58,16.19-26.74c.04-.38-.26-.54-.51-.74-.65-.51-6.66-4.24-7.06-4.15l-13.84,22.49L54.68,3.06c-.28-.24-.48,0-.72.09-.59.23-6.72,4-6.94,4.35l16.11,27.09L7.64,124.9c-.87.72-6.18.02-7.64.27v9.11h137.24v-9.11h-7.37ZM86.04,125.17l-17.16-36.18-17.69,36.18h-9.92l27.6-56.82,27.08,56.82h-9.92Z'/></g></svg></div>` : `<div style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 137.5 137.5"><g><path fill="none" d="M0,125.17V0h137.5v137.5H0v-3.22l.26-.54h136.64l.33.54c-.21-.06-.5-.13-.54-.31-.27-1.29-.13-6.86,0-8.41l.54-.39c-.06.21-.14.52-.31.54-1.03.12-5.81.18-6.68,0l-.38-.54-.59.06c-18.63-30.16-37.18-60.35-55.64-90.57,5.23-9.02,10.59-17.99,16.09-26.9-.78-.59-6.46-4.27-6.82-4.09l-13.4,21.79c-.28.43-.79.36-1.18.13L54.31,3.58c-2.25,1.24-4.49,2.57-6.57,4.09l15.68,26.38.19.52c-18.36,30.21-36.83,60.37-55.44,90.49-1.2,1.03-6,.8-7.74.62l-.44-.49Z"/><path fill="#444444ff" d="M129.86,125.17l-55.76-90.58,16.19-26.74c.04-.38-.26-.54-.51-.74-.65-.51-6.66-4.24-7.06-4.15l-13.84,22.49L54.68,3.06c-.28-.24-.48,0-.72.09-.59.23-6.72,4-6.94,4.35l16.11,27.09L7.64,124.9c-.87.72-6.18.02-7.64.27v9.11h137.24v-9.11h-7.37ZM86.04,125.17l-17.16-36.18-17.69,36.18h-9.92l27.6-56.82,27.08,56.82h-9.92Z"/></g></svg>
              </div>`}
              <!-- Favori butonu sol üstte, fotoğraf üzerinde -->
              <div style="position: absolute; top: 6px; left: 6px; z-index: 3;">
                <div style="font-size: 0; color: #ef4444; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: ${marker.isFavorite ? '#ef4444' : 'rgba(254,242,242,0.95)'}; border: 1px solid #ef4444; transition: background 0.2s; cursor:pointer;" onclick="window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type: 'toggleFavorite', latitude: ${marker.lat}, longitude: ${marker.lng} }))" title="Favorilere ekle/kaldır">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="${marker.isFavorite ? '#ffffff' : 'none'}" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.1 18.55l-.1.1l-.11-.1C7.14 14.24 4 11.39 4 8.5C4 6.5 5.5 5 7.5 5c1.54 0 3.04 1.04 3.57 2.36h1.87C13.46 6.04 14.96 5 16.5 5C18.5 5 20 6.5 20 8.5c0 2.89-3.14 5.74-7.9 10.05z" stroke="#ef4444" stroke-width="1.5" fill="${marker.isFavorite ? '#ffffff' : 'none'}"/>
                  </svg>
                </div>
              </div>
            </div>
            <div style="flex: 1 1 55%; width: 55%; display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 8px 10px 8px 10px; justify-content: flex-start; position: relative;">
              <!-- Başlık ve tip -->
              <div style="padding-left: 0;">
                <div class="popup-title" style="font-size: 15px; margin-bottom: 2px; cursor:pointer;" onclick="openCampingAreaDetail(${marker.lat}, ${marker.lng})">
                  ${marker.name.replace(/'/g, "\\'")}
                </div>
                <span class="popup-type" style="margin-bottom: 2px;">${marker.typeLabel}</span>
                ${marker.isUserSubmitted ? '<div style="font-size: 12px; color: #8b5cf6;">⭐ Kullanıcı Ekledi</div>' : ''}
                ${marker.distance && marker.distance !== '' ? '<div style="font-size: 12px; color: #6b7280;">📍 ' + marker.distance + '</div>' : ''}
              </div>
              <!-- Olanaklar (amenities) ikonları alt satırda -->
              <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 4px 0 0 0; min-height: 24px;">
                ${(marker.amenities && Array.isArray(marker.amenities) && marker.amenities.length > 0) ? marker.amenities.map(am => `
                  <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; background: #f3f4f6; margin-right: 2px; font-size: 16px;" title="${am}">
                    ${marker.getAmenityIcon(am)}
                  </span>
                `).join('') : ''}
              </div>
              <!-- Alt aksiyonlar (mercek ve harita) -->
              <div style="display: flex; flex-direction: row; align-items: center; gap: 8px; margin-top: 8px;">
                  <div style="font-size: 0; color: #059669; flex: 1; display: flex; align-items: center; justify-content: flex-start; cursor:pointer;" onclick="openCampingAreaDetail(${marker.lat}, ${marker.lng})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a5a5aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>  
                    <span style="font-size: 13px; color: #222; margin-left: 5px">Detaylı Bilgi</span>
                  </div>
                  <div style="position: relative; display: flex; align-items: center;">
                    <div style="width: 24px; height: 24px; background: none; border-radius: 8%; display: flex; align-items: center; justify-content: center; position: relative; cursor:pointer;" onclick="toggleMapMenu(this, ${marker.lat}, ${marker.lng})">
                      ${getSVGIcon('navigation', { width: 18, height: 18 })}
                    </div>
                    <div class="map-menu" style="display: none; position: absolute; top: 55px; left: -85px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); padding: 6px 0; min-width: 120px; z-index: 999;">
                    <div style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; cursor: pointer;" onclick="openGoogleMaps(${marker.lat}, ${marker.lng}); hideMapMenu(this);">
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                      <span style="font-size: 13px; color: #222;">Google Haritalar</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; cursor: pointer;" onclick="openYandexMaps(${marker.lat}, ${marker.lng}); hideMapMenu(this);">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="44" fill="none" viewBox="0 0 26 26"><path fill="#F8604A" d="M26 13c0-7.18-5.82-13-13-13S0 5.82 0 13s5.82 13 13 13 13-5.82 13-13Z"></path><path fill="#fff" d="M13.353 14.343c.76 1.664 1.013 2.243 1.013 4.241v2.65h-2.714v-4.467L6.534 5.634h2.83l3.989 8.71Zm3.346-8.709-3.32 7.542h2.759l3.328-7.542h-2.767Z"></path></svg>
                      <span style="font-size: 13px; color: #222;">Yandex Haritalar</span>
                    </div>
                  </div>
                  
              </div>
                </div>
                <!-- Kamp Planla Seçim Butonu -->
                ${(selectForPlanMode || isLocationPickerMode) ? `
                <div style="margin-top:6px; padding: 0 10px 6px 10px;">
                  <button class="select-for-plan-btn" data-payload="${encodeURIComponent(JSON.stringify({ type: 'selectCampingAreaForPlan', id: marker.id ? marker.id : null, latitude: marker.lat, longitude: marker.lng, name: (marker.name || ''), areaType: (marker.typeLabel || '') }))}" style="width:100%; padding:8px 10px; background:#059669; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:13px;">Bu kampı seç</button>
                </div>
              ` : ''}
              </div>
            </div>
            </div>
          \`);
            // Marker referansını diziye ekle
            // Popup açılıp kapandığında React Native'e bildir
            marker${idx}.on('popupopen', function() {
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type: 'popupopen'}));
            });
            marker${idx}.on('popupclose', function() {
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type: 'popupclose'}));
            });
            markerRefs.push({ marker: marker${idx}, lat: ${marker.lat}, lng: ${marker.lng} });
          `).join('')}
          }
          
          // Popup açma fonksiyonu - arama sonucundan haritaya geçişte kullanılır
          window.openMarkerPopup = function(lat, lng) {
            var found = markerRefs.find(function(m) {
              return Math.abs(m.lat - lat) < 0.0001 && Math.abs(m.lng - lng) < 0.0001;
            });
            if (found) {
              map.setView([lat, lng], 16);
              setTimeout(function() {
                found.marker.openPopup();
              }, 500);
            }
          };
          
          // Mevcut konuma kamp alanı ekleme fonksiyonu
          window.addCampingAreaHere = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'addCampingAreaAtCurrentLocation',
                latitude: ${currentLocation.coords.latitude},
                longitude: ${currentLocation.coords.longitude}
              }));
            }
          };
          
          // Kamp alanı detay açma fonksiyonu
          window.openCampingAreaDetail = function(lat, lng) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'campingAreaClicked',
                latitude: lat,
                longitude: lng
              }));
            }
          };
          
          // Google Maps yol tarifi açma fonksiyonu
          window.openGoogleMaps = function(lat, lng) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'openGoogleMaps',
                latitude: lat,
                longitude: lng
              }));
            }
          };
          
          // Yandex Maps yol tarifi açma fonksiyonu
          window.openYandexMaps = function(lat, lng) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'openYandexMaps',
                latitude: lat,
                longitude: lng
              }));
            }
          };

          // Açılır menü fonksiyonları (HTML dışında, script bloğunda olmalı)
          window.toggleMapMenu = function(btn, lat, lng) {
            // Diğer açık menüleri kapat
            document.querySelectorAll('.map-menu').forEach(function(menu) { menu.style.display = 'none'; });
            var menu = btn.nextElementSibling;
            if (menu) {
              menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
            }
            // Dışarı tıklanınca menüyü kapat
            setTimeout(function() {
              document.addEventListener('click', hideMenuOnClick, { once: true });
            }, 10);
            function hideMenuOnClick(e) {
              if (!menu.contains(e.target) && e.target !== btn) {
                menu.style.display = 'none';
              }
            }
          };
          window.hideMapMenu = function(child) {
            var menu = child.closest('.map-menu');
            if (menu) menu.style.display = 'none';
          };

          // Delegated click handler for select-for-plan buttons (avoid inline onclick parsing issues)
          document.addEventListener('click', function(e) {
            try {
              var btn = (e.target && e.target.closest) ? e.target.closest('.select-for-plan-btn') : null;
              if (!btn) return;
              var payload = btn.getAttribute('data-payload');
              if (!payload) return;
              try {
                var decoded = decodeURIComponent(payload);
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(decoded);
                } else {
                  console.log('select-for-plan payload:', decoded);
                }
              } catch (err) {
                console.warn('select-for-plan decode error', err);
              }
            } catch (err) {
              console.warn('select-for-plan click handler error', err);
            }
          });
        </script>
      </body>
      </html>
    `;
  };

  // HTML çıktısını memoize et - gereksiz re-render'ları önle
  const mapHTML = useMemo(() => {
    return generateMapHTML();
  }, [location, filteredCampingAreas, mapMoveQuery, isLocationPickerMode, selectForPlanMode, isConnected, favorites]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'selectCampingAreaForPlan') {
        try {
          // bulabiliyorsak detaylı area bilgisini al
          const area = filteredCampingAreas.find((a: any) => String(a.id) === String(data.id));
          const raw = {
            id: data.id,
            latitude: data.latitude,
            longitude: data.longitude,
            name: data.name || (area ? area.name : undefined),
            areaType: data.areaType || (area ? (area.tags?.type || area.type) : undefined),
            gotoStep: 3,
          };
          // Normalize for event consumers: ensure `type` holds area type (camp-plan expects payload.type)
          const eventPayload = { ...raw, type: raw.areaType };
          // Persist pending selection so camp-plan reads it if event is missed
          (async () => {
            try {
              await AsyncStorage.setItem('campPlanPendingSelected', JSON.stringify(eventPayload));
            } catch (e) {}
            try { eventBus.emit('camp-plan:selectedArea', eventPayload); } catch (e) {}
            // seçim modu kapat
            setSelectForPlanMode(false);
            try { eventBus.emit('camp-plan:modeActive', { active: false }); } catch {}
            // Haritadan camp-plan sayfasına geri dön
            try { router.push('/camp-plan'); } catch (e) {}
          })();
        } catch (e) {
          console.warn('[MapScreen] selectCampingAreaForPlan hata', e);
        }
        return;
      }
      if (data.type === 'locationSelected') {
        // Guest kullanıcı için limit kontrolü
        if (isGuest && !canAddMoreAreas) {
          Alert.alert(
            'Kamp Alanı Limiti',
            `Guest kullanıcılar en fazla ${GUEST_LIMIT} kamp alanı oluşturabilir. Premium abonelik ile sınırsız kamp alanı oluşturabilirsiniz.`,
            [
              { text: 'Tamam', style: 'cancel' },
              { 
                text: 'Premium Ol!', 
                onPress: () => router.push('/premium' as any),
                style: 'default'
              }
            ]
          );
          setIsLocationPickerMode(false);
          return;
        }
        
        setSelectedLocation({
          latitude: data.latitude,
          longitude: data.longitude
        });
        setIsLocationPickerMode(false);
        if (isMounted.current && !syncProgress.isLoading) setShowAddModal(true);
      } else if (data.type === 'addCampingAreaAtCurrentLocation') {
        // Guest kullanıcı için limit kontrolü
        if (isGuest && !canAddMoreAreas) {
          Alert.alert(
            'Kamp Alanı Limiti',
            `Guest kullanıcılar en fazla ${GUEST_LIMIT} kamp alanı oluşturabilir. Premium abonelik ile sınırsız kamp alanı oluşturabilirsiniz.`,
            [
              { text: 'Tamam', style: 'cancel' },
              { 
                text: 'Premium Ol!', 
                onPress: () => router.push('/premium' as any),
                style: 'default'
              }
            ]
          );
          return;
        }
        
        setSelectedLocation({
          latitude: data.latitude,
          longitude: data.longitude
        });
        if (isMounted.current && !syncProgress.isLoading) setShowAddModal(true);
      } else if (data.type === 'campingAreaClicked') {
        const area = filteredCampingAreas.find((a: any) =>
          Math.abs(a.latitude - data.latitude) < 0.0001 &&
          Math.abs(a.longitude - data.longitude) < 0.0001
        );
        if (area && isMounted.current) {
          setSelectedCampingArea(area as CampingArea);
          setShowDetailModal(true);
        }
      } else if (data.type === 'toggleFavorite') {
        const area = filteredCampingAreas.find((a: any) =>
          Math.abs(a.latitude - data.latitude) < 0.0001 &&
          Math.abs(a.longitude - data.longitude) < 0.0001
        );
        if (area) {
          handleToggleFavorite(area as CampingArea);
        }
      } else if (data.type === 'openGoogleMaps') {
        openGoogleMapsNavigation(data.latitude, data.longitude);
      } else if (data.type === 'openYandexMaps') {
        openYandexMapsNavigation(data.latitude, data.longitude);
      } else if (data.type === 'mapMoved') {
        setMapCenter({ latitude: data.latitude, longitude: data.longitude });
        if (location && (Math.abs(location.coords.latitude - data.latitude) > 0.01 || Math.abs(location.coords.longitude - data.longitude) > 0.01)) {
          setShowMapMoveButton(true);
        } else {
          setShowMapMoveButton(false);
        }
      } else if (data.type === 'popupopen') {
        setShowMapPopup(true);
      } else if (data.type === 'popupclose') {
        setShowMapPopup(false);
      } else if (data.type === 'requestCachedTile') {
        // Offline modda cache'den tile iste
        (async () => {
          try {
            const cachedTile = await getCachedTile(data.z, data.x, data.y);
            // WebView'a yanıt gönder - hızlıca callback tetikle
            if (isMounted.current && webViewRef.current) {
              const script = `
                if (window.tileCacheCallback_${data.requestId}) {
                  window.tileCacheCallback_${data.requestId}(${cachedTile ? `"${cachedTile}"` : 'null'});
                }
                true;
              `;
              webViewRef.current.injectJavaScript(script);
            }
          } catch (error) {
            // Hata durumunda da callback'i tetikle (null ile)
            if (__DEV__) console.error('[MapTileCache] Cache okuma hatası:', error);
            if (isMounted.current && webViewRef.current) {
              const script = `
                if (window.tileCacheCallback_${data.requestId}) {
                  window.tileCacheCallback_${data.requestId}(null);
                }
                true;
              `;
              webViewRef.current.injectJavaScript(script);
            }
          }
        })();
      } else if (data.type === 'cacheTile') {
        // Online modda tile'ı cache'le
        if (isConnected) {
          (async () => {
            try {
              await cacheTile(data.z, data.x, data.y);
            } catch (error) {
              if (__DEV__) console.error('[MapTileCache] Cache yazma hatası:', error);
            }
          })();
        }
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  const startLocationPicker = () => {
    if (!isMounted.current) return;
    
    // Guest kullanıcı için limit kontrolü
    if (isGuest && !canAddMoreAreas) {
      Alert.alert(
        'Kamp Alanı Limiti',
        `Guest kullanıcılar en fazla ${GUEST_LIMIT} kamp alanı oluşturabilir. Premium abonelik ile sınırsız kamp alanı oluşturabilirsiniz.`,
        [
          { text: 'Tamam', style: 'cancel' },
          { 
            text: 'Premium Ol!', 
            onPress: () => router.push('/premium' as any),
            style: 'default'
          }
        ]
      );
      return;
    }
    
    setSelectedLocation(null);
    setIsLocationPickerMode(true);
  };

  const cancelLocationPicker = () => {
    if (!isMounted.current) return;
    setIsLocationPickerMode(false);
    setSelectedLocation(null);
    setSelectForPlanMode(false);
    try { eventBus.emit('camp-plan:modeActive', { active: false }); } catch {}
  };

  const addCampingAreaAtCurrentLocation = () => {
    if (!isMounted.current) return;
    
    // Guest kullanıcı için limit kontrolü
    if (isGuest && !canAddMoreAreas) {
      Alert.alert(
        'Kamp Alanı Limiti',
        `Guest kullanıcılar en fazla ${GUEST_LIMIT} kamp alanı oluşturabilir. Premium abonelik ile sınırsız kamp alanı oluşturabilirsiniz.`,
        [
          { text: 'Tamam', style: 'cancel' },
          { 
            text: 'Premium Ol!', 
            onPress: () => router.push('/premium' as any),
            style: 'default'
          }
        ]
      );
      return;
    }
    
      if (location) {
      setSelectedLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });
      if (!syncProgress.isLoading) setShowAddModal(true);
    }
  };

  const handleEditCampingArea = (area: CampingArea) => {
    setSelectedCampingArea(area);
    setShowDetailModal(false);
    setShowEditModal(true);
  };

  const handleDeleteCampingArea = async (area: CampingArea) => {
    const areaId = (area as any).id;
    console.log('🗑️ handleDeleteCampingArea called for:', area.name, 'ID:', areaId);
    setShowDetailModal(false);
    // Silme sonrası localde gerçekten silinmiş mi kontrol et
    setTimeout(async () => {
      console.log('🔄 Refreshing data after deletion');
      await refreshData();
      try {
        const allAreas = await getDatabase().getAllCampingAreas();
        const exists = allAreas.some(a => (a as any).id === areaId);
        if (exists) {
          console.log(`[DEBUG] Silinen alan localde HÂLÂ mevcut! ID: ${areaId}`);
        } else {
          console.log(`[DEBUG] Silinen alan localde YOK. ID: ${areaId}`);
        }
      } catch (e) {
        console.log('[DEBUG] Silinen alanı kontrol ederken hata:', e);
      }
    }, 500);
  };

  const handleToggleFavorite = (area: CampingArea) => {
    toggleFavorite(area);
    // Favoriler listesini güncellemek için bir callback ekleyelim
  };

  const toggleFavorite = async (area: CampingArea) => {
    try {
    const isFav = favorites.has((area as any).id);
      
      if (isFav) {
  await getDatabase().removeFromFavorites(Number((area as any).id));
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete((area as any).id);
          return newSet;
        });
        console.log('Removed from favorites:', area.name);
      } else {
  await getDatabase().addToFavorites(Number((area as any).id));
  setFavorites(prev => new Set(prev).add((area as any).id));
  console.log('Added to favorites:', area.name);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Hata', 'Favori durumu değiştirilemedi.');
    }
  };

  const handlePlanCamp = () => {
    router.push('/camp-plan');
  };

  const openGoogleMapsNavigation = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    Linking.openURL(url).catch(err => {
      console.error('Google Maps açılamadı:', err);
      Alert.alert('Hata', 'Google Maps uygulaması açılamadı');
    });
  };

  const openYandexMapsNavigation = (latitude: number, longitude: number) => {
    const url = `yandexmaps://maps.yandex.com/?rtext=~${latitude},${longitude}&rtt=auto`;
    Linking.openURL(url).catch(err => {
      console.error('Yandex Maps açılamadı, web versiyonunu deniyor:', err);
      // Fallback to web version
      const webUrl = `https://yandex.com/maps/?rtext=~${latitude},${longitude}&rtt=auto`;
      Linking.openURL(webUrl).catch(webErr => {
        console.error('Yandex Maps web versiyonu da açılamadı:', webErr);
        Alert.alert('Hata', 'Yandex Maps uygulaması açılamadı');
      });
    });
  };

  // Liste görünümü için navigasyon wrapper fonksiyonları
  const handleNavigateFromList = (area: CampingArea, provider: 'google' | 'yandex') => {
    const latitude = (area as any).latitude;
    const longitude = (area as any).longitude;
    if (provider === 'google') {
      openGoogleMapsNavigation(latitude, longitude);
    } else {
      openYandexMapsNavigation(latitude, longitude);
    }
  };


  // Yükleme sırasında tüm işlemleri devre dışı bırakmak için bir state
  const isBusy = loading;

  // Loader animasyonu için
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Manuel senkronizasyon için ref - Hook kuralları gereği erken return'den önce tanımlanmalı
  const lastManualSyncRef = useRef<number>(0);

  useEffect(() => {
    let loopAnim: Animated.CompositeAnimation | null = null;
    if (isBusy) {
      loopAnim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopAnim.start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
    return () => {
      if (loopAnim) loopAnim.stop();
    };
  }, [isBusy]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Manuel senkronizasyon fonksiyonu (dakikada 1 kez) - Erken return'den önce tanımlanmalı
  const handleManualSync = async () => {
    const now = Date.now();
    if (now - lastManualSyncRef.current < 60000) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('Lütfen tekrar denemeden önce 1 dakika bekleyin.', ToastAndroid.SHORT);
      } else {
        Alert.alert('Çok sık istek', 'Lütfen tekrar denemeden önce 1 dakika bekleyin.');
      }
      return;
    }
    lastManualSyncRef.current = now;
    try {
      // Konum kontrolü - manuel sync başında da kontrol et
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const newLocation = await Location.getCurrentPositionAsync({});
          if (newLocation && newLocation.coords) {
            // Mevcut konum ile yeni konum arasında anlamlı fark varsa (>0.01 derece ~1km)
            if (location && (Math.abs(location.coords.latitude - newLocation.coords.latitude) > 0.01 || 
                Math.abs(location.coords.longitude - newLocation.coords.longitude) > 0.01)) {
              console.log('[MANUAL SYNC] Konum değişti, harita güncelleniyor...');
              setMapMoveQuery(null); // Haritayı yeni konuma döndür
            }
          }
        }
      } catch (e) {
        console.warn('[MANUAL SYNC] Konum kontrolü hatası:', e);
      }

      if (!isConnected) {
        if (Platform.OS === 'android') {
          ToastAndroid.show('Çevrimdışı: Sadece yerel veriler güncellendi.', ToastAndroid.SHORT);
        } else {
          Alert.alert('Çevrimdışı', 'Sadece yerel veriler güncellendi.');
        }
        await refreshData();
        setMapKey(prev => prev + 1); // Haritayı yenile
        return;
      }

      // Senkronizasyon zaten çalışıyorsa uyarı gösterme
      if (isSyncingRef.current) {
        if (__DEV__) console.log('[MANUAL SYNC] Zaten bir sync işlemi devam ediyor, tekrar başlatılmayacak.');
        return;
      }
      isSyncingRef.current = true;
      // Sadece burada uyarı göster
      if (Platform.OS === 'android') {
        ToastAndroid.show('Veriler güncelleniyor...', ToastAndroid.SHORT);
      } else {
        Alert.alert('Senkronizasyon', 'Veriler güncelleniyor...');
      }
      // Önce local veriyi güncelle, UI hemen güncellensin
      await refreshData();
      setMapKey(prev => prev + 1); // Haritayı yenile
      // Sunucu eşitlemesini arka planda başlat
      (async () => {
        try {
          const token = await getToken();
          if (token && user?.id) {
            if (__DEV__) console.log('[DEBUG][PROGRESS] Manuel sync başlıyor...');
            setSyncProgress({ current: 0, total: 0, isLoading: true });
            await syncAll({ 
              userId: user.id,
              onProgress: (current, total) => {
                if (__DEV__) console.log('[DEBUG][PROGRESS] Manuel progress:', current, '/', total);
                setSyncProgress({ current, total, isLoading: true });
              }
            });
            if (__DEV__) console.log('[DEBUG][PROGRESS] Manuel sync tamamlandı');
            setSyncProgress({ current: 0, total: 0, isLoading: false });
          }
          // Eşitleme sonrası local veriyi tekrar güncelle (opsiyonel)
          await refreshData();
          setMapKey(prev => prev + 1); // Haritayı tekrar yenile
        } catch (e) {
          console.error('Arka planda senkronizasyon hatası:', e);
        } finally {
          isSyncingRef.current = false;
        }
      })();
    } catch (e) {
      Alert.alert('Hata', 'Senkronizasyon sırasında bir hata oluştu.');
      isSyncingRef.current = false;
    }
  };

  // Harita merkezine göre kamp alanlarını gösteren butonun fonksiyonu
  const handleShowMapMoveResults = () => {
    if (mapCenter) {
      setMapMoveQuery(mapCenter);
      setShowMapMoveButton(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['left','right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshData}>
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Yükleme sırasında sayfa yarı saydam değil, dokunma engeli yok
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <HelpModal visible={helpVisible} onClose={() => {
        if (isMounted.current) setHelpVisible(false);
      }} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kamp Alanları</Text>
        <View style={styles.headerActions}>
          {/* Görünüm Değiştirme Butonu */}
          <TouchableOpacity
            style={[styles.actionButton, (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }, syncProgress.isLoading && { opacity: 0.4 }]}
            onPress={() => {
              if (syncProgress.isLoading) {
                return;
              }
              if (!isConnected && !user?.offline_enabled) {
                Alert.alert(
                  'Offline Özellik Gerekli',
                  'Liste görünümü için Premium aboneliğe ihtiyacınız var.',
                  [
                    { text: 'İptal', style: 'cancel' },
                    { 
                      text: 'Premium Ol', 
                      onPress: () => router.push('/premium' as any),
                      style: 'default'
                    }
                  ]
                );
                return;
              }
                if (isMounted.current) {
                // Liste → Harita geçişinde paylaşılan kamp alanı listesini sıfırla
                if (viewMode === 'list' && notificationCampingAreas) {
                  setNotificationCampingAreas(null);
                }
                changeViewMode(viewMode === 'map' ? 'list' : 'map');
              }
            }}
            disabled={isBusy || (!isConnected && !user?.offline_enabled) || syncProgress.isLoading}
          >
            {viewMode === 'map' ? (
              <List size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
            ) : (
              <Map size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }, syncProgress.isLoading && { opacity: 0.4 }]}
            onPress={async () => {
              if (syncProgress.isLoading) {
                return;
              }
              if (!isConnected && !user?.offline_enabled) {
                Alert.alert(
                  'Offline Özellik Gerekli',
                  'Arama özelliği için Premium aboneliğe ihtiyacınız var.',
                  [
                    { text: 'İptal', style: 'cancel' },
                    { 
                      text: 'Premium Ol', 
                      onPress: () => router.push('/premium' as any),
                      style: 'default'
                    }
                  ]
                );
                return;
              }
              if (!isMounted.current) return;
              try {
                const allAreas = await getDatabase().getAllCampingAreas();
                if (isMounted.current) {
                  setSearchAllAreas(Array.isArray(allAreas) ? allAreas : []);
                  setViewMode('search');
                }
              } catch {
                if (isMounted.current) {
                  setSearchAllAreas([]);
                }
              }
            }}
            disabled={isBusy || (!isConnected && !user?.offline_enabled) || syncProgress.isLoading}
          >
            <Feather name="search" size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }, syncProgress.isLoading && { opacity: 0.4 },
              (() => {
                const isFilterActive =
                  turkeyWideKeys.length > 0 ||
                  selectedTags.length < campingTypes.length ||
                  selectedFilters.length < FILTERS.filter(f => f.visible).length;
                return isFilterActive ? { backgroundColor: '#059669' } : undefined;
              })()
            ]}
            onPress={() => {
              if (syncProgress.isLoading) {
                return;
              }
              if (!isConnected && !user?.offline_enabled) {
                Alert.alert(
                  'Offline Özellik Gerekli',
                  'Filtre özelliği için Premium aboneliğe ihtiyacınız var.',
                  [
                    { text: 'İptal', style: 'cancel' },
                    { 
                      text: 'Premium Ol', 
                      onPress: () => router.push('/premium' as any),
                      style: 'default'
                    }
                  ]
                );
                return;
              }
              if (isMounted.current) setShowFilters(!showFilters);
            }}
            disabled={isBusy || (!isConnected && !user?.offline_enabled) || syncProgress.isLoading}
          >
            {(() => {
              const disabled = !isConnected && !user?.offline_enabled;
              const isFilterActive =
                turkeyWideKeys.length > 0 ||
                selectedTags.length < campingTypes.length ||
                selectedFilters.length < FILTERS.filter(f => f.visible).length;
              return (
                <View style={{ position: 'relative' }}>
                  <Filter size={20} color={disabled ? '#9ca3af' : isFilterActive ? '#fff' : '#059669'} />
                  {isFilterActive && !disabled && (
                    <View style={{
                      position: 'absolute', top: -4, right: -4,
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: '#f97316',
                      borderWidth: 1, borderColor: '#fff',
                    }} />
                  )}
                </View>
              );
            })()}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              (isFullSyncInProgressRef.current || syncProgress.isLoading) && { opacity: 0.4 }
            ]}
            onPress={
              isBusy || isFullSyncInProgressRef.current || syncProgress.isLoading
                ? undefined
                : handleManualSync
            }
            accessibilityLabel="Manuel Senkronize Et"
            disabled={isBusy || isFullSyncInProgressRef.current || syncProgress.isLoading}
          >
            {isBusy || isFullSyncInProgressRef.current || syncProgress.isLoading ? (
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <RefreshCw size={20} color="#ef4444" />
              </Animated.View>
            ) : (
              !isConnected ? (
                <OfflineSyncIcon width={24} height={24} color="#010101" />
              ) : (
                <RefreshCw size={20} color="#059669" />
              )
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <CampingAreaFilters
            userFilters={FILTERS}
            selectedUserFilters={selectedFilters}
            selectedCampingTypes={selectedTags}
            onUserFilterToggle={toggleCustomFilter}
            onCampingTypeToggle={toggleTagFilter}
            onToggleAllCampingTypes={toggleAllCampingTypes}
            onClose={() => {
              if (isMounted.current) setShowFilters(false);
            }}
            disabled={isBusy}
            filteredAreas={filteredCampingAreas}
            userId={user?.id}
            turkeyWideFilters={turkeyWideKeys}
            onTurkeyWideToggle={toggleTurkeyWide}
            isOffline={!isConnected}
            isPremium={!!(user?.isPremium || user?.offline_enabled)}
          />
        </View>
      )}
      {/* Bildirim Barı - Filtre satırının hemen altında */}
      {showNotificationBar && Array.isArray(notifications) && notifications.length > 0 && (
        <Animated.View style={[styles.notificationBar, {
          opacity: notificationBarAnim,
          backgroundColor:
            notifications[notificationIndex]?.type === 'announcement'
              ? '#2563eb'
              : notifications[notificationIndex]?.type === 'friend_request'
                ? '#059669'
                : notifications[notificationIndex]?.type === 'checklist_share'
                  ? '#f59e42'
                  : notifications[notificationIndex]?.type === 'camping_area_share'
                    ? '#8b5cf6'
                    : '#f59e42',
        }]}> 
          <TouchableOpacity style={styles.notificationContent} onPress={() => notifications[notificationIndex]?.goto()}>
            {notifications[notificationIndex]?.type === 'friend_request' ? (
              <UserPlus size={20} color="#fff" style={{ marginRight: 8 }} />
            ) : notifications[notificationIndex]?.type === 'checklist_share' ? (
              <List size={20} color="#fff" style={{ marginRight: 8 }} />
            ) : notifications[notificationIndex]?.type === 'camping_area_share' ? (
              <MapPin size={20} color="#fff" style={{ marginRight: 8 }} />
            ) : (
              <Binoculars size={20} color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={[styles.notificationText, { color: '#fff' }]}>{notifications[notificationIndex]?.message}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      {/* Sync Progress Bar - Menü barının hemen altında */}
      {(() => {
        if (__DEV__ && (syncProgress.isLoading || syncProgress.total > 0)) {
          console.log('[DEBUG][PROGRESS] Render check:', JSON.stringify(syncProgress));
        }
        return null;
      })()}
      {syncProgress.isLoading && syncProgress.total > 0 && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View 
              style={[
                styles.progressBarFill,
                { width: `${Math.min((syncProgress.current / syncProgress.total) * 100, 100)}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {syncProgress.total > 100 
              ? `${syncProgress.current} / ${syncProgress.total} kamp alanı yükleniyor...`
              : 'Senkronizasyon tamamlanıyor'}
          </Text>
          {syncProgress.total > 100 && (
            <Text style={styles.progressSubText}>
               Pasif sekmeler eşitleme sonrası aktif olacaktır.
            </Text>
          )}
        </View>
      )}
      {/* Senkronizasyon sırasında üstte uyarı banner'ı (sadece ekrana dokunulunca 2sn görünür) */}
      {showSyncBanner && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncBannerText}>🔄 Lütfen senkronizasyonun tamamlanmasını bekleyin</Text>
        </View>
      )}
      {/* Offline Mode Banner */}
      {!isConnected && (
        <View style={[styles.offlineBanner, !user?.offline_enabled && { paddingVertical: 12 }]}>
          <Text style={styles.offlineBannerText}>
            {user?.offline_enabled 
              ? '📵 Offline Mod - Cache\'lenmiş harita gösteriliyor' 
              : <>📵 Offline mod için <Text style={{fontWeight: 'bold', fontStyle: 'italic'}}>Premium</Text> aboneliği gerekmektedir.</>}
          </Text>
          {!user?.offline_enabled && (
            <TouchableOpacity
              style={styles.premiumButton}
              onPress={() => router.push('/premium' as any)}
            >
              <Text style={styles.premiumButtonText}>Premium Ol!</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Location Picker Mode Banner */}
      {isLocationPickerMode && (
        <View style={styles.locationPickerBanner} pointerEvents={isBusy ? 'none' : 'auto'}>
          <View style={{ flex: 1, flexDirection: 'column' }}>
            <Text style={styles.locationPickerText}>📍 Haritada konum seçmek için tıklayın</Text>
            {isGuest && (
              <Text style={{ fontSize: 12, color: remainingAreas <= 3 ? '#dc2626' : '#6b7280', marginTop: 6 }}>
                Kalan kamp alanı hakkı: {remainingAreas}/{GUEST_LIMIT}
              </Text>
            )}
          </View>
          {isGuest && (
            <TouchableOpacity
              style={{
                backgroundColor: '#059669',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                marginRight: 8,
              }}
              onPress={() => {
                cancelLocationPicker();
                router.push('/premium' as any);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Premium Ol!</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.cancelLocationPicker}
            onPress={cancelLocationPicker}
                       disabled={isBusy}
          >
            <Text style={styles.cancelLocationPickerText}>İptal</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Ana İçerik - Harita, Liste veya Arama Görünümü */}
      {viewMode === 'search' ? (
        /* Arama Görünümü */
        <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <CampingAreaSearchBar
            campingAreas={searchAllAreas}
            campTypeFilter={selectForPlanMode ? (selectedTags?.[0] ?? null) : null}
            onSelect={area => {
              setSearchSelectedArea(area);
              setShowDetailModal(true);
              setSelectedCampingArea(area);
            }}
            onShowOnMap={area => {
              const lat = (area as any).latitude;
              const lng = (area as any).longitude;
              if (lat && lng) {
                const timeoutId1 = setTimeout(() => {
                  if (!isMounted.current) return;
                  setMapCenter({ latitude: lat, longitude: lng });
                  setMapMoveQuery({ latitude: lat, longitude: lng });
                  changeViewMode('map');
                  // Haritaya geçtikten sonra popup'ı aç
                  const timeoutId2 = setTimeout(() => {
                    if (!isMounted.current) return;
                    safeInjectJavaScript(`
                      if (window.openMarkerPopup) {
                        window.openMarkerPopup(${lat}, ${lng});
                      }
                      true;
                    `, 'ListViewPopup');
                  }, 1000);
                  timeoutRefs.current.push(timeoutId2);
                }, 100);
                timeoutRefs.current.push(timeoutId1);
              }
            }}
            user={user}
            isGuest={isGuest}
            isConnected={isConnected}
          />
          <TouchableOpacity onPress={() => {
            if (isMounted.current) changeViewMode('map');
          }} style={{ alignSelf: 'center', marginTop: 16, backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Haritaya Dön</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'map' ? (
        <>
          {/* Map */}
          <View style={styles.mapContainer} pointerEvents="auto">
            <WebView
              key={`map-${mapKey}`}
              ref={webViewRef}
              source={{ html: mapHTML }}
              style={styles.map}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onMessage={handleWebViewMessage}
              onLoadStart={() => {
                if (isMounted.current) {
                  setIsWebViewReady(false);
                }
              }}
              onLoadEnd={() => {
                if (isMounted.current) {
                  setIsWebViewReady(true);
                }
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.warn('[WebView] Error:', nativeEvent);
                if (isMounted.current) {
                  setIsWebViewReady(false);
                }
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.warn('[WebView] HTTP Error:', nativeEvent.statusCode);
              }}
              onRenderProcessGone={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('[WebView] Render process gone:', nativeEvent.didCrash);
                // WebView crash oldu, yeniden yükle
                if (isMounted.current) {
                  setIsWebViewReady(false);
                  setTimeout(() => {
                    if (isMounted.current) {
                      setMapKey(prev => prev + 1);
                    }
                  }, 100);
                }
              }}
              pointerEvents={(!user?.offline_enabled && !isConnected) ? 'none' : 'auto'}
            />
            {/* BLUR OVERLAY: Premium değilse ve offline ise harita üstüne blur ve dokunmatik engel */}
            {(!user?.offline_enabled && !isConnected) && (
              <BlurOverlay visible onPremiumPress={() => router.push('/premium' as any)} />
            )}
            {/* Harita kaydırıldığında çıkan buton */}
            {showMapMoveButton && mapCenter && !isLocationPickerMode && !showMapPopup && (
              <View style={styles.mapMoveButtonContainer} pointerEvents="box-none">
                <TouchableOpacity 
                  style={[
                    styles.fab, 
                    styles.fabBinoculars, 
                    (!user?.offline_enabled && !isConnected) && { opacity: 0.4 },
                    syncProgress.isLoading && { opacity: 0.4 }
                  ]} 
                  onPress={() => {
                    if (syncProgress.isLoading) {
                      return;
                    }
                    if (!isConnected && !user?.offline_enabled) {
                      Alert.alert(
                        'Offline Özellik Gerekli',
                        'Bu arama özelliği için Premium aboneliğe ihtiyacınız var.',
                        [
                          { text: 'İptal', style: 'cancel' },
                          { 
                            text: 'Premium Ol', 
                            onPress: () => router.push('/premium' as any),
                            style: 'default'
                          }
                        ]
                      );
                      return;
                    }
                    handleShowMapMoveResults();
                  }}
                  disabled={(!isConnected && !user?.offline_enabled) || syncProgress.isLoading}
                >
                  <Binoculars size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Floating Action Buttons */}
          {!isLocationPickerMode && !showMapPopup && (
            <View style={styles.fabContainer} pointerEvents={(isBusy || syncProgress.isLoading) ? 'none' : 'auto'}>
              <TouchableOpacity
                style={[styles.fab, styles.fabSecondary, (isBusy || syncProgress.isLoading) ? { opacity: 0.45 } : {}]}
                onPress={() => {
                  if (isMounted.current && !syncProgress.isLoading) setIsLocationPickerMode(true);
                }}
                disabled={isBusy || syncProgress.isLoading}
              >
                <Plus size={28} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fab, (isBusy || syncProgress.isLoading) ? { opacity: 0.45 } : {}]}
                onPress={handleShowCurrentLocation}
                disabled={isBusy || syncProgress.isLoading}
              >
                <LocateFixed size={24} color="white" />
              </TouchableOpacity>
            </View>
          )}

            {/* Camp Plan compact overlay: small back/next/close and step title under header */}
            {selectForPlanMode && (
              <View style={styles.planOverlayCompact} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.compactBtn}
                  onPress={() => {
                    (async () => {
                      try { await AsyncStorage.setItem('campPlanPendingStep', JSON.stringify({ step: 1 })); } catch (e) {}
                      try { eventBus.emit('camp-plan:mapBack'); } catch {}
                      setSelectForPlanMode(false);
                      try { router.push('/camp-plan'); } catch (e) {}
                    })();
                  }}
                >
                  <ArrowLeft size={18} color="#374151" />
                </TouchableOpacity>

                <Text style={styles.compactTitle}>Adım 3 / 5 — Kamp Alanı Seçimi</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.compactBtn}
                    onPress={() => {
                      (async () => {
                        try { await AsyncStorage.setItem('campPlanPendingStep', JSON.stringify({ step: 3 })); } catch (e) {}
                        try { eventBus.emit('camp-plan:mapNext'); } catch {}
                        setSelectForPlanMode(false);
                        try { eventBus.emit('camp-plan:modeActive', { active: false }); } catch {}
                        try { router.push('/camp-plan'); } catch (e) {}
                      })();
                    }}
                  >
                    <ArrowRight size={18} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.compactBtn}
                    onPress={() => {
                        (async () => {
                          try {
                            await AsyncStorage.removeItem('campPlanPendingOpen');
                            await AsyncStorage.removeItem('campPlanPendingStep');
                            await AsyncStorage.removeItem('campPlanPendingSelected');
                          } catch (e) {}
                          // Restore previous filters/map if we saved them
                          try {
                            if (prevSelectedTagsRef.current) {
                              if (prevSelectedTagsRef.current) {
                                setSelectedTags(prevSelectedTagsRef.current as any[]);
                              }
                              prevSelectedTagsRef.current = null;
                            }
                            if (prevMapMoveQueryRef.current) {
                              setMapMoveQuery(prevMapMoveQueryRef.current);
                              prevMapMoveQueryRef.current = null;
                            }
                            // Refresh data to reflect restored filters
                            if (refreshDataRef.current && typeof refreshDataRef.current === 'function') {
                              refreshDataRef.current();
                            }
                          } catch (e) {}
                          setSelectForPlanMode(false);
                          try { eventBus.emit('camp-plan:modeActive', { active: false }); } catch {}
                          try { router.replace('/'); } catch (e) {}
                        })();
                    }}
                  >
                    <X size={18} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

          {/* Konum İzni Butonu - Sadece izin verilmediğinde göster */}
          {(console.log('[DEBUG] Buton render koşulları:', {
            hasLocationPermission,
            isLocationPickerMode,
            showMapPopup,
            shouldRender: hasLocationPermission === false && !isLocationPickerMode && !showMapPopup
          }), hasLocationPermission === false && !isLocationPickerMode && !showMapPopup) && (
            <View style={styles.locationPermissionContainer} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.locationPermissionButton}
                onPress={() => {
                  console.log('[DEBUG] Konum izni butonu tıklandı, modal açılıyor');
                  setUserDismissedPermissionModal(false); // Kullanıcı tekrar izin istiyor
                  setLocationPermissionModalVisible(true);
                }}
                disabled={isBusy}
                activeOpacity={0.7}
              >
                <Navigation size={20} color="white" style={{ marginRight: 8 }} />
                <Text style={styles.locationPermissionText}>Konum İznini Aç</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Info Panel */}
          {!isLocationPickerMode && (
            <View style={styles.infoPanel} pointerEvents={(isBusy || syncProgress.isLoading) ? 'none' : 'auto'}>
              <View style={styles.infoPanelHeader}>
                <MapPin size={16} color="#059669" />
                <Text style={styles.infoPanelTitle}>
                  {Array.isArray(filteredCampingAreas) ? filteredCampingAreas.length : 0} kamp alanı yakınınızda
                </Text>
              </View>
              <View style={styles.infoPanelContent}>
                <Text style={styles.infoPanelSubtitle}>
                  {location ? 'Haritadaki işaretlere dokunarak detayları görün' : 'Konum bilgisi alınıyor...'}
            </Text>
            {location && (
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[styles.planCampButton, (isBusy || syncProgress.isLoading) ? { opacity: 0.6 } : {}]}
                  onPress={handlePlanCamp}
                  disabled={isBusy || syncProgress.isLoading}
                >
                  {hasDraftPlan && <View style={styles.draftDot} />}
                  <Calendar size={14} color="#7c3aed" />
                  <Text style={styles.planCampButtonText}>Kamp Planla</Text>
                  {planCount > 0 && (
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>{planCount > 99 ? '99+' : String(planCount)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.currentLocationButton, (isBusy || syncProgress.isLoading) ? { opacity: 0.6 } : {}]}
                  onPress={addCampingAreaAtCurrentLocation}
                  disabled={isBusy || syncProgress.isLoading}
                >
                  <Plus size={14} color="#059669" />
                  <Text style={styles.currentLocationButtonText}>Mevcut Konuma Ekle</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {__DEV__ && (
            <Text style={styles.debugText}>Debug modu aktif</Text>
          )}
        </View>
      )}
        </>
      ) : (
        /* Liste Görünümü */
        <View style={{ flex: 1 }}>
          <CampingAreaListView
            campingAreas={notificationCampingAreas ?? filteredCampingAreas}
            isCampPlanMode={selectForPlanMode}
            onSelectArea={(area) => {
              if (!isMounted.current) return;
              if (syncProgress.isLoading) return;
              // Bildirim kaynaklı özel liste açık ise kapat
              if (notificationCampingAreas) setNotificationCampingAreas(null);
              setSelectedCampingArea(area);
              setShowDetailModal(true);
            }}
            onNavigate={handleNavigateFromList}
            currentLocation={location?.coords}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            disabled={syncProgress.isLoading}
            isGuest={isGuest}
            isConnected={isConnected}
          />
        </View>
      )}

      <AddCampingAreaModal
        visible={showAddModal}
        onClose={() => {
          if (isMounted.current) {
            setShowAddModal(false);
            setIsLocationPickerMode(false); // FAB'lerin tekrar görünmesini sağla
            setShowMapPopup(false);
          }
        }}
        initialLocation={selectedLocation ?? undefined}
        user={user}
        isGuest={isGuest}
        remainingAreas={remainingAreas}
        guestLimit={GUEST_LIMIT}
        onSuccess={async () => {
          // refreshData ile birlikte local olarak da ekle
          await refreshData();
          // Son eklenen alanı local veritabanından bulup state'e ekle
          try {
            const allAreas = await getDatabase().getAllCampingAreas();
            // Son eklenen alanı bul (en son eklenen, isme ve koordinata göre)
            const lastAdded = Array.isArray(allAreas) && allAreas.length > 0 ? allAreas[allAreas.length - 1] : null;
            if (lastAdded) {
              // Eğer haritada yoksa, state'e ekle (örnek: filtreye uyan bir alan ise)
              // Bunu doğrudan refreshData sonrası state güncellemesiyle yapıyoruz
            }
          } catch (e) { /* ignore */ }
        }}
      />

      <CampingAreaDetailModal
        visible={showDetailModal}
        onClose={() => {
          if (isMounted.current) {
            setShowDetailModal(false);
            setIsLocationPickerMode(false);
            setShowMapPopup(false);
          }
        }}
        campingArea={(() => {
          if (!selectedCampingArea) return selectedCampingArea;
          const oh = selectedCampingArea.opening_hours;
          if (Array.isArray(oh)) {
            return selectedCampingArea;
          }
          if (typeof oh === 'string' && oh.trim().startsWith('[')) {
            try {
              const arr = JSON.parse(oh);
              if (Array.isArray(arr)) {
                return { ...selectedCampingArea, opening_hours: arr };
              }
            } catch {}
          }
          return selectedCampingArea;
        })()}
        onEdit={area => {
          if (!isMounted.current) return;
          setSelectedCampingArea(area);
          setShowDetailModal(false);
          setShowEditModal(true);
        }}
        onDelete={area => {
          if (!isMounted.current) return;
          setShowDetailModal(false);
          setTimeout(() => {
            if (isMounted.current) refreshData();
          }, 500);
        }}
        onToggleFavorite={handleToggleFavorite}
        isFavorite={selectedCampingArea ? favorites.has((selectedCampingArea as any).id) : false}
        onAddAtMap={(!isLocationPickerMode && location) ? (() => {
          if (!isMounted.current) return;
          setShowDetailModal(false);
          setTimeout(() => {
            if (isMounted.current) setIsLocationPickerMode(true);
          }, 300);
        }) : undefined}
        isSuperAdmin={isSuperAdmin}
        currentUserId={user?.id}
      />

      <EditCampingAreaModal
        visible={showEditModal}
        onClose={() => {
          if (isMounted.current) {
            setShowEditModal(false);
            setIsLocationPickerMode(false); // FAB'lerin tekrar görünmesini sağla
            setShowMapPopup(false);
          }
        }}
        campingArea={selectedCampingArea as any}
        onSuccess={async () => {
          setShowEditModal(false);
          setIsLocationPickerMode(false);
          setShowMapPopup(false);
          await refreshData();
          // Güncel veriyi doğrudan DB'den oku.
          // campingAreas closure'u bu noktada stale (eski) olduğundan .find() kullanmak
          // friend_user_ids gibi yeni yazılan alanların kaybolmasına yol açıyordu.
          if (selectedCampingArea) {
            try {
              const updated = await getDatabase().getCampingAreaById((selectedCampingArea as any).id);
              if (updated) setSelectedCampingArea(updated as any);
            } catch (_e) { /* ignore */ }
          }
          // React Native WebView source prop değişikliğine tepki vermez; yeni
          // görünürlük renginin haritaya yansıması için WebView'i yeniden mount et.
          setMapKey(prev => prev + 1);
        }}
        currentUserId={user?.id}
      />
      
      {/* Location Permission Modal - HelpModal kapalıyken render et (view tag çakışmasını önlemek için) */}
      {!helpVisible && (
        <LocationPermissionModal
          visible={locationPermissionModalVisible}
          onClose={async () => {
            // Modal kapalıysa tekrar state güncelleme yapma
            if (!locationPermissionModalVisible) return;
            if (isMounted.current) {
              setLocationPermissionModalVisible(false);
              setUserDismissedPermissionModal(true);
              
              // LocationPermissionModal kapandığında, guest kullanıcıysa guest modalı beklet
              if (user?.role === 'guest') {
                // "Bir daha gösterme" kontrolü
                try {
                  const doNotShowGuest = await SecureStore.getItemAsync('doNotShowGuestInfoModal');
                  if (doNotShowGuest !== 'true') {
                    setPendingShowGuestModal(true);
                  }
                } catch (e) {
                  console.error('[GUEST MODAL] SecureStore hatası:', e);
                }
              }
            }
          }}
          onPermissionGranted={async () => {
            if (!locationPermissionModalVisible) return;
            console.log('[PERMISSION] Modal izin granted callback çağrıldı');
            if (isMounted.current) {
              setHasLocationPermission(true);
              setLocationPermissionModalVisible(false);
              
              // İzin verildikten sonra da guest kontrolü yap
              if (user?.role === 'guest') {
                try {
                  const doNotShowGuest = await SecureStore.getItemAsync('doNotShowGuestInfoModal');
                  if (doNotShowGuest !== 'true') {
                    setPendingShowGuestModal(true);
                  }
                } catch (e) {
                  console.error('[GUEST MODAL] SecureStore hatası:', e);
                }
              }
            }
          }}
        />
      )}
      
      {/* Guest Info Modal - Diğer modaller kapalıyken render et (view tag çakışmasını önlemek için) */}
      {!helpVisible && !locationPermissionModalVisible && (
        <GuestInfoModal
          visible={guestInfoModalVisible}
          onClose={() => {
            if (isMounted.current) {
              setGuestInfoModalVisible(false);
              // "Bir daha gösterme" flag'ını kaydet
              SecureStore.setItemAsync('doNotShowGuestInfoModal', 'true').catch(e => 
                console.error('[GUEST MODAL] SecureStore hatası:', e)
              );
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  notificationBar: {
    backgroundColor: '#f0fdf4',
    borderBottomWidth: 1,
    borderBottomColor: '#dcfce7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    zIndex: 999,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationText: {
    color: '#059669',
    fontWeight: 'bold',
    fontSize: 15,
    flex: 1,
         },
  notificationNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  notificationNavText: {
    color: '#059669',
    fontWeight: 'bold',
    fontSize: 14,
    marginHorizontal: 4,
  },
  planOverlayHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 12,
    height: 56,
    zIndex: 1200,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  planOverlayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  planOverlayClose: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1300,
  },
  planOverlayBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    zIndex: 1200,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planOverlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#64748b',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
  },
  planOverlayBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
  },
  planOverlayBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  planOverlayCompact: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 85,
    zIndex: 1300,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  compactBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  fabBinoculars: {
    backgroundColor: '#059669',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    marginRight: 0,
    marginBottom: 12,
  },
  mapMoveButtonContainer: {
    position: 'absolute',
    bottom: 168,
    right: 85,
    alignItems: 'flex-end',
    zIndex: 200,
  },
  mapMoveButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapMoveButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersContainer: {
    position: 'absolute',
    top: 60, // Header yüksekliği kadar
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1000,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  filtersContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#059669',
  },
  filterChipActive: {
    backgroundColor: '#059669',
  },
  filterText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 180,
    flexDirection: 'column',
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabSecondary: {
    backgroundColor: '#10b981',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  infoPanelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  infoPanelContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoPanelSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  planCampButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7c3aed',
  },
  planCampButtonText: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: '600',
  },
  draftDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dc2626',
    marginRight: 4,
  },
  planBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  planBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#059669',
  },
  currentLocationButtonText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  locationPermissionContainer: {
    position: 'absolute',
    bottom: 180,
    left: 20,
    right: 20,
    alignItems: 'flex-start',
    zIndex: 999,
    elevation: 10,
  },
  locationPermissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  locationPermissionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  locationPickerBanner: {
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationPickerText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '600',
  },
  cancelLocationPicker: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f59e0b',
    borderRadius: 6,
  },
  cancelLocationPickerText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  syncBanner: {
    backgroundColor: '#fee2e2',
    borderBottomWidth: 1,
    borderBottomColor: '#ef4444',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  syncBannerText: {
    fontSize: 14,
    color: '#b91c1c',
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  offlineBanner: {
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
    flexWrap: 'wrap',
    gap: 8,
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
  },
  premiumButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  debugText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  progressBarContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  progressSubText: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});