import { SvgXml } from 'react-native-svg';
import { useState, useEffect, useMemo } from 'react';
import { Edit } from 'lucide-react-native';
import * as React from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, BackHandler, RefreshControl, Platform, ToastAndroid } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
// Logout adımlarını göstermek için yardımcı fonksiyon
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  SquareCheck as CheckSquare, 
  Square, 
  Plus, 
  Trash2, 
  Share2, 
  TreePine, 
  Sun, 
  Snowflake, 
  Leaf, 
  X,
  ChevronDown,
  ChevronUp,
  User,
  CheckCircle2
} from 'lucide-react-native';
import { getSVGIcon } from '../icons/svgIcons';
import { getCampingTypeIcon } from '../../lib/categories';
import { Modal } from 'react-native';
import AddChecklistItemModal from '../../components/AddChecklistItemModal';
import { getToken } from '../../lib/auth';
import { API_URL } from '../../lib/config';
import { getMe } from '../../lib/userCommunityApi';
import { getAppConfig } from '../../lib/adminSettingsApi';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

// AsyncStorage yerine SecureStore kullanımı
const SecureStorage = {
  async getItem(key: string) {
    return await SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};

interface ChecklistItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
}

interface CampingType {
  id: string;
  name: string;
  icon: any;
  color: string;
}

interface Season {
  id: string;
  name: string;
  icon: any;
  color: string;
}

interface StandardChecklist {
  id: string;
  name: string;
}
interface StandardChecklistItem {
  id: string;
  item_name: string;
  category?: string;
}

interface CustomChecklist {
  id: string;
  name: string;
  is_shared: boolean;
  created_at: string;
  share_id?: string | null;
}
interface CustomChecklistItem {
  id: string;
  checklist_id: string;
  item_name: string;
}

// const checklistData: Record<string, Record<string, ChecklistItem[]>> = {}; // Artık kullanılmıyor

import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../components/ThemeProvider';

