import * as SecureStore from 'expo-secure-store';
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

// Arka plan konum izleme görevi
const BACKGROUND_LOCATION_TASK = 'background-location-task';

import { campingTypes, getCampingTypeLabel, getCampingAreaBgColor } from '../../lib/categories';
import { filterCampingAreasByUser } from '../../lib/accessControl';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import HelpModal from '../../components/HelpModal';

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
import { getSVGIcon } from '../icons/svgIcons';
import { syncAll } from '@/lib/syncManager';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { listAnnouncements } from '@/lib/announcementApi';
import { getValilikIdFromProvinceName, getProvinceFromDistrict } from '@/lib/provinceMap';
// If getValilikIdFromProvinceName is the default export, use:
// import getValilikIdFromProvinceName from '@/lib/provinceMap';
// Or, if it is not exported at all, you need to export it from '@/lib/provinceMap.ts'
import { getProvinceFromOSM } from '../../lib/osmReverseGeocode';
import { getMe, listCommunityMembers } from '@/lib/userCommunityApi';
import { API_URL } from '@/lib/config';
import { UserPlus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { on as onEvent, off as offEvent } from '@/lib/eventBus';
import { Animated, Easing, AppState } from 'react-native';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MapPin, Filter, Navigation, Plus, Calendar, RefreshCw, Loader2, Binoculars, LocateFixed, List, Map } from 'lucide-react-native';
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

// Arka plan konum izleme görevini tanımla
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[BackgroundLocation] Hata:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      const { latitude, longitude } = location.coords;
      
      console.log(`[BackgroundLocation] Konum alındı: ${latitude}, ${longitude}`);
      
      try {
        // Kullanıcı offline özelliğine sahip mi kontrol et
        const token = await getToken();
        if (!token) {
          console.log('[BackgroundLocation] Token yok, cache atlandı');
          return;
        }
        
        const userData = await getMe();
        
        // DEBUG: Kullanıcı datasını kontrol et
        console.log('[BackgroundLocation] 🔍 User Data:', JSON.stringify({
          id: userData?.id,
          email: userData?.email,
          role: userData?.role,
          offline_enabled: userData?.offline_enabled,
          offline_radius_km: userData?.offline_radius_km
        }, null, 2));
        
        if (!userData || !userData.offline_enabled) {
          console.log('[BackgroundLocation] ❌ Offline özelliği aktif değil, cache atlandı');
          return;
        }
        
        // Kullanıcının offline_radius_km değerini kullan (varsayılan 20 km)
        const radiusKm = userData.offline_radius_km || 20;
        
        // Bölgeyi offline kullanım için cache'le
        await precacheRegionWithRadius(latitude, longitude, radiusKm);
        console.log(`[BackgroundLocation] Bölge cache'lendi: ${latitude}, ${longitude} (${radiusKm} km)`);
      } catch (error) {
        console.error('[BackgroundLocation] Cache hatası:', error);
      }
    }
  }
});

