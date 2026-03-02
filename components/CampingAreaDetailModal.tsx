import React, { useState, useEffect } from 'react';
import { API_URL } from '@/lib/config';
import { getToken } from '../lib/auth';
import Svg, { Path } from 'react-native-svg';
import { getSVGIcon } from '@/app/icons/svgIcons';
import { SvgXml } from 'react-native-svg';
import { Dimensions } from 'react-native';
// Arkadaş tipini tanımla
// API /friends?user_id=X endpoint'i { id, name, email, avatar_url } formatında döner
// (types/friend.ts ile uyumlu). user_id de olabilir — her iki alanı destekliyoruz.
type Friend = {
  id?: string | number;
  user_id?: string | number;
  first_name?: string;
  last_name?: string;
  name?: string;
  avatar?: string;
  avatar_url?: string;
  email?: string;
};
// Basit avatar bileşeni
const FriendAvatar = ({ avatar, name }: { avatar?: string; name: string }) => (
  avatar ? (
    <Image source={{ uri: avatar }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#e5e7eb' }} />
  ) : (
    <View style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#6b7280', fontWeight: 'bold', fontSize: 18 }}>{name?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  )
);
// API'ya gönderim için images alanını stringleştiren yardımcı fonksiyon
export function prepareCampingAreaPayload(area: any) {
  const payload = { ...area };
  if (Array.isArray(payload.images)) {
    payload.images = JSON.stringify(payload.images);
  }
  // amenities artık dizi olarak gönderilecek, stringleştirme kaldırıldı
  // if (Array.isArray(payload.amenities)) {
  //   payload.amenities = JSON.stringify(payload.amenities);
  // }
  if (Array.isArray(payload.opening_hours)) {
    payload.opening_hours = JSON.stringify(payload.opening_hours);
  }
  if (typeof payload.tags === 'object' && payload.tags !== null) {
    payload.tags = JSON.stringify(payload.tags);
  }
  return payload;
}

// Local cache ile görsel gösteren yardımcı bileşen
const GalleryImageWithCache = ({ img, source_id, setImageError, onPress, refreshKey }: { img: string, source_id?: any, setImageError: (v: boolean) => void, onPress?: () => void, refreshKey?: number }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isConnected = useNetworkStatus();
  const prevConnectedRef = React.useRef<boolean>(isConnected);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        let image_id = '';
        if (/photo_\d+_\d+/.test(img)) {
          image_id = img.match(/photo_\d+_\d+/)?.[0] || '';
        } else {
          image_id = img.split('/').pop()?.split('.')[0] || '';
        }
        
        // Offline'dan online'a geçiş yapıldıysa cache'i yenile (mevcut cache'i sil ve yeniden indir)
        const wasOffline = !prevConnectedRef.current;
        const isNowOnline = isConnected;
        const justWentOnline = wasOffline && isNowOnline;
        
        // Sadece offline->online geçişte forceRefresh yapılır
        // Modal açıldığında normal cache kontrolü yapılır (cache varsa kullan, yoksa indir)
        const shouldForceRefresh = justWentOnline;
        
        if (justWentOnline) {
          console.log('[image-cache] 🟢 ONLINE olundu, cache yenileniyor:', img);
        }
        
        // refreshKey değiştiğinde (modal açıldığında) sadece yükleme tetiklenir, cache varsa kullanılır
        const localPath = await getCachedImagePath(image_id, img, shouldForceRefresh, isConnected);
        if (localPath.startsWith('file://')) {
          console.log(`[image-cache] ✅ LOCAL gösteriliyor: ${image_id}`);
        } else {
          console.log(`[image-cache] 🌐 REMOTE gösteriliyor: ${image_id}`);
        }
        if (isMounted) setUri(localPath);
      } catch (e) {
        console.log('[image-cache] ❌ HATA:', e);
        if (isMounted) setError(true);
        setImageError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    load();
    
    // Önceki bağlantı durumunu güncelle
    prevConnectedRef.current = isConnected;
    
    return () => { isMounted = false; };
  }, [img, isConnected, refreshKey]);

  if (loading) {
    return (
      <View style={[styles.galleryImageWrapper, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e5e7eb' }]}> 
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }
  if (error || !uri) {
    return (
      <View style={[styles.galleryImageWrapper, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e5e7eb' }]}> 
        <Text style={{ fontSize: 32, color: '#9ca3af' }}>🏕️</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.galleryImageWrapper} onPress={onPress} activeOpacity={0.9}>
      <Image
        source={{ uri }}
        style={styles.galleryImage}
        onError={() => { setError(true); setImageError(true); }}
      />
      {(source_id === '1' || img.includes('googleusercontent')) && (
        <View style={styles.googleBadge}>
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    <Path d="M1 1h22v22H1z" fill="none" />
  </Svg>
</View>
      )}
    </TouchableOpacity>
  );
};
import { ActivityIndicator } from 'react-native';
import { getCachedImagePath } from '@/lib/imageCache';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Image, Alert, Linking, TextInput } from 'react-native';
const defaultImage = require('../assets/images/image-placeholder.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, MapPin, Star, Navigation, Heart, Trash2, Phone, Globe, Clock, Users, DollarSign, AlertTriangle } from 'lucide-react-native';
import { CampingArea, getDatabase } from '@/lib/database';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { deleteCampingAreaSmart } from '@/lib/syncManager';

// Lightbox için büyük fotoğraf bileşeni
const LightboxImage = ({ img, refreshKey }: { img: string, refreshKey?: number }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isConnected = useNetworkStatus();
  const prevConnectedRef = React.useRef<boolean>(isConnected);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        let image_id = '';
        if (/photo_\d+_\d+/.test(img)) {
          image_id = img.match(/photo_\d+_\d+/)?.[0] || '';
        } else {
          image_id = img.split('/').pop()?.split('.')[0] || '';
        }
        
        // Offline'dan online'a geçiş yapıldıysa cache'i yenile (mevcut cache'i sil ve yeniden indir)
        const wasOffline = !prevConnectedRef.current;
        const isNowOnline = isConnected;
        const justWentOnline = wasOffline && isNowOnline;
        
        // Sadece offline->online geçişte forceRefresh yapılır
        // Lightbox açıldığında normal cache kontrolü yapılır (cache varsa kullan, yoksa indir)
        const shouldForceRefresh = justWentOnline;
        
        if (justWentOnline) {
          console.log('[lightbox-cache] 🟢 ONLINE olundu, cache yenileniyor:', img);
        }
        
        // refreshKey değiştiğinde (lightbox açıldığında) sadece yükleme tetiklenir, cache varsa kullanılır
        const localPath = await getCachedImagePath(image_id, img, shouldForceRefresh, isConnected);
        if (isMounted) setUri(localPath);
      } catch (e) {
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    load();
    
    // Önceki bağlantı durumunu güncelle
    prevConnectedRef.current = isConnected;
    
    return () => { isMounted = false; };
  }, [img, isConnected, refreshKey]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  if (error || !uri) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 48, color: '#9ca3af' }}>🏕️</Text>
        <Text style={{ color: '#fff', marginTop: 16 }}>Fotoğraf yüklenemedi</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%' }}
      resizeMode="contain"
    />
  );
};


interface CampingAreaDetailModalProps {
  visible: boolean;
  onClose: () => void;
  campingArea: CampingArea | null;
  onEdit?: (area: CampingArea) => void;
  onDelete?: (area: CampingArea) => void;
  onToggleFavorite?: (area: CampingArea) => void;
  isFavorite?: boolean;
  onAddAtMap?: () => void;
}


import { getCampingTypeLabel, getCampingAreaBgColor } from '../lib/categories';



const getAmenityIcon = (amenity: string) => {
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

const getPriceRangeLabel = (priceRange: string) => {
  switch (priceRange) {
    case 'free': return 'Ücretsiz';
    case 'budget': return 'Ekonomik (0-500₺)';
    case 'mid': return 'Orta (500-1500₺)';
    case 'premium': return 'Premium (1500₺+)';
    default: return 'Belirtilmemiş';
  }
};

// opening_hours stringini günlere göre ayrıştıran yardımcı fonksiyon
const EN_TO_TR_DAYS: Record<string, string> = {
  'Monday': 'Pazartesi',
  'Tuesday': 'Salı',
  'Wednesday': 'Çarşamba',
  'Thursday': 'Perşembe',
  'Friday': 'Cuma',
  'Saturday': 'Cumartesi',
  'Sunday': 'Pazar',
  'Mon': 'Pzt',
  'Tue': 'Sal',
  'Wed': 'Çar',
  'Thu': 'Per',
  'Fri': 'Cum',
  'Sat': 'Cmt',
  'Sun': 'Paz',
  'Everyday': 'Her gün',
  'Every day': 'Her gün',
};

function translateDay(day: string): string {
  let d = day.trim();
  // Aralıklar için (örn: Monday-Friday)
  d = d.replace(/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*[-–]\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)/gu, (m, p1, p2) => {
    const t1 = EN_TO_TR_DAYS[normalizeDay(p1)] || p1;
    const t2 = EN_TO_TR_DAYS[normalizeDay(p2)] || p2;
    return `${t1}-${t2}`;
  });
  // Tekil günler için kelime kelime eşleştir
  const words = d.split(/\s|,|;/).map(w => w.trim()).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const norm = normalizeDay(words[i]);
    if (EN_TO_TR_DAYS[norm]) {
      d = d.replace(new RegExp(words[i], 'gi'), EN_TO_TR_DAYS[norm]);
    }
  }
  return d;
}