export default function ChecklistScreen({ navigation }: any) {
  const { colors } = useTheme();
  // State'ler en üstte tanımlanmalı
  const [userRole, setUserRole] = useState<string>('');
  
  // Sezon ve kamp türü state'leri
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [campingTypes, setCampingTypes] = useState<CampingType[]>([]);
  const [seasonIdMap, setSeasonIdMap] = useState<Record<string, number>>({});
  const [campingTypeIdMap, setCampingTypeIdMap] = useState<Record<string, number>>({});
  const [selectedSeason, setSelectedSeason] = useState<string>('spring');
  const [selectedCampingType, setSelectedCampingType] = useState<string>('campground');
  
      // Ekranın sağ ve solundan kaydırınca geri gitmeyi engelle
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
    // Tüm işaretleri temizle fonksiyonu (buton için)
    const clearChecklist = async () => {
      setCheckedItems({});
      await SecureStore.deleteItemAsync('checklist_checkedItems');
    };
  const searchParams = useLocalSearchParams();
  const router = useRouter();
  const isLoggingOut = searchParams.logout === '1';

  // Tüm hook'lar ve state'ler burada
  // ...tüm hook'lar ve fonksiyonlar...

  useEffect(() => {
    if (isLoggingOut) {
      router.replace('/(auth)/logout');
    }
  }, [isLoggingOut]);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editChecklistName, setEditChecklistName] = useState('');

  // Kişisel checklist başlığı güncelleme fonksiyonu
  const updateCustomChecklistName = async (checklistId: string, newName: string) => {
    try {
      const token = await getToken();
      const payload = { name: newName };
      const res = await fetch(`${API_URL}/custom_checklists/${checklistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Checklist başlık güncelleme hatası:', errorText);
        throw new Error(`Checklist başlık güncellenemedi: ${res.status}`);
      }
      await fetchCustomChecklists();
    } catch (e) {
      console.warn('Checklist başlık güncelleme hatası:', e);
    }
  };
  // Arkadaş listesi için state
  const [friends, setFriends] = useState<any[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [checklistToShare, setChecklistToShare] = useState<string | null>(null);
  // Her checklist için, hangi arkadaşlarla paylaşıldı bilgisini tutan state
  const [sharedWith, setSharedWith] = useState<Record<string, string[]>>({}); // { [checklistId]: [userId, ...] }
  // Her paylaşım için shareId tutan state (paylaşımı geri çekmek için)
  const [shareIds, setShareIds] = useState<Record<string, Record<string, string>>>({}); // { [checklistId]: { [userId]: shareId } }

  // Belirli bir kullanıcı için paylaşımı geri çek
  const unshareChecklistWithUser = async (checklistId: string, userId: string) => {
    try {
      const shareId = shareIds[checklistId]?.[userId];
      console.log('[DEBUG] unshareChecklistWithUser', { checklistId, userId, shareId });
      if (!shareId) {
        console.warn('[DEBUG] Paylaşımı geri çekilemedi: shareId yok', { checklistId, userId });
        return;
      }
      const token = await getToken();
      const url = `${API_URL}/checklst_shares/${shareId}`;
      // PATCH ile paylaşımı geri çek (status: revoked, is_active: false, revokedAt: now)
      const payload = {
        status: 'revoked',
        is_active: false,
        revokedAt: new Date().toISOString()
      };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      console.log('[DEBUG] PATCH (unshare) yanıtı:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('[DEBUG] Paylaşımı geri çekme hatası:', errorText);
        Alert.alert('Hata', 'Paylaşım geri çekilemedi');
        return;
      }
      // State'ten kaldır
      const newSharedWith = { ...sharedWith };
      const newShareIds = { ...shareIds };
      if (newSharedWith[checklistId]) {
        newSharedWith[checklistId] = newSharedWith[checklistId].filter(uid => uid !== userId);
        if (newSharedWith[checklistId].length === 0) delete newSharedWith[checklistId];
      }
      if (newShareIds[checklistId]?.[userId]) {
        delete newShareIds[checklistId][userId];
        if (Object.keys(newShareIds[checklistId]).length === 0) delete newShareIds[checklistId];
      }
      setSharedWith(newSharedWith);
      setShareIds(newShareIds);
      
      Alert.alert('Başarılı', 'Paylaşım geri çekildi');
    } catch (e) {
      console.warn('[DEBUG] Paylaşımı geri çekme hatası:', e);
      Alert.alert('Hata', 'Paylaşım geri çekilemedi');
    }
  };
  // Arkadaş listesini API'dan çek
  async function fetchFriends() {
    try {
      const me = await getMe();
      const token = await getToken();
      const url = `${API_URL}/friends?user_id=${me.id}`;
      console.log('[Arkadaş Listesi] İstek URL:', url);
      console.log('[Arkadaş Listesi] Token:', token);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const responseText = await res.clone().text();
      console.log('[Arkadaş Listesi] Backend yanıtı:', res.status, responseText);
      if (!res.ok) throw new Error('Arkadaşlar alınamadı');
      const data = await res.json();
      setFriends(data || []);
    } catch (e) {
      setFriends([]);
      console.warn('Arkadaş listesi alınamadı:', e);
    }
  }

  // Network status kontrolü
  const isConnected = useNetworkStatus();

  // Pull-to-refresh için state ve ref
  const [refreshing, setRefreshing] = useState(false);
  const lastSyncTimeRef = React.useRef<number>(0);

  // İlk yüklemede arkadaş listesini çek
  useEffect(() => {
    fetchFriends();
  }, []);

  // Pull-to-refresh handler - dakikada 1 kez sınırlaması ile
  const handleRefresh = async () => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    const oneMinuteInMs = 60000;

    // Son senkronizasyondan 1 dakika geçmemişse atla
    if (timeSinceLastSync < oneMinuteInMs) {
      const remainingSeconds = Math.ceil((oneMinuteInMs - timeSinceLastSync) / 1000);
      if (__DEV__) console.log(`[CHECKLIST_REFRESH] Çok erken, ${remainingSeconds} saniye sonra tekrar deneyin.`);
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Lütfen ${remainingSeconds} saniye sonra tekrar deneyin.`, ToastAndroid.SHORT);
      } else {
        Alert.alert('Çok Sık Güncelleme', `Lütfen ${remainingSeconds} saniye sonra tekrar deneyin.`);
      }
      return;
    }

    if (!isConnected) {
      if (__DEV__) console.log('[CHECKLIST_REFRESH] Offline, senkronizasyon atlanıyor.');
      if (Platform.OS === 'android') {
        ToastAndroid.show('İnternet bağlantısı yok.', ToastAndroid.SHORT);
      } else {
        Alert.alert('İnternet Bağlantısı Yok', 'Checklist güncellemesi için internet bağlantısı gerekli.');
      }
      return;
    }
    
    if (userRole === 'guest') {
      if (__DEV__) console.log('[CHECKLIST_REFRESH] Guest kullanıcı, atlanıyor.');
      if (Platform.OS === 'android') {
        ToastAndroid.show('Misafir kullanıcılar senkronizasyon yapamaz.', ToastAndroid.SHORT);
      } else {
        Alert.alert('Misafir Kullanıcı', 'Misafir kullanıcılar checklist senkronizasyonu yapamaz.');
      }
      return;
    }
    
    setRefreshing(true);
    
    try {
      const token = await getToken();
      if (!token) {
        if (__DEV__) console.log('[CHECKLIST_REFRESH] Token yok, atlanıyor.');
        if (Platform.OS === 'android') {
          ToastAndroid.show('Lütfen tekrar giriş yapın.', ToastAndroid.SHORT);
        } else {
          Alert.alert('Oturum Hatası', 'Lütfen tekrar giriş yapın.');
        }
        setRefreshing(false);
        return;
      }
      
      if (__DEV__) console.log('[CHECKLIST_REFRESH] Senkronizasyon başlatılıyor...');
      
      // Kişisel ve paylaşılan checklistleri güncelle
      await fetchCustomChecklists();
      
      // Standart checklist de güncelle (eğer map'ler hazırsa)
      if (Object.keys(seasonIdMap).length > 0 && Object.keys(campingTypeIdMap).length > 0) {
        await fetchStandardChecklist();
        if (__DEV__) console.log('[CHECKLIST_REFRESH] Standart checklist güncellendi');
      }
      
      lastSyncTimeRef.current = now;
      if (__DEV__) console.log('[CHECKLIST_REFRESH] Senkronizasyon tamamlandı');
      
      // Başarılı güncelleme bildirimi
      if (Platform.OS === 'android') {
        ToastAndroid.show('Checklist güncellendi ✓', ToastAndroid.SHORT);
      } else {
        Alert.alert('✓ Güncellendi', 'Checklist verileriniz başarıyla güncellendi.');
      }
    } catch (err) {
      if (__DEV__) console.error('[CHECKLIST_REFRESH] Hata:', err);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Güncelleme hatası. Tekrar deneyin.', ToastAndroid.SHORT);
      } else {
        Alert.alert('Güncelleme Hatası', 'Checklist güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Sayfa açıldığında senkronizasyon yap
  useFocusEffect(
    React.useCallback(() => {
      async function syncOnFocus() {
        if (!isConnected) {
          if (__DEV__) console.log('[CHECKLIST_FOCUS_SYNC] Offline, senkronizasyon atlanıyor.');
          return;
        }
        
        if (userRole === 'guest') {
          if (__DEV__) console.log('[CHECKLIST_FOCUS_SYNC] Guest kullanıcı, atlanıyor.');
          return;
        }
        
        try {
          const token = await getToken();
          if (!token) {
            if (__DEV__) console.log('[CHECKLIST_FOCUS_SYNC] Token yok, atlanıyor.');
            return;
          }
          
          if (__DEV__) console.log('[CHECKLIST_FOCUS_SYNC] Senkronizasyon başlatılıyor...');
          
          // Kişisel ve paylaşılan checklistleri güncelle
          await fetchCustomChecklists();
          
          // Standart checklist de güncelle (eğer map'ler hazırsa)
          if (Object.keys(seasonIdMap).length > 0 && Object.keys(campingTypeIdMap).length > 0) {
            await fetchStandardChecklist();
            if (__DEV__) console.log('[CHECKLIST_FOCUS_SYNC] Standart checklist güncellendi');
          }
          
          lastSyncTimeRef.current = Date.now();
          if (__DEV__) console.log('[CHECKLIST_FOCUS_SYNC] Senkronizasyon tamamlandı');
        } catch (err) {
          if (__DEV__) console.error('[CHECKLIST_FOCUS_SYNC] Hata:', err);
        }
      }
      
      syncOnFocus();
    }, [isConnected, userRole, seasonIdMap, campingTypeIdMap])
  );

  // Paylaşım bilgilerini AsyncStorage'dan yükle ve kaydetme kodları kaldırıldı
  // Artık paylaşım bilgileri sadece API'den çekilecek, local storage kullanılmıyor

  // Modal açıldığında state'leri logla
  useEffect(() => {
    if (showShareModal) {
      console.log('[DEBUG useEffect] Modal açıldı!');
      console.log('[DEBUG useEffect] checklistToShare:', checklistToShare);
      console.log('[DEBUG useEffect] sharedWith:', sharedWith);
      console.log('[DEBUG useEffect] shareIds:', shareIds);
    }
  }, [showShareModal, checklistToShare, sharedWith, shareIds]);

  // Paylaş butonuna basıldığında log ekle
  const handleShareButton = (clId: string) => {
    console.log('[DEBUG] Paylaş butonuna basıldı, checklist ID:', clId);
    console.log('[DEBUG] Paylaş butonunda sharedWith:', sharedWith);
    setChecklistToShare(clId);
    setTimeout(() => {
      console.log('[DEBUG] Modal açılıyor, checklistToShare:', clId);
      setShowShareModal(true);
    }, 100);
  };
  const updateCustomChecklistItem = async (itemId: string, newName: string) => {
    try {
      const token = await getToken();
      const payload = { item_name: newName };
      const res = await fetch(`${API_URL}/custom_checklists/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Custom item güncelleme hatası:', errorText);
        throw new Error(`Custom item güncellenemedi: ${res.status}`);
      }
      await fetchCustomChecklists();
    } catch (e) {
      console.warn('Custom item güncelleme hatası:', e);
    }
  };

  // Kişisel checklist item silme fonksiyonu
  const deleteCustomChecklistItem = async (itemId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/custom_checklists/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Custom item silme hatası:', errorText);
        throw new Error(`Custom item silinemedi: ${res.status}`);
      }
      await fetchCustomChecklists();
    } catch (e) {
      console.warn('Custom item silme hatası:', e);
    }
  };

  // Kişisel checklist'i arkadaşlarla paylaşma fonksiyonu
  const shareCustomChecklist = async (checklistId: string, friendIds: string[]) => {
    try {
      const token = await getToken();
      const me = await getMe();
      // friendIds dizisini integer dizisine dönüştür (gerekirse)
      const friendIdArray = friendIds.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
      // Not (açıklama) eklemek isterseniz, parametre olarak alınabilir
      const note = '';
      const payload = {
        checklist_id: checklistId,
        shared_with_user_id: friendIdArray, // DİZİ OLARAK GÖNDERİLİYOR
        shared_by_user_id: me.id,
        note
      };
      console.log('[DEBUG] shareCustomChecklist payload:', payload);
      const res = await fetch(`${API_URL}/checklst_shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      console.log('[DEBUG] shareCustomChecklist response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Checklist paylaşma hatası:', errorText);
        Alert.alert('Hata', 'Checklist paylaşılırken bir hata oluştu');
        throw new Error(`Checklist paylaşılamadı: ${res.status}`);
      }
      // Backend'den dönen paylaşım kayıtlarını al
      const shareRecords = await res.json();
      console.log('[DEBUG] shareCustomChecklist yanıt:', shareRecords);
      
      // State'i hemen güncelle (backend GET endpoint'i olmadığı için)
      const checklistIdStr = String(checklistId);
      const newSharedWith = { ...sharedWith };
      const newShareIds = { ...shareIds };
      
      if (!newSharedWith[checklistIdStr]) newSharedWith[checklistIdStr] = [];
      if (!newShareIds[checklistIdStr]) newShareIds[checklistIdStr] = {};
      
      // Dönen kayıtlardan shareId'leri al
      if (Array.isArray(shareRecords)) {
        shareRecords.forEach((record: any) => {
          const userIdStr = String(record.shared_with_user_id);
          if (!newSharedWith[checklistIdStr].includes(userIdStr)) {
            newSharedWith[checklistIdStr].push(userIdStr);
          }
          newShareIds[checklistIdStr][userIdStr] = record.id;
        });
      }
      
      setSharedWith(newSharedWith);
      setShareIds(newShareIds);
      console.log('[DEBUG] State güncellendi - sharedWith:', newSharedWith);
      console.log('[DEBUG] State güncellendi - shareIds:', newShareIds);
      
      Alert.alert('Başarılı', 'Checklist başarıyla paylaşıldı');
      setSelectedFriends([]);
    } catch (e) {
      console.warn('Checklist paylaşma hatası:', e);
      Alert.alert('Hata', 'Checklist paylaşılırken bir hata oluştu');
    }
  };

  // Sezon ve kamp türlerini ve kullanıcı rolünü API'den çek
  useEffect(() => {
    async function fetchSeasonsAndTypesAndRole() {
      try {
        const token = await getToken();
        const seasonsUrl = `${API_URL}/seasons`;
        const typesUrl = `${API_URL}/camping_types`;
        console.log('Seasons endpoint:', seasonsUrl);
        console.log('Camping types endpoint:', typesUrl);
        // seasons tablosu
        const seasonsData = await safeFetchJson(seasonsUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // camping_types tablosu
        const typesData = await safeFetchJson(typesUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Kullanıcı rolünü çek
        const me = await getMe();
        setUserRole(me.role || '');

        // Kod eşlemesi için map oluştur (hem raw hem canonical id'leri ekle)
        const seasonMap: Record<string, number> = {};
        const campingTypeMap: Record<string, number> = {};
        // Kod: 'spring', 'summer' vs. (backend'de code veya slug varsa)
        seasonsData.forEach((s: any) => {
          seasonMap[s.code || s.slug || s.name.toLowerCase()] = s.id;
        });
        // typesData içindeki legacy kodları canonical değerlere eşle
        // tent/legacy_1 -> campground, caravan/legacy_2 -> caravan_site, nature/legacy_3 -> hiking_road
        const typeAliasGroups: Record<string, string[]> = {
          tent: ['tent', 'campground', 'legacy_1', '1'],
          campground: ['tent', 'campground', 'legacy_1', '1'],
          caravan: ['caravan', 'caravan_site', 'legacy_2', '2'],
          caravan_site: ['caravan', 'caravan_site', 'legacy_2', '2'],
          nature: ['nature', 'hiking_road', 'legacy_3', '3'],
          hiking_road: ['nature', 'hiking_road', 'legacy_3', '3'],
        };
        typesData.forEach((t: any) => {
          const rawId = String(t.code || t.slug || t.name || '').toLowerCase();
          const canonical = rawId === 'tent' ? 'campground'
            : rawId === 'caravan' ? 'caravan_site'
            : rawId === 'nature' ? 'hiking_road'
            : rawId === 'bungalov' ? 'bungalow'
            : rawId;
          const keys = new Set<string>([
            rawId,
            canonical,
            String(t.id),
            ...(typeAliasGroups[rawId] || []),
            ...(typeAliasGroups[canonical] || []),
          ]);
          keys.forEach((k) => {
            if (k) campingTypeMap[k] = t.id;
          });
        });

        // Frontend için
        setSeasons(seasonsData.map((s: any) => {
          const id = s.code || s.slug || s.name.toLowerCase();
          let icon = Leaf;
          let color = '#10b981'; // Varsayılan yeşil
          let displayName = s.name; // Varsayılan olarak backend'den gelen isim

          // Mevsime göre ikon, renk ve Türkçe isim ataması
          switch (id) {
            case 'spring':
              icon = Leaf;
              color = '#22c55e'; // Canlı yeşil
              displayName = 'İlkbahar';
              break;
            case 'summer':
              icon = Sun;
              color = '#f97316'; // Turuncu
              displayName = 'Yaz';
              break;
            case 'autumn':
              icon = TreePine;
              color = '#b45309'; // Kiremit/kahverengi
              displayName = 'Sonbahar';
              break;
            case 'winter':
              icon = Snowflake;
              color = '#3b82f6'; // Mavi
              displayName = 'Kış';
              break;
          }

          return {
            id,
            name: displayName,
            icon: s.icon || icon,
            color: s.color || color,
          };
        }));
        const normalizedCampingTypes = typesData.map((t: any) => {
          const rawId = t.code || t.slug || String(t.name || '').toLowerCase();
          const canonical = rawId === 'tent' ? 'campground'
            : rawId === 'caravan' ? 'caravan_site'
            : rawId === 'nature' ? 'hiking_road'
            : rawId === 'bungalov' ? 'bungalow'
            : rawId;
          let displayName = t.name || t.label || canonical;
          switch (canonical) {
            case 'campground':
              displayName = 'Kamp Alanı';
              break;
            case 'caravan_site':
              displayName = 'Karavan Alanı';
              break;
            case 'hiking_road':
              displayName = 'Yürüyüş Parkuru';
              break;
            case 'bungalow':
              displayName = 'Bungalov';
              break;
          }

          const rawSvg = t.svg || t.iconSvg || null;
          const icon = (props: any = {}) => {
            const baseSvg = rawSvg || getCampingTypeIcon(canonical, props) || getSVGIcon('campground', props);
            if (typeof baseSvg !== 'string' || !baseSvg.startsWith('<svg')) return getSVGIcon('campground', props);
            let out = baseSvg;
            if (props.width) out = /width=["'][^"']*["']/.test(out) ? out.replace(/width=["'][^"']*["']/, `width="${props.width}"`) : out.replace(/<svg\b/, `<svg width="${props.width}"`);
            if (props.height) out = /height=["'][^"']*["']/.test(out) ? out.replace(/height=["'][^"']*["']/, `height="${props.height}"`) : out.replace(/<svg\b/, `<svg height="${props.height}"`);
            const color = props.stroke || props.fill || t.color || '#059669';
            out = out.replace(/currentColor/g, color);
            return out;
          };

          return {
            id: canonical,
            name: displayName,
            icon,
            color: t.color || '#059669',
          };
        });

        // Kullanıcı tercihi: önce kullanıcı prefs, sonra global admin ayarı, sonra SecureStore fallback
        let visibleMap: Record<string, boolean> | null = null;
        try {
          if (me && me.preferences && typeof me.preferences === 'object' && me.preferences.checklist_visible_types) {
            visibleMap = me.preferences.checklist_visible_types;
          } else {
            // Try global admin app-config
            try {
              const appCfg = await getAppConfig();
              if (appCfg && appCfg.checklist_visible_types) {
                visibleMap = appCfg.checklist_visible_types;
              }
            } catch (e) {
              // ignore
            }
            if (!visibleMap) {
              const vis = await SecureStorage.getItem('checklist_visible_types');
              if (vis) visibleMap = JSON.parse(vis);
            }
          }
        } catch (e) {
          visibleMap = null;
        }

        const filteredTypes = visibleMap ? normalizedCampingTypes.filter((nt: any) => (visibleMap[nt.id] === undefined ? true : !!visibleMap[nt.id])) : normalizedCampingTypes;

        setCampingTypes(filteredTypes);
        if (filteredTypes.length > 0 && !filteredTypes.some((t: CampingType) => t.id === selectedCampingType)) {
          setSelectedCampingType(filteredTypes[0].id);
        }
        setSeasonIdMap(seasonMap);
        setCampingTypeIdMap(campingTypeMap);
      } catch (e: any) {
        if (e.message && e.message.startsWith('Beklenen JSON')) {
          console.warn('Sezon ve kamp türleri alınamadı, yanıt:', e.message);
        } else {
          console.warn('Sezon ve kamp türleri alınamadı:', e);
        }
      }
    }
    fetchSeasonsAndTypesAndRole();
  }, []);
  
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [sharedCheckedItems, setSharedCheckedItems] = useState<Record<string, boolean>>({});

  // Checklist işaretlerini AsyncStorage'dan yükle

  useEffect(() => {
    const loadCheckedItems = async () => {
      try {
        const saved = await SecureStorage.getItem('checklist_checkedItems');
        if (saved) setCheckedItems(JSON.parse(saved));
      } catch {}
    };
    loadCheckedItems();
  }, []);

  // İşaretler değişince kaydet
  useEffect(() => {
    SecureStorage.setItem('checklist_checkedItems', JSON.stringify(checkedItems));
  }, [checkedItems]);
  // const [customItems, setCustomItems] = useState<Record<string, ChecklistItem[]>>({}); // Artık kullanılmıyor
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [standardChecklist, setStandardChecklist] = useState<StandardChecklist | null>(null);
  const [standardChecklistItems, setStandardChecklistItems] = useState<StandardChecklistItem[]>([]);
  const [customChecklists, setCustomChecklists] = useState<CustomChecklist[]>([]);
  const [customChecklistItemsApi, setCustomChecklistItemsApi] = useState<Record<string, CustomChecklistItem[]>>({});
  const [sharedChecklists, setSharedChecklists] = useState<CustomChecklist[]>([]);
  const [showCreateChecklistModal, setShowCreateChecklistModal] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [newChecklistItemName, setNewChecklistItemName] = useState('');
  const [showAddChecklistItemModal, setShowAddChecklistItemModal] = useState(false);

  // Eski local customItems kodları kaldırıldı

  useEffect(() => {
    // Takvimden güncel mevsimi bul
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    let season = 'spring';
    if (month >= 3 && month <= 5) season = 'spring'; // İlkbahar
    else if (month >= 6 && month <= 8) season = 'summer'; // Yaz
    else if (month >= 9 && month <= 11) season = 'autumn'; // Sonbahar
    else season = 'winter'; // Kış
    setSelectedSeason(season);
  }, []);

  // Güvenli fetch helper
  async function safeFetchJson(url: string, options?: any) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type');
    if (!res.ok) {
      // Eğer 404 ise boş array döndür
      if (res.status === 404) {
        return [];
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Beklenen JSON, gelen: ${contentType || 'yok'}\nYanıt: ${text.slice(0, 200)}`);
    }
    return await res.json();
  }

  // Standart checklist fetch fonksiyonunu component scope'a taşı
  const fetchStandardChecklist = async () => {
    try {
      const token = await getToken();
      // String id'yi integer id'ye çevir
      const seasonIntId = seasonIdMap[selectedSeason];
      const campingTypeIntId = campingTypeIdMap[selectedCampingType];
      const url = `${API_URL}/standard_checklists?season_id=${seasonIntId}&camping_type_id=${campingTypeIntId}`;
      console.log('Standart checklist GET url:', url);
      console.log('Standart checklist parametreleri:', { seasonIntId, campingTypeIntId });
      console.log('Kullanılan token:', token);
      const resData = await safeFetchJson(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Standart checklist yanıtı:', resData);
      if (resData && resData.length > 0) {
        setStandardChecklist(resData[0]);
        // Checklist itemlarını çek
        const itemsUrl = `${API_URL}/standard_checklists/items?checklist_id=${resData[0].id}`;
        console.log('Standart checklist items GET url:', itemsUrl);
        const itemsData = await safeFetchJson(itemsUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Standart checklist items yanıtı:', itemsData);
        setStandardChecklistItems(itemsData || []);
      } else {
        setStandardChecklist(null);
        setStandardChecklistItems([]);
      }
    } catch (e: any) {
      setStandardChecklist(null);
      setStandardChecklistItems([]);
      console.warn('Standart checklist alınamadı:', e);
      if (e && e.response) {
        console.warn('Hata yanıtı:', e.response);
      }
    }
  };

  // useEffect ile fetchStandardChecklist'i çağır
  useEffect(() => {
    if (Object.keys(seasonIdMap).length > 0 && Object.keys(campingTypeIdMap).length > 0) {
      fetchStandardChecklist();
    }
  }, [selectedSeason, selectedCampingType, seasonIdMap, campingTypeIdMap]);

  // Online olduğunda checklist'leri yenile
  useEffect(() => {
    if (isConnected && userRole !== 'guest') {
      const token = getToken();
      if (token) {
        if (__DEV__) console.log('[CHECKLIST] Online olundu, veriler yenileniyor...');
        
        // Custom checklist'leri yenile
        fetchCustomChecklists().catch(err => {
          if (__DEV__) console.warn('[CHECKLIST] Custom checklist yenileme hatası:', err);
        });
        
        // Standart checklist'i yenile (map'ler hazırsa)
        if (Object.keys(seasonIdMap).length > 0 && Object.keys(campingTypeIdMap).length > 0) {
          fetchStandardChecklist().catch(err => {
            if (__DEV__) console.warn('[CHECKLIST] Standard checklist yenileme hatası:', err);
          });
        }
      }
    }
  }, [isConnected]);

  // Kişisel ve paylaşılan checklistleri API'den çeken fonksiyon
  async function fetchCustomChecklists() {
    try {
      const token = await getToken();
      const me = await getMe();
      const url = `${API_URL}/custom_checklists?user_id=${me.id}`;
      console.log('[Custom Checklist] İstek URL:', url);
      console.log('[Custom Checklist] Token:', token);
      let data;
      try {
        data = await safeFetchJson(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('[Custom Checklist] Backend yanıtı:', data);
        if (!Array.isArray(data) || data.length === 0) {
          // Sunucudan kişisel checklist verisi alınamadı veya boş. (Alert kaldırıldı)
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('HTTP')) {
          // Hata durumunda status kodu ve response body'yi logla
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const body = await res.text();
          console.error('[Custom Checklist] Hata Detay:', {
            url,
            status: res.status,
            body,
            token
          });
          // Guest kullanıcı 403/yetkisi yok hatası ise Alert gösterme, sadece logla
          const isGuestPermissionError = res.status === 403 && body.includes('yetkisi yok');
          if (isGuestPermissionError) {
            if (__DEV__) console.log('[Custom Checklist] Guest kullanıcı yetki hatası (403), alert gösterilmiyor:', body);
          } else {
            Alert.alert('Checklist Hatası', `Sunucudan veri alınamadı: ${res.status}\n${body}`);
          }
        } else {
          if (userRole !== 'guest') {
            Alert.alert('Checklist Hatası', 'Sunucudan veri alınamadı.');
          }
        }
        throw err;
      }
      setCustomChecklists(data || []);
      const itemsObj: Record<string, CustomChecklistItem[]> = {};
      
      // Önce kişisel checklistlerin itemlarını al
      for (const checklist of data || []) {
        const itemsUrl = `${API_URL}/custom_checklists/items?checklist_id=${checklist.id}`;
        console.log('[Custom Checklist] Items GET url:', itemsUrl);
        const itemsData = await safeFetchJson(itemsUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        itemsObj[checklist.id] = itemsData || [];
      }
      // Benimle paylaşılan checklist'ler
      const sharedUrl = `${API_URL}/checklst_shares/shared?shared_with_user_id=${me.id}`;
      console.log('[Custom Checklist] Shared checklist GET url:', sharedUrl);
      const sharedData = await safeFetchJson(sharedUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('[Custom Checklist] Shared checklist yanıtı:', sharedData);

      // Tekrarlı paylaşımları filtrele - unique checklist_id'leri al
      const uniqueSharedChecklists = Array.from(new Set((sharedData || []).map((share: any) => share.checklist_id)))
        .filter((id): id is string => Boolean(id)); // undefined/null değerleri filtrele ve type assertion ekle

      console.log('[Custom Checklist] Unique shared checklist IDs:', uniqueSharedChecklists);

      // Paylaşılan checklistlerin adını ve detaylarını çek
      // checklist_id'ye göre ilk paylaşım kaydındaki başlığı bul
      const sharedChecklistDetails: CustomChecklist[] = uniqueSharedChecklists.map((checklistId) => {
        const shareRecord = (sharedData || []).find((s: any) => s.checklist_id === checklistId);
        console.log('[DEBUG] shareRecord for checklistId', checklistId, ':', shareRecord);
        console.log('[DEBUG] owner.username:', shareRecord?.owner?.username);
        console.log('[DEBUG] shared_by_name:', shareRecord?.shared_by_name);
        console.log('[DEBUG] shared_by_user_name:', shareRecord?.shared_by_user_name);
        console.log('[DEBUG] shared_by:', shareRecord?.shared_by);
        return {
          id: checklistId,
          name: shareRecord?.name || '',
          is_shared: true,
          created_at: '',
          share_id: shareRecord?.id || null, // paylaşım kaydının id'si
          shared_by_name: shareRecord?.owner?.username || shareRecord?.shared_by_name || shareRecord?.shared_by_user_name || 'Bilinmeyen Kullanıcı', // paylaşan kullanıcının kullanıcı adı
        };
      });
      
      console.log('[DEBUG] Final sharedChecklistDetails with user names:', sharedChecklistDetails);

      // Kendi paylaşımlarımızı (benim checklist'lerimi kimlerle paylaştığımı) çek
      const mySharesUrl = `${API_URL}/checklst_shares?shared_by_user_id=${me.id}`;
      console.log('[Custom Checklist] My shares GET url:', mySharesUrl);
      let mySharesData: any = [];
      try {
        const mySharesRes = await fetch(mySharesUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('[Custom Checklist] My shares response status:', mySharesRes.status);
        if (mySharesRes.ok) {
          mySharesData = await mySharesRes.json();
          console.log('[Custom Checklist] My shares yanıtı:', mySharesData);
        } else {
          const errorText = await mySharesRes.text();
          console.warn('[Custom Checklist] My shares hata yanıtı:', errorText);
        }
      } catch (e) {
        console.warn('[Custom Checklist] My shares alınamadı:', e);
      }

      // Arkadaş bazında paylaşım durumu ve shareId'leri çıkar (kendi paylaşımlarımızdan)
      const sharedWithObj: Record<string, string[]> = {};
      const shareIdsObj: Record<string, Record<string, string>> = {};
      console.log('[DEBUG] mySharesData:', mySharesData);
      (mySharesData || []).forEach((share: any) => {
        if (!share.checklist_id || !share.shared_with_user_id) return;
        const checklistIdStr = String(share.checklist_id);
        const userIdStr = String(share.shared_with_user_id);
        if (!sharedWithObj[checklistIdStr]) sharedWithObj[checklistIdStr] = [];
        sharedWithObj[checklistIdStr].push(userIdStr);
        if (!shareIdsObj[checklistIdStr]) shareIdsObj[checklistIdStr] = {};
        shareIdsObj[checklistIdStr][userIdStr] = share.id;
      });
      console.log('[DEBUG] sharedWithObj:', sharedWithObj);
      console.log('[DEBUG] shareIdsObj:', shareIdsObj);
      // Paylaşılan checklistlerin itemlarını al
      for (const checklistId of uniqueSharedChecklists) {
        try {
          const itemsUrl = `${API_URL}/custom_checklists/items?checklist_id=${checklistId}`;
          console.log('[Shared Checklist] Items GET url:', itemsUrl);
          const itemsData = await safeFetchJson(itemsUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log('[Shared Checklist] Items data:', itemsData);
          if (Array.isArray(itemsData)) {
            itemsObj[checklistId] = itemsData;
          }
        } catch (e) {
          console.warn('[Shared Checklist] Itemlar alınamadı:', checklistId, e);
        }
      }

      console.log('[Shared Checklist] Final details:', sharedChecklistDetails);

      console.log('[Custom Checklist] Final itemsObj:', itemsObj);

      // Tüm veriler toplandıktan sonra state'leri güncelle
      setSharedChecklists(sharedChecklistDetails);
      setCustomChecklistItemsApi(itemsObj); // Hem kişisel hem paylaşılan checklistlerin itemlarını güncelle
      setSharedWith(sharedWithObj);
      setShareIds(shareIdsObj);

      // [DEBUG PAYLAŞIM] Backend'den güncellenen state'i logla
      console.log('[DEBUG PAYLAŞIM] Backend\'den güncellendi - sharedWith:', sharedWithObj);
      console.log('[DEBUG PAYLAŞIM] Backend\'den güncellendi - shareIds:', shareIdsObj);
    } catch (e) {
      setCustomChecklists([]);
      setCustomChecklistItemsApi({});
      setSharedChecklists([]);
      console.warn('[Custom Checklist] Alınamadı:', e);
    }
  }

// Paylaşılan checklisti kaldırma fonksiyonu (component scope)
const removeSharedChecklist = async (shareId: string) => {
  try {
    console.log('[DEBUG] removeSharedChecklist çağrıldı, shareId:', shareId);
    const token = await getToken();
    const url = `${API_URL}/checklst_shares/${shareId}`;
    console.log('[DEBUG] DELETE isteği gönderiliyor:', url);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[DEBUG] DELETE yanıt status:', res.status);
    if (!res.ok) {
      const errorText = await res.text();
      console.warn('Paylaşılan checklist kaldırma hatası:', errorText);
      Alert.alert('Hata', 'Paylaşılan checklist kaldırılamadı');
      throw new Error(`Paylaşılan checklist kaldırılamadı: ${res.status}`);
    }
    console.log('[DEBUG] Paylaşım silindi, fetchCustomChecklists çağrılıyor...');
    await fetchCustomChecklists();
    console.log('[DEBUG] State güncellendi');
    Alert.alert('Başarılı', 'Paylaşılan checklist kaldırıldı');
  } catch (e) {
    console.warn('Paylaşılan checklist kaldırma hatası:', e);
    Alert.alert('Hata', 'Paylaşılan checklist kaldırılırken bir hata oluştu');
  }
};

  // isLoggingOut zaten yukarıda tanımlı, tekrar tanımlama!
  useEffect(() => {
    if (userRole !== 'guest' && !isLoggingOut) {
      fetchCustomChecklists();
    }
  }, [userRole, isLoggingOut]);

  // Kişisel checklist oluşturma fonksiyonu
  async function createCustomChecklist(name: string, isShared: boolean): Promise<string | null> {
    try {
      const token = await getToken();
      const me = await getMe();
      const payload = { name, is_shared: isShared, user_id: me.id };
      console.log('Checklist oluşturma için gönderilen veri:', payload);
      const res = await fetch(`${API_URL}/custom_checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const responseText = await res.text();
      console.log('Checklist oluşturma yanıtı:', res.status, responseText);
      if (!res.ok) throw new Error('Checklist oluşturulamadı');
      let checklistId: string | null = null;
      try {
        const json = JSON.parse(responseText);
        checklistId = json.id || null;
      } catch (e) {
        // Yanıt JSON değilse veya id yoksa fallback
        checklistId = null;
      }
      // Yeniden çek
      await fetchCustomChecklists();
      return checklistId;
    } catch (e) {
      console.warn('Checklist oluşturma hatası:', e);
      return null;
    }
  }

  // Kişisel checklist'e item ekleme fonksiyonu
  async function addCustomChecklistItem(checklistId: string, itemName: string) {
    try {
      const token = await getToken();
      const payload = { checklist_id: checklistId, item_name: itemName };
      console.log('Checklist item ekleme için gönderilen veri:', payload);
      const res = await fetch(`${API_URL}/custom_checklists/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Checklist item eklenemedi');
      await res.json();
      // Yeniden çek
      await fetchCustomChecklists();
    } catch (e) {
      console.warn('Checklist item ekleme hatası:', e);
    }
  }

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
    // Tüm işaretleri temizle
    const clearChecklist = async () => {
      setCheckedItems({});
      await SecureStorage.removeItem('checklist_checkedItems');
    };
  };

  // addCustomItem fonksiyonu artık sadece API ile çalışacak şekilde güncellendi
  const addCustomItem = async (item: any) => {
    // Superadmin ve standart checklist mevcutsa, kategori/öğe eklenebilir
    if (userRole === 'superadmin' && standardChecklist) {
      try {
        const token = await getToken();
        const me = await getMe();
        const payload = {
          checklist_id: standardChecklist.id,
          item_name: item.name || item.item_name,
          category: item.category || selectedCategory,
          user_id: me.id,
        };
        console.log('Standart checklist item ekleme payload:', payload);
        const res = await fetch(`${API_URL}/standard_checklists/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorText = await res.text();
          console.warn('Sunucu yanıtı:', res.status, errorText);
          throw new Error(`Standart checklist item eklenemedi: ${res.status} ${errorText}`);
        }
        const responseData = await res.json();
        console.log('Başarılı yanıt:', responseData);
        // Yeniden çek
        const itemsUrl = `${API_URL}/standard_checklists/items?checklist_id=${standardChecklist.id}`;
        const itemsData = await safeFetchJson(itemsUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStandardChecklistItems(itemsData || []);
      } catch (e) {
        console.warn('Standart checklist item ekleme hatası:', e);
      }
    } else if (selectedChecklistId) {
      // Kişisel checklist için API'ya ekleme
      await addCustomChecklistItem(selectedChecklistId, item.name || item.item_name);
    }
  };
  // Superadmin için standart checklist yoksa oluşturma butonu
  const handleCreateStandardChecklist = async () => {
    try {
      const token = await getToken();
      const me = await getMe();
      const seasonIntId = seasonIdMap[selectedSeason];
      const campingTypeIntId = campingTypeIdMap[selectedCampingType];
      const payload = {
        season_id: seasonIntId,
        camping_type_id: campingTypeIntId,
        created_by: me.id,
        name: `${seasons.find(s => s.id === selectedSeason)?.name || ''} - ${campingTypes.find(t => t.id === selectedCampingType)?.name || ''} Standart Checklist`,
      };
      console.log('[DEBUG] Standart checklist oluşturma payload:', payload);
      const res = await fetch(`${API_URL}/standard_checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.log('[HATA] Standart checklist oluşturulamadı:', errorText);
        return;
      }
      console.log('[BİLGİ] Standart checklist oluşturuldu!');
      // Checklist oluşturulduktan sonra tekrar fetch et
      if (Object.keys(seasonIdMap).length > 0 && Object.keys(campingTypeIdMap).length > 0) {
        // fetchStandardChecklist fonksiyonunu çağır
        if (typeof fetchStandardChecklist === 'function') {
          fetchStandardChecklist();
        } else {
          // State tetiklemek için selectedSeason'u değiştir
          setSelectedSeason(prev => prev);
        }
      }
    } catch (e) {
      console.log('[HATA] Standart checklist oluşturulamadı:', e);
    }
  };

  // Standart checklist item silme fonksiyonu
  const deleteStandardItem = async (itemId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/standard_checklists/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Silme hatası:', errorText);
        throw new Error(`Item silinemedi: ${res.status}`);
      }
      // Listeyi yenile
      if (standardChecklist) {
        const itemsUrl = `${API_URL}/standard_checklists/items?checklist_id=${standardChecklist.id}`;
        const itemsData = await safeFetchJson(itemsUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStandardChecklistItems(itemsData || []);
      }
    } catch (e) {
      console.warn('Item silme hatası:', e);
    }
  };

  // Standart checklist item güncelleme fonksiyonu
  const updateStandardItem = async (itemId: string, newName: string, newCategory: string) => {
    try {
      if (!standardChecklist) {
        throw new Error('Standart checklist bulunamadı');
      }

      const token = await getToken();
      console.log('Güncelleme isteği:', { itemId, newName, newCategory });
      
      // Backend'in beklediği formatta payload
      const payload = {
        category: newCategory,
        item_name: newName,
        checklist_id: standardChecklist.id
      };
      console.log('Güncelleme payload:', payload);

      // PUT /standard_checklists/items/:id endpoint'i
      const res = await fetch(`${API_URL}/standard_checklists/items/${itemId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Güncelleme hatası:', errorText);
        console.warn('Kullanılan token:', token);
        console.warn('Kullanıcı rolü:', userRole);
        throw new Error(`Item güncellenemedi: ${res.status}`);
      }

      const responseData = await res.json();
      console.log('Güncelleme başarılı:', responseData);

      // Listeyi yenile
      if (standardChecklist) {
        const itemsUrl = `${API_URL}/standard_checklists/items?checklist_id=${standardChecklist.id}`;
        const itemsData = await safeFetchJson(itemsUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStandardChecklistItems(itemsData || []);
      }
    } catch (e) {
      console.warn('Item güncelleme hatası:', e);
    }
  };

  const deleteCustomItem = (itemId: string) => {
    // Artık local customItems kullanılmıyor, silme işlemi API ile yapılmalı
  };

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Standart checklist itemlarını ChecklistItem tipine dönüştür
  const mappedStandardItems = useMemo(() => {
    const mapped = standardChecklistItems.map(item => ({
      id: item.id,
      name: item.item_name,
      checked: false,
      category: item.category || 'Standart',
    }));
    console.log('mappedStandardItems calculated:', mapped);
    return mapped;
  }, [standardChecklistItems]);

  const currentChecklist = useMemo(() => {
    const list = [...mappedStandardItems];
    console.log('currentChecklist calculated:', list);
    return list;
  }, [mappedStandardItems]);

  console.log('currentChecklist:', currentChecklist);
  
  const groupedItems = currentChecklist.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const completedCount = currentChecklist.filter(item => checkedItems[item.id]).length;
  const totalCount = currentChecklist.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  const categories = Object.keys(groupedItems);

  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const renderChecklistItem = ({ item, isCustom }: { item: ChecklistItem; isCustom?: boolean }) => {
    const isStandardItem = typeof item.id === 'number';
    const isEditing = editingItem?.id === item.id;

    if (isEditing) {
      return (
        <View style={[styles.checklistItem, { flexDirection: 'column' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.itemText, { borderBottomWidth: 1, borderColor: colors.primary, padding: 4, marginBottom: 4, color: colors.text }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Item adı"
              />
              <TextInput
                style={[styles.itemText, { borderBottomWidth: 1, borderColor: colors.primary, padding: 4, color: colors.text }]}
                value={editCategory}
                onChangeText={setEditCategory}
                placeholder="Kategori"
              />
            </View>
            <View style={{ flexDirection: 'row', marginLeft: 8 }}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#059669', marginRight: 4 }]}
                onPress={async () => {
                  try {
                    console.log('Güncelleme butonuna basıldı:', {
                      id: item.id,
                      name: editName,
                      category: editCategory
                    });
                    await updateStandardItem(item.id.toString(), editName, editCategory);
                    setEditingItem(null);
                  } catch (error) {
                    console.error('Güncelleme sırasında hata:', error);
                    Alert.alert('Hata', 'Güncelleme yapılırken bir hata oluştu');
                  }
                }}
              >
                <Text style={{ color: 'white' }}>Kaydet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.danger }]}
                onPress={() => setEditingItem(null)}
              >
                <Text style={{ color: 'white' }}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.checklistItem, { borderBottomColor: colors.surfaceVariant }, checkedItems[item.id] && [styles.checkedItem, { backgroundColor: colors.primaryLight }]]}
        onPress={() => toggleItem(item.id)}
      >
        <View style={styles.checkboxContainer}>
          {checkedItems[item.id] ? (
            <CheckSquare size={24} color={colors.primary} />
          ) : (
            <Square size={24} color={colors.muted} />
          )}
        </View>
        <Text style={[styles.itemText, { color: colors.textSecondary }, checkedItems[item.id] && [styles.checkedText, { color: colors.primary }]]}>
          {item.name}
        </Text>
        {(isCustom || (isStandardItem && userRole === 'superadmin')) && (
          <View style={{ flexDirection: 'row' }}>
            {isStandardItem && userRole === 'superadmin' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.info, marginRight: 8 }]}
                onPress={() => {
                  setEditingItem(item);
                  setEditName(item.name);
                  setEditCategory(item.category);
                }}
              >
                <Edit size={18} color="white" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.danger }]}
              onPress={() => isStandardItem ? deleteStandardItem(item.id.toString()) : deleteCustomItem(item.id)}
            >
              <Text style={{ color: 'white' }}>Sil</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Kamp Checklist</Text>
              <Text style={[styles.headerSubtitle, { color: colors.muted }]}>Kamp hazırlığınızı organize edin</Text>
            </View>
            {Object.values(checkedItems).some(v => v) && (
              <View style={{ flex: 1, alignItems: 'flex-end', maxWidth: '50%' }}>
                <TouchableOpacity
                  onPress={clearChecklist}
                  style={{ backgroundColor: colors.danger, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, maxWidth: '100%' }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={{ color: 'white', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.1 }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    Tümünü Temizle
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.progressContainer, { backgroundColor: colors.surface }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>İlerleme</Text>
            <Text style={[styles.progressPercentage, { color: colors.primary }]}>{completionPercentage}%</Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${completionPercentage}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.progressText, { color: colors.muted }]}>
            {completedCount} / {totalCount} öğe tamamlandı
          </Text>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Mevsim Seçin</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {seasons.map((season) => (
              <TouchableOpacity
                key={season.id}
                style={[
                  styles.seasonCard,
                  { backgroundColor: colors.surface },
                  selectedSeason === season.id && [styles.selectedCard, { backgroundColor: colors.primary }],
                  { borderColor: season.color }
                ]}
                onPress={() => setSelectedSeason(season.id)}
              >
                <season.icon 
                  size={32} 
                  color={selectedSeason === season.id ? 'white' : season.color} 
                />
                <Text style={[
                  styles.cardText,
                  { color: colors.textSecondary },
                  selectedSeason === season.id && styles.selectedCardText
                ]}>
                  {season.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Kamp Türü Seçin</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {campingTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeCard,
                  { backgroundColor: colors.surface },
                  selectedCampingType === type.id && [styles.selectedCard, { backgroundColor: colors.primary }],
                  { borderColor: type.color }
                ]}
                onPress={() => setSelectedCampingType(type.id)}
              >
                <SvgXml 
                  xml={type.icon({ 
                    width: 28, 
                    height: 28, 
                    fill: selectedCampingType === type.id ? 'white' : type.color, 
                    stroke: selectedCampingType === type.id ? 'white' : type.color 
                  })} 
                  width={28} 
                  height={28} 
                />
                <Text style={[
                  styles.cardText,
                  { color: colors.textSecondary },
                  selectedCampingType === type.id && styles.selectedCardText
                ]}>
                  {type.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.checklistContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {seasons.find(s => s.id === selectedSeason)?.name} - {campingTypes.find(t => t.id === selectedCampingType)?.name} Listesi
          </Text>
          {/* Eğer superadmin ve standart checklist yoksa oluşturma butonu göster */}
          {userRole === 'superadmin' && !standardChecklist && (
            <TouchableOpacity
              style={[styles.addCategoryButton, { marginBottom: 12, borderColor: colors.primary, backgroundColor: colors.surface }]}
              onPress={handleCreateStandardChecklist}
            >
              <Plus size={20} color={colors.primary} />
              <Text style={[styles.addCategoryText, { color: colors.primary }]}>Yeni Standart Checklist Oluştur</Text>
            </TouchableOpacity>
          )}
          {Object.entries(groupedItems).map(([category, items]) => (
            <View key={category} style={[styles.categoryContainer, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={[styles.categoryHeader, { backgroundColor: colors.surfaceVariant, borderBottomColor: colors.border }]}
                onPress={() => toggleCategory(category)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                  <Text style={[styles.categoryTitle, { color: colors.text, backgroundColor: 'transparent', borderBottomWidth: 0 }]}>{category}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {userRole === 'superadmin' && standardChecklist && (
                      <TouchableOpacity
                        style={styles.addItemButton}
                        onPress={(e) => {
                          e.stopPropagation && e.stopPropagation();
                          setSelectedCategory(category);
                          setShowAddModal(true);
                        }}
                      >
                        <Plus size={16} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                    <View style={{ marginLeft: 8 }}>
                      {openCategories[category] ? (
                        <ChevronUp size={20} color={colors.muted} />
                      ) : (
                        <ChevronDown size={20} color={colors.muted} />
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
              {openCategories[category] && (
                <View>
                  {(items as any[]).map((item) => (
                    <View key={item.id}>
                      {renderChecklistItem({ item, isCustom: typeof item.id === 'string' && item.id.startsWith('custom_') })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          {userRole === 'superadmin' && standardChecklist && (
            <TouchableOpacity
              style={[styles.addCategoryButton, { borderColor: colors.primary, backgroundColor: colors.surface }]}
              onPress={() => {
                setSelectedCategory('Yeni Kategori');
                setShowAddModal(true);
              }}
            >
              <Plus size={20} color={colors.primary} />
              <Text style={[styles.addCategoryText, { color: colors.primary }]}>Yeni Kategori Ekle</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Kişisel checklistler bölümü */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Kişisel Checklistlerim</Text>
          <TouchableOpacity style={[styles.addCategoryButton, { borderColor: colors.primary, backgroundColor: colors.surface }]} onPress={() => setShowCreateChecklistModal(true)}>
            <Plus size={20} color={colors.primary} />
            <Text style={[styles.addCategoryText, { color: colors.primary }]}>Yeni Kişisel Checklist Oluştur</Text>
          </TouchableOpacity>
          {customChecklists.map((cl, idx) => {
            if (idx === 0) {
              console.log('[DEBUG RENDER] customChecklists:', customChecklists);
            }
            console.log('[DEBUG RENDER] customChecklistItemsApi[cl.id]:', cl.id, customChecklistItemsApi[cl.id]);
            return (
              <View key={cl.id} style={[styles.categoryContainer, { backgroundColor: colors.surface }]}>
                <View style={[styles.categoryHeader, { backgroundColor: colors.surfaceVariant, borderBottomColor: colors.border }]}>
                  {editingChecklistId === cl.id ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        style={[styles.categoryTitle, { borderBottomWidth: 1, borderColor: colors.primary, flex: 1, marginRight: 8, color: colors.text, backgroundColor: 'transparent' }]}
                        value={editChecklistName}
                        onChangeText={setEditChecklistName}
                        placeholder="Checklist başlığı"
                      />
                      <TouchableOpacity
                        style={[styles.addItemButton, { marginRight: 4, backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                        onPress={async () => {
                          await updateCustomChecklistName(cl.id, editChecklistName);
                          setEditingChecklistId(null);
                        }}
                      >
                        <CheckCircle2 size={16} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.addItemButton, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                        onPress={() => setEditingChecklistId(null)}
                      >
                        <X size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.categoryTitle, { color: colors.text, backgroundColor: 'transparent', borderBottomWidth: 0 }]}>{cl.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* DÜZENLE BUTONU */}
                        <TouchableOpacity style={[styles.addItemButton, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]} onPress={() => {
                          setEditingChecklistId(cl.id);
                          setEditChecklistName(cl.name);
                        }}>
                          <Edit size={16} color={colors.info} />
                        </TouchableOpacity>
                        {/* PAYLAŞ BUTONU */}
                        <TouchableOpacity style={[styles.addItemButton, { marginLeft: 8, backgroundColor: colors.primaryLight, borderColor: colors.primary }]} onPress={() => handleShareButton(cl.id)}>
                          <Share2 size={16} color={colors.info} />
                        </TouchableOpacity>
                        {/* EKLE BUTONU */}
                        <TouchableOpacity style={[styles.addItemButton, { marginLeft: 8, backgroundColor: colors.primaryLight, borderColor: colors.primary }]} onPress={() => {
                          setSelectedChecklistId(cl.id);
                          setShowAddChecklistItemModal(true);
                        }}>
                          <Plus size={16} color={colors.primary} />
                        </TouchableOpacity>
                        {/* SİL BUTONU */}
                        <TouchableOpacity style={[styles.addItemButton, { marginLeft: 8, backgroundColor: colors.primaryLight, borderColor: colors.primary }]} onPress={async () => {
                          try {
                            const token = await getToken();
                            const resShares = await fetch(`${API_URL}/checklst_shares?checklist_id=${cl.id}`, {
                              method: 'DELETE',
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            if (!resShares.ok && resShares.status !== 404) {
                              const errorText = await resShares.text();
                              console.log('Checklist paylaşımları silme hatası:', errorText);
                              Alert.alert('Hata', `Checklist paylaşımları silinemedi: ${errorText}`);
                              return;
                            }
                            const res = await fetch(`${API_URL}/custom_checklists/${cl.id}`, {
                              method: 'DELETE',
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            if (!res.ok) {
                              const errorText = await res.text();
                              console.log('Checklist silme hatası:', errorText);
                              Alert.alert('Hata', `Checklist silinemedi: ${errorText}`);
                              return;
                            }
                            await fetchCustomChecklists();
                          } catch (e) {
                            console.log('Checklist silinirken hata:', e);
                            Alert.alert('Hata', 'Checklist silinirken bir hata oluştu');
                          }
                        }}>
                          <Trash2 size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
                {(customChecklistItemsApi[cl.id] || []).map((item) => {
                  const isEditing = editingItem?.id === item.id;
                  const key = `${cl.id}_${item.id}`;
                  const checked = checkedItems[key] || false;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.checklistItem, { borderBottomColor: colors.surfaceVariant }, checked && [styles.checkedItem, { backgroundColor: colors.primaryLight }]]}
                      onPress={() => {
                        setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
                      }}
                    >
                      <View style={styles.checkboxContainer}>
                        {checked ? (
                          <CheckSquare size={24} color={colors.primary} />
                        ) : (
                          <Square size={24} color={colors.muted} />
                        )}
                      </View>
                      {isEditing ? (
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput
                            style={[styles.itemText, { borderBottomWidth: 1, borderColor: colors.primary, padding: 4, marginRight: 8, color: colors.text }]}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Item adı"
                          />
                          <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: colors.primary, marginRight: 4 }]}
                            onPress={async () => {
                              await updateCustomChecklistItem(item.id, editName);
                              setEditingItem(null);
                            }}
                          >
                            <CheckSquare size={20} color="white" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: colors.danger }]}
                            onPress={() => setEditingItem(null)}
                          >
                            <Square size={20} color="white" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <Text style={[styles.itemText, { color: colors.textSecondary }, checked && [styles.checkedText, { color: colors.primary }]]}>{item.item_name}</Text>
                          <View style={{ flexDirection: 'row' }}>
                            <TouchableOpacity
                              style={[styles.actionButton, { backgroundColor: colors.info, marginRight: 8 }]}
                              onPress={() => {
                                setEditingItem(item as any);
                                setEditName(item.item_name);
                              }}
                            >
                              <Edit size={20} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionButton, { backgroundColor: colors.danger, marginRight: 8 }]}
                              onPress={() => deleteCustomChecklistItem(item.id)}
                            >
                              <Trash2 size={20} color="white" />
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>

        {/* Paylaşılan Checklistler bölümü */}
        {sharedChecklists.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Benimle Paylaşılan Checklistler</Text>
            {sharedChecklists.map((cl, index) => {
              const checklistItems = customChecklistItemsApi[cl.id] || [];
              // Durum badge'i için status ve is_active alanlarını kullan
              const status = (cl as any).status;
              const isActive = (cl as any).is_active !== false;
              const revokedAt = (cl as any).revokedAt;
              return (
                <View key={`shared-checklist-${cl.id || index}`} style={[styles.categoryContainer, { backgroundColor: colors.surface }]}>
                  <View style={[styles.categoryHeader, { backgroundColor: colors.surfaceVariant, borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.categoryTitle, { color: colors.text, backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
                        {cl.name || (cl as any).title || (cl as any).checklist_name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#f3e8ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginRight: 8 }}>
                          <Text style={{ fontSize: 12, color: '#8b5cf6', fontWeight: '600' }}>
                            @{(cl as any).shared_by_name || 'Bilinmeyen Kullanıcı'} tarafından paylaşıldı
                          </Text>
                        </View>
                        {/* Durum badge'i */}
                        {status && (
                          <View style={{ alignSelf: 'flex-start', backgroundColor: isActive ? '#dcfce7' : '#fee2e2', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                            <Text style={{ fontSize: 11, color: isActive ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                              {isActive ? 'Aktif' : 'Geri Çekildi'}
                              {revokedAt && !isActive ? ` (${new Date(revokedAt).toLocaleDateString('tr-TR')})` : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {/* Kaldırma butonu */}
                    {cl.share_id && (
                      <TouchableOpacity
                        style={[styles.addItemButton, { marginLeft: 8, backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                        onPress={() => removeSharedChecklist(cl.share_id!)}
                      >
                        <Trash2 size={16} color={colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {checklistItems.length > 0 ? (
                    <View>
                      {checklistItems.map((item, idx) => {
                        const checked = sharedCheckedItems[item.id] || false;
                        return (
                          <TouchableOpacity
                            key={item.id || idx}
                            style={[styles.checklistItem, { borderBottomColor: colors.surfaceVariant }, checked && [styles.checkedItem, { backgroundColor: colors.primaryLight }]]}
                            onPress={() => {
                              setSharedCheckedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                            }}
                          >
                            <View style={styles.checkboxContainer}>
                              {checked ? (
                                <CheckSquare size={24} color={colors.primary} />
                              ) : (
                                <Square size={24} color={colors.muted} />
                              )}
                            </View>
                            <Text style={[styles.itemText, { color: colors.textSecondary }, checked && [styles.checkedText, { color: colors.primary }]]}>
                              {item.item_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ 
                      textAlign: 'center',
                      color: colors.muted,
                      paddingVertical: 12,
                      fontStyle: 'italic'
                    }}>Bu listede henüz öğe yok</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Yeni checklist modalı */}
        {showCreateChecklistModal && (
          <Modal
            visible={showCreateChecklistModal}
            animationType="slide"
            transparent
            onRequestClose={() => setShowCreateChecklistModal(false)}
          >
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.18)' }}>
              <View style={{ height: '80%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.15, shadowRadius: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Yeni Kişisel Checklist Oluştur</Text>
                  <TouchableOpacity onPress={() => setShowCreateChecklistModal(false)} style={{ padding: 4 }}>
                    <X size={24} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20 }}>
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 }}>Checklist Adı *</Text>
                    <TextInput
                      placeholder="Checklist adı"
                      value={newChecklistName}
                      onChangeText={setNewChecklistName}
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, backgroundColor: colors.surface, color: colors.text }}
                    />
                  </View>
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 }}>Checklist Item</Text>
                    <TextInput
                      placeholder="İlk item adı"
                      value={newChecklistItemName}
                      onChangeText={setNewChecklistItemName}
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, backgroundColor: colors.surface, color: colors.text }}
                    />
                  </View>
                </View>
                <View style={{ padding: 20, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <TouchableOpacity
                    style={{ backgroundColor: newChecklistName.trim() ? colors.primary : colors.muted, paddingVertical: 16, borderRadius: 8, alignItems: 'center' }}
                    onPress={async () => {
                      if (!newChecklistName.trim()) return;
                      // Önce checklisti oluştur
                      const checklistId = await createCustomChecklist(newChecklistName, false);
                      // Sonra item ekle
                      if (checklistId && newChecklistItemName.trim()) {
                        await addCustomChecklistItem(checklistId, newChecklistItemName);
                      }
                      setShowCreateChecklistModal(false);
                      setNewChecklistName('');
                      setNewChecklistItemName('');
                    }}
                    disabled={!newChecklistName.trim()}
                  >
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Oluştur</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Yeni checklist item modalı */}
        {showAddChecklistItemModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center', zIndex: 99 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, minWidth: 260, alignItems: 'center', elevation: 4 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 18, color: colors.primary }}>Yeni Checklist Item</Text>
              <TextInput
                placeholder="Item adı"
                value={newChecklistItemName}
                onChangeText={setNewChecklistItemName}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, width: 200, marginBottom: 12, color: colors.text }}
              />
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 10, marginBottom: 8 }} onPress={async () => {
                if (selectedChecklistId) {
                  await addCustomChecklistItem(selectedChecklistId, newChecklistItemName);
                }
                setShowAddChecklistItemModal(false);
                setNewChecklistItemName('');
                setSelectedChecklistId(null);
              }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Ekle</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddChecklistItemModal(false)} style={{ padding: 8 }}>
                <Text style={{ color: colors.muted, fontWeight: 'bold' }}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Paylaşım Modalı */}
      <Modal
        visible={showShareModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowShareModal(false);
          setSelectedFriends([]);
          setChecklistToShare(null);
        }}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <View style={{ 
            height: '80%', 
            backgroundColor: colors.surface, 
            borderTopLeftRadius: 24, 
            borderTopRightRadius: 24,
            padding: 20,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.15,
            shadowRadius: 8
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text }}>Checklist Paylaş</Text>
              <TouchableOpacity 
                onPress={() => {
                  setShowShareModal(false);
                  setSelectedFriends([]);
                  setChecklistToShare(null);
                }}
                style={{ padding: 8 }}
              >
                <X size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 12 }}>Paylaşmak istediğiniz arkadaşları seçin:</Text>

            <ScrollView style={{ flex: 1 }}>
              {(() => {
                console.log('[DEBUG MODAL] checklistToShare:', checklistToShare);
                console.log('[DEBUG MODAL] sharedWith:', sharedWith);
                console.log('[DEBUG MODAL] shareIds:', shareIds);
                console.log('[DEBUG MODAL] friends:', friends);
                return null;
              })()}
              {friends.map((friend) => {
                const isShared = !!(checklistToShare && sharedWith[checklistToShare] && sharedWith[checklistToShare].includes(String(friend.id)));
                console.log(`[DEBUG MODAL] Friend ${friend.name} (ID: ${friend.id}):`, {
                  checklistToShare,
                  sharedWithForChecklist: sharedWith[checklistToShare || ''],
                  isShared,
                  friendIdAsString: String(friend.id)
                });
                return (
                  <View key={friend.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: selectedFriends.includes(friend.id) ? colors.primaryLight : colors.surface }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                      onPress={() => {
                        setSelectedFriends(prev => 
                          prev.includes(friend.id)
                            ? prev.filter(id => id !== friend.id)
                            : [...prev, friend.id]
                        );
                      }}
                      disabled={isShared}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.border, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <User size={24} color={colors.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, color: colors.text, fontWeight: '500' }}>{friend.name}</Text>
                        <Text style={{ fontSize: 14, color: colors.muted }}>{friend.email}</Text>
                      </View>
                      {selectedFriends.includes(friend.id) && !isShared && (
                        <CheckCircle2 size={24} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                    {isShared ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: colors.primaryLight, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, flexDirection: 'row', alignItems: 'center' }}>
                          <CheckCircle2 size={14} color={colors.primary} style={{ marginRight: 4 }} />
                          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Paylaşıldı</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.addItemButton]}
                          onPress={() => {
                            if (checklistToShare) {
                              console.log('[DEBUG] Paylaşımı geri çek butonuna basıldı', { checklistToShare, friendId: friend.id });
                              unshareChecklistWithUser(checklistToShare, String(friend.id));
                            }
                          }}
                        >
                          <X size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View style={{ paddingVertical: 16 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: selectedFriends.length > 0 ? colors.primary : colors.border,
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
                disabled={selectedFriends.length === 0 || !checklistToShare}
                onPress={async () => {
                  if (checklistToShare && selectedFriends.length > 0) {
                    await shareCustomChecklist(checklistToShare, selectedFriends);
                    setShowShareModal(false);
                  }
                }}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Seçili Arkadaşlarla Paylaş ({selectedFriends.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      <AddChecklistItemModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addCustomItem}
        categories={categories}
        selectedCategory={selectedCategory}
        onDelete={
          // Eğer kategori kişisel checklist ise silme fonksiyonu iletilsin
          selectedCategory && selectedCategory.startsWith('custom_')
            ? () => {
                // Kategoriye ait tüm itemları sil
                // Artık local customItems kullanılmıyor, kategori silme işlemi API ile yapılmalı
                setShowAddModal(false);
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  headerSubtitle: { fontSize: 14 },
  progressContainer: { margin: 20, padding: 20, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressTitle: { fontSize: 16, fontWeight: '600' },
  progressPercentage: { fontSize: 18, fontWeight: '700' },
  progressBar: { height: 8, borderRadius: 4, marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 14, textAlign: 'center' },
  sectionContainer: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', paddingHorizontal: 20, marginBottom: 16 },
  horizontalScroll: { paddingLeft: 20 },
  seasonCard: { alignItems: 'center', padding: 16, marginRight: 12, borderRadius: 16, borderWidth: 2, minWidth: 100, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  typeCard: { alignItems: 'center', padding: 16, marginRight: 12, borderRadius: 16, borderWidth: 2, minWidth: 110, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  selectedCard: { },
  cardText: { fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  selectedCardText: { color: 'white' },
  checklistContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  categoryContainer: { borderRadius: 16, marginBottom: 16, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  categoryTitle: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  checkedItem: { },
  checkboxContainer: { marginRight: 12 },
  itemText: { fontSize: 16, flex: 1 },
  checkedText: { textDecorationLine: 'line-through' },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  addItemButton: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  deleteButton: { padding: 8, marginLeft: 8 },
  addCategoryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, padding: 20, marginTop: 16, borderWidth: 2, borderStyle: 'dashed' },
  addCategoryText: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
  actionButton: { 
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
});