export default function MapScreen() {
    // Son sorgulanan konumu saklamak için ref
    const lastQueriedLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
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
  
  // Görünüm modu: 'map', 'list' veya 'search'
  const [viewMode, setViewMode] = useState<'map' | 'list' | 'search'>('map');
  // Video reklam aç/kapa kontrolü
  // ...existing code...
  // useTokenAutoLogout kaldırıldı: Token login sonrası otomatik silinmeyecek
  // Yardım modalı (sadece ilk açılışta göster)
  const [helpVisible, setHelpVisible] = useState(false);
  
  // Konum izni uyarı modalı
  const [locationPermissionModalVisible, setLocationPermissionModalVisible] = useState(false);
  
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
      // Önce localde gösterilen duyuru id'lerini al
      const shownAnnouncementIdsStr = await SecureStore.getItemAsync('shownAnnouncementIds');
      const shownAnnouncementIds = shownAnnouncementIdsStr ? JSON.parse(shownAnnouncementIdsStr) : [];
      const isFirstLaunch = shownAnnouncementIds.length === 0;
      const db = getDatabase();

      // İlk açılış: konum bazlı görünürlük kontrolü için önce kısa bir konum denemesi yap
      let matchedValilikIdLocal: any = null;
      try {
        const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 500));
        const location = await Promise.race([locationPromise, timeoutPromise]) as any;
        if (location && location.coords) {
          const provinceName = await getProvinceFromOSM(location.coords.latitude, location.coords.longitude);
          if (provinceName) {
            const normalized = provinceName.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/Ç/g, 'c').replace(/Ğ/g, 'g').replace(/İ/g, 'i').replace(/Ö/g, 'o').replace(/Ş/g, 's').replace(/Ü/g, 'u').replace(/\s+/g, '');
            const { districtToProvinceMap, provinceNameToValilikId } = require('@/lib/provinceMap');
            const matchedProvince = districtToProvinceMap[normalized] || null;
            if (matchedProvince) matchedValilikIdLocal = provinceNameToValilikId[matchedProvince] || null;
          }
        }
      } catch (err) {
        if (__DEV__) console.log('[ANNOUNCEMENT] İlk açılış için konum alınamadı (timeout veya hata):', err?.message);
      }

      // İlk açılış: local DB'deki duyuruları hemen göster ve çık (hızlı yol)
      if (isFirstLaunch) {
        if (__DEV__) console.log('[ANNOUNCEMENT] İlk açılış - Lokal veritabanından hızlı gösterim başlatılıyor');
        const allAnnouncementsLocal = await db.listAnnouncementsLocal({ onlyActive: true });

        // Konum/valilik filtresi uygula (sadece genel/valilik duyurularına)
        let visibleAnnouncementsLocal = allAnnouncementsLocal;
        if (matchedValilikIdLocal && Array.isArray(allAnnouncementsLocal)) {
          visibleAnnouncementsLocal = allAnnouncementsLocal.filter(a => {
            if (a.community_id === 0) {
              return String(a.valilik_id) === String(matchedValilikIdLocal);
            }
            return true;
          });
        }

        if (Array.isArray(visibleAnnouncementsLocal) && visibleAnnouncementsLocal.length > 0) {
          if (__DEV__) console.log('[ANNOUNCEMENT] İlk açılış - Lokal veritabanındaki (görünür) duyuru sayısı gösteriliyor (hızlı yol):', visibleAnnouncementsLocal.length);
          const visibleIds = visibleAnnouncementsLocal.map(a => a.id);
          await SecureStore.setItemAsync('shownAnnouncementIds', JSON.stringify(visibleIds));

          if (!skipNotification && !isFullSyncInProgressRef.current) {
            setNotifications([{
              id: visibleAnnouncementsLocal[0].id,
              type: 'announcement',
              message: `${visibleAnnouncementsLocal.length} duyurunuz var!`,
              goto: () => router.push('/announcements'),
            }]);
            setNotificationIndex(0);
            setShowNotificationBar(true);
            setTimeout(() => setShowNotificationBar(false), 5000);
          }
          return;
        }
      }

      // Lokal duyuruları kontrol et (yeni local duyuru varsa hemen göster)
      if (__DEV__) console.log('[ANNOUNCEMENT] Lokal duyurular çekiliyor (hızlı kontrol)...');
      const dbStartTime = Date.now();
      const allAnnouncementsLocal = await db.listAnnouncementsLocal({ onlyActive: true });
      const dbDuration = Date.now() - dbStartTime;
      if (__DEV__) console.log(`[ANNOUNCEMENT] Lokal duyurular çekildi (hızlı kontrol: ${dbDuration}ms, ${Array.isArray(allAnnouncementsLocal) ? allAnnouncementsLocal.length : 0} kayıt)`);

      // Eğer daha önce ilk açılışta alınan matchedValilikIdLocal varsa kullan, yoksa null kalacak ve filtre uygulanmayacak
      let filteredLocalAnnouncements = allAnnouncementsLocal;
      if (typeof matchedValilikIdLocal !== 'undefined' && matchedValilikIdLocal) {
        filteredLocalAnnouncements = Array.isArray(allAnnouncementsLocal)
          ? allAnnouncementsLocal.filter(a => {
              if (a.community_id === 0) {
                return String(a.valilik_id) === String(matchedValilikIdLocal);
              }
              return true;
            })
          : [];
      }

      const newAnnouncementsLocal = Array.isArray(filteredLocalAnnouncements)
        ? filteredLocalAnnouncements.filter((a: any) => !shownAnnouncementIds.includes(a.id))
        : [];

      if (Array.isArray(newAnnouncementsLocal) && newAnnouncementsLocal.length > 0 && !skipNotification && !isFullSyncInProgressRef.current) {
        if (__DEV__) console.log('[ANNOUNCEMENT] Lokal yeni duyuru bulundu, gösteriliyor (hızlı yol):', newAnnouncementsLocal.length);
        const updatedIds = [...shownAnnouncementIds, ...newAnnouncementsLocal.map(a => a.id)];
        await SecureStore.setItemAsync('shownAnnouncementIds', JSON.stringify(updatedIds));
        setNotifications([{
          id: newAnnouncementsLocal[0].id,
          type: 'announcement',
          message: `Okunmamış ${newAnnouncementsLocal.length} yeni duyurunuz var!`,
          goto: () => router.push('/announcements'),
        }]);
        setNotificationIndex(0);
        setShowNotificationBar(true);
        setTimeout(() => {
          if (isMounted.current) setShowNotificationBar(false);
        }, 30000);
        return;
      }

      // Localde yeni yoksa, daha detaylı kontrol: kullanıcı, konum ve API
      const userStartTime = Date.now();
      const user = await getMe();
      const userDuration = Date.now() - userStartTime;
      if (__DEV__) console.log(`[ANNOUNCEMENT] getMe() tamamlandı (${userDuration}ms)`);

      // Konum bilgisini al ve valilik_id bul (kısa timeout) — yalnızca daha önce belirlenmediyse çalıştır
      if (!matchedValilikIdLocal) {
        try {
          const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 500));
          const location = await Promise.race([locationPromise, timeoutPromise]) as any;
          if (location && location.coords) {
            const provinceName = await getProvinceFromOSM(location.coords.latitude, location.coords.longitude);
            if (provinceName) {
              const normalized = provinceName.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/Ç/g, 'c').replace(/Ğ/g, 'g').replace(/İ/g, 'i').replace(/Ö/g, 'o').replace(/Ş/g, 's').replace(/Ü/g, 'u').replace(/\s+/g, '');
              const { districtToProvinceMap, provinceNameToValilikId } = require('@/lib/provinceMap');
              const matchedProvince = districtToProvinceMap[normalized] || null;
              if (matchedProvince) matchedValilikIdLocal = provinceNameToValilikId[matchedProvince] || null;
            }
          }
        } catch (err) {
          if (__DEV__) console.log('[ANNOUNCEMENT] Konum alınamadı (timeout veya hata):', err?.message);
        }
      }

      // Aktif duyuruları local DB'den tekrar al (valilik filtresi uygulanacak)
      if (__DEV__) console.log('[ANNOUNCEMENT] Lokal duyurular tekrar çekiliyor (filtre uygulanacak)...');
      let allAnnouncements = await db.listAnnouncementsLocal({ onlyActive: true });
      if (matchedValilikIdLocal) {
        // Valilik filtresi uygula
        allAnnouncements = allAnnouncements.filter(a => {
          if (a.community_id === 0) {
            return String(a.valilik_id) === String(matchedValilikIdLocal);
          }
          return true;
        });
      }
      // Yeni duyuruları local'den hesapla (henüz API'ye gerek yoksa bu hızlı yol kullanılır)
      let newAnnouncements: any[] = Array.isArray(allAnnouncements)
        ? allAnnouncements.filter((a: any) => !shownAnnouncementIds.includes(a.id))
        : [];
      // Eğer localde yoksa API'den çek
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
        // Valilik_id filtresi sadece genel duyurular için uygula
        if (matchedValilikIdLocal) {
          allAnnouncements = allAnnouncements.filter(a => {
            if (a.community_id === 0) {
              // Genel duyuru: valilik_id kontrolü yap
              return String(a.valilik_id) === String(matchedValilikIdLocal);
            }
            // Topluluk duyurusu: direkt kabul et
            return true;
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
        await SecureStore.setItemAsync('shownAnnouncementIds', JSON.stringify(updatedIds));
        
        // Bildirim göster (full sync sırasında değil)
        setNotifications([{
          id: newAnnouncements[0].id,
          type: 'announcement',
          message: `Okunmamış ${Array.isArray(newAnnouncements) ? newAnnouncements.length : 0} yeni duyurunuz var!`,
          goto: () => router.push('/announcements'),
        }]);
        setNotificationIndex(0);
        setShowNotificationBar(true);
        // Bildirim 30 saniye sonra kapanacak
        setTimeout(() => {
          if (isMounted.current) setShowNotificationBar(false);
        }, 30000);
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
    }
  }, [showNotificationBar]);


  // Harita senkronizasyonundan sonra da yeni duyuru bildirimi tetiklensin
  useEffect(() => {
    // isConnected veya harita sync sonrası tetiklenebilir (full sync sırasında bildirim gösterme)
    fetchAnnouncementsSilently(router, isFullSyncInProgressRef.current);
  }, [isConnected]);
  // Konumu güncelleyen fonksiyon
  const getCurrentLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Konum izni reddedildi, varsayılan olarak Türkiye'nin merkezi kullanılacak
        // useCampingAreas hook'u otomatik olarak varsayılan konumu ayarlayacak
        setHasLocationPermission(false);
        await refreshData();
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setHasLocationPermission(true);
      // Eğer useCampingAreas gibi bir hook ile location state yönetiliyorsa, burada bir şekilde location'ı güncellemelisiniz.
      // Eğer location doğrudan değiştirilemiyorsa, refreshData ile yeniden çekilmesini sağlayabilirsiniz.
      await refreshData();
    } catch (e) {
      // Hata durumunda da varsayılan konum kullanılacak
      setHasLocationPermission(false);
      await refreshData();
    }
  };

  // Konum izni isteme fonksiyonu
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasLocationPermission(true);
        await refreshData();
        if (Platform.OS === 'android') {
          ToastAndroid.show('Konum izni verildi', ToastAndroid.SHORT);
        } else {
          Alert.alert('Başarılı', 'Konum izni verildi');
        }
      } else {
        setHasLocationPermission(false);
        // İzin reddedildi - kullanıcıyı ayarlara yönlendir
        Alert.alert(
          'Konum İzni Gerekli',
          'Konum özelliklerini kullanmak için lütfen cihaz ayarlarından konum iznini açın.',
          [
            { text: 'İptal', style: 'cancel' },
            { 
              text: 'Ayarlara Git', 
              onPress: () => {
                Linking.openSettings();
              }
            }
          ]
        );
      }
    } catch (e) {
      console.error('[DEBUG] Konum izni hatası:', e);
      setHasLocationPermission(false);
    }
  };

  // Mevcut konuma odaklanma fonksiyonu
  const handleShowCurrentLocation = async () => {
    try {
      if (!isMounted.current) return;
      
      if (location && location.coords) {
        setMapMoveQuery(null); // Varsayılan konuma dön
        setMapCenter({ latitude: location.coords.latitude, longitude: location.coords.longitude }); // Haritayı kullanıcı konumuna odakla
        
        const timeoutId = setTimeout(() => {
          if (!isMounted.current || !webViewRef.current || !isWebViewReady) return;
          
          // WebView'ın yüklendiğinden emin ol
          try {
            webViewRef.current.injectJavaScript(`
              if (typeof map !== 'undefined') {
                map.setView([${location.coords.latitude}, ${location.coords.longitude}], 13);
              }
              true;
            `);
          } catch (err) {
            console.warn('[DEBUG] WebView JavaScript injection failed:', err);
          }
        }, 300);
        timeoutRefs.current.push(timeoutId);
        await refreshData();
      } else {
        // Konum alınamıyorsa tekrar iste
        await getCurrentLocation();
        await refreshData();
      }
    } catch (e) {
      // Hata yönetimi
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
    (async () => {
      if (isConnected) {
        const token = await getToken();
        if (token) {
          // Konum kontrolü - değişmişse haritayı güncelle
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              const newLocation = await Location.getCurrentPositionAsync({});
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
          
          const user = await getMe();
          if (__DEV__) console.log('[DEBUG][PROGRESS] Sync başlıyor...');
          setSyncProgress({ current: 0, total: 0, isLoading: true });
          await syncAll({ 
            userId: user?.id,
            onProgress: (current, total) => {
              if (__DEV__) console.log('[DEBUG][PROGRESS] Progress güncellendi:', current, '/', total);
              setSyncProgress({ current, total, isLoading: true });
            }
          });
          if (__DEV__) console.log('[DEBUG][PROGRESS] Sync tamamlandı');
          setSyncProgress({ current: 0, total: 0, isLoading: false });
        } else {
        }
      }
    })();
  }, [isConnected]);
  
  // Arka plan konum izlemeyi başlat
  useEffect(() => {
    let isActive = true;
    
    const startBackgroundLocation = async () => {
      try {
        // Önce kullanıcının offline özelliğine sahip olup olmadığını kontrol et
        const token = await getToken();
        if (!token) {
          console.log('[BackgroundLocation] Token yok, offline mod devre dışı');
          return;
        }
        
        const userData = await getMe();
        if (!userData || !userData.offline_enabled) {
          console.log('[BackgroundLocation] Kullanıcı offline özelliğine sahip değil');
          // Kullanıcıya bilgilendirme göster (opsiyonel)
          if (userData && userData.role === 'guest') {
            console.log('[BackgroundLocation] Guest kullanıcılar offline mod kullanamaz');
          }
          return;
        }
        
        console.log(`[BackgroundLocation] Offline özelliği aktif (${userData.offline_radius_km || 20} km)`);
        
        // Konum izni kontrolü
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
          console.log('[BackgroundLocation] Konum izni reddedildi');
          return;
        }
        
        // Arka plan konum izni (sadece iOS için gerekli)
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.log('[BackgroundLocation] Arka plan konum izni reddedildi - Kısıtlı mod');
          
          // İlk kez gösterildi mi kontrol et (sadece bilgilendirme için)
          const limitedModeAlertSeen = await SecureStore.getItemAsync('offlineLimitedModeAlertSeen');
          if (!limitedModeAlertSeen) {
            // İlk kez, bilgilendirme göster
            Alert.alert(
              'Offline Mod: Kısıtlı Özellikler',
              'Konum izniniz "Yalnızca uygulama kullanılırken" olarak ayarlandı.\n\n✅ Manuel harita cache yapabilirsiniz\n❌ Otomatik arka plan senkronizasyonu devre dışı\n\nTam özellikler için: Ayarlar > Uygulamalar > Kamp Defterim > Konum > "Her zaman izin ver\n\n\nProfil sayfasından da konum izninizi düzenleyebilirsiniz."',
              [
                {
                  text: 'Anladım',
                  onPress: async () => {
                    await SecureStore.setItemAsync('offlineLimitedModeAlertSeen', '1');
                  },
                  style: 'cancel'
                },
                {
                  text: 'Ayarlara Aç',
                  onPress: async () => {
                    await SecureStore.setItemAsync('offlineLimitedModeAlertSeen', '1');
                    if (Platform.OS === 'ios') {
                      Linking.openURL('app-settings:');
                    } else {
                      Linking.openSettings();
                    }
                  }
                }
              ]
            );
          }
          return; // Arka plan tracking başlatma
        }
        
        // Zaten çalışıyor mu kontrol et
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
        if (isRegistered && isActive) {
          console.log('[BackgroundLocation] Zaten çalışıyor');
          return;
        }
        
        // Arka plan konum izlemeyi başlat (her 10 dakikada bir)
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10 * 60 * 1000, // 10 dakika
          distanceInterval: 1000, // 1 km
          foregroundService: {
            notificationTitle: 'Kamp Defterim',
            notificationBody: 'Offline harita senkronizasyonu için konum izleniyor',
            notificationColor: '#059669',
          },
          pausesUpdatesAutomatically: true,
          showsBackgroundLocationIndicator: false,
        });
        
        console.log('[BackgroundLocation] Başlatıldı - her 10 dakikada bir konum alınacak');
      } catch (error) {
        console.error('[BackgroundLocation] Başlatma hatası:', error);
      }
    };
    
    startBackgroundLocation();
    
    return () => {
      isActive = false;
      // Component unmount olduğunda arka plan izlemeyi durdur
      Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    };
  }, []);
  
  // ...existing code...

  const [user, setUser] = useState<any>(null);

  // Arkadaş sayısını logla
  useEffect(() => {
    if (user && Array.isArray(user.friends)) {
    }
  }, [user?.friends]);
  const [communityMember, setCommunityMember] = useState<any>(null);

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
        const userData = await getMe(); // users tablosu (artık offline_enabled ve offline_radius_km içerir)
        
        // Offline ayarlarını logla
        if (__DEV__) {
          console.log('[User] ✅ Offline ayarları:', {
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
        setUser({ ...userData, friends });
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
        setUser(null);
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
          const shownIdsStr = await SecureStore.getItemAsync('shownFriendRequestIds');
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
            await SecureStore.setItemAsync('shownFriendRequestIds', JSON.stringify([...shownIds, ...newRequests.map(r => r.id)]));
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
            const shownSharedStr = await SecureStore.getItemAsync('shownSharedChecklistIds');
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
              await SecureStore.setItemAsync('shownSharedChecklistIds', JSON.stringify([...shownSharedIds, ...newShares.map(s => s.id)]));
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
            const shownCampingAreasStr = await SecureStore.getItemAsync('shownSharedCampingAreaIds');
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
                    // Haritaya geç
                    if (isMounted.current) setViewMode('map');
                    // Kamp alanının konumuna odaklan
                    const lat = (firstArea as any).latitude;
                    const lng = (firstArea as any).longitude;
                    if (lat && lng) {
                      const timeoutId1 = setTimeout(() => {
                        if (!isMounted.current) return;
                        setMapCenter({ latitude: lat, longitude: lng });
                        setMapMoveQuery({ latitude: lat, longitude: lng });
                        // Marker popup'ını aç
                        const timeoutId2 = setTimeout(() => {
                          if (!isMounted.current || !webViewRef.current || !isWebViewReady) return;
                          try {
                            webViewRef.current.injectJavaScript(`
                              if (window.openMarkerPopup) {
                                window.openMarkerPopup(${lat}, ${lng});
                              }
                              true;
                            `);
                          } catch (err) {
                            console.warn('[DEBUG] WebView marker popup injection failed:', err);
                          }
                        }, 800);
                        timeoutRefs.current.push(timeoutId2);
                      }, 100);
                      timeoutRefs.current.push(timeoutId1);
                    }
                  },
                },
              ];
              // Gösterilenleri kaydet
              await SecureStore.setItemAsync('shownSharedCampingAreaIds', JSON.stringify([...shownCampingAreaIds, ...newSharedAreas.map((a: any) => a.id)]));
            }
          } catch (e) {
            console.warn('[Camping Area Notification] Hata:', e);
          }
        }

        // Öncelik: kamp alanı paylaşımı > checklist paylaşımı > arkadaşlık isteği
        if (Array.isArray(campingAreaNotifs) && campingAreaNotifs.length > 0) {
          setNotifications(campingAreaNotifs);
          setNotificationIndex(0);
          setShowNotificationBar(true);
        } else if (Array.isArray(checklistNotifs) && checklistNotifs.length > 0) {
          setNotifications(checklistNotifs);
          setNotificationIndex(0);
          setShowNotificationBar(true);
        } else if (Array.isArray(friendNotifs) && friendNotifs.length > 0) {
          setNotifications(friendNotifs);
          setNotificationIndex(0);
          setShowNotificationBar(true);
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
  const [selectedLocation, setSelectedLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  // Artık filtreler merkezi kategori yönetiminden geliyor
  const [selectedTags, setSelectedTags] = useState(campingTypes.map(t => t.id));

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

  const [favorites, setFavorites] = useState<Set<string | number>>(new Set());
  // Harita merkezini ve buton state'ini tut
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMapMoveButton, setShowMapMoveButton] = useState(false);
  const [mapMoveQuery, setMapMoveQuery] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMapPopup, setShowMapPopup] = useState(false);

  // Sadece kullanıcıya ait private ve tüm public alanları kapsayacak şekilde sorgu

  // Varsayılan olarak konumdan başlat, harita hareket ettirilirse mapMoveQuery ile güncelle
  const { campingAreas, loading, error, location, refreshData } = useCampingAreas({
    tags: selectedTags,
    radius: mapMoveQuery ? 20 : 30, // default 10 : 20
    latitude: mapMoveQuery ? mapMoveQuery.latitude : undefined,
    longitude: mapMoveQuery ? mapMoveQuery.longitude : undefined,
    currentUserId: user?.id ?? undefined,
    isSuperAdmin,
  });

  // refreshData'yı ref'te sakla (stale closure önleme)
  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

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
        appStateTimeoutRef.current = setTimeout(() => {
          if (!isMounted.current) return;
          
          // Veri yenileme fonksiyonlarını tetikle (ref'ten al - stale closure önleme)
          if (refreshDataRef.current && typeof refreshDataRef.current === 'function') {
            try {
              refreshDataRef.current();
            } catch (err) {
              if (__DEV__) console.warn('[AppState] refreshData error:', err);
            }
          }
          // Duyuruları da yenile (full sync sırasında bildirim gösterme)
          try {
            fetchAnnouncementsSilently(routerRef.current, isFullSyncInProgressRef.current);
          } catch (err) {
            if (__DEV__) console.warn('[AppState] fetchAnnouncements error:', err);
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

  // Konum izni durumunu kontrol et
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const hasPermission = status === 'granted';
        console.log('[DEBUG] Konum izni durumu:', status, 'hasPermission:', hasPermission);
        setHasLocationPermission(hasPermission);
      } catch {
        console.log('[DEBUG] Konum izni kontrol hatası');
        setHasLocationPermission(false);
      }
    })();
  }, [location]);

  // Ekran focus'a geldiğinde konum izni ve mesafe kontrolü yap
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          const hasPermission = status === 'granted';
          console.log('[DEBUG] Focus - Konum izni durumu:', status);
          setHasLocationPermission(hasPermission);
          
          // Konum izni varsa ve ilk yüklemeden sonraysa mesafe kontrolü yap
          if (hasPermission && hasInitialSyncRef.current) {
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
              await refreshData();
            }
          }
        } catch {
          setHasLocationPermission(false);
        }
      })();
    }, [location, mapMoveQuery])
  );

  // Guest kullanıcılar sadece kendi oluşturduğu kamp alanlarını görebilsin
  const isGuest = user?.role === 'guest';
  // log kaldırıldı
  // console.log('[DEBUG] Tüm kamp alanları:', campingAreas);
  let filteredCampingAreas = filterCampingAreasByUser(campingAreas, user, isGuest);
  filteredCampingAreas = filteredCampingAreas.filter(area => {
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

  // API senkronizasyonu sadece ilk mount'ta çalışsın
  const isSyncingRef = useRef(false);
  const hasInitialSyncRef = useRef(false);
  // Duyuru fetch işlemlerinin çakışmasını önlemek için ref
  const isFetchingAnnouncementsRef = useRef(false);
  
  // İlk açılışta API'dan senkronizasyon
  useEffect(() => {
    if (hasInitialSyncRef.current) return;
    hasInitialSyncRef.current = true;
    
    (async () => {
      await refreshData();
      // Duyurular arka planda fetch (full sync sırasında bildirim gösterme)
      fetchAnnouncementsSilently(router, isFullSyncInProgressRef.current);
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
            
            const count = await getDatabase().fetchAndStoreCampingAreasFromAPI(undefined, { 
              forceFull: shouldForceFullSync,
              onProgress: shouldForceFullSync ? (current, total) => {
                if (__DEV__) console.log('[DEBUG][PROGRESS] Full sync progress:', current, '/', total);
                setSyncProgress({ current, total, isLoading: true });
              } : undefined
            });
            
            if (shouldForceFullSync) {
              if (__DEV__) console.log('[DEBUG][PROGRESS] Full sync tamamlandı:', count, 'kayıt');
              await SecureStore.setItemAsync('hasInitialSync', 'true');
              await SecureStore.setItemAsync('isInitialSyncComplete', 'true'); // Duyurular tab'ını aç
              isFullSyncInProgressRef.current = false; // Bildirimleri aç
              setSyncProgress({ current: 0, total: 0, isLoading: false });
            }
            
            if (__DEV__) console.log('API ile senkronize edilen kamp alanı sayısı:', count);
            await refreshData();
            // Harita sync sonrası tekrar fetch (full sync sırasında bildirim gösterme)
            fetchAnnouncementsSilently(router, shouldForceFullSync);
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
  }, []);

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
        
        // Sessizce veriyi güncelle (loading göstermeden)
        await refreshData();
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
    if (!location) {
      return '';
    }

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
          var map = L.map('map').setView([${mapMoveQuery ? mapMoveQuery.latitude : location.coords.latitude}, ${mapMoveQuery ? mapMoveQuery.longitude : location.coords.longitude}], 14);
          var isLocationPickerMode = ${isLocationPickerMode};
          var selectedLocationMarker = null;
          var isOffline = ${!isConnected};
          
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
                  
                  // Timeout - 500ms sonra hala yanıt gelmezse placeholder
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
                  }, 500);
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
              maxZoom: 19,
              minZoom: 1,
              bounds: null,
              keepBuffer: 0
            });
          } else {
            // Online modda: Backend proxy üzerinden yükle
            // Version parametresi ile backend cache bypass (CartoDB'ye geçiş için)
            tileLayer = L.tileLayer(window.API_URL + '/tiles/{z}/{x}/{y}.png?v=cartodb', {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
              errorTileUrl: '',
              maxZoom: 19,
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
              
              // Add new marker
              selectedLocationMarker = L.marker([lat, lng]).addTo(map);
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
          L.marker([${location.coords.latitude}, ${location.coords.longitude}], {
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
              ${(marker.images && marker.images[0]) ? `<img src='${marker.images[0]}' alt='Kapak' style="width: 100%; height: 100%; object-fit: cover; border-radius: 0; display: block;" />` : `<div style=\"width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;\">
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
              map.setView([lat, lng], 15);
              setTimeout(function() {
                found.marker.openPopup();
              }, 300);
            }
          };
          
          // Mevcut konuma kamp alanı ekleme fonksiyonu
          window.addCampingAreaHere = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'addCampingAreaAtCurrentLocation',
                latitude: ${location.coords.latitude},
                longitude: ${location.coords.longitude}
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
        </script>
      </body>
      </html>
    `;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'locationSelected') {
        setSelectedLocation({
          latitude: data.latitude,
          longitude: data.longitude
        });
        setIsLocationPickerMode(false);
        if (isMounted.current) setShowAddModal(true);
      } else if (data.type === 'addCampingAreaAtCurrentLocation') {
        setSelectedLocation({
          latitude: data.latitude,
          longitude: data.longitude
        });
        if (isMounted.current) setShowAddModal(true);
      } else if (data.type === 'campingAreaClicked') {
        const area = campingAreas.find(a => 
          Math.abs((a as any).latitude - data.latitude) < 0.0001 && 
          Math.abs((a as any).longitude - data.longitude) < 0.0001
        );
        if (area && isMounted.current) {
          setSelectedCampingArea(area as CampingArea);
          setShowDetailModal(true);
        }
      } else if (data.type === 'toggleFavorite') {
        const area = campingAreas.find(a => 
          Math.abs((a as any).latitude - data.latitude) < 0.0001 && 
          Math.abs((a as any).longitude - data.longitude) < 0.0001
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
            // WebView'a yanıt gönder
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                if (window.tileCacheCallback_${data.requestId}) {
                  window.tileCacheCallback_${data.requestId}(${cachedTile ? `"${cachedTile}"` : 'null'});
                  delete window.tileCacheCallback_${data.requestId};
                }
                true;
              `);
            }
          } catch (error) {
            if (__DEV__) console.error('[MapTileCache] Cache okuma hatası:', error);
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
    setSelectedLocation(null);
    setIsLocationPickerMode(true);
  };

  const cancelLocationPicker = () => {
    if (!isMounted.current) return;
    setIsLocationPickerMode(false);
    setSelectedLocation(null);
  };

  const addCampingAreaAtCurrentLocation = () => {
    if (location && isMounted.current) {
      setSelectedLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });
      setShowAddModal(true);
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
    // TODO: Navigate to camp planning screen or open planning modal
    console.log('Kamp Planla button pressed');
    Alert.alert('Kamp Planla', 'Kamp planlama özelliği yakında eklenecek!');
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
        const { status } = await Location.requestForegroundPermissionsAsync();
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
      <HelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kamp Alanları</Text>
        <View style={styles.headerActions}>
          {/* Görünüm Değiştirme Butonu */}
          <TouchableOpacity
            style={[styles.actionButton, (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }]}
            onPress={() => {
              if (!isConnected && !user?.offline_enabled) {
                Alert.alert(
                  'Offline Özellik Gerekli',
                  'Liste görünümü için Premium aboneliğe ihtiyacınız var.',
                  [{ text: 'Tamam' }]
                );
                return;
              }
              if (isMounted.current) {
                setViewMode(viewMode === 'map' ? 'list' : 'map');
              }
            }}
            disabled={isBusy || (!isConnected && !user?.offline_enabled)}
          >
            {viewMode === 'map' ? (
              <List size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
            ) : (
              <Map size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }]}
            onPress={async () => {
              if (!isConnected && !user?.offline_enabled) {
                Alert.alert(
                  'Offline Özellik Gerekli',
                  'Arama özelliği için Premium aboneliğe ihtiyacınız var.',
                  [{ text: 'Tamam' }]
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
            disabled={isBusy || (!isConnected && !user?.offline_enabled)}
          >
            <Feather name="search" size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }]}
            onPress={() => {
              if (!isConnected && !user?.offline_enabled) {
                Alert.alert(
                  'Offline Özellik Gerekli',
                  'Filtre özelliği için Premium aboneliğe ihtiyacınız var.',
                  [{ text: 'Tamam' }]
                );
                return;
              }
              if (isMounted.current) setShowFilters(!showFilters);
            }}
            disabled={isBusy || (!isConnected && !user?.offline_enabled)}
          >
            <Filter size={20} color={(!isConnected && !user?.offline_enabled) ? "#9ca3af" : "#059669"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={isBusy ? undefined : handleManualSync}
            accessibilityLabel="Manuel Senkronize Et"
            disabled={isBusy}
          >
            {isBusy ? (
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Loader2 size={20} color="#ef4444" />
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
              Duyuru sekmesi eşitleme sonrası aktif olacaktır.
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
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            {user?.offline_enabled 
              ? '📵 Offline Mod - Cache\'lenmiş harita gösteriliyor' 
              : <>📵 Offline mod için <Text style={{fontWeight: 'bold', fontStyle: 'italic'}}>Premium</Text> aboneliği gerekmektedir.</>}
          </Text>
        </View>
      )}
      {/* Location Picker Mode Banner */}
      {isLocationPickerMode && (
        <View style={styles.locationPickerBanner} pointerEvents={isBusy ? 'none' : 'auto'}>
          <Text style={styles.locationPickerText}>📍 Haritada konum seçmek için tıklayın</Text>
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
                  setViewMode('map');
                  // Haritaya geçtikten sonra popup'ı aç
                  const timeoutId2 = setTimeout(() => {
                    if (!isMounted.current || !webViewRef.current || !isWebViewReady) return;
                    try {
                      webViewRef.current.injectJavaScript(`
                        if (window.openMarkerPopup) {
                          window.openMarkerPopup(${lat}, ${lng});
                        }
                        true;
                      `);
                    } catch (err) {
                      console.warn('[DEBUG] WebView popup injection failed:', err);
                    }
                  }, 500);
                  timeoutRefs.current.push(timeoutId2);
                }, 100);
                timeoutRefs.current.push(timeoutId1);
              }
            }}
            user={user}
            isGuest={isGuest}
          />
          <TouchableOpacity onPress={() => {
            if (isMounted.current) setViewMode('map');
          }} style={{ alignSelf: 'center', marginTop: 16, backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Haritaya Dön</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'map' ? (
        <>
          {/* Map */}
          <View style={styles.mapContainer} pointerEvents="auto">
            {location && (
              <WebView
                ref={webViewRef}
                key={mapKey}
                source={{ html: generateMapHTML() }}
                style={styles.map}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                onMessage={handleWebViewMessage}
                onLoadStart={() => setIsWebViewReady(false)}
                onLoadEnd={() => {
                  if (isMounted.current) {
                    setIsWebViewReady(true);
                  }
                }}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  if (__DEV__) {
                    console.warn('[WebView] Error:', nativeEvent);
                  }
                  setIsWebViewReady(false);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  if (__DEV__) {
                    console.warn('[WebView] HTTP Error:', nativeEvent.statusCode);
                  }
                }}
                onRenderProcessGone={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  if (__DEV__) {
                    console.error('[WebView] Render process gone:', nativeEvent.didCrash);
                  }
                  // WebView crash oldu, yeniden yükle
                  if (isMounted.current) {
                    setMapKey(prev => prev + 1);
                  }
                }}
              />
            )}
            {/* Harita kaydırıldığında çıkan buton */}
            {showMapMoveButton && mapCenter && !isLocationPickerMode && !showMapPopup && (
              <View style={styles.mapMoveButtonContainer} pointerEvents="box-none">
                <TouchableOpacity 
                  style={[
                    styles.fab, 
                    styles.fabBinoculars, 
                    (!user?.offline_enabled && !isConnected) && { opacity: 0.4 }
                  ]} 
                  onPress={() => {
                    if (!isConnected && !user?.offline_enabled) {
                      Alert.alert(
                        'Offline Özellik Gerekli',
                        'Bu arama özelliği için Premium aboneliğe ihtiyacınız var.',
                        [{ text: 'Tamam' }]
                      );
                      return;
                    }
                    handleShowMapMoveResults();
                  }}
                  disabled={!isConnected && !user?.offline_enabled}
                >
                  <Binoculars size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {/* Artık dokunma kilidi ve overlay yok, sadece ikon dönecek */}
          </View>

          {/* Floating Action Buttons */}
          {!isLocationPickerMode && !showMapPopup && (
            <View style={styles.fabContainer} pointerEvents={isBusy ? 'none' : 'auto'}>
              <TouchableOpacity style={[styles.fab, styles.fabSecondary]} onPress={() => {
                if (isMounted.current) setIsLocationPickerMode(true);
              }} disabled={isBusy}>
                <Plus size={28} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fab} onPress={handleShowCurrentLocation} disabled={isBusy}>
                <LocateFixed size={24} color="white" />
              </TouchableOpacity>
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
                  console.log('[DEBUG] Buton onPress tetiklendi');
                  requestLocationPermission();
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
            <View style={styles.infoPanel} pointerEvents={isBusy ? 'none' : 'auto'}>
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
                  style={styles.planCampButton}
                  onPress={handlePlanCamp}
                  disabled={isBusy}
                >
                  <Calendar size={14} color="#7c3aed" />
                  <Text style={styles.planCampButtonText}>Kamp Planla</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.currentLocationButton}
                  onPress={addCampingAreaAtCurrentLocation}
                  disabled={isBusy}
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
            campingAreas={filteredCampingAreas}
            onSelectArea={(area) => {
              if (!isMounted.current) return;
              setSelectedCampingArea(area);
              setShowDetailModal(true);
            }}
            onNavigate={handleNavigateFromList}
            currentLocation={location?.coords}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
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
          // Güncellenen kaydı tekrar bul ve state'e yaz
          if (selectedCampingArea) {
            const updated = campingAreas.find(a => (a as any).id === (selectedCampingArea as any).id);
            if (updated) setSelectedCampingArea(updated);
          }
        }}
        currentUserId={user?.id}
      />
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
    flex: 1,
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
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
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