function normalizeDay(str: string): string {
  // Küçük harfe çevir, baş harfi büyüt (Monday -> Monday, pazartesi -> Pazartesi)
  if (!str) return '';
  const lower = str.toLocaleLowerCase('tr-TR');
  // İngilizce günler
  const map: Record<string, string> = {
    'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday', 'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday', 'sunday': 'Sunday',
    'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed', 'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat', 'sun': 'Sun',
    'everyday': 'Everyday', 'every day': 'Every day',
    // Türkçe günler
    'pazartesi': 'Pazartesi', 'salı': 'Salı', 'çarşamba': 'Çarşamba', 'perşembe': 'Perşembe', 'cuma': 'Cuma', 'cumartesi': 'Cumartesi', 'pazar': 'Pazar',
    'pzt': 'Pzt', 'sal': 'Sal', 'çar': 'Çar', 'per': 'Per', 'cum': 'Cum', 'cmt': 'Cmt', 'paz': 'Paz',
    'her gün': 'Everyday',
  };
  return map[lower] || str;
}

function translateHours(hours: string): string {
  let h = hours.trim();
  h = h.replace(/Open 24 hours|24 hours|24 Hours|24 Saat Açık/i, '24 Saat Açık');
  // AM/PM'li saatleri 24 saat formatına çevirmek isterseniz burada ek kod yazabilirsiniz.
  return h;
}

