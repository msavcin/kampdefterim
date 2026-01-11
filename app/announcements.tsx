// Yardımcı fonksiyonlar en üste taşındı
// Valilik adını id'den döndüren basit bir fonksiyon (geliştirilebilir)
function getValilik(valilikId: number) {
  // Gelişmiş bir eşleme gerekiyorsa buraya ekleyin
  if (!valilikId) return '';
  // Örnek: 1 => 'Adana', 2 => 'Adıyaman', ...
  // Gerçek eşleme için bir map kullanılabilir
  return `Valilik ID: ${valilikId}`;
}

// fetchAnnouncements fonksiyonu en üste taşındı
async function fetchAnnouncements(communityId: number | null, valilikId: number | null) {
  const token = await getToken();
  const db = getDatabase();
  const urls = [`${API_URL}/announcements?community_id=0`];
  if (communityId && communityId !== 0) {
    urls.push(`${API_URL}/announcements?community_id=${communityId}`);
  }
  console.log('[fetchAnnouncements] API istekleri başlatılıyor:', urls);
  const results = await Promise.all(
    urls.map(url => fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()))
  );
  let all = ([] as any[]).concat(...results);
  console.log('[fetchAnnouncements] API veri boyutu:', all.length);
  const seen = new Set();
  all = all.filter((a: any) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  try {
    let processed = 0;
    for (const ann of all) {
      await db.insertAnnouncement(ann);
      processed++;
      if (processed % 50 === 0) {
        console.log(`[fetchAnnouncements] ${processed} duyuru işlendi...`);
      }
    }
    console.log(`[fetchAnnouncements] Toplam ${processed} duyuru local veritabanına kaydedildi.`);
  } catch (err) {
    console.warn('Duyurular local veritabanına kaydedilemedi:', err);
  }
  if (valilikId) {
    return all.filter((a: any) => {
      if (a.community_id === 0) {
        return String(a.valilik_id) === String(valilikId);
      }
      return true;
    });
  }
  return all;
}
import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { RefreshControl } from 'react-native';
import { TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import * as Location from 'expo-location';
import { getValilikIdFromProvinceName, districtToProvinceMap, provinceNameToValilikId } from '@/lib/provinceMap';
import { Shield, Tag, Info, AlertTriangle, Bell } from 'lucide-react-native';
import { API_URL } from '@/lib/config';
import { getDatabase } from '@/lib/database';
import { getProvinceFromOSM } from '@/lib/osmReverseGeocode';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image, Modal, BackHandler, Platform, ToastAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from '@/lib/auth';
import { getMe, getCommunityById } from '@/lib/userCommunityApi';
import { deleteAnnouncement } from '@/lib/announcementApi';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnnouncementDetail from './announcementDetail';
import AnnouncementEditScreen from './announcement-edit/[id]';
import { getSVGIcon } from './icons/svgIcons';
import Svg, { SvgXml } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';

function capitalizeTurkish(str: string) {
  if (!str) return '';
  return str.charAt(0).toLocaleUpperCase('tr-TR') + str.slice(1);
}

const keywordIcon = (keyword: string) => {
  switch (keyword.toLowerCase()) {
    case 'deprem':
      return <AlertTriangle size={16} color="#f59e0b" style={{marginRight:2}} />;
    case 'gönüllü':
      return <Shield size={16} color="#059669" style={{marginRight:2}} />;
    case 'yardım':
      return <Info size={16} color="#2563eb" style={{marginRight:2}} />;
    default:
      return <Tag size={16} color="#6b7280" style={{marginRight:2}} />;
  }
};

export default function AnnouncementsScreen() {
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

      // Yenileme throttling için
      const [refreshing, setRefreshing] = useState(false);
      const lastRefreshTimeRef = React.useRef<number>(0);
      // Local ve API işlemleri bitene kadar yükleniyor mesajı için state
      const [localLoading, setLocalLoading] = useState(true);
      const [apiLoading, setApiLoading] = useState(false);
    // Filtreleme ve arama için state'ler (sadece superadmin için)
    const [searchText, setSearchText] = useState('');
    const [selectedProvince, setSelectedProvince] = useState<string>('');
    const [tagText, setTagText] = useState('');
    // İller listesi (örnek, gerçek map'ten alınabilir)
    const provinces = [
      '', 'Adana', 'Adıyaman', 'Afyon', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce'
    ];
  const searchParams = useLocalSearchParams();

  const isConnected = useNetworkStatus(); // log kaldırıldı

  // matchedValilikId'yi component scope'unda tut
  let matchedValilikId: number | null = null;

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [communityLeaders, setCommunityLeaders] = useState<Record<number, string>>({});
  const [communityLeaderIds, setCommunityLeaderIds] = useState<Record<number, number>>({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editAnnouncementId, setEditAnnouncementId] = useState<number | null>(null);
  const router = useRouter();

  // Detay linki için WebView modal state'i
  const [webModalVisible, setWebModalVisible] = useState(false);
  const [webModalUrl, setWebModalUrl] = useState<string | null>(null);

  // Duyurular yüklendiğinde topluluk lideri adlarını topluca resolve et
  useEffect(() => {
    const resolveLeaders = async () => {
      const ids = Array.from(new Set(announcements.map(a => a.community_id).filter(id => id && id !== 0)));
      const leaders: Record<number, string> = {};
      const leaderIds: Record<number, number> = {};
      for (const id of ids) {
        try {
          const comm = await getCommunityById(id);
          let leaderName = comm?.leader_name || comm?.leader?.name || comm?.leader?.username || 'Topluluk Lideri';
          leaders[id] = leaderName;
          // Lider id'sini bul
          let leaderId = comm?.leader?.id || comm?.leader_id || null;
          if (leaderId) leaderIds[id] = Number(leaderId);
        } catch {
          leaders[id] = 'Topluluk Lideri';
        }
      }
      setCommunityLeaders(prev => ({ ...prev, ...leaders }));
      setCommunityLeaderIds(prev => ({ ...prev, ...leaderIds }));
    };
    if (announcements.length > 0) {
      resolveLeaders();
    }
  }, [announcements]);

  // Duyuruları çekmek ve filtrelemek için yardımcı fonksiyon
  const refreshAnnouncements = async () => {
        // Throttle: 1 dakikada birden fazla yenileme engellenir
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
        const oneMinuteInMs = 60000;
        
        if (timeSinceLastRefresh < oneMinuteInMs) {
          const remainingSeconds = Math.ceil((oneMinuteInMs - timeSinceLastRefresh) / 1000);
          if (__DEV__) console.log(`[ANNOUNCEMENTS_REFRESH] Çok erken, ${remainingSeconds} saniye sonra tekrar deneyin.`);
          
          if (Platform.OS === 'android') {
            ToastAndroid.show(`Lütfen ${remainingSeconds} saniye sonra tekrar deneyin.`, ToastAndroid.SHORT);
          } else {
            Alert.alert('Çok Sık Güncelleme', `Lütfen ${remainingSeconds} saniye sonra tekrar deneyin.`);
          }
          
          setRefreshing(false);
          return;
        }
        
        lastRefreshTimeRef.current = now;
    setAnnouncementsLoading(true);
    setRefreshing(true);
    setLocalLoading(true);
    setApiLoading(false);
    try {
    // Sadece local veriyi göster (harita sayfası zaten otomatik sync yapıyor)
    const db = getDatabase();
    let localAnnouncements = (await db.listAnnouncementsLocal({ onlyActive: true })).filter((a: any) => a.deleted !== 1 && a.aktif !== 0);
    // Kullanıcıyı paralel çek
    let userData: any = null;
    try {
      userData = await getMe();
      setUser(userData);
    } catch {}
    // matchedValilikIdLocal'ı async olarak belirle (ve bekle)
    let matchedValilikIdLocal: number | null = null;
    try {
      const storedValilikId = await AsyncStorage.getItem('matchedValilikId');
      if (storedValilikId) {
        matchedValilikIdLocal = parseInt(storedValilikId);
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          const provinceName = await getProvinceFromOSM(loc.coords.latitude, loc.coords.longitude);
          if (provinceName) {
            const normalized = provinceName.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/Ç/g, 'c').replace(/Ğ/g, 'g').replace(/İ/g, 'i').replace(/Ö/g, 'o').replace(/Ş/g, 's').replace(/Ü/g, 'u').replace(/\s+/g, '');
            const matchedProvince = districtToProvinceMap[normalized] || null;
            if (matchedProvince) {
              matchedValilikIdLocal = provinceNameToValilikId[matchedProvince] || null;
              if (matchedValilikIdLocal) {
                await AsyncStorage.setItem('matchedValilikId', String(matchedValilikIdLocal));
              }
            }
          }
        }
      }
    } catch {}
    // Superadmin ise tüm local duyuruları göster, filtreleme sadece search alanında yapılacak
    let filtered = localAnnouncements;
    if (userData?.role !== 'superadmin' && userData) {
      filtered = localAnnouncements.filter((a: any) => {
        if (a.community_id === 0) {
          if (matchedValilikIdLocal && a.valilik_id) {
            return String(a.valilik_id) === String(matchedValilikIdLocal);
          }
          return false;
        }
        if (userData?.community_id && String(a.community_id) === String(userData.community_id)) return true;
        return false;
      });
    }
    // Sıralama fonksiyonu
    const sortLeaderFirst = (arr: any[]) => {
      const communityAnnouncements = arr.filter(a => a.community_id !== 0);
      const valilikAnnouncements = arr
        .filter(a => a.community_id === 0)
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
      return [
        ...communityAnnouncements,
        ...valilikAnnouncements
      ];
    };
    filtered = [
      ...filtered.filter((a: any) => a.community_id === 0),
      ...filtered.filter((a: any) => a.community_id !== 0)
    ];
    filtered = sortLeaderFirst(filtered);
    setAnnouncements(filtered);
    setAnnouncementsLoading(false);
    setRefreshing(false);
    setLocalLoading(false);
    setApiLoading(false);
    
    // Başarılı yenileme bildirimi
    if (Platform.OS === 'android') {
      ToastAndroid.show('Duyurular güncellendi ✓', ToastAndroid.SHORT);
    }
    
    // API sync kaldırıldı - harita sayfası zaten otomatik sync yapıyor (her 1 dakikada)
    } catch (error) {
      setAnnouncements([]);
      setAnnouncementsLoading(false);
      setRefreshing(false);
      setApiLoading(false);
      
      // Hata bildirimi
      if (Platform.OS === 'android') {
        ToastAndroid.show('Güncelleme hatası', ToastAndroid.SHORT);
      } else {
        Alert.alert('Hata', 'Duyurular yüklenirken bir hata oluştu.');
      }
    }
  };

  // useEffect'leri ve handleDelete'i component fonksiyonu içine taşı
  useEffect(() => {
    refreshAnnouncements();
  }, []);

  useEffect(() => {
    if (searchParams.refresh === '1') {
      refreshAnnouncements();
    }
  }, [searchParams.refresh]);

  // Sekmeye her odaklanıldığında (haritadan gelindiğinde) local DB'yi güncelle
  useFocusEffect(
    React.useCallback(() => {
      // Sadece local DB'den çek, API isteği yapma (harita zaten sync yapmıştır)
      (async () => {
        try {
          const db = getDatabase();
          const localAnnouncements = (await db.listAnnouncementsLocal({ onlyActive: true })).filter((a: any) => a.deleted !== 1 && a.aktif !== 0);
          
          // Kullanıcı bilgisi varsa filtrele
          if (user) {
            let filtered = localAnnouncements;
            if (user.role !== 'superadmin') {
              const storedValilikId = await AsyncStorage.getItem('matchedValilikId');
              const valilikId = storedValilikId ? parseInt(storedValilikId) : null;
              
              filtered = localAnnouncements.filter((a: any) => {
                if (a.community_id === 0) {
                  if (valilikId && a.valilik_id) {
                    return String(a.valilik_id) === String(valilikId);
                  }
                  return false;
                }
                if (user?.community_id && String(a.community_id) === String(user.community_id)) return true;
                return false;
              });
            }
            
            // Sıralama
            filtered = [
              ...filtered.filter((a: any) => a.community_id === 0),
              ...filtered.filter((a: any) => a.community_id !== 0)
            ];
            
            const sortLeaderFirst = (arr: any[]) => {
              const communityAnnouncements = arr.filter(a => a.community_id !== 0);
              const valilikAnnouncements = arr
                .filter(a => a.community_id === 0)
                .sort((a, b) => {
                  const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return dateB - dateA;
                });
              return [...communityAnnouncements, ...valilikAnnouncements];
            };
            
            filtered = sortLeaderFirst(filtered);
            setAnnouncements(filtered);
          }
        } catch (err) {
          console.error('[ANNOUNCEMENTS] Focus event DB güncelleme hatası:', err);
        }
      })();
    }, [user])
  );

  // Duyuru silme
  const handleDelete = async (id: number) => {
    Alert.alert(
      'Duyuru Sil',
      'Bu duyuruyu silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive', onPress: async () => {
            try {
              // Debug bilgileri
              // Taze kullanıcı bilgisi ve token al
              const freshUserData = await getMe();
              setUser(freshUserData); // User state'i güncelle
              const token = await getToken();
              // API_URL config dosyasından geliyor
              // Önce duyuru detayını al
              const detailRes = await fetch(`${API_URL}/announcements/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const detail = await detailRes.json();
              // Duyuru sahibi veya topluluk lideri kontrolü
              const isOwner = detail.created_by && parseInt(detail.created_by) === parseInt(user?.id);
              const isCommunityLeader = user?.role === 'leader' && 
                                      parseInt(detail.community_id) === parseInt(user?.community_id);
              const isSuperAdmin = user?.role === 'superadmin';
                // ...loglar kaldırıldı, gereksiz alanlar silindi
              // Direkt fetch kullan çünkü özel yetki bilgileri gönderiyoruz
              const res = await fetch(`${API_URL}/announcements/${id}`, {
                method: 'DELETE',
                headers: { 
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  community_id: parseInt(detail.community_id),
                  created_by: parseInt(detail.created_by),
                  user_id: parseInt(user?.id),
                  user_role: user?.role,
                  isOwner,
                  isCommunityLeader
                })
              });
              // Yanıt ve status kodu kontrol
              const text = await res.text();
              if (res.status === 200 || res.status === 204) {
                // Sunucudan silindi, localden de sil
                try {
                  const db = getDatabase();
                  await db.deleteAnnouncementLocal?.(id);
                } catch {}
                setAnnouncements(announcements.filter(a => a.id !== id));
                Alert.alert('Başarılı', 'Duyuru başarıyla silindi.');
                return;
              }
              let result;
              try {
                result = text ? JSON.parse(text) : null;
              } catch (err) {
                Alert.alert('API Yanıtı (ham)', text);
                result = null;
              }
              if (result && (result.success || result.deleted || result.status === 'ok')) {
                try {
                  const db = getDatabase();
                  await db.deleteAnnouncementLocal?.(id);
                } catch {}
                setAnnouncements(announcements.filter(a => a.id !== id));
                Alert.alert('Başarılı', 'Duyuru başarıyla silindi.');
              } else if (result) {
                // Sunucu hata verse bile localden silmeye devam et
                try {
                  const db = getDatabase();
                  await db.deleteAnnouncementLocal?.(id);
                } catch {}
                setAnnouncements(announcements.filter(a => a.id !== id));
                Alert.alert('Uyarı', result?.message || 'Duyuru sunucudan silinemedi, ancak cihazınızdan kaldırıldı.');
              } else {
                // Sunucu hata verse bile localden silmeye devam et
                try {
                  const db = getDatabase();
                  await db.deleteAnnouncementLocal?.(id);
                } catch {}
                setAnnouncements(announcements.filter(a => a.id !== id));
                Alert.alert('Uyarı', 'Duyuru sunucudan silinemedi, ancak cihazınızdan kaldırıldı.');
              }
            } catch (e: any) {
              Alert.alert('Hata', e?.message || JSON.stringify(e) || 'Duyuru silinemedi.');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAnnouncements}
            colors={["#6366f1"]}
            tintColor="#6366f1"
          />
        }
      >
        <View style={{ padding: 16 }}>
          {/* Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0e7ff', justifyContent: 'center', alignItems: 'center', marginRight: 14, shadowColor: '#6366f1', shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 }}>
              <Bell size={22} color="#6366f1" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#3730a3', letterSpacing: 0.2, flex: 1 }}>Duyurular</Text>
          </View>
          
          {/* Butonlar */}
          {((user?.role === 'leader' || user?.role === 'superadmin') || user?.role === 'superadmin') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 8 }}>
              {(user?.role === 'leader' || user?.role === 'superadmin') && (
                <TouchableOpacity
                  style={{ backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', shadowColor: '#6366f1', shadowOpacity: 0.10, shadowRadius: 4, elevation: 1 }}
                  onPress={() => router.push('/announcement-create')}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>+ Duyuru Ekle</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Superadmin için filtreleme ve arama alanı */}
          {user?.role === 'superadmin' && (
            <View style={{ marginBottom: 18, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e0e7ff' }}>
              {/* Arama metni */}
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#6366f1', marginBottom: 4 }}>Başlık/İçerik Ara</Text>
                <TextInput
                  style={{ height: 40, fontSize: 15, color: '#222', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e7ff', paddingHorizontal: 10, marginBottom: 0 }}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Başlık veya içerik ara..."
                  placeholderTextColor="#a1a1aa"
                  autoCorrect={false}
                  autoCapitalize="none"
                  underlineColorAndroid="transparent"
                />
              </View>
              {/* İl seçici */}
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#6366f1', marginBottom: 4 }}>İl'e Göre Filtrele</Text>
                <TextInput
                  style={{ height: 40, fontSize: 15, color: '#222', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e7ff', paddingHorizontal: 10, marginBottom: 0 }}
                  value={selectedProvince}
                  onChangeText={setSelectedProvince}
                  placeholder="İl adı..."
                  placeholderTextColor="#a1a1aa"
                  autoCorrect={false}
                  autoCapitalize="words"
                  underlineColorAndroid="transparent"
                />
              </View>
              {/* Tag arama */}
              <View style={{ marginBottom: 4 }}>
                <Text style={{ fontWeight: 'bold', color: '#6366f1', marginBottom: 4 }}>Tag'e Göre Filtrele</Text>
                <TextInput
                  style={{ height: 40, fontSize: 15, color: '#222', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e7ff', paddingHorizontal: 10, marginBottom: 0 }}
                  value={tagText}
                  onChangeText={setTagText}
                  placeholder="Etiket ara..."
                  placeholderTextColor="#a1a1aa"
                  autoCorrect={false}
                  autoCapitalize="none"
                  underlineColorAndroid="transparent"
                />
              </View>
            </View>
          )}
          {(announcementsLoading || localLoading || apiLoading) ? (
            <View style={{ marginTop: 32, alignItems: 'center' }}>
              <ActivityIndicator color="#6366f1" size="large" />
              <Text style={{ color: '#6366f1', fontSize: 16, marginTop: 12, fontStyle: 'italic' }}>Duyurular yükleniyor...</Text>
            </View>
          ) : announcements.length === 0 ? (
            <Text style={{ color: '#64748b', fontSize: 16, textAlign: 'center', marginTop: 32, fontStyle: 'italic' }}>Duyurular bulunamadı.</Text>
          ) : (
            // Filtreleme motoru: sadece superadmin için filtre uygula, diğerleri için doğrudan göster
            (user?.role === 'superadmin' ? announcements.filter(a => {
              // Başlık veya içerik araması
              const search = searchText.trim().toLowerCase();
              const tag = tagText.trim().toLowerCase();
              const provinceInput = selectedProvince.trim().toLowerCase();
              let matches = true;
              // Türkçe karakterleri normalize eden yardımcı fonksiyon
              const normalize = (str: string) =>
                str
                  .toLocaleLowerCase('tr-TR')
                  .replace(/ç/g, 'c')
                  .replace(/ğ/g, 'g')
                  .replace(/ı/g, 'i')
                  .replace(/ö/g, 'o')
                  .replace(/ş/g, 's')
                  .replace(/ü/g, 'u')
                  .replace(/\s+/g, '');
              if (search) {
                const title = (a.title || '').toLowerCase();
                const content = (a.content || a.message || '').toLowerCase();
                matches = matches && (title.includes(search) || content.includes(search));
              }
              if (provinceInput) {
                // Tüm map anahtarlarını normalize ederek karşılaştır
                let valilikId: number | undefined;
                for (const [key, value] of Object.entries(provinceNameToValilikId)) {
                  if (normalize(key) === normalize(provinceInput)) {
                    valilikId = value;
                    break;
                  }
                }
                if (valilikId) {
                  matches = matches && String(a.valilik_id) === String(valilikId);
                } else {
                  matches = false;
                }
              }
              if (tag) {
                let keywords: string[] = [];
                if (Array.isArray(a.keywords)) {
                  keywords = a.keywords;
                } else if (typeof a.keywords === 'string') {
                  keywords = a.keywords.split(',').map(k => k.trim()).filter(Boolean);
                }
                matches = matches && keywords.some(k => k.toLowerCase().includes(tag));
              }
              return matches;
            }) : announcements).map((a, i) => {
              // Etkinlik aktiflik kontrolü
              let etkinlikAktif = true;
              if (a.bitis_tarihi) {
                try {
                  const now = new Date();
                  const bitis = new Date(a.bitis_tarihi);
                  if (bitis < now) etkinlikAktif = false;
                } catch {}
              }
              if (a.active === false) etkinlikAktif = false;
              if (!etkinlikAktif) return null;
              const canDelete = 
                user?.role === 'superadmin' || 
                (user?.role === 'leader' && (
                  (a.created_by && parseInt(a.created_by) === parseInt(user?.id)) ||
                  (a.created_by === null && a.community_id === user?.community_id)
                ));
              let leaderName = 'Bilinmiyor';
              if (a.community_id === 0) {
                leaderName = 'Kamp Defterim';
              } else if (communityLeaders[a.community_id]) {
                leaderName = communityLeaders[a.community_id];
              }
              // keywords: string[] veya virgüllü string olabilir
              let keywords: string[] = [];
              if (Array.isArray(a.keywords)) {
                keywords = a.keywords;
              } else if (typeof a.keywords === 'string') {
                keywords = a.keywords.split(',').map(k => k.trim()).filter(Boolean);
              }
              let valilikText = '';
              if (a.valilik_id) {
                valilikText = getValilik(a.valilik_id);
              }
              const isLeaderAnnouncement = parseInt(a.created_by) === parseInt(user?.id);
              // Topluluk duyuruları için özel renkler
              const isCommunityAnnouncement = a.community_id !== 0;
              const cardBgColor = isCommunityAnnouncement ? '#f1f5f9' : '#fff';
              const cardBorderColor = isCommunityAnnouncement ? '#f1f5f9' : '#fff';
              // Sadece detaylı bilgi butonu ile açılabilen kart (valilik duyurusu ise kart tıklanamaz)
              const CardContent = (
                <>
                  {/* Fotoğraf varsa başlığın üstünde göster */}
                  {(() => {
                    let photos = a.event_photos;
                    if (!photos) {
                      if (a.images) {
                        photos = a.images;
                      } else if (a.photo_links) {
                        photos = a.photo_links;
                      }
                    }
                    if (typeof photos === 'string' && photos.trim() !== '' && photos !== '[]') {
                      try { photos = JSON.parse(photos); } catch (e) { photos = []; }
                    }
                    if (Array.isArray(photos) && photos.length > 0) {
                      return (
                        <View style={{ marginBottom: 10 }}>
                          {photos.map((url: string, idx: number) => (
                            <Image
                              key={idx}
                              source={{ uri: url }}
                              style={{ width: '100%', height: 180, borderRadius: 10, backgroundColor: '#e5e7eb', marginBottom: 6 }}
                              resizeMode="cover"
                            />
                          ))}
                        </View>
                      );
                    }
                    return null;
                  })()}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Bell size={16} color="#6366f1" style={{ marginRight: 8 }} />
                    <Text style={{ fontWeight: 'bold', color: '#3730a3', fontSize: 16, flex: 1 }}>{a.title}</Text>
                  </View>
                  {a.etkinlik_turu && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, marginTop: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
                        <SvgXml xml={getSVGIcon('etkinlik_turu', { width: 20, height: 20 })} width={20} height={20} />
                        <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{a.etkinlik_turu}</Text>
                      </View>
                      {a.zorluk_seviyesi && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
                          <SvgXml xml={getSVGIcon('zorluk_seviyesi', { width: 20, height: 20 })} width={20} height={20} />
                          <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{a.zorluk_seviyesi}</Text>
                        </View>
                      )}
                      {a.etkinlik_suresi && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <SvgXml xml={getSVGIcon('etkinlik_suresi', { width: 20, height: 20 })} width={20} height={20} />
                          <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{a.etkinlik_suresi}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {a.community_id === 0 && valilikText ? (
                    <Text style={{ fontSize: 13, color: '#2563eb', fontWeight: '600', marginBottom: 4 }}>{valilikText}</Text>
                  ) : null}
                  {a.community_id === 0 && keywords.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                      {keywords.map((kw, j) => (
                        <View key={j} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4 }}>
                          {keywordIcon(kw)}
                          <Text style={{ fontSize: 13, color: '#374151', marginLeft: 2 }}>{kw}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Özet sadece topluluk duyurularında gösterilir (community_id !== 0) */}
                  {a.community_id !== 0 && (a.content || a.message) && (() => {
                    let text = a.content || a.message;
                    text = text.replace(/<[^>]+>/g, ' ');
                    text = text.replace(/[#*_`~\[\]()\-!>]+/g, ' ');
                    text = text.replace(/\s+/g, ' ').trim();
                    const words = text.split(' ');
                    const limited = words.length > 20 ? words.slice(0, 20).join(' ') + '...' : text;
                    return (
                      <Text style={{ color: '#334155', fontSize: 15, marginTop: 2, marginBottom: 6, lineHeight: 21 }}>{limited}</Text>
                    );
                  })()}
                  {a.link && typeof a.link === 'string' && a.link.trim() !== '' && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 6, marginBottom: 2 }}
                      onPress={() => {
                        let url = a.link;
                        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                        Linking.openURL(url);
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Detaylı bilgi</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ color: '#6366f1', fontSize: 13, fontWeight: '600' }}>Ekleyen: </Text>
                    <Text style={{ color: '#64748b', fontSize: 13, marginRight: 8 }}>{leaderName || a.author_name || 'Bilinmiyor'}</Text>
                    <Text style={{ color: '#a1a1aa', fontSize: 12, flex: 1 }}>{a.created_at ? new Date(a.created_at).toLocaleString('tr-TR') : ''}</Text>
                  </View>
                  {canDelete && (
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#e0e7ff', shadowColor: '#6366f1', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 }}
                        onPress={() => {
                          setEditAnnouncementId(a.id);
                          setEditModalVisible(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 12 }}>Düzenle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#e0e7ff', shadowColor: '#6366f1', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 }}
                        onPress={() => handleDelete(a.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color: '#6366f1', fontWeight: 'bold', fontSize: 12 }}>Sil</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
              // Valilik duyurusu ise kart tıklanamaz, sadece detaylı bilgi butonu çalışır
              if (a.community_id === 0) {
                return (
                  <View
                    key={a.id || i}
                    style={{
                      marginBottom: 16,
                      backgroundColor: cardBgColor,
                      borderRadius: 14,
                      padding: 18,
                      borderWidth: 1,
                      borderColor: cardBorderColor,
                      shadowColor: '#6366f1',
                      shadowOpacity: 0.08,
                      shadowRadius: 8,
                      elevation: 2,
                      position: 'relative',
                    }}
                  >
                    {CardContent}
                  </View>
                );
              }
              // Topluluk duyuruları için eski davranış devam etsin
              return (
                <TouchableOpacity
                  key={a.id || i}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedAnnouncement(a);
                    setModalVisible(true);
                  }}
                  style={{
                    marginBottom: 16,
                    backgroundColor: cardBgColor,
                    borderRadius: 14,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: cardBorderColor,
                    shadowColor: '#6366f1',
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 2,
                    position: 'relative',
                  }}
                >
                  {CardContent}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
      {modalVisible && selectedAnnouncement && (
        <AnnouncementDetail
          visible={modalVisible}
          announcement={{
            ...selectedAnnouncement,
            // Detayda tam metin gösterilsin diye, content/message orijinal haliyle geçsin
            content: selectedAnnouncement.content || selectedAnnouncement.message,
            message: selectedAnnouncement.message || selectedAnnouncement.content
          }}
          onClose={() => {
            setModalVisible(false);
            setSelectedAnnouncement(null);
          }}
        />
      )}
      {editModalVisible && editAnnouncementId && (
        <AnnouncementEditScreen
          id={editAnnouncementId}
          visible={editModalVisible}
          onClose={() => {
            setEditModalVisible(false);
            setEditAnnouncementId(null);
          }}
          onSuccess={refreshAnnouncements}
        />
      )}
      {/* WebView ile detay linki modalı */}
      <Modal
        visible={webModalVisible}
        animationType="slide"
        onRequestClose={() => setWebModalVisible(false)}
        transparent={true}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(30,41,59,0.85)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '94%', height: Platform.OS === 'web' ? '80%' : '85%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#6366f1', padding: 10 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Detaylı Bilgi</Text>
              <TouchableOpacity onPress={() => setWebModalVisible(false)}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Kapat</Text>
              </TouchableOpacity>
            </View>
            {webModalUrl && (
              <WebView
                source={{ uri: webModalUrl }}
                style={{ flex: 1 }}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color="#6366f1" size="large" />
                  </View>
                )}
                allowsBackForwardNavigationGestures
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={["*"]}
                injectedJavaScript={`
                  // Menü, header, footer, aside, cookie bar gibi elementleri kaldır
                  (function() {
                    var selectors = [
                      'header', 'nav', 'footer', 'aside', '.cookie', '.cookies', '.cookie-bar', '.cookie-banner', '.menu', '.navbar', '.nav', '.footer', '.site-header', '.site-footer', '#header', '#footer', '#nav', '#navbar', '#menu', '#cookie', '#cookies', '#cookie-bar', '#cookie-banner', '[role="banner"]', '[role="navigation"]', '[role="contentinfo"]', '[aria-label="Çerez"]', '[aria-label="cookie"]', '[aria-label="menü"]', '[aria-label="menu"]'
                    ];
                    selectors.forEach(function(sel) {
                      var els = document.querySelectorAll(sel);
                      els.forEach(function(el) { el.remove(); });
                    });
                    // Eğer ana içerik <main> veya <article> ise sadece onu göster
                    var main = document.querySelector('main, article, #main, .main, #content, .content');
                    if (main) {
                      document.body.innerHTML = '';
                      document.body.appendChild(main);
                      // Sağdan soldan padding ekle
                      main.style.paddingLeft = '10px';
                      main.style.paddingRight = '10px';
                      main.style.boxSizing = 'border-box';
                    } else {
                      // Ana içerik bulunamadıysa body'ye padding ekle
                      document.body.style.paddingLeft = '10px';
                      document.body.style.paddingRight = '10px';
                      document.body.style.boxSizing = 'border-box';
                    }
                  })();
                  true;
                `}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
