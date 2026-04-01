import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { getLastKnownLocationAsync } from '../lib/largeStorage';
import CustomDatePicker, { formatDateTR } from '../components/CustomDatePicker';
import { SvgXml } from 'react-native-svg';
import { campingTypes, getCampingTypeLabel, getCampingTypeIcon } from '../lib/categories';
import { getDatabase } from '../lib/database';
import { fetchOpenMeteoForecast, evaluateOpenMeteoForecast } from '../lib/openMeteo';
import CampingAreaDetailModal from '../components/CampingAreaDetailModal';
import Badge from '../components/Badge';
import WeatherIcon from '../components/WeatherIcon';
import Icon from './icons';
import { useTheme } from '../components/ThemeProvider';
import { eventBus } from '../lib/eventBus';
import { getLocationNameFromOSM, getProvinceFromOSM } from '../lib/osmReverseGeocode';

const DRAFT_KEY = 'campPlannerDraft';
const SAVED_PLANS_KEY = 'campPlannerSavedPlans';
const WEATHER_API_KEY = '750db91332eb47c69c8171303262703';

type CampPlanLocation = {
  latitude: number;
  longitude: number;
  label?: string;
};

type CampPlanStatus = 'draft' | 'saved';

type CampPlan = {
  id: string;
  startDate?: string;
  endDate?: string;
  campType?: string;
  location?: CampPlanLocation;
  weather?: any;
  announcements?: any[];
  status: CampPlanStatus;
  updatedAt: string;
  createdAt: string;
};

const steps = [
  { id: 0, title: 'Tarih Seçimi', description: 'Tarih seçmek zorunlu değil, planınızı esnek bırakabilirsiniz.' },
  { id: 1, title: 'Kamp Türü Seçimi', description: 'Kamp türünüzü seçin (algoritma ve filtreler buna göre güncellenecek).' },
  { id: 2, title: 'Bölge Seçimi', description: 'Haritadan konumu seçin, bu lokasyondaki kamp alanları yüklenecek.' },
  { id: 3, title: 'Hava & Duyurular', description: 'Seçtiğiniz konuma göre hava tahmini ve duyurular görünecek.' },
  { id: 4, title: 'Plan Kaydet', description: 'Planı kaydedin, istediğiniz zaman devam edin veya güncelleyin.' },
];