function parseOpeningHours(opening_hours: any): { day: string, hours: string }[] {
  // Eğer varsayılan boş JSON ise hiç veri yokmuş gibi davran
  const EMPTY_JSON = '{"weekday":{"open":"","close":""},"weekend":{"open":"","close":""}}';
  if (!opening_hours) return [];
  if (typeof opening_hours === 'string' && opening_hours.trim() === EMPTY_JSON) return [];
  
  // Object formatı {weekday: {open, close}, weekend: {open, close}} için
  if (typeof opening_hours === 'object' && !Array.isArray(opening_hours)) {
    const result: { day: string, hours: string }[] = [];
    if (opening_hours.weekday && typeof opening_hours.weekday === 'object') {
      const { open, close } = opening_hours.weekday;
      if (open && close) {
        result.push({ day: '', hours: `Hafta içi: ${open} - ${close}` });
      }
    }
    if (opening_hours.weekend && typeof opening_hours.weekend === 'object') {
      const { open, close } = opening_hours.weekend;
      if (open && close) {
        result.push({ day: '', hours: `Hafta sonu: ${open} - ${close}` });
      }
    }
    if (result.length > 0) return result;
  }
  
  // String formatında {weekday={open=..., close=...}, weekend={...}} gibi malformed JSON için regex parser
  if (typeof opening_hours === 'string' && opening_hours.includes('weekday=') && opening_hours.includes('weekend=')) {
    try {
      const trimmed = opening_hours.trim();
      
      // Eğer {weekday={open=,close=}, weekend={open=,close=}} gibi tamamen boşsa gösterme
      if (trimmed.match(/weekday=\{open=,\s*close=\}/) && trimmed.match(/weekend=\{open=,\s*close=\}/)) {
        console.log('[DetailModal][parseOpeningHours] Both weekday and weekend are empty, skipping');
        return [];
      }
      
      const weekdayMatch = trimmed.match(/weekday=\{([^}]+)\}/);
      const weekendMatch = trimmed.match(/weekend=\{([^}]+)\}/);
      
      const parseTimeObj = (str: string) => {
        const openMatch = str.match(/open=([^,\s]+)/);
        const closeMatch = str.match(/close=([^,\s]+)/);
        return {
          open: openMatch ? openMatch[1] : '',
          close: closeMatch ? closeMatch[1] : ''
        };
      };
      
      const result: { day: string, hours: string }[] = [];
      if (weekdayMatch) {
        const weekdayObj = parseTimeObj(weekdayMatch[1]);
        if (weekdayObj.open && weekdayObj.close) {
          result.push({ day: '', hours: `Hafta içi: ${weekdayObj.open} - ${weekdayObj.close}` });
        }
      }
      if (weekendMatch) {
        const weekendObj = parseTimeObj(weekendMatch[1]);
        if (weekendObj.open && weekendObj.close) {
          result.push({ day: '', hours: `Hafta sonu: ${weekendObj.open} - ${weekendObj.close}` });
        }
      }
      if (result.length > 0) return result;
    } catch (err) {
      console.log('[DetailModal][parseOpeningHours] Regex parse failed:', err);
    }
  }
  
  if (Array.isArray(opening_hours)) {
    return opening_hours.map((item: any) => {
      if (typeof item === 'string') {
        const idx = item.indexOf(':');
        if (idx > 0) {
          const day = translateDay(item.slice(0, idx).trim());
          const hours = translateHours(item.slice(idx + 1).trim());
          return { day, hours };
        } else {
          return { day: '', hours: translateHours(item) };
        }
      } else if (typeof item === 'object' && item.day && item.hours) {
        return { day: translateDay(String(item.day)), hours: translateHours(String(item.hours)) };
      } else {
        return { day: '', hours: translateHours(String(item)) };
      }
    });
  }
  if (typeof opening_hours === 'string' && opening_hours.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(opening_hours);
      if (Array.isArray(arr)) {
        return arr.map((item: any) => {
          if (typeof item === 'string') {
            const idx = item.indexOf(':');
            if (idx > 0) {
              const day = translateDay(item.slice(0, idx).trim());
              const hours = translateHours(item.slice(idx + 1).trim());
              return { day, hours };
            } else {
              return { day: '', hours: translateHours(item) };
            }
          } else if (typeof item === 'object' && item.day && item.hours) {
            return { day: translateDay(String(item.day)), hours: translateHours(String(item.hours)) };
          } else {
            return { day: '', hours: translateHours(String(item)) };
          }
        });
      }
    } catch {}
  }
  if (typeof opening_hours === 'string') {
    return opening_hours.split(/;|\n/).map(part => {
      const trimmed = part.trim();
      const match = trimmed.match(/^([A-Za-zÇĞİÖŞÜçğıöşü\s\-–]+)\s+([\d:.,\-– ]+[APMapm\s–-]*)$/u);
      if (match) {
        return { day: translateDay(match[1].replace(/\s+/g, ' ').trim()), hours: translateHours(match[2].replace(/\s+/g, ' ').trim()) };
      } else if (/^(Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar|Her gün|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(trimmed)) {
        return { day: translateDay(trimmed), hours: '' };
      } else {
        return { day: '', hours: translateHours(trimmed) };
      }
    }).filter(x => x.day || x.hours);
  }
  return [];
}