const emptyPlan = (): CampPlan => ({
  id: `${Date.now()}`,
  status: 'draft',
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const formatYmdToDdMmYyyy = (ymd?: string | null) => {
  if (!ymd) return '';
  try {
    const parts = String(ymd).split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  } catch (e) {}
  return formatDateTR(ymd as any);
};

const makeMapHTML = (lat: number, lng: number) => `<!DOCTYPE html><html><head><meta name="viewport" content="initial-scale=1.0,user-scalable=no"/><link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/><style>html,body,#map{width:100%;height:100%;margin:0;padding:0;}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet/dist/leaflet.js"></script><script>var map=L.map('map').setView([${lat},${lng}],7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);var marker=null;function setMarker(lat,lng){if(marker){map.removeLayer(marker);} marker=L.marker([lat,lng]).addTo(map);}map.on('click',function(e){var c=e.latlng;setMarker(c.lat,c.lng);window.ReactNativeWebView.postMessage(JSON.stringify({type:'selected',latitude:c.lat,longitude:c.lng}));});</script></body></html>`;

export default function CampPlanPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<CampPlan>(emptyPlan());
  const [savedPlans, setSavedPlans] = useState<CampPlan[]>([]);
  const [isCreatingNewPlan, setIsCreatingNewPlan] = useState<boolean>(false);
  const [availableCampAreas, setAvailableCampAreas] = useState<any[]>([]);
  const [selectedLocationText, setSelectedLocationText] = useState('Henüz konum seçilmedi');
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weathermap, setWeatherMap] = useState<any>(null);
  const [announcementList, setAnnouncementList] = useState<any[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [planLocationNames, setPlanLocationNames] = useState<Record<string, string>>({});
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{latitude:number; longitude:number}>({ latitude: 39.9251, longitude: 32.8375 });
  const [selectedCampingAreaObj, setSelectedCampingAreaObj] = useState<any | null>(null);
  const [showCampingAreaModal, setShowCampingAreaModal] = useState(false);
  const savedScrollRef = useRef<ScrollView | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<number>(0);
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const SIDE_PADDING = 16; // matches styles.content padding
  const CARD_SPACING = 12;
  const CARD_WIDTH = SCREEN_WIDTH - SIDE_PADDING * 2;
  const ITEM_WIDTH = CARD_WIDTH + CARD_SPACING;
  
  // Sync carousel position when expandedPlanId changes
  useEffect(() => {
    if (!savedPlans || savedPlans.length === 0) return;
    const idx = Math.max(0, savedPlans.findIndex(p => p.id === expandedPlanId));
    setCarouselIndex(idx >= 0 ? idx : 0);
    try {
      if (savedScrollRef.current && typeof idx === 'number' && idx >= 0) {
        savedScrollRef.current.scrollTo({ x: idx * ITEM_WIDTH, animated: true });
      }
    } catch (e) {}
  }, [expandedPlanId, savedPlans]);

  const { theme } = useTheme();

  const themedStyles: any = {
    container: [styles.container, { backgroundColor: theme.colors.background }],
    topBar: [styles.topBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
    title: [styles.title, { color: theme.colors.text }],
    selectButton: [styles.selectButton, { backgroundColor: theme.colors.primary }],
    selectButtonText: [styles.selectButtonText, { color: '#fff' }],
    stepIndicator: [styles.stepIndicator, { backgroundColor: theme.colors.surface }],
    stepIndicatorText: [styles.stepIndicatorText, { color: theme.colors.text }],
    bottomBar: [styles.bottomBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
    navBtn: [styles.navBtn, { backgroundColor: theme.colors.primary }],
    navBtnDisabled: [styles.navBtnDisabled, { backgroundColor: theme.colors.muted }],
    planCard: [styles.planCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
    smallHeader: [styles.smallHeader, { color: theme.colors.text }],
    summaryText: [styles.summaryText, { color: theme.colors.text }],
    weatherBox: [styles.weatherBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
    actionBtn: [styles.actionBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
    actionBtnText: [styles.actionBtnText, { color: theme.colors.text }],
    editBtn: [styles.editBtn, { backgroundColor: theme.colors.background }],
    smallItem: [styles.smallItem, { backgroundColor: theme.colors.surface }],
  };

  useEffect(() => {
    (async () => {
      try {
        // 1) Load existing draft and saved plans first
        const rawDraft = await AsyncStorage.getItem(DRAFT_KEY);
        const rawPlans = await AsyncStorage.getItem(SAVED_PLANS_KEY);
        let currentDraft: CampPlan = emptyPlan();
        if (rawDraft) {
          const parsed = JSON.parse(rawDraft);
          if (parsed && typeof parsed === 'object') {
            currentDraft = { ...emptyPlan(), ...parsed, status: 'draft' };
            if (parsed.status === 'draft') {
              setStepIndex(typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0);
            }
          }
        }
        if (rawPlans) {
          const parsedPlans = JSON.parse(rawPlans);
          if (Array.isArray(parsedPlans)) {
            setSavedPlans(parsedPlans);
            setIsCreatingNewPlan(parsedPlans.length === 0);
          }
        } else {
          // No saved plans -> start new planning immediately
          setSavedPlans([]);
          setIsCreatingNewPlan(true);
        }

        // 2) Then handle any pending selection (serialized processing to avoid races)
        try {
          const pendingRaw = await AsyncStorage.getItem('campPlanPendingSelected');
          if (pendingRaw) {
            const parsedPending = JSON.parse(pendingRaw);
            if (parsedPending && parsedPending.latitude && parsedPending.longitude) {
              let label = parsedPending.name || '';
              try {
                if ((!label || label.trim() === '') && parsedPending.id) {
                  const db = getDatabase();
                  const area = await db.getCampingAreaById(Number(parsedPending.id));
                  if (area && area.name) label = area.name;
                }
              } catch (e) {
                // ignore DB errors
              }

              const token = `${parsedPending.id ?? ''}:${parsedPending.latitude}:${parsedPending.longitude}`;
              processedSelectionRef.current = token;

              const newDraft: CampPlan = {
                ...currentDraft,
                location: {
                  latitude: Number(parsedPending.latitude),
                  longitude: Number(parsedPending.longitude),
                  label: label || 'Seçilen Kamp Alanı',
                },
              };
              currentDraft = newDraft;
              await AsyncStorage.removeItem('campPlanPendingSelected');
              if (typeof parsedPending.gotoStep === 'number') {
                setStepIndex(parsedPending.gotoStep);
              } else {
                await saveDraft(newDraft, 2);
              }
            }
          }
        } catch (e) {
          // ignore pending selection errors
        }

        // 3) Apply any pending step request
        try {
          const pendingStep = await AsyncStorage.getItem('campPlanPendingStep');
          if (pendingStep) {
            const p = JSON.parse(pendingStep);
            if (p && typeof p.step === 'number') setStepIndex(p.step);
            await AsyncStorage.removeItem('campPlanPendingStep');
          }
        } catch (e) {
          // ignore
        }

        // 4) Finally set draft state once
        setDraft(currentDraft);
      } catch (err) {
        console.warn('CampPlanPage load hata', err);
      }
    })();
  }, []);

  // Keep a ref to the latest draft so event handlers use up-to-date value
  const draftRef = useRef<CampPlan>(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Track last processed selection to avoid double-processing pending+event races
  const processedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (draft.location) {
      setSelectedLocationText(`${draft.location.latitude.toFixed(3)}, ${draft.location.longitude.toFixed(3)}`);
      setMapCenter({ latitude: draft.location.latitude, longitude: draft.location.longitude });
      loadNearbyAreas(draft.location.latitude, draft.location.longitude, draft.campType);
      loadAnnouncements(draft.location.latitude, draft.location.longitude);
      fetchWeather(draft.location.latitude, draft.location.longitude, draft.startDate, draft.endDate);
      (async () => {
        try {
          const name = await getLocationNameFromOSM(draft.location!.latitude, draft.location!.longitude);
          // Show as returned by OSM ("İl, İlçe") to match CampingAreaListView
          setLocationName(name);
        } catch (err) {
          console.warn('[camp-plan] reverse geocode hata', err);
          setLocationName(null);
        }
      })();
    } else {
      setSelectedLocationText('Henüz konum seçilmedi');
      setAvailableCampAreas([]);
      setAnnouncementList([]);
      setWeatherMap(null);
      setLocationName(null);
    }
  }, [draft.location, draft.startDate, draft.endDate]);

      // Eğer lokasyon seçildiyse ve yakın kamp alanları yüklendiyse,
      // eğer kullanıcı tarafından bir etiket (label) atanmadıysa en yakın kamp alanının adını ata.
      useEffect(() => {
        try {
          if (!draft.location) return;
          const hasLabel = !!draft.location.label && !draft.location.label.startsWith('Haritadan') && draft.location.label !== 'Seçilen Kamp Alanı';
          if (hasLabel) return;
          if (availableCampAreas && availableCampAreas.length > 0) {
            // Hesapla: en yakın kamp alanını bul
            let best: any = null;
            let bestDist = Number.POSITIVE_INFINITY;
            for (const area of availableCampAreas) {
              if (!area.latitude || !area.longitude) continue;
              const d = getDistanceMeters(draft.location.latitude, draft.location.longitude, Number(area.latitude), Number(area.longitude));
              if (d < bestDist) {
                bestDist = d;
                best = area;
              }
            }
            if (best && best.name) {
              const newDraft = { ...draft, location: { ...draft.location, label: best.name } };
              saveDraft(newDraft, undefined);
            }
          }
        } catch (e) {
          // ignore
        }
      }, [availableCampAreas]);

  // MapScreen'den seçilen kamp alanını dinle
  useEffect(() => {
    const handler = async (payload: any) => {
      try {
        if (!payload) return;
        // Avoid double-processing the same selection if it was handled from pending storage
        const token = `${payload.id ?? ''}:${payload.latitude}:${payload.longitude}`;
        if (processedSelectionRef.current === token) return;
        processedSelectionRef.current = token;
        // Eğer payload içinde isim yoksa ve id varsa DB'den adını al
        let label = payload.name || '';
        try {
          if ((!label || label.trim() === '') && payload.id) {
            const db = getDatabase();
            const area = await db.getCampingAreaById(Number(payload.id));
            if (area && area.name) label = area.name;
          }
        } catch (e) {
          // ignore
        }

        const newDraft = {
          ...draft,
          location: {
            latitude: Number(payload.latitude),
            longitude: Number(payload.longitude),
            label: label || 'Seçilen Kamp Alanı',
          },
        };
        setDraft(newDraft);
        // Eğer payload içinde gotoStep varsa oraya ilerle, yoksa 2. adıma kaydet
        if (typeof payload.gotoStep === 'number') {
          saveDraft(newDraft, payload.gotoStep);
          setStepIndex(payload.gotoStep);
        } else {
          saveDraft(newDraft, 2);
        }
        // Eğer kamp türü boşsa, seçilen alanın türünü atamaya çalış
        if (!newDraft.campType && payload.type) {
          saveDraft({ ...newDraft, campType: payload.type });
        }
      } catch (e) {
        console.warn('[camp-plan] selectedArea handler hata', e);
      }
    };
    eventBus.on('camp-plan:selectedArea', handler);
    return () => {
      eventBus.off('camp-plan:selectedArea', handler);
    };
  }, [draft]);

  // Eğer kamp türü değişirse ve lokasyon varsa, yakın kamp alanlarını yeniden filtrele
  useEffect(() => {
    if (draft.location) {
      loadNearbyAreas(draft.location.latitude, draft.location.longitude, draft.campType);
    }
  }, [draft.campType]);

  // Eğer kullanıcı Adım 3'e (Hava & Duyurular) geldiyse, mevcut seçimi hemen yenile
  useEffect(() => {
    const doRefresh = async () => {
      try {
        if (stepIndex === 3 && draft.location) {
          const { latitude, longitude } = draft.location;
          // Yenilemeleri paralel başlat
          loadNearbyAreas(latitude, longitude, draft.campType);
          loadAnnouncements(latitude, longitude);
          fetchWeather(latitude, longitude, draft.startDate, draft.endDate);
        }
      } catch (e) {
        console.warn('[camp-plan] step3 refresh hata', e);
      }
    };
    doRefresh();
  }, [stepIndex, draft.location?.latitude, draft.location?.longitude, draft.campType, draft.startDate, draft.endDate]);

  // Map ekranındaki overlay'in ileri/geri butonlarına yanıt ver
  useEffect(() => {
    const onMapNext = async () => {
      // Harita üzerindeki İleri butonu: doğrudan Hava & Duyurular (adım index 3) olmalı
      const target = 3;
      setStepIndex(target);
      try { await saveDraft(draftRef.current, target); } catch {};
    };
    const onMapBack = async () => {
      // Harita üzerindeki Geri butonu: Kamp Türü seçimine (adım index 1) geri dönmeli
      const target = 1;
      setStepIndex(target);
      try { await saveDraft(draftRef.current, target); } catch {};
    };
    eventBus.on('camp-plan:mapNext', onMapNext);
    eventBus.on('camp-plan:mapBack', onMapBack);
    return () => {
      eventBus.off('camp-plan:mapNext', onMapNext);
      eventBus.off('camp-plan:mapBack', onMapBack);
    };
  }, []);

  const saveDraft = async (newDraft: CampPlan, newStepIndex?: number) => {
    const payload: CampPlan = {
      ...newDraft,
      updatedAt: new Date().toISOString(),
      status: 'draft',
    };
    setDraft(payload);
    try {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      eventBus.emit('camp-planner:updated');
    } catch (err) {
      console.warn('[camp-plan] draft kaydetme hata', err);
    }
  };

  const clearDraft = async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
      setDraft(emptyPlan());
      eventBus.emit('camp-planner:updated');
    } catch (err) {
      console.warn('[camp-plan] draft temizleme hata', err);
    }
  };

  const persistPlan = async () => {
    setIsSaving(true);
    try {
      const planToSave: CampPlan = {
        ...draft,
        status: 'saved',
        updatedAt: new Date().toISOString(),
      };
      const existing = await AsyncStorage.getItem(SAVED_PLANS_KEY);
      let list: CampPlan[] = [];
      if (existing) {
        const parsed = JSON.parse(existing);
        if (Array.isArray(parsed)) list = parsed;
      }
      list = [planToSave, ...list.filter(p => p.id !== planToSave.id)];
      await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(list));
      await AsyncStorage.removeItem(DRAFT_KEY);
      setSavedPlans(list);
      setDraft(planToSave);
      eventBus.emit('camp-planner:updated');
      // Clear any pending selection/step keys so map overlay won't reopen unexpectedly
      try { await AsyncStorage.removeItem('campPlanPendingSelected'); } catch (_) {}
      try { await AsyncStorage.removeItem('campPlanPendingStep'); } catch (_) {}
      try { eventBus.emit('camp-plan:modeActive', { active: false }); } catch (_) {}

      Alert.alert('Başarılı', 'Kamp planınız kaydedildi.');

      // Navigate back to map screen
      try { router.replace('/'); } catch (e) { try { router.push('/'); } catch (_) {} }
    } catch (err) {
      console.warn('[camp-plan] plan kaydetme hata', err);
      Alert.alert('Hata', 'Plan kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadNearbyAreas = async (lat: number, lng: number, campType?: string | null) => {
    try {
      const all = await getDatabase().listCampingAreas();
      const filtered = all.filter((area: any) => {
        if (!area.latitude || !area.longitude) return false;
        const d = getDistanceMeters(lat, lng, Number(area.latitude), Number(area.longitude));
        if (d > 25000) return false;

        // area type normalization (tags.type or tags string or area.type)
        const rawTags = (area as any).tags;
        const areaType: string = (typeof rawTags === 'object' && rawTags !== null && rawTags.type)
          ? rawTags.type
          : (typeof rawTags === 'string' && (rawTags as string).trim() !== '')
            ? rawTags
            : (typeof (area as any).type === 'string' ? (area as any).type : '');

        if (campType && areaType && String(areaType) !== String(campType)) return false;

        return true;
      });
      setAvailableCampAreas(filtered);
    } catch (err) {
      console.warn('camp-plan nearby area hata', err);
      setAvailableCampAreas([]);
    }
  };

  const loadAnnouncements = async (lat: number, lng: number) => {
    try {
      const db = getDatabase();
      const localAnnouncements = (await db.listAnnouncementsLocal({ onlyActive: true })) || [];

      // Kullanıcı bilgisi ve bağlantı durumu
      let userData: any = null;
      try {
        const { getMe } = require('../lib/userCommunityApi');
        userData = await getMe();
      } catch (e) {
        userData = null;
      }
      let isConnected = true;
      try {
        const net = await Network.getNetworkStateAsync();
        isConnected = !!net.isConnected && !!net.isInternetReachable;
      } catch (e) {
        isConnected = true;
      }

      // Bulunduğumuz koordinattan valilik/province tespiti
      let matchedValilikIdLocal: number | null = null;
      try {
        const province = await getProvinceFromOSM(lat, lng);
        if (province) {
          const { getValilikIdFromProvinceName } = require('../lib/provinceMap');
          const vid = getValilikIdFromProvinceName(province);
          if (vid) matchedValilikIdLocal = Number(vid);
        }
      } catch (e) {
        // ignore
      }

      const isSuperadmin = userData?.role === 'superadmin';

      let filtered = localAnnouncements;
      if (!isSuperadmin) {
        filtered = localAnnouncements.filter((a: any) => {
          if (a.community_id === 0) {
            // Bölgesel duyuruysa valilik id eşleşmeli
            if (a.valilik_id) {
              if (matchedValilikIdLocal) {
                return String(a.valilik_id) === String(matchedValilikIdLocal);
              }
              return false;
            }
            // Genel duyuru: online veya premium kullanıcı için göster
            if (isConnected || userData?.offline_enabled) return true;
            return false;
          }
          // Topluluk duyuruları gösterilsin
          if (userData?.community_id && String(a.community_id) === String(userData.community_id)) return true;
          return false;
        });
      }

      // Sıralama: superadmin duyuruları ve topluluk duyuruları öncelik
      const sortLeaderFirst = (arr: any[]) => {
        const byDate = (a: any, b: any) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        };
        const superadminAnnouncements = arr
          .filter(a => a.community_id === 0 && !a.valilik_id)
          .sort(byDate);
        const communityAnnouncements = arr.filter(a => a.community_id !== 0);
        const valilikAnnouncements = arr
          .filter(a => a.community_id === 0 && !!a.valilik_id)
          .sort(byDate);
        return [...superadminAnnouncements, ...communityAnnouncements, ...valilikAnnouncements];
      };

      const sorted = sortLeaderFirst(filtered);
      setAnnouncementList(sorted.slice(0, 10));
    } catch (err) {
      console.warn('camp-plan announcements hata', err);
      setAnnouncementList([]);
    }
  };

  const evaluateForecast = (days: any[] | undefined) => {
    if (!Array.isArray(days) || days.length === 0) return '';
    let totalPop = 0;
    let maxPop = 0;
    let totalMeanTemp = 0;
    let maxWind = 0;
    let count = 0;
    for (const d of days) {
      const pop = Number((d.pop ?? 0)) || 0;
      const maxT = Number((d.maxTemp ?? d.temp ?? 0)) || 0;
      const minT = Number((d.minTemp ?? d.temp ?? 0)) || 0;
      const meanT = (maxT + minT) / 2;
      const wind = Number((d.wind_kph ?? 0)) || 0;
      totalPop += pop;
      maxPop = Math.max(maxPop, pop);
      totalMeanTemp += meanT;
      maxWind = Math.max(maxWind, wind);
      count += 1;
    }
    const avgPop = Math.round(totalPop / Math.max(1, count));
    const avgTemp = Math.round(totalMeanTemp / Math.max(1, count));

    const messages: string[] = [];
    if (maxPop >= 70) messages.push('Yağış riski yüksek gün(ler) var.');
    else if (avgPop >= 40) messages.push('Yağış ihtimali var.');
    if (avgTemp <= 0) messages.push('Çok soğuk; don riski olabilir.');
    else if (avgTemp <= 10) messages.push('Serin hava bekleniyor.');
    else if (avgTemp >= 30) messages.push('Sıcak hava bekleniyor.');
    if (maxWind >= 50) messages.push('Güçlü rüzgar uyarısı.');
    if (messages.length === 0) messages.push('Genelde kamp için uygun hava bekleniyor.');

    return `${messages.join(' ')} (Ortalama sıcaklık ${avgTemp}°C, ort. yağış olasılığı ${avgPop}%)`;
  };

  const fetchWeather = async (lat: number, lng: number, startDate?: string | null, endDate?: string | null) => {
    setWeatherLoading(true);
    try {
      const toLocalIsoDay = (s?: string | null) => {
        try {
          if (!s) return null;
          const d = new Date(s);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch {
          return null;
        }
      };

      const parseYmdToLocal = (ymd?: string | null) => {
        if (!ymd) return null;
        const parts = String(ymd).split('-').map(p => Number(p));
        if (parts.length !== 3 || parts.some(isNaN)) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
      };

      const ymdAddDays = (ymd: string, days: number) => {
        const d = parseYmdToLocal(ymd);
        if (!d) return null;
        const nd = new Date(d.getTime());
        nd.setDate(nd.getDate() + days);
        return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
      };

      const datesRangeInclusive = (startYmd: string, endYmd: string) => {
        const out: string[] = [];
        const s = parseYmdToLocal(startYmd);
        const e = parseYmdToLocal(endYmd);
        if (!s || !e) return out;
        for (let cur = new Date(s.getTime()); cur.getTime() <= e.getTime(); cur.setDate(cur.getDate() + 1)) {
          out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
        }
        return out;
      };

      const diffDays = (() => {
        const startDay = toLocalIsoDay(startDate);
        const endDay = toLocalIsoDay(endDate);
        if (!startDay && !endDay) return 3;
        if (startDay && endDay) {
          try {
            const s = parseYmdToLocal(startDay);
            const e = parseYmdToLocal(endDay);
            if (!s || !e) return 3;
            const ms = e.getTime() - s.getTime();
            const count = Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
            return Math.min(count, 15);
          } catch (err) {
            return 3;
          }
        }
        return 3;
      })();

      // Primary: Open-Meteo (free, up to 16 days)
      try {
          const startDay = toLocalIsoDay(startDate);
          const endDay = toLocalIsoDay(endDate);

          // Ensure we request enough days so the returned array includes
          // startDate + diffDays-1 following days. If startDay is in the future
          // request daysUntilStart + diffDays so the returned series contains
          // the requested start..end window.
          let daysToFetch = diffDays;
          if (startDay) {
            try {
              const todayLocal = new Date();
              const todayYmd = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
              const startDateObj = parseYmdToLocal(startDay);
              const todayDateObj = parseYmdToLocal(todayYmd);
              const daysUntilStart = Math.max(0, Math.round((startDateObj.getTime() - todayDateObj.getTime()) / (1000 * 60 * 60 * 24)));
              daysToFetch = Math.min(16, daysUntilStart + diffDays);
              if (daysToFetch < 1) daysToFetch = diffDays;
            } catch (e) {
              daysToFetch = diffDays;
            }
          }

          const data = await fetchOpenMeteoForecast(lat, lng, daysToFetch);

          let selectedDays: any[] = [];
          if (startDay) {
            // Determine inclusive end date: either provided endDay, or startDay + diffDays -1
            const computedEnd = endDay ? endDay : (() => {
              const d = parseYmdToLocal(startDay);
              if (!d) return startDay;
              const nd = new Date(d.getTime());
              nd.setDate(nd.getDate() + diffDays - 1);
              return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
            })();
            const wanted = datesRangeInclusive(startDay, computedEnd);
            selectedDays = wanted.map(w => data.days.find((md: any) => md.date === w)).filter(Boolean);
          } else if (!startDay && !endDay) {
            selectedDays = data.days;
          } else {
            // only endDay provided (rare) — include from earliest available up to endDay
            selectedDays = data.days.filter((md: any) => md.date <= endDay);
          }

          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            try {
              console.debug('[camp-plan][fetchWeather][open-meteo] debug', {
                startDay, endDay, diffDays, daysToFetch,
                returnedDates: data.days?.map((d: any) => d.date),
                selectedDates: selectedDays.map((d: any) => d.date),
              });
            } catch (e) {}
          }

        const current = data.raw?.current_weather || { temperature: selectedDays?.[0]?.avgTemp ?? null, windspeed: selectedDays?.[0]?.wind_kph ?? null };
        const list = [{ weather: [{ description: selectedDays?.[0]?.text || (current?.temperature ? `Sıcaklık ${current.temperature}°C` : '') }], main: { temp: current?.temperature ?? selectedDays?.[0]?.avgTemp ?? null, humidity: null }, pop: selectedDays?.[0]?.pop ?? 0 }];
        setWeatherMap({ provider: 'open-meteo', city: data.city || { name: data.raw?.timezone || 'Open-Meteo' }, list, days: selectedDays, raw: data.raw });
        return;
      } catch (err) {
        console.warn('[camp-plan] Open-Meteo primary failed, falling back to WeatherAPI:', err);
      }

      // Fallback legacy flow: WeatherAPI -> Open-Meteo hourly (keeps existing behavior if needed)
      const diffDaysLegacy = (() => {
        const startDay = toLocalIsoDay(startDate);
        const endDay = toLocalIsoDay(endDate);
        if (!startDay && !endDay) return 3;
        if (startDay && endDay) {
          try {
            const s = parseYmdToLocal(startDay);
            const e = parseYmdToLocal(endDay);
            if (!s || !e) return 3;
            const ms = e.getTime() - s.getTime();
            const count = Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
            return Math.min(count, 10);
          } catch (err) {
            return 3;
          }
        }
        return 3;
      })();

      // If startDate is provided, request extra days so the forecast includes
      // startDate + diffDaysLegacy-1 following days.
      let weatherApiDays = diffDaysLegacy;
      try {
        const startDayTemp = toLocalIsoDay(startDate);
        if (startDayTemp) {
          const todayLocal = new Date();
          const todayYmd = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
          const startDateObj = parseYmdToLocal(startDayTemp);
          const todayDateObj = parseYmdToLocal(todayYmd);
          const daysUntilStart = Math.max(0, Math.round((startDateObj.getTime() - todayDateObj.getTime()) / (1000 * 60 * 60 * 24)));
          weatherApiDays = Math.min(10, daysUntilStart + diffDaysLegacy);
          if (weatherApiDays < 1) weatherApiDays = diffDaysLegacy;
        }
      } catch (e) {
        weatherApiDays = diffDaysLegacy;
      }

      const weatherApiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lng}&days=${weatherApiDays}&aqi=no&alerts=yes`;
      const waRes = await fetch(weatherApiUrl);
      if (waRes.ok) {
        const waData = await waRes.json();
        const forecastDays = waData.forecast?.forecastday || [];
        const days = forecastDays.map((d: any) => ({
          date: d.date,
          text: d.day?.condition?.text,
          icon: d.day?.condition?.icon,
          maxTemp: d.day?.maxtemp_c,
          minTemp: d.day?.mintemp_c,
          avgTemp: d.day?.avgtemp_c,
          pop: (d.day?.daily_chance_of_rain ?? d.day?.daily_chance_of_precip ?? d.day?.daily_chance_of_snow) ?? 0,
          wind_kph: d.day?.maxwind_kph ?? 0,
          raw: d,
        }));

        const startDay = toLocalIsoDay(startDate);
        const endDay = toLocalIsoDay(endDate);
        let selectedDays: any[] = [];
        if (startDay) {
          const computedEnd = endDay ? endDay : (() => {
            const d = parseYmdToLocal(startDay);
            if (!d) return startDay;
            const nd = new Date(d.getTime());
            nd.setDate(nd.getDate() + diffDaysLegacy - 1);
            return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
          })();
          const wanted = datesRangeInclusive(startDay, computedEnd);
          selectedDays = wanted.map(w => days.find((md: any) => md.date === w)).filter(Boolean);
        } else if (!startDay && !endDay) {
          selectedDays = days;
        } else {
          // only endDay provided: include all available days up to endDay
          selectedDays = days.filter((md: any) => md.date <= endDay);
        }

        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          try {
            console.debug('[camp-plan][fetchWeather][weatherapi] debug', {
              startDay, endDay, diffDaysLegacy,
              requestedDays: weatherApiDays,
              returnedDates: days.map((d: any) => d.date),
              selectedDates: selectedDays.map((d: any) => d.date),
            });
          } catch (e) {}
        }

        const current = waData.current || {};
        const list = [
          {
            weather: [{ description: current?.condition?.text || '' }],
            main: { temp: current?.temp_c ?? current?.temp_f ?? null, humidity: current?.humidity ?? null },
            pop: selectedDays?.[0]?.pop ?? 0,
          },
        ];

        setWeatherMap({ provider: 'weatherapi', city: { name: waData.location?.name || `${waData.location?.region || ''} ${waData.location?.country || ''}` }, list, days: selectedDays, alerts: waData.alerts ?? waData.alert ?? null, raw: waData });
        return;
      }

      // Final fallback: older Open-Meteo hourly mapping (kept for compatibility)
      console.warn('[camp-plan] WeatherAPI hata, fallback Open-Meteo hourly kullanılıyor', waRes.status);
      const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,windspeed_10m&timezone=auto`;
      const openMeteoRes = await fetch(openMeteoUrl);
      if (!openMeteoRes.ok) {
        throw new Error(`Open-Meteo ${openMeteoRes.status}`);
      }
      const openMeteoData = await openMeteoRes.json();
      const hourly = openMeteoData.hourly || {};
      const times: string[] = hourly.time || [];
      const temps: number[] = hourly.temperature_2m || [];
      const pops: number[] = hourly.precipitation_probability || [];
      const winds: number[] = hourly.windspeed_10m || [];
      const daysMap: Record<string, any> = {};
      for (let i = 0; i < times.length; i++) {
        const date = times[i].slice(0, 10);
        daysMap[date] = daysMap[date] || { temps: [], pops: [], winds: [] };
        if (typeof temps[i] === 'number') daysMap[date].temps.push(temps[i]);
        if (typeof pops[i] === 'number') daysMap[date].pops.push(pops[i]);
        if (typeof winds[i] === 'number') daysMap[date].winds.push(winds[i]);
      }
      const mappedDays = Object.keys(daysMap).map((date) => {
        const d = daysMap[date];
        const maxTemp = d.temps.length ? Math.max(...d.temps) : null;
        const minTemp = d.temps.length ? Math.min(...d.temps) : null;
        const avgTemp = d.temps.length ? Math.round(d.temps.reduce((a: number, b: number) => a + b, 0) / d.temps.length) : null;
        const avgPop = d.pops.length ? Math.round(d.pops.reduce((a: number, b: number) => a + b, 0) / d.pops.length) : 0;
        const maxWind = d.winds.length ? Math.max(...d.winds) : 0;
        return { date, maxTemp, minTemp, avgTemp, pop: avgPop, wind_kph: maxWind, raw: openMeteoData };
      });

      const startDay = toLocalIsoDay(startDate);
      const endDay = toLocalIsoDay(endDate);
      let selectedDaysOm: any[] = [];
      if (startDay) {
        const computedEnd = endDay ? endDay : (() => {
          const d = parseYmdToLocal(startDay);
          if (!d) return startDay;
          const nd = new Date(d.getTime());
          nd.setDate(nd.getDate() + diffDaysLegacy - 1);
          return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
        })();
        const wanted = datesRangeInclusive(startDay, computedEnd);
        selectedDaysOm = wanted.map(w => mappedDays.find((md: any) => md.date === w)).filter(Boolean);
      } else if (!startDay && !endDay) {
        selectedDaysOm = mappedDays;
      } else {
        // only endDay provided: include all available days up to endDay
        selectedDaysOm = mappedDays.filter((md: any) => md.date <= endDay);
      }

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        try {
          console.debug('[camp-plan][fetchWeather][open-meteo-hourly] debug', {
            startDay, endDay, diffDaysLegacy,
            returnedDates: mappedDays.map((d: any) => d.date),
            selectedDates: selectedDaysOm.map((d: any) => d.date),
          });
        } catch (e) {}
      }

      const currentWeather = openMeteoData.current_weather || { temperature: mappedDays?.[0]?.avgTemp ?? null, windspeed: mappedDays?.[0]?.wind_kph ?? null };
      const list = [{ weather: [{ description: `Sıcaklık ${currentWeather.temperature}°C, rüzgar ${currentWeather.windspeed} km/s` }], main: { temp: currentWeather.temperature, humidity: openMeteoData.hourly?.relativehumidity_2m?.[0] ?? null }, pop: selectedDaysOm?.[0]?.pop ?? 0 }];
      setWeatherMap({ provider: 'open-meteo', city: { name: openMeteoData.timezone || 'Open-Meteo' }, list, days: selectedDaysOm, raw: openMeteoData });
    } catch (err) {
      console.warn('[camp-plan] weather fetch hata', err);
      setWeatherMap(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  const selectCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Konum İzni', 'Konum izni verilmedi. Harita üzerinden manuel seçebilirsiniz.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const newDraft = {
        ...draft,
        location: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          label: 'Mevcut Konum',
        },
      };
      saveDraft(newDraft, 3);
    } catch (err) {
      console.warn('[camp-plan] current location error', err);
      Alert.alert('Hata', 'Konum alınamadı. Lütfen tekrar deneyin.');
    }
  };

  const onMapMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'selected' && data.latitude && data.longitude) {
        const newDraft = {
          ...draft,
          location: {
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            label: 'Haritadan Seçilen',
          },
        };
        saveDraft(newDraft, 3);
        setMapCenter({ latitude: Number(data.latitude), longitude: Number(data.longitude) });
      }
    } catch (error) {
      console.warn('[camp-plan] map message parse error', error);
    }
  };

  const handleStepNext = async () => {
    if (stepIndex === 0) {
      if (draft.startDate && draft.endDate) {
        const start = new Date(draft.startDate);
        const end = new Date(draft.endDate);
        if (end < start) {
          Alert.alert('Tarih Bilgisi', 'Bitiş tarihi başlangıç tarihinden önce olamaz.');
          return;
        }
      }
    }
    if (stepIndex === 1 && !draft.campType) {
      Alert.alert('Kamp Türü', 'Lütfen kamp türü seçin veya bir sonraki adıma devam edin.');
      return;
    }
    const nextStep = Math.min(steps.length - 1, stepIndex + 1);
    // Eğer 1. adımdan (Kamp Türü) ilerleniyorsa, harita açılmadan önce cihazın mevcut konumunu alıp MapScreen'e gönder
    if (stepIndex === 1) {
      try {
        let currentLoc = draft.location ?? null;
        try {
          const cached = await getLastKnownLocationAsync();
          if (cached && typeof cached.latitude === 'number' && typeof cached.longitude === 'number') {
            currentLoc = { latitude: cached.latitude, longitude: cached.longitude };
          } else {
            try {
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              currentLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            } catch (locErr) {
              console.warn('[camp-plan] current location alınamadı ve cache boş, fallback to draft.location', locErr);
            }
          }
        } catch (cacheErr) {
          console.warn('[camp-plan] cached location okunurken hata', cacheErr);
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            currentLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          } catch (locErr) {
            console.warn('[camp-plan] current location alınamadı, fallback to draft.location', locErr);
          }
        }

        // Saveden önce adımı güncelle
        setStepIndex(nextStep);
        saveDraft(draft, nextStep);

        // Map ekranını aç ve seçili kamp türü ile cihaz konumunu gönder
        try { router.push('/'); } catch (e) {}
        (async () => {
          try {
            await AsyncStorage.setItem('campPlanPendingOpen', JSON.stringify({ campType: draft.campType, location: currentLoc }));
          } catch (e) {}
          setTimeout(() => {
            eventBus.emit('camp-plan:openMap', { campType: draft.campType, location: currentLoc });
          }, 400);
        })();
        return;
      } catch (e) {
        console.warn('[camp-plan] open map with current location hata', e);
      }
    }

    setStepIndex(nextStep);
    saveDraft(draft, nextStep);
  };

  const handleStepBack = async () => {
    if (stepIndex === 0) return;
    const prev = stepIndex - 1;
    // Eğer geri dönüş Bölge Seçimi adımına (2) ise, kullanıcıyı tam ekran haritaya yönlendir
    if (prev === 2) {
      setStepIndex(prev);
      await saveDraft(draft, prev);
      try { router.push('/'); } catch (e) {}
      (async () => {
        try {
          await AsyncStorage.setItem('campPlanPendingOpen', JSON.stringify({ campType: draft.campType, location: draft.location }));
        } catch (e) {}
        setTimeout(() => {
          eventBus.emit('camp-plan:openMap', { campType: draft.campType, location: draft.location });
        }, 350);
      })();
      return;
    }

    setStepIndex(prev);
    saveDraft(draft, prev);
  };

  const openPlan = (plan: CampPlan) => {
    setDraft(plan);
    // Ensure UI shows the step content (tarih seçimi) instead of saved list
    setIsCreatingNewPlan(true);
    setStepIndex(0);
    saveDraft({ ...plan, status: 'draft' }, 0);
  };

  const siteDistanceText = (loc: CampPlanLocation | undefined, area: any) => {
    if (!loc || !area.latitude || !area.longitude) return '-';
    const d = getDistanceMeters(loc.latitude, loc.longitude, Number(area.latitude), Number(area.longitude));
    return `${(d / 1000).toFixed(1)} km`;
  };

  const handleNavigate = (lat: number | undefined, lng: number | undefined, provider: 'google' | 'yandex') => {
    if (!lat || !lng) return;
    const url = provider === 'google'
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `yandexmaps://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
    Linking.openURL(url).catch(err => console.error('Navigation error:', err));
  };

  const openCampingAreaDetail = async (plan: CampPlan) => {
    try {
      if (!plan.location) {
        Alert.alert('Konum yok', 'Bu plan için konum bilgisi yok.');
        return;
      }
      let found: any | null = null;
      // Önce yakın kamp alanları içinden aramaya çalış
      if (availableCampAreas && availableCampAreas.length > 0) {
        if (plan.location.label) {
          found = availableCampAreas.find((a: any) => a && a.name && (a.name === plan.location!.label || a.name.includes(plan.location!.label) || plan.location!.label.includes(a.name)));
        }
        if (!found) {
          let best: any = null;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const a of (availableCampAreas as any[])) {
            if (!a.latitude || !a.longitude) continue;
            const d = getDistanceMeters(plan.location.latitude, plan.location.longitude, Number(a.latitude), Number(a.longitude));
            if (d < bestDist) { bestDist = d; best = a; }
          }
          if (best) found = best;
        }
      }

      // Eğer hala bulunamadıysa DB'den tüm alanları tara ve en yakın olanı al
      if (!found) {
        const db = getDatabase();
        const all = await db.listCampingAreas();
        let best: any = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const a of (all as any[])) {
          if (!a.latitude || !a.longitude) continue;
          const d = getDistanceMeters(plan.location.latitude, plan.location.longitude, Number(a.latitude), Number(a.longitude));
          if (d < bestDist) { bestDist = d; best = a; }
        }
        if (best) found = best;
      }

      if (found && found.id) {
        const db = getDatabase();
        const full = await db.getCampingAreaById(Number(found.id));
        if (full) {
          setSelectedCampingAreaObj(full);
          setShowCampingAreaModal(true);
          return;
        }
      }

      Alert.alert('Detay bulunamadı', 'Bu kamp alanına ait detay verisi bulunamadı.');
    } catch (err) {
      console.warn('[camp-plan] openCampingAreaDetail hata', err);
      Alert.alert('Hata', 'Kamp alanı detayı açılamadı.');
    }
  };

  const stepContent = useMemo(() => {
    switch (stepIndex) {
      case 0:
        return (
          <View>
            <Text style={styles.fieldLabel}>Kamp Başlangıç Tarihi</Text>
            <TouchableOpacity style={themedStyles.selectButton} onPress={() => setIsStartDatePickerOpen(true)}>
              <Text style={themedStyles.selectButtonText}>{draft.startDate ? formatDateTR(draft.startDate) : 'Tarih Seçilmedi'}</Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Kamp Bitiş Tarihi</Text>
            <TouchableOpacity style={themedStyles.selectButton} onPress={() => setIsEndDatePickerOpen(true)}>
              <Text style={themedStyles.selectButtonText}>{draft.endDate ? formatDateTR(draft.endDate) : 'Tarih Seçilmedi'}</Text>
            </TouchableOpacity>

            <Text style={styles.helpText}>Tarih seçmek zorunlu değildir. Boş geçerek sonraki adıma devam edebilirsiniz.</Text>
          </View>
        );
      case 1:
        return (
          <View>
            <Text style={styles.fieldLabel}>Kamp Türü Seçin</Text>
            <View style={styles.typeGrid}>
              {campingTypes.map((type) => {
                const selected = draft.campType === type.id;
                const iconNode = getCampingTypeIcon(type.id);
                const renderIcon = (n: any) => {
                  if (typeof n === 'string') {
                    if (n.startsWith('<svg')) {
                      return <SvgXml xml={n} width={18} height={18} />;
                    }
                    return <Text style={{ fontSize: 20 }}>{n}</Text>;
                  }
                  return n;
                };
                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.typeCard, selected && styles.typeCardSelected]}
                    onPress={() => saveDraft({ ...draft, campType: type.id })}
                  >
                    <View style={styles.typeIcon}>{renderIcon(iconNode)}</View>
                    <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>{type.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helpText}>Kamp türleri dinamik olarak merkezi kategori listesinden gelir.</Text>
          </View>
        );
      case 2:
        return (
          <View>
            <Text style={styles.fieldLabel}>Bölge seçimi</Text>
            <TouchableOpacity style={styles.selectButton} onPress={selectCurrentLocation}>
              <Icon name="MapPin" size={16} color="#fff" />
              <Text style={themedStyles.selectButtonText || styles.selectButtonText}>Mevcut konumu kullan</Text>
            </TouchableOpacity>
            <Text style={styles.helpText}>Haritaya dokunarak istediğiniz noktayı seçin.</Text>
            <Text style={styles.helpText}>Haritayı tam ekran açarak daha detaylı seçim yapabilirsiniz.</Text>
            <TouchableOpacity style={[themedStyles.selectButton, { marginTop: 8 }]} onPress={() => {
              // Harita ekranını aç ve seçili kamp türü ile lokasyonu gönder
              try {
                router.push('/');
              } catch (e) {
                // fallback: sadece event emit
              }
              // Pending payload kaydet (MapScreen mount olmazsa bile okunabilecek)
              (async () => {
                try {
                  await AsyncStorage.setItem('campPlanPendingOpen', JSON.stringify({ campType: draft.campType, location: draft.location }));
                } catch (e) {
                  // ignore
                }
                // MapScreen mount edilene kadar kısa bir gecikme ver
                setTimeout(() => {
                  eventBus.emit('camp-plan:openMap', { campType: draft.campType, location: draft.location });
                }, 400);
              })();
            }}>
              <Icon name="MapPin" size={16} color="#fff" />
              <Text style={themedStyles.selectButtonText || styles.selectButtonText}>Haritada Aç</Text>
            </TouchableOpacity>
            <Text style={styles.statusText}>Seçilen koordinat: {selectedLocationText}</Text>
            <Text style={styles.helpText}>Haritadan kamp alanı seçerek devam edebilirsiniz.</Text>
          </View>
        );
      case 3:
        return (
          <View>
            <Text style={styles.fieldLabel}>Hava Durumu</Text>
            {weatherLoading ? <ActivityIndicator size="small" color="#059669" /> : (
              weathermap?.list?.length > 0 ? (
                <View>
                    <View style={themedStyles.weatherBox}>
                                <Text style={styles.smallHeader}>Şu anki: {locationName ?? weathermap.city?.name ?? ''}</Text>
                    <Text>{weathermap.list[0].weather[0].description} · {Math.round(weathermap.list[0].main.temp)}°C</Text>
                    {weathermap?.list?.[0]?.main?.humidity != null && (
                      <Text>Nem {weathermap.list[0].main.humidity}%</Text>
                    )}
                    <Text style={{ marginTop: 6, color: '#0f172a', fontWeight: '600' }}>Seçilen Kamp Alanı: {draft.location?.label ?? locationName ?? weathermap.city?.name ?? selectedLocationText}</Text>
                  </View>

                  {weathermap?.days?.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <View style={styles.sectionTitleRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Icon name="Calendar" size={16} color={theme.colors.text} />
                          <Text style={[styles.sectionTitle2, { marginLeft: 6 }]}>Tahmin ({weathermap.days.length} gün)</Text>
                        </View>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.forecastScroll}
                        contentContainerStyle={{ paddingVertical: 6 }}
                        nestedScrollEnabled={true}
                      >
                        {weathermap.days.map((d: any) => (
                          <View key={d.date} style={styles.forecastCard}>
                            <Text style={styles.forecastDate}>{formatYmdToDdMmYyyy(d.date)}</Text>
                            <Text style={styles.forecastSummary}>{d.text || '...'}</Text>
                            <View style={styles.flashRow}>
                              <View style={styles.forecastIconContainer}>
                                <WeatherIcon condition={d.text || ''} size={30} />
                              </View>
                              <View style={styles.tempColumn}>
                                <Text style={styles.forecastTemp}>{(d.avgTemp ?? d.maxTemp ?? '-') }°C</Text>
                                <Text style={styles.forecastMinTemp}>Min {(d.minTemp ?? '-') }°C</Text>
                              </View>
                            </View>
                            <View style={styles.forecastDivider} />
                            <View style={styles.forecastMetaColumn}>
                              <View style={styles.forecastMetaRowItem}><Text style={styles.forecastMetaIcon}>💧</Text><Text style={styles.forecastMetaText}>{`Yağış ${Math.round(Number(d.pop ?? 0))}%`}</Text></View>
                              <View style={styles.forecastMetaRowItem}><Text style={styles.forecastMetaIcon}>🍃</Text><Text style={styles.forecastMetaText}>{`Rüzgâr ${Math.round(Number(d.wind_kph ?? 0))} km/s`}</Text></View>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                          {(() => {
                            const evalText = evaluateForecast(weathermap.days);
                            if (!evalText) return null;
                            return (
                              <View style={[styles.evaluationBox, { marginTop: 8 }]}> 
                                <View style={styles.evaluationHeader}>
                                  <View style={styles.evaluationIcon}><Icon name="Info" size={16} color="#0f172a" /></View>
                                  <Text style={styles.evaluationTitle}>Hava Değerlendirmesi</Text>
                                </View>
                                <Text style={styles.evaluationText}>{evalText}</Text>
                              </View>
                            );
                          })()}
                    </View>
                  )}
                </View>
              ) : (
                <Text style={styles.helpText}>Hava verisi yok. Lokasyon seçin veya internete bağlanın.</Text>
              )
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Duyurular</Text>
            {announcementList.length > 0 ? announcementList.slice(0, 5).map((ann: any) => (
              <View key={ann.id || ann.title || Math.random()} style={themedStyles.smallItem}>
                <Text style={styles.smallHeader}>{ann.title || ann.baslik || 'Duyuru'}</Text>
                <Text style={styles.helpText}>{ann.summary || ann.aciklama || 'Detay yok'}</Text>
              </View>
            )) : <Text style={styles.helpText}>Bu konum için aktif duyuru bulunamadı.</Text>}
          </View>
        );
      case 4:
        return (
          <View>
            <Text style={styles.fieldLabel}>Plan Özeti</Text>
            <Text style={styles.summaryText}>Başlangıç: {draft.startDate ? formatDateTR(draft.startDate) : 'Yok'}</Text>
            <Text style={styles.summaryText}>Bitiş: {draft.endDate ? formatDateTR(draft.endDate) : 'Yok'}</Text>
            <Text style={styles.summaryText}>Kamp Türü: {draft.campType ? getCampingTypeLabel(draft.campType) : 'Seçilmedi'}</Text>
            <Text style={styles.summaryText}>Konum: {draft.location ? (draft.location.label ? draft.location.label : `${draft.location.latitude.toFixed(4)}, ${draft.location.longitude.toFixed(4)}`) : 'Seçilmedi'}</Text>
            {weathermap ? (() => {
              const evalText = evaluateForecast(weathermap.days);
              return evalText ? (
                <View style={[styles.evaluationBox, { marginTop: 8 }]}> 
                  <View style={styles.evaluationHeader}>
                    <View style={styles.evaluationIcon}><Icon name="Info" size={16} color="#0f172a" /></View>
                    <Text style={styles.evaluationTitle}>Hava Değerlendirmesi</Text>
                  </View>
                  <Text style={styles.evaluationText}>{evalText}</Text>
                </View>
              ) : null;
            })() : (
              <Text style={styles.helpText}>Hava değerlendirmesi için konum seçin.</Text>
            )}
            <Text style={styles.summaryText}>Durum: {draft.status}</Text>
          </View>
        );
      default:
        return <Text>Adım bulunamadı</Text>;
    }
  }, [stepIndex, draft, availableCampAreas, weathermap, announcementList, weatherLoading, selectedLocationText]);

  const validateCanSave = () => {
    // Kaydetme için ya lokasyon ve kamp türü aynı anda olmalı,
    // ya da en azından başlangıç tarihi seçilmiş olmalı (kullanıcı sadece tarih seçip kaydedebilmelidir).
    if (draft.startDate) return true;
    return !!(draft.location && draft.campType);
  };

  return (
    <SafeAreaView style={themedStyles.container}>
      <View style={themedStyles.topBar}>
        <Text style={themedStyles.title}>Kamp Planla</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.plusIcon} onPress={() => {
            // Start a fresh plan (step 1)
            try {
              const np = emptyPlan();
              setDraft(np);
              saveDraft(np, 0);
              setIsCreatingNewPlan(true);
              setStepIndex(0);
            } catch (e) {
              console.warn('[camp-plan] yeni plan başlatma hata', e);
            }
          }}>
              <Icon name="Plus" size={20} color="#059669" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { router.back(); }} style={styles.closeIcon}>
              <Icon name="X" size={22} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {stepIndex === 0 && !isCreatingNewPlan && (
          <>
            {savedPlans.length === 0 ? (
              <Text style={styles.helpText}>Henüz kaydedilmiş plan yok.</Text>
            ) : !expandedPlanId ? (
              savedPlans.map((plan) => {
                const expanded = expandedPlanId === plan.id;
                const title = plan.location?.label ?? (plan.campType ? getCampingTypeLabel(plan.campType) : 'Başlık yok');
                const savedEvalText = weathermap ? evaluateForecast(weathermap.days) : '';
                return (
                  <View key={plan.id}>
                    <View style={themedStyles.planCard}>
                      <View style={styles.planCardHeader}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                        setExpandedPlanId(expanded ? null : plan.id);
                        if (!expanded && plan.location) {
                          try { fetchWeather(plan.location.latitude, plan.location.longitude, plan.startDate, plan.endDate); } catch (e) {}

                          // Fetch plan-specific reverse-geocoded label (il, ilçe) without overwriting draft locationName
                          (async () => {
                              try {
                                if (!planLocationNames[plan.id]) {
                                  try {
                                    const nm = await getLocationNameFromOSM(plan.location.latitude, plan.location.longitude);
                                    if (nm && typeof nm === 'string') {
                                      setPlanLocationNames(prev => ({ ...prev, [plan.id]: nm }));
                                    } else if (plan.location?.label) {
                                      setPlanLocationNames(prev => ({ ...prev, [plan.id]: plan.location!.label! }));
                                    }
                                  } catch (innerErr) {
                                    if (plan.location?.label) {
                                      setPlanLocationNames(prev => ({ ...prev, [plan.id]: plan.location!.label! }));
                                    }
                                  }
                                }
                              } catch (err) {
                                // ignore reverse-geocode errors
                              }
                            })();
                          }
                        }}>
                          <View>
                            <Text style={styles.planCardTitle}>{title}</Text>
                            <Text style={styles.planCardSubtitle}>{plan.campType ? getCampingTypeLabel(plan.campType) : 'Seçilmedi'}</Text>
                            <View style={styles.planBadgesRow}>
                              {plan.startDate && plan.endDate ? (
                                <Badge variant="light" style={styles.badgeDate}>{formatDateTR(plan.startDate)} - {formatDateTR(plan.endDate)}</Badge>
                              ) : (
                                <Badge variant="light" style={styles.badgeDate}>{plan.startDate ? formatDateTR(plan.startDate) : 'Tarih yok'}</Badge>
                              )}
                            </View>
                          </View>
                      </TouchableOpacity>

                      <View style={styles.planCardHeaderRight}>
                        <TouchableOpacity style={styles.headerEditBtn} onPress={() => openPlan(plan)}>
                          <Icon name="Edit" size={14} color="#0f172a" />
                          <Text style={styles.headerEditBtnText}>Düzenle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerDeleteBtn} onPress={async () => {
                          try {
                            const existing = await AsyncStorage.getItem(SAVED_PLANS_KEY);
                            let list: CampPlan[] = [];
                            if (existing) {
                              const parsed = JSON.parse(existing);
                              if (Array.isArray(parsed)) list = parsed;
                            }
                            const newList = list.filter(p => p.id !== plan.id);
                            await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(newList));
                            setSavedPlans(newList);
                            Alert.alert('Silindi', 'Plan başarıyla silindi.');
                            if (expanded) setExpandedPlanId(null);
                          } catch (err) {
                            console.warn('[camp-plan] plan silme hata', err);
                            Alert.alert('Hata', 'Plan silinemedi. Lütfen tekrar deneyin.');
                          }
                        }}>
                          <Icon name="Trash2" size={14} color="#b91c1c" />
                        </TouchableOpacity>
                      </View>
                      </View>
                    </View>
                    {expanded && (
                      <View style={styles.planDetailsOutside}>
                        <View style={styles.planDetailsInline}>
                        {weatherLoading ? <ActivityIndicator size="small" color="#059669" /> : (
                          weathermap?.list?.length > 0 ? (
                            <View>
                              <View style={styles.weatherSummaryCard}>
                                <View style={styles.weatherSummaryTop}>
                                  <WeatherIcon condition={weathermap.list[0].weather[0].description || ''} size={26} />
                                  <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={styles.smallHeader}>Konum: {(planLocationNames[plan.id] ?? locationName ?? plan.location?.label ?? weathermap.city?.name) || ''}</Text>
                                    <Text style={styles.helpText}>{weathermap.list[0].weather[0].description} · {Math.round(weathermap.list[0].main.temp)}°C</Text>
                                  </View>
                                </View>
                                {weathermap?.list?.[0]?.main?.humidity != null && (
                                  <Text style={styles.helpText}>Nem {weathermap.list[0].main.humidity}%</Text>
                                )}
                              </View>

                              {weathermap?.days?.length > 0 && (
                                <View style={{ marginTop: 12 }}>
                                  <View style={styles.sectionTitleRow}>
                                    <Text style={styles.sectionTitle2}>Tahmin ({weathermap.days.length} gün)</Text>
                                  </View>
                                  <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.forecastScroll}
                                    contentContainerStyle={{ paddingVertical: 6 }}
                                    nestedScrollEnabled={true}
                                  >
                                    {weathermap.days.map((d: any) => (
                                      <View key={d.date} style={styles.forecastCard}>
                                        <Text style={styles.forecastDate}>{formatYmdToDdMmYyyy(d.date)}</Text>
                                        <Text style={styles.forecastSummary}>{d.text || '...'}</Text>
                                        <View style={styles.flashRow}>
                                          <View style={styles.forecastIconContainer}>
                                            <WeatherIcon condition={d.text || ''} size={32} />
                                          </View>
                                          <View style={styles.tempColumn}>
                                            <Text style={styles.forecastTemp}>{(typeof d.maxTemp === 'number' ? d.maxTemp.toFixed(1) : (d.avgTemp ?? d.maxTemp ?? '-'))}°C</Text>
                                            <Text style={styles.forecastMinTemp}>Min {(d.minTemp ?? '-') }°C</Text>
                                          </View>
                                        </View>
                                        <View style={styles.forecastDivider} />
                                        <View style={styles.forecastMetaColumn}>
                                          <View style={styles.forecastMetaRowItem}><Text style={styles.forecastMetaIcon}>💧</Text><Text style={styles.forecastMetaText}>{`Yağış ${Math.round(Number(d.pop ?? 0))}%`}</Text></View>
                                          <View style={styles.forecastMetaRowItem}><Text style={styles.forecastMetaIcon}>🍃</Text><Text style={styles.forecastMetaText}>{`Rüzgar ${Math.round(Number(d.wind_kph ?? 0))} km/s`}</Text></View>
                                        </View>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  {(() => {
                                    const evalText = evaluateForecast(weathermap.days);
                                    if (!evalText) return null;
                                    return (
                                      <View style={[styles.evaluationBox, { marginTop: 8 }]}> 
                                        <View style={styles.evaluationHeader}>
                                          <View style={styles.evaluationIcon}><Icon name="Info" size={16} color="#0f172a" /></View>
                                          <Text style={styles.evaluationTitle}>Hava Değerlendirmesi</Text>
                                        </View>
                                        <Text style={styles.evaluationText}>{evalText}</Text>
                                      </View>
                                    );
                                  })()}
                                </View>
                              )}
                            </View>
                          ) : (
                            <Text style={styles.helpText}>Hava verisi yok. Lokasyon seçin veya internete bağlanın.</Text>
                          )
                        )}

                        <View style={styles.detailActionsRow}>
                          <View style={{ flexDirection: 'row' }}>
                            <TouchableOpacity style={[styles.routeBtn, !plan.location && { opacity: 0.5 }]} disabled={!plan.location} onPress={() => handleNavigate(plan.location?.latitude, plan.location?.longitude, 'google')}>
                              <Text style={styles.routeBtnText}>🧭 Rota (Google)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.routeBtn, !plan.location && { opacity: 0.5 }]} disabled={!plan.location} onPress={() => handleNavigate(plan.location?.latitude, plan.location?.longitude, 'yandex')}>
                              <Text style={styles.routeBtnText}>🧭 Rota (Yandex)</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity style={styles.detailLink} onPress={() => openCampingAreaDetail(plan)}>
                          <Text style={styles.detailLinkText}>Detaylı Bilgi ↗</Text>
                        </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled={false}
                  snapToInterval={ITEM_WIDTH}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  ref={savedScrollRef}
                  nestedScrollEnabled={true}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH);
                    setCarouselIndex(idx);
                    const plan = savedPlans[idx];
                    if (plan) {
                      setExpandedPlanId(plan.id);
                      if (plan.location) {
                        try { fetchWeather(plan.location.latitude, plan.location.longitude, plan.startDate, plan.endDate); } catch (e) {}
                      }
                    }
                  }}
                  contentContainerStyle={{ paddingHorizontal: 0 }}
                >
                  {savedPlans.map((plan, idx) => {
                    const title = plan.location?.label ?? (plan.campType ? getCampingTypeLabel(plan.campType) : 'Başlık yok');
                    return (
                      <View key={plan.id} style={{ width: CARD_WIDTH, marginRight: CARD_SPACING }}>
                        <View style={themedStyles.planCard}>
                          <View style={styles.planCardHeader}>
                            <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                              setExpandedPlanId(plan.id);
                              try { savedScrollRef.current?.scrollTo({ x: idx * ITEM_WIDTH, animated: true }); } catch (err) {}
                              if (plan.location) {
                                try { fetchWeather(plan.location.latitude, plan.location.longitude, plan.startDate, plan.endDate); } catch (e) {}
                              }
                            }}>
                              <View>
                                <Text style={styles.planCardTitle}>{title}</Text>
                                <Text style={styles.planCardSubtitle}>{plan.campType ? getCampingTypeLabel(plan.campType) : 'Seçilmedi'}</Text>
                                <View style={styles.planBadgesRow}>
                                  {plan.startDate && plan.endDate ? (
                                    <Badge variant="light" style={styles.badgeDate}>{formatDateTR(plan.startDate)} - {formatDateTR(plan.endDate)}</Badge>
                                  ) : (
                                    <Badge variant="light" style={styles.badgeDate}>{plan.startDate ? formatDateTR(plan.startDate) : 'Tarih yok'}</Badge>
                                  )}
                                </View>
                              </View>
                            </TouchableOpacity>

                            <View style={styles.planCardHeaderRight}>
                              <TouchableOpacity style={styles.headerEditBtn} onPress={() => openPlan(plan)}>
                                <Icon name="Edit" size={14} color="#0f172a" />
                                <Text style={styles.headerEditBtnText}>Düzenle</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.headerDeleteBtn} onPress={async () => {
                                try {
                                  const existing = await AsyncStorage.getItem(SAVED_PLANS_KEY);
                                  let list: CampPlan[] = [];
                                  if (existing) {
                                    const parsed = JSON.parse(existing);
                                    if (Array.isArray(parsed)) list = parsed;
                                  }
                                  const newList = list.filter(p => p.id !== plan.id);
                                  await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(newList));
                                  setSavedPlans(newList);
                                  Alert.alert('Silindi', 'Plan başarıyla silindi.');
                                } catch (err) {
                                  console.warn('[camp-plan] plan silme hata', err);
                                  Alert.alert('Hata', 'Plan silinemedi. Lütfen tekrar deneyin.');
                                }
                              }}>
                                <Icon name="Trash2" size={14} color="#b91c1c" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>

                        <View style={styles.planDetailsOutside}>
                          <View style={styles.planDetailsInline}>
                            {weatherLoading ? <ActivityIndicator size="small" color="#059669" /> : (
                              weathermap?.list?.length > 0 ? (
                                <View>
                                  <View style={styles.weatherSummaryCard}>
                                    <View style={styles.weatherSummaryTop}>
                                      <WeatherIcon condition={weathermap.list[0].weather[0].description || ''} size={26} />
                                      <View style={{ marginLeft: 10, flex: 1 }}>
                                        <Text style={styles.smallHeader}>Konum: {(planLocationNames[plan.id] ?? locationName ?? plan.location?.label ?? weathermap.city?.name) || ''}</Text>
                                        <Text style={styles.helpText}>{weathermap.list[0].weather[0].description} · {Math.round(weathermap.list[0].main.temp)}°C</Text>
                                      </View>
                                    </View>
                                    {weathermap?.list?.[0]?.main?.humidity != null && (
                                      <Text style={styles.helpText}>Nem {weathermap.list[0].main.humidity}%</Text>
                                    )}
                                  </View>

                                  {weathermap?.days?.length > 0 && (
                                    <View style={{ marginTop: 12 }}>
                                      <View style={styles.sectionTitleRow}>
                                        <Text style={styles.sectionTitle2}>Tahmin ({weathermap.days.length} gün)</Text>
                                      </View>
                                      <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        style={styles.forecastScroll}
                                        contentContainerStyle={{ paddingVertical: 6 }}
                                        nestedScrollEnabled={true}
                                      >
                                        {weathermap.days.map((d: any) => (
                                          <View key={d.date} style={styles.forecastCard}>
                                            <Text style={styles.forecastDate}>{formatYmdToDdMmYyyy(d.date)}</Text>
                                            <Text style={styles.forecastSummary}>{d.text || '...'}</Text>
                                            <View style={styles.flashRow}>
                                              <View style={styles.forecastIconContainer}>
                                                <WeatherIcon condition={d.text || ''} size={32} />
                                              </View>
                                              <View style={styles.tempColumn}>
                                                <Text style={styles.forecastTemp}>{(typeof d.maxTemp === 'number' ? d.maxTemp.toFixed(1) : (d.avgTemp ?? d.maxTemp ?? '-'))}°C</Text>
                                                <Text style={styles.forecastMinTemp}>Min {(d.minTemp ?? '-') }°C</Text>
                                              </View>
                                            </View>
                                            <View style={styles.forecastDivider} />
                                            <View style={styles.forecastMetaColumn}>
                                              <View style={styles.forecastMetaRowItem}><Text style={styles.forecastMetaIcon}>💧</Text><Text style={styles.forecastMetaText}>{`Yağış ${Math.round(Number(d.pop ?? 0))}%`}</Text></View>
                                              <View style={styles.forecastMetaRowItem}><Text style={styles.forecastMetaIcon}>🍃</Text><Text style={styles.forecastMetaText}>{`Rüzgar ${Math.round(Number(d.wind_kph ?? 0))} km/s`}</Text></View>
                                            </View>
                                          </View>
                                        ))}
                                      </ScrollView>
                                      {(() => {
                                        const evalText = evaluateForecast(weathermap.days);
                                        if (!evalText) return null;
                                        return (
                                          <View style={[styles.evaluationBox, { marginTop: 8 }]}> 
                                            <View style={styles.evaluationHeader}>
                                              <View style={styles.evaluationIcon}><Icon name="Info" size={16} color="#0f172a" /></View>
                                              <Text style={styles.evaluationTitle}>Hava Değerlendirmesi</Text>
                                            </View>
                                            <Text style={styles.evaluationText}>{evalText}</Text>
                                          </View>
                                        );
                                      })()}
                                    </View>
                                  )}
                                </View>
                              ) : (
                                <Text style={styles.helpText}>Hava verisi yok. Lokasyon seçin veya internete bağlanın.</Text>
                              )
                            )}

                            <View style={styles.detailActionsRow}>
                              <View style={{ flexDirection: 'row' }}>
                                <TouchableOpacity style={[styles.routeBtn, !plan.location && { opacity: 0.5 }]} disabled={!plan.location} onPress={() => handleNavigate(plan.location?.latitude, plan.location?.longitude, 'google')}>
                                  <Text style={styles.routeBtnText}>🧭 Rota (Google)</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.routeBtn, !plan.location && { opacity: 0.5 }]} disabled={!plan.location} onPress={() => handleNavigate(plan.location?.latitude, plan.location?.longitude, 'yandex')}>
                                  <Text style={styles.routeBtnText}>🧭 Rota (Yandex)</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            <TouchableOpacity style={styles.detailLink} onPress={() => openCampingAreaDetail(plan)}>
                              <Text style={styles.detailLinkText}>Detaylı Bilgi ↗</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={styles.paginationContainer}>
                  {savedPlans.map((_, i) => <View key={i} style={[styles.dot, i === carouselIndex ? styles.dotActive : null]} />)}
                </View>
              </>
            )}
          </>
        )}

        {(stepIndex !== 0 || isCreatingNewPlan || savedPlans.length === 0) && (
          <View style={themedStyles.stepIndicator}>
            <Text style={themedStyles.stepIndicatorText}>Adım {stepIndex + 1} / {steps.length} - {steps[stepIndex].title}</Text>
          </View>
        )}

        {(stepIndex !== 0 || isCreatingNewPlan || savedPlans.length === 0) && stepContent}

      </ScrollView>

      {!(savedPlans && savedPlans.length > 0 && stepIndex === 0 && !isCreatingNewPlan) && (
        <View style={themedStyles.bottomBar}>
          <TouchableOpacity style={[themedStyles.navBtn, stepIndex === 0 && themedStyles.navBtnDisabled]} onPress={handleStepBack} disabled={stepIndex === 0}>
            <Icon name="ArrowLeft" size={18} color={stepIndex === 0 ? '#94a3b8' : '#fff'} />
            <Text style={[styles.navBtnText, stepIndex === 0 && styles.navBtnTextDisabled]}>Geri</Text>
          </TouchableOpacity>

          {stepIndex < steps.length - 1 ? (
            <TouchableOpacity style={themedStyles.navBtn} onPress={handleStepNext}>
              <Text style={styles.navBtnText}>İleri</Text>
              <Icon name="ArrowRight" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[themedStyles.navBtn, !validateCanSave() && themedStyles.navBtnDisabled]}
              onPress={persistPlan}
              disabled={isSaving || !validateCanSave()}
            >
              {isSaving ? <ActivityIndicator color="#fff" /> : <><Icon name="CheckCircle" size={18} color="#fff" /><Text style={styles.navBtnText}>Kaydet</Text></>}
            </TouchableOpacity>
          )}
        </View>
      )}

      <CampingAreaDetailModal
        visible={showCampingAreaModal}
        onClose={() => { setShowCampingAreaModal(false); setSelectedCampingAreaObj(null); }}
        campingArea={selectedCampingAreaObj}
      />

      <CustomDatePicker
        visible={isStartDatePickerOpen}
        value={draft.startDate ? new Date(draft.startDate) : new Date()}
        onChange={(date) => saveDraft({ ...draft, startDate: date.toISOString() })}
        onClose={() => setIsStartDatePickerOpen(false)}
        title="Başlangıç Tarihi"
      />
      <CustomDatePicker
        visible={isEndDatePickerOpen}
        value={draft.endDate ? new Date(draft.endDate) : new Date()}
        onChange={(date) => saveDraft({ ...draft, endDate: date.toISOString() })}
        onClose={() => setIsEndDatePickerOpen(false)}
        title="Bitiş Tarihi"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  plusIcon: { padding: 6, marginRight: 8 },
  closeIcon: { padding: 6 },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#1f2937' },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginTop: 12, marginBottom: 6 },
  selectButton: { backgroundColor: '#059669', padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
  selectButtonText: { color: '#fff', fontWeight: '600' },
  listItem: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, marginBottom: 8 },
  listItemSelected: { backgroundColor: '#059669', borderColor: '#047857' },
  listItemText: { color: '#0f172a' },
  statusText: { color: '#475569', marginTop: 8 },
  helpText: { color: '#64748b', fontSize: 13, marginTop: 6 },
  stepIndicator: { marginTop: 10, marginBottom: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: '#e2e8f0', borderRadius: 10 },
  stepIndicatorText: { color: '#334155', fontWeight: '600' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTopWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, minWidth: 120 },
  navBtnDisabled: { backgroundColor: '#94a3b8' },
  navBtnText: { color: '#fff', fontWeight: '700', marginHorizontal: 6 },
  navBtnTextDisabled: { color: '#f1f5f9' },
  planCard: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, marginBottom: 4, backgroundColor: '#fff' },
  smallHeader: { fontWeight: '800', color: '#0f172a' },
  smallNote: { fontSize: 12, color: '#64748b', marginTop: 2 },
  summaryText: { marginBottom: 5, color: '#334155' },
  weatherBox: { borderWidth: 1, borderColor:'#cbd5e1', backgroundColor:'#f3f4f6', borderRadius:12, padding: 10 },
  evaluationBox: { borderWidth: 1, borderColor:'#e6eef6', backgroundColor:'#eeeeef', borderRadius:12, padding: 12 },
  evaluationHeader: { flexDirection:'row', alignItems:'center', marginBottom:6 },
  evaluationIcon: { width:36, height:36, borderRadius:18, backgroundColor:'#fff', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#e6eef6' },
  evaluationTitle: { fontSize:14, fontWeight:'700', marginLeft:8, color:'#0f172a' },
  evaluationText: { color:'#334155', fontSize:13, lineHeight:18 },
  mapPickerContainer: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, overflow: 'hidden', height: 220, marginVertical: 8 },
  smallItem: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 8, marginBottom: 6, backgroundColor: '#fff' },

  sectionTitle2: { fontSize: 14, color: '#0f172a', marginVertical: 4, fontWeight: '700' },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 },
  sectionMore: { fontSize: 12, color: '#0ea5e9', fontWeight: '700' },
  forecastSummaryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  planCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  deleteBtn: { padding: 8, marginLeft: 8 },
  editBtn: { padding: 8, marginLeft: 8, backgroundColor: '#f1f5f9', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  editBtnText: { color: '#0f172a', fontWeight: '700' },
  planDetails: { marginTop: 8, padding: 8, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e6eef6' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  typeCard: { width: 96, alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: 'white', marginBottom: 8 },
  typeCardSelected: { borderColor: '#059669', backgroundColor: '#f0fdf4' },
  typeIcon: { marginBottom: 6 },
  typeLabel: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  typeLabelSelected: { color: '#059669', fontWeight: '600' },
  detailActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 8 },
  actionBtnText: { color: '#0f172a', fontWeight: '600' },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planCardHeaderRight: { flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  planCardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  planCardSubtitle: { fontSize: 13, color: '#475569', marginTop: 2 },
  planBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 6 },
  badgeDate: { marginRight: 8 },
  planCardActions: { flexDirection: 'row', marginTop: 8, alignItems: 'center' },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', borderWidth: 1 },
  actionButtonText: { color: '#0f172a', fontWeight: '600', fontSize: 12, marginLeft: 6 },
  routeBtn: { width: '46%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#e6eef6', marginHorizontal: 6 },
  routeBtnText: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  detailLink: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  detailLinkText: { color: '#0f172a', fontWeight: '700' },
  headerEditBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e6eef6', minWidth: 88, justifyContent: 'center' },
  headerEditBtnText: { marginLeft: 8, color: '#0f172a', fontWeight: '600' },
  headerDeleteBtn: { marginTop: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#fee2e2' },
  weatherSummaryCard: { backgroundColor: '#eeeeef', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 },
  weatherSummaryTop: { flexDirection: 'row', alignItems: 'center' },
  forecastScroll: { marginTop: 6 },
  forecastCard: { width: 160, padding: 14, marginRight: 12, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e7e7ea', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  forecastDate: { fontSize: 12, color: '#334155', fontWeight: '700' },
  forecastSummary: { fontSize: 12, color: '#6b7280', marginTop: 6, fontWeight: '600' },
  forecastIconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  flashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  tempColumn: { justifyContent: 'center', alignItems: 'flex-end' },
  forecastTemp: { fontSize: 20, color: '#111827', fontWeight: '800' },
  forecastMinTemp: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  forecastDivider: { height: 1, backgroundColor: '#eef2f7', marginTop: 10 },
  forecastMetaColumn: { marginTop: 8 },
  forecastMetaRowItem: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  forecastMetaIcon: { marginRight: 8 },
  forecastMetaText: { fontSize: 12, color: '#60a5fa' },
  forecastDetails: { fontSize: 12, color: '#64748b', marginTop: 6 },
  planDetailsOutside: { marginTop: 4, paddingHorizontal: 0 },
  planDetailsInline: { marginTop: 4, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 0, borderTopWidth: 1, borderTopColor: '#e6eef6', backgroundColor: 'transparent' },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: '#e2e8f0', marginHorizontal: 6 },
  dotActive: { width: 16, height: 8, borderRadius: 8, backgroundColor: '#111827' },
});