export default function CampingAreaDetailModal({ 
  visible, 
  onClose, 
  campingArea, 
  onEdit, 
  onDelete, 
  onToggleFavorite,
  isFavorite = false,
  onAddAtMap,
  isSuperAdmin = false,
  currentUserId
}: CampingAreaDetailModalProps & { isSuperAdmin?: boolean; currentUserId?: string | number }) {
  const [imageError, setImageError] = useState(false);
  const [imageRefreshKey, setImageRefreshKey] = useState(0);

  // Modal açıldığında görselleri yeniden kontrol et
  useEffect(() => {
    if (visible && campingArea) {
      console.log('[CampingAreaDetailModal] 🔄 Modal açıldı, görseller yenilenecek');
      setImageRefreshKey(prev => prev + 1);
    }
  }, [visible, campingArea?.id]);

  // API'den gelen veriyi logla
  useEffect(() => {
    if (campingArea) {
      console.log('[CampingAreaDetailModal] campingArea:', campingArea);
      console.log('[CampingAreaDetailModal] fee değeri:', campingArea.fee, 'tipi:', typeof campingArea.fee);
    }
  }, [campingArea]);

  // owner_username state: önce campingArea'dan al, yoksa API'den owner_id ile çek
  const [ownerUsername, setOwnerUsername] = useState<string>('');
  useEffect(() => {
    if (!campingArea) { setOwnerUsername(''); return; }
    const stored = campingArea.owner_username || '';
    if (stored) {
      setOwnerUsername(stored);
      return;
    }
    // Saklanan username yoksa ve owner_id varsa sunucudan çek
    const ownerId = Number((campingArea as any).owner_id);
    if (!ownerId || ownerId <= 0) { setOwnerUsername(''); return; }
    import('@/lib/userMembership').then(({ getUserById }) => {
      getUserById(ownerId)
        .then(info => {
          if (info?.username) setOwnerUsername(info.username);
          else setOwnerUsername('');
        })
        .catch(() => setOwnerUsername(''));
    });
  }, [campingArea?.id, campingArea?.owner_username, (campingArea as any)?.owner_id]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const isConnected = useNetworkStatus();
  const [showMapMenu, setShowMapMenu] = useState(false);
  
  // Hata bildirimi için state'ler
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [errorChecks, setErrorChecks] = useState<Record<string, boolean>>({});
  const [errorDesc, setErrorDesc] = useState('');
  const [errorTypeValue, setErrorTypeValue] = useState('');
  const [errorTypeOther, setErrorTypeOther] = useState('');
  const [errorAmenities, setErrorAmenities] = useState<string[]>([]);
  const [errorAmenitiesOther, setErrorAmenitiesOther] = useState('');
  
  // Fotoğraf lightbox için state'ler
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const scrollViewRef = React.useRef<ScrollView>(null);
  
  // Lightbox açıldığında doğru pozisyona kaydır
  React.useEffect(() => {
    if (lightboxVisible && scrollViewRef.current) {
      // Küçük bir gecikme ile scroll yapıyoruz çünkü modal açılması için zaman gerekiyor
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: lightboxIndex * Dimensions.get('window').width,
          y: 0,
          animated: false
        });
      }, 100);
    }
  }, [lightboxVisible]);
  
  // Google Haritalar aç
  const openGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Hata', 'Google Haritalar açılamadı.');
    });
  };
  // Yandex Haritalar aç
  const openYandexMaps = (lat: number, lng: number) => {
    const url = `https://yandex.com.tr/harita/?ll=${lng},${lat}&z=16`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Hata', 'Yandex Haritalar açılamadı.');
    });
  };

  // Hata bildirimi için mail gönder
  const handleSendErrorReport = () => {
    if (!campingArea) return;
    const checkedFields = Object.keys(errorChecks).filter(k => errorChecks[k]);
    let body = `Kamp Alanı Hata Bildirimi\n\n`;
    body += `Alan Adı: ${campingArea.name}\n`;
    body += `Konum: ${(campingArea as any).latitude}, ${(campingArea as any).longitude}\n`;
    // Kamp Türü seçiliyse detay ekle
    if (errorChecks['Kamp Türü']) {
      body += `Kamp Türü: ${errorTypeValue}`;
      if (errorTypeValue === 'Diğer' && errorTypeOther.trim()) {
        body += ` (${errorTypeOther.trim()})`;
      }
      body += `\n`;
    } else {
      body += `Kamp Türü: ${getCampingTypeLabel(campingArea.type)}\n`;
    }
    // Olanaklar seçiliyse detay ekle
    if (errorChecks['Olanaklar']) {
      body += `Olanaklar: `;
      body += errorAmenities.filter(a => a !== 'Diğer').join(', ');
      if (errorAmenities.includes('Diğer') && errorAmenitiesOther.trim()) {
        body += `, Diğer: ${errorAmenitiesOther.trim()}`;
      }
      body += `\n`;
    }
    body += `\nHatalı/eksik alanlar:\n`;
    checkedFields.forEach(f => {
      if (f !== 'Kamp Türü' && f !== 'Olanaklar') body += `- ${f}\n`;
    });
    if (errorDesc.trim()) {
      body += `\nEk Açıklama: ${errorDesc.trim()}\n`;
    }
    const mailto = `mailto:kampdefterim@gmail.com?subject=Kamp Alanı Hata Bildirimi&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailto);
    setShowErrorReport(false);
    setErrorChecks({});
    setErrorDesc('');
    setErrorTypeValue('');
    setErrorTypeOther('');
    setErrorAmenities([]);
    setErrorAmenitiesOther('');
  };

  // Hata bildirimi için temel alanlar
  const errorFields = [
    'Alan Adı',
    'Konum',
    'Kamp Türü', // başlık güncellendi
    'Açıklama',
    'Olanaklar',
    'İletişim Bilgileri',
    'Açılış Saatleri',
    'Kapasite',
    'Fiyat Aralığı',
    'Ücret Durumu',
    'Diğer (açıklamada belirtiniz)'
  ];

  // Sadece friend_user_ids ile paylaşılmış arkadaşları göster
  useEffect(() => {
    if (!visible || !campingArea) return;
    // friend_user_ids: kamp alanı ile paylaşılmış kullanıcı id'leri
    const friendUserIds: string[] = Array.isArray((campingArea as any).friend_user_ids)
      ? (campingArea as any).friend_user_ids.map(String)
      : Array.isArray((campingArea as any).friends)
        ? (campingArea as any).friends.map((f: any) => {
            if (typeof f === 'object' && f !== null) {
              const fId = f.user_id ?? f.id;
              return fId !== undefined ? String(fId) : String(f);
            }
            return String(f);
          })
        : [];
    if (!friendUserIds.length) {
      setFriends([]);
      setFriendsError(null);
      setLoadingFriends(false);
      return;
    }
    setLoadingFriends(true);
    setFriendsError(null);
    // Tüm arkadaşları çekip, sadece friend_user_ids'de olanları filtrele
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/friends?user_id=${currentUserId}`, {
          credentials: 'include',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error('Arkadaşlar yüklenemedi: ' + errText);
        }
        const data = await res.json();
        // Sadece friend_user_ids'de olanları göster
        // API { id } veya { user_id } formatında dönebilir — her ikisini de kontrol et
        const filtered = Array.isArray(data)
          ? data.filter((f: any) => {
              const fId = f.user_id ?? f.id;
              return fId !== undefined && friendUserIds.includes(String(fId));
            })
          : [];
        setFriends(filtered);
      } catch (e: any) {
        setFriendsError(e.message || 'Arkadaşlar yüklenemedi');
      } finally {
        setLoadingFriends(false);
      }
    })();
  }, [visible, campingArea?.id, JSON.stringify((campingArea as any)?.friend_user_ids), JSON.stringify((campingArea as any)?.friends)]);

  if (!campingArea) return null;

  const isUserSubmitted = (
    (typeof campingArea.tags === 'object' && campingArea.tags?.user_submitted === 'yes') ||
    (typeof (campingArea as any).created_by === 'string' && (campingArea as any).created_by.length > 0) ||
    ((campingArea as any).source_id === 0) ||
    (typeof (campingArea as any).owner_id !== 'undefined' && Number((campingArea as any).owner_id) > 0)
  );

  // Superadmin tüm kamp alanlarını silebilir, owner ise sadece kendi eklediğini silebilir
  const canDelete = isSuperAdmin || (
    currentUserId && campingArea.owner_id && String(currentUserId) === String(campingArea.owner_id)
  );

  const handleDelete = () => {
    Alert.alert(
      'Alanı Sil',
      'Bu kamp alanını silmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { 
          text: 'Sil', 
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Delete button pressed for area:', campingArea.name, 'ID:', (campingArea as any).id);
              const success = await deleteCampingAreaSmart({ campingArea, isConnected });
              if (!success) {
                Alert.alert('Hata', 'Kamp alanı silinirken bir hata oluştu.');
                return;
              }
              onDelete?.(campingArea);
            } catch (error) {
              console.error('❌ Error deleting area:', error);
              Alert.alert('Hata', 'Kamp alanı silinirken bir hata oluştu.');
            }
          }
        }
      ]
    );
  };

  const handleFavoriteToggle = () => {
    onToggleFavorite?.(campingArea);
  };

  const handleEdit = () => {
    onEdit?.(campingArea);
  };


  const openWebsite = () => {
    if (campingArea.website) {
      let url = campingArea.website;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      Linking.openURL(url).catch(() => {
        Alert.alert('Hata', 'Web sitesi açılamadı.');
      });
    }
  };

  const callPhone = () => {
    if (campingArea.phone) {
      const phoneUrl = `tel:${campingArea.phone}`;
      Linking.openURL(phoneUrl).catch(() => {
        Alert.alert('Hata', 'Telefon araması başlatılamadı.');
      });
    }
  };

  const sendEmail = () => {
    if (campingArea.contact_email) {
      const emailUrl = `mailto:${campingArea.contact_email}`;
      Linking.openURL(emailUrl).catch(() => {
        Alert.alert('Hata', 'E-posta uygulaması açılamadı.');
      });
    }
  };

  // Açılış saatlerini anlamlı formatta hazırla
  let openingHoursList: { day: string, hours: string }[] = [];
  let oh: any = campingArea.opening_hours;
  // Eğer string ise ve JSON nesnesi gibi başlıyorsa parse et
  if (typeof oh === 'string' && oh.trim().startsWith('{')) {
    try {
      oh = JSON.parse(oh);
    } catch {}
  }
  if (
    oh &&
    typeof oh === 'object' &&
    !Array.isArray(oh) &&
    ((oh.weekday && typeof oh.weekday === 'object') || (oh.weekend && typeof oh.weekend === 'object'))
  ) {
    // Hafta içi/sonu formatı
    let weekday = '';
    let weekend = '';
    if (oh.weekday && typeof oh.weekday === 'object' && oh.weekday.open && oh.weekday.close) {
      weekday = `Hafta içi: ${oh.weekday.open} - ${oh.weekday.close}`;
    }
    if (oh.weekend && typeof oh.weekend === 'object' && oh.weekend.open && oh.weekend.close) {
      weekend = `Hafta sonu: ${oh.weekend.open} - ${oh.weekend.close}`;
    }
    openingHoursList = [];
    if (weekday) openingHoursList.push({ day: '', hours: weekday });
    if (weekend) openingHoursList.push({ day: '', hours: weekend });
  } else {
    openingHoursList = parseOpeningHours(campingArea.opening_hours);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setShowErrorReport(true)}
              accessibilityLabel="Hata bildir"
            >
              <AlertTriangle size={20} color="#f59e0b" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, isFavorite && styles.favoriteActive]}
              onPress={handleFavoriteToggle}
              accessibilityLabel="Favorilere ekle/kaldır"
            >
              <Heart 
                size={20} 
                color={isFavorite ? "#ffffff" : "#ef4444"} 
                fill={isFavorite ? "#ffffff" : "none"}
              />
            </TouchableOpacity>
            {canDelete && (
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={handleDelete}
                accessibilityLabel="Kamp alanını sil"
              >
                <Trash2 size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* Haritada kamp alanı ekle butonu */}

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Fotoğraf Galerisi */}
          {Array.isArray(campingArea.images) && campingArea.images.length > 0 && !imageError ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.galleryContainer}
              contentContainerStyle={styles.galleryContent}
            >
              {campingArea.images.map((img, idx) => (
                typeof img === 'string' && img.trim() !== '' ? (
                  <GalleryImageWithCache
                    key={idx}
                    img={img}
                    source_id={campingArea.source_id}
                    setImageError={setImageError}
                    refreshKey={imageRefreshKey}
                    onPress={() => {
                      setLightboxIndex(idx);
                      setLightboxVisible(true);
                    }}
                  />
                ) : null
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.galleryContainer, { justifyContent: 'center', alignItems: 'center' }]}>
              <Image
                source={defaultImage}
                style={{ width: '80%', height: 160, resizeMode: 'contain' }}
              />
            </View>
          )}

          {/* Main Info */}
          <View style={styles.mainInfo}>
            <View style={styles.titleRow}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>{campingArea.name ? String(campingArea.name) : ''}</Text>
                <View style={[styles.typeChip, { backgroundColor: getCampingAreaBgColor(campingArea) }]}> 
                  <Text style={styles.typeText}>{
                    (campingArea.tags && campingArea.tags.type)
                      ? String(getCampingTypeLabel(campingArea.tags.type))
                      : (campingArea.type ? String(getCampingTypeLabel(campingArea.type)) : '')
                  }</Text>
                </View>
                <View style={styles.userSubmittedChip}>
                  <Text style={styles.userSubmittedText}>
                    @{ownerUsername || 'KampDefterim'} ekledi
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.locationRow}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <MapPin size={16} color="#6b7280" />
                <Text style={styles.locationText}>
                  {typeof (campingArea as any).latitude === 'number' && typeof (campingArea as any).longitude === 'number'
                    ? `${(campingArea as any).latitude.toFixed(6)}, ${(campingArea as any).longitude.toFixed(6)}`
                    : ''}
                </Text>
                {typeof campingArea.distance_km === 'number' ? (
                  <Text style={styles.distanceText}>• {campingArea.distance_km.toFixed(1)} km</Text>
                ) : null}
                <View style={{ flex: 1 }} />
                {/* Sağda navigasyon ikonu */}
                <View style={{ position: 'relative', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <TouchableOpacity
                    style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10 }}
                    onPress={() => setShowMapMenu(v => !v)}
                    activeOpacity={0.7}
                  >
                    {(() => {
                      const icon = getSVGIcon ? getSVGIcon('navigation', { width: 18, height: 18 }) : null;
                      if (typeof icon === 'string' && icon.startsWith('<svg')) {
                        return <SvgXml xml={icon} width={22} height={22} />;
                      }
                      if (typeof icon === 'string') {
                        return <Text style={{ fontSize: 18 }}>{icon}</Text>;
                      }
                      if (icon) {
                        return <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>;
                      }
                      return <Navigation size={20} color="#059669" />;
                    })()}
                  </TouchableOpacity>
                  {showMapMenu && (
                    <View style={{ position: 'absolute', top: 38, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, paddingVertical: 6, minWidth: 140, zIndex: 999, elevation: 10 }}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16 }}
                        onPress={() => {
                          setShowMapMenu(false);
                          openGoogleMaps((campingArea as any).latitude, (campingArea as any).longitude);
                        }}
                      >
                        <Svg width={24} height={24} viewBox="0 0 24 24">
                          <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          <Path d="M1 1h22v22H1z" fill="none" />
                        </Svg>
                        <Text style={{ fontSize: 13, color: '#222', marginLeft: 6 }}>Google Haritalar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16 }}
                        onPress={() => {
                          setShowMapMenu(false);
                          openYandexMaps((campingArea as any).latitude, (campingArea as any).longitude);
                        }}
                      >
                        <Svg width={24} height={24} viewBox="0 0 26 26">
                          <Path fill="#F8604A" d="M26 13c0-7.18-5.82-13-13-13S0 5.82 0 13s5.82 13 13 13 13-5.82 13-13Z" />
                          <Path fill="#fff" d="M13.353 14.343c.76 1.664 1.013 2.243 1.013 4.241v2.65h-2.714v-4.467L6.534 5.634h2.83l3.989 8.71Zm3.346-8.709-3.32 7.542h2.759l3.328-7.542h-2.767Z" />
                        </Svg>
                        <Text style={{ fontSize: 13, color: '#222', marginLeft: 6 }}>Yandex Haritalar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {(typeof campingArea.rating === 'number' && campingArea.rating > 0) ? (
              <View style={styles.ratingRow}>
                <Star size={16} color="#fbbf24" fill="#fbbf24" />
                <Text style={styles.ratingText}>
                  {campingArea.rating.toFixed(1)} ({campingArea.review_count ? String(campingArea.review_count) : '0'} değerlendirme)
                </Text>
              </View>
            ) : null}
          </View>

          {/* Description */}
          {campingArea.description && typeof campingArea.description === 'string' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Açıklama</Text>
              <Text style={styles.description}>{campingArea.description ?? ''}</Text>
            </View>
          )}

          {/* Amenities */}
          {Array.isArray(campingArea.amenities) && campingArea.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Olanaklar</Text>
              <View style={styles.amenitiesGrid}>
                {campingArea.amenities.map((amenity, index) => (
                  <View key={index} style={styles.amenityChip}>
                    <Text style={styles.amenityIcon}>{getAmenityIcon(String(amenity))}</Text>
                    <Text style={styles.amenityText}>{amenity ? String(amenity) : ''}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Contact Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
            
            {campingArea.phone && typeof campingArea.phone === 'string' && (
              <TouchableOpacity style={styles.contactItem} onPress={callPhone}>
                <Phone size={20} color="#059669" />
                <Text style={styles.contactText}>{campingArea.phone ?? ''}</Text>
                <Navigation size={16} color="#6b7280" />
              </TouchableOpacity>
            )}
            
            {campingArea.website && typeof campingArea.website === 'string' && (
              <TouchableOpacity style={styles.contactItem} onPress={openWebsite}>
                <Globe size={20} color="#059669" />
                <Text style={styles.contactText}>{campingArea.website ?? ''}</Text>
                <Navigation size={16} color="#6b7280" />
              </TouchableOpacity>
            )}
            
            {campingArea.contact_email && typeof campingArea.contact_email === 'string' && (
              <TouchableOpacity style={styles.contactItem} onPress={sendEmail}>
                <Text style={styles.contactLabel}>📧</Text>
                <Text style={styles.contactText}>{campingArea.contact_email ?? ''}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Details */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detaylar</Text>

            {/* Görünürlük Bilgisi */}
            {campingArea.visibility && (
              <View style={styles.detailItem}>
                <Globe size={20} color={getCampingAreaBgColor(campingArea)} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Görünürlük</Text>
                  <Text style={styles.detailValue}>
                    {campingArea.visibility === 'public' && 'Herkese Açık'}
                    {campingArea.visibility === 'private' && 'Sadece Size Görünüyor'}
                    {campingArea.visibility === 'community' && 'Topluluğa Açık'}
                    {campingArea.visibility === 'friends' && 'Arkadaşlara Açık'}
                  </Text>
                </View>
              </View>
            )}
            {/* Paylaşılan arkadaşlar — sadece visibility='friends' ve owner için */}
            {campingArea.visibility === 'friends' && currentUserId && String(campingArea.owner_id) === String(currentUserId) && (
              <View style={[styles.detailItem, { alignItems: 'flex-start' }]}>
                <Users size={20} color="#059669" style={{ marginTop: 2 }} />
                <View style={[styles.detailContent, { flexShrink: 1 }]}>
                  <Text style={styles.detailLabel}>Paylaşılan Kişiler</Text>
                  {loadingFriends && <ActivityIndicator size="small" color="#059669" style={{ marginTop: 4 }} />}
                  {friendsError ? (
                    <Text style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{friendsError}</Text>
                  ) : !loadingFriends && friends.length === 0 ? (
                    <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Hiç arkadaşla paylaşılmamış.</Text>
                  ) : (
                    friends.map(f => (
                      <View key={String(f.user_id ?? (f as any).id)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <FriendAvatar
                          avatar={(f as any).avatar_url || f.avatar}
                          name={(f as any).name || f.first_name || f.email || ''}
                        />
                        <View>
                          <Text style={{ fontWeight: '600', color: '#374151', fontSize: 14 }}>
                            {(f as any).name || f.first_name || ''}{f.last_name ? ' ' + f.last_name : ''}
                          </Text>
                          {f.email ? <Text style={{ color: '#6b7280', fontSize: 12 }}>{f.email}</Text> : null}
                        </View>
                        <View style={{ marginLeft: 8, backgroundColor: '#dcfce7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#22c55e' }}>
                          <Text style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 12 }}>✓ Paylaşıldı</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {Array.isArray(openingHoursList) && openingHoursList.length > 0 && openingHoursList.some(row => (row.day && row.day.trim()) || (row.hours && row.hours.trim())) && (
              <View style={styles.detailItem}>
                <Clock size={20} color="#6b7280" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Açılış Saatleri</Text>
                  {openingHoursList
                    .filter(row => (row.day && row.day.trim()) || (row.hours && row.hours.trim()))
                    .map((row, idx) => (
                      <Text key={idx} style={styles.detailValue}>
                        {row.day ? row.day + ':' : ''} {row.hours}
                      </Text>
                    ))}
                </View>
              </View>
            )}

            {(() => {
              const cap = Number(campingArea.capacity);
              return cap > 0;
            })() && (
              <View style={styles.detailItem}>
                <Users size={20} color="#6b7280" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Kapasite</Text>
                  <Text style={styles.detailValue}>{Number(campingArea.capacity)} kişi</Text>
                </View>
              </View>
            )}

            {campingArea.price_range && typeof campingArea.price_range === 'string' && (
              <View style={styles.detailItem}>
                <DollarSign size={20} color="#6b7280" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Fiyat Aralığı</Text>
                  <Text style={styles.detailValue}>{getPriceRangeLabel(campingArea.price_range)}</Text>
                </View>
              </View>
            )}

            {(campingArea.fee !== undefined && campingArea.fee !== null) && (
              <View style={styles.detailItem}>
                <DollarSign size={20} color="#6b7280" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Ücret Durumu</Text>
                  <Text style={[styles.detailValue, campingArea.fee ? styles.paidText : styles.freeText]}>
                    {campingArea.fee ? 'Ücretli' : 'Ücretsiz'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Edit Button: Sadece superadmin veya owner görebilir */}
          {isUserSubmitted && (isSuperAdmin || (currentUserId && campingArea.owner_id && String(currentUserId) === String(campingArea.owner_id))) && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                <Text style={styles.editButtonText}>Bilgileri Düzenle</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Hata Bildirim Modalı */}
        <Modal visible={showErrorReport} animationType="slide" transparent onRequestClose={() => setShowErrorReport(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingTop: 24, paddingHorizontal: 18, minWidth: 280, maxWidth: '90%', elevation: 4, maxHeight: '85%', width: '90%' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 18, color: '#f59e0b', textAlign: 'center' }}>Hata Bildirimi</Text>
              <Text style={{ fontSize: 15, marginBottom: 10, color: '#374151' }}>Lütfen hatalı veya eksik bulduğunuz alanları işaretleyin:</Text>
              <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ paddingBottom: 16 }}>
                {errorFields.map(field => (
                  <View key={field}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
                      onPress={() => setErrorChecks(prev => ({ ...prev, [field]: !prev[field] }))}
                    >
                      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: errorChecks[field] ? '#f59e0b' : '#d1d5db', backgroundColor: errorChecks[field] ? '#f59e0b' : '#fff', marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                        {errorChecks[field] && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✓</Text>}
                      </View>
                      <Text style={{ fontSize: 15, color: '#374151' }}>{field}</Text>
                      {/* Alt kırılım ikonu: Kamp Türü ve Olanaklar için */}
                      {(field === 'Kamp Türü' || field === 'Olanaklar') && (
                        <Text style={{ marginLeft: 6, fontSize: 16, color: errorChecks[field] ? '#f59e0b' : '#9ca3af' }}>
                          {errorChecks[field] ? '▼' : '▶'}
                        </Text>
                      )}
                    </TouchableOpacity>
                    {/* Kamp Türü seçiliyse alt seçenekleri göster */}
                    {field === 'Kamp Türü' && errorChecks['Kamp Türü'] && (
                      <View style={{ marginLeft: 32, marginBottom: 8 }}>
                        {['Kamp Alanı', 'Karavan Alanı', 'Mesire Alanı', 'Piknik Alanı', 'Restoran', 'Diğer'].map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
                            onPress={() => {
                              setErrorTypeValue(opt);
                              if (opt !== 'Diğer') setErrorTypeOther('');
                            }}
                          >
                            <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: errorTypeValue === opt ? '#f59e0b' : '#d1d5db', backgroundColor: errorTypeValue === opt ? '#f59e0b' : '#fff', marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                              {errorTypeValue === opt && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>✓</Text>}
                            </View>
                            <Text style={{ fontSize: 14, color: '#374151' }}>{opt}</Text>
                          </TouchableOpacity>
                        ))}
                        {/* Diğer seçiliyse metin kutusu */}
                        {errorTypeValue === 'Diğer' && (
                          <TextInput
                            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, fontSize: 14, marginTop: 4, backgroundColor: '#f9fafb' }}
                            placeholder="Kamp türünü yazınız..."
                            value={errorTypeOther}
                            onChangeText={setErrorTypeOther}
                          />
                        )}
                      </View>
                    )}
                    {/* Olanaklar seçiliyse alt seçenekleri göster */}
                    {field === 'Olanaklar' && errorChecks['Olanaklar'] && (
                      <View style={{ marginLeft: 32, marginBottom: 8 }}>
                        {['Tuvalet', 'Duş', 'İçme Suyu', 'Elektrik', 'Wifi', 'Market', 'Restoran', 'Otopark', 'Piknik Masası', 'Barbekü', 'Ateş Yeri', 'Diğer'].map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
                            onPress={() => {
                              if (errorAmenities.includes(opt)) {
                                setErrorAmenities(errorAmenities.filter(a => a !== opt));
                                if (opt === 'Diğer') setErrorAmenitiesOther('');
                              } else {
                                setErrorAmenities([...errorAmenities, opt]);
                              }
                            }}
                          >
                            <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: errorAmenities.includes(opt) ? '#f59e0b' : '#d1d5db', backgroundColor: errorAmenities.includes(opt) ? '#f59e0b' : '#fff', marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                              {errorAmenities.includes(opt) && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>✓</Text>}
                            </View>
                            <Text style={{ fontSize: 14, color: '#374151' }}>{opt}</Text>
                          </TouchableOpacity>
                        ))}
                        {/* Diğer seçiliyse metin kutusu */}
                        {errorAmenities.includes('Diğer') && (
                          <TextInput
                            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, fontSize: 14, marginTop: 4, backgroundColor: '#f9fafb' }}
                            placeholder="Olanak ekleyin..."
                            value={errorAmenitiesOther}
                            onChangeText={setErrorAmenitiesOther}
                          />
                        )}
                      </View>
                    )}
                  </View>
                ))}
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 15, marginTop: 10, marginBottom: 16, backgroundColor: '#f9fafb' }}
                  placeholder="Ek açıklama veya öneriniz..."
                  value={errorDesc}
                  onChangeText={setErrorDesc}
                  multiline
                  numberOfLines={3}
                />
              </ScrollView>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingBottom: 8 }}>
                <TouchableOpacity onPress={() => setShowErrorReport(false)} style={{ backgroundColor: '#e5e7eb', borderRadius: 8, paddingVertical: 12, flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: '#374151', fontWeight: 'bold', fontSize: 15 }}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendErrorReport} style={{ backgroundColor: '#f59e0b', borderRadius: 8, paddingVertical: 12, flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Gönder</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Fotoğraf Lightbox Modalı */}
        {Array.isArray(campingArea.images) && campingArea.images.length > 0 && (
          <Modal visible={lightboxVisible} animationType="fade" transparent onRequestClose={() => setLightboxVisible(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
              {/* ScrollView ile kaydırılabilir fotoğraflar */}
              <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const newIndex = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                  setLightboxIndex(newIndex);
                }}
                style={{ flex: 1 }}
              >
                {campingArea.images.map((img, idx) => {
                  if (typeof img !== 'string' || img.trim() === '') return null;
                  return (
                    <View key={idx} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height, justifyContent: 'center', alignItems: 'center' }}>
                      <LightboxImage img={img} refreshKey={imageRefreshKey} />
                    </View>
                  );
                })}
              </ScrollView>

              {/* Kapat butonu - en üstte ve tıklanabilir */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 50, right: 20, zIndex: 999, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 20, padding: 10, elevation: 10 }}
                onPress={() => {
                  console.log('Lightbox kapatılıyor...');
                  setLightboxVisible(false);
                }}
                activeOpacity={0.7}
              >
                <X size={28} color="#fff" />
              </TouchableOpacity>
              
              {/* Fotoğraf sayacı */}
              <View style={{ position: 'absolute', top: 50, left: 0, right: 0, alignItems: 'center', zIndex: 998, pointerEvents: 'none' }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                    {lightboxIndex + 1} / {campingArea.images.length}
                  </Text>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addAtMapButton: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 0,
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addAtMapButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  // Styles aynen senin verdiğin şekilde kaldı
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  closeButton: { padding: 4 },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  favoriteActive: { backgroundColor: '#ef4444' },
  content: { flex: 1 },
  heroImage: { width: '100%', height: 200, resizeMode: 'cover' },
  galleryContainer: { width: '100%', height: 200, marginBottom: 8 },
  galleryContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  galleryImageWrapper: { position: 'relative', marginRight: 8 },
  galleryImage: { width: 260, height: 180, borderRadius: 12, resizeMode: 'cover', backgroundColor: '#e5e7eb' },
  googleBadge: { position: 'absolute', top: 8, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#4285F4', zIndex: 2 },
  googleBadgeText: { color: '#4285F4', fontWeight: 'bold', fontSize: 16, fontFamily: 'monospace' },
  mainInfo: { backgroundColor: 'white', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  titleContainer: { flex: 1 },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  typeChip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  typeText: { fontSize: 12, color: 'white', fontWeight: '600' },
  userSubmittedChip: { alignSelf: 'flex-start', backgroundColor: '#f3e8ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  userSubmittedText: { fontSize: 12, color: '#8b5cf6', fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  locationText: { fontSize: 14, color: '#6b7280', fontFamily: 'monospace' },
  distanceText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  section: { backgroundColor: 'white', marginTop: 8, padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 16 },
  description: { fontSize: 16, color: '#374151', lineHeight: 24 },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenityChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 6 },
  amenityIcon: { fontSize: 16 },
  amenityText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  contactLabel: { fontSize: 16, color: '#374151', fontWeight: '500' },
  contactText: { fontSize: 16, color: '#059669', flex: 1 },
  detailItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 14, color: '#6b7280', marginBottom: 2 },
  detailValue: { fontSize: 16, color: '#374151', fontWeight: '500' },
  paidText: { color: '#dc2626' },
  freeText: { color: '#059669' },
  editButton: { backgroundColor: '#059669', paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  editButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
