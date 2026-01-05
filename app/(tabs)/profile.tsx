import Constants from 'expo-constants';
// Sunucu eşleştirme fonksiyonu: source_id:1 olan tüm kamp alanlarını lokal veritabanına kaydet
async function syncServerCampgroundsToLocal() {
  try {
    const token = await getToken();
    // Sunucudan source_id:1 olan kamp alanlarını çek
    const res = await fetch(`${API_URL}/campgrounds?source_id=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Sunucudan veri alınamadı');
    // Lokal veritabanına ekle
    const db = require('../../lib/database').getDatabase();
    let added = 0;
    for (const area of data) {
      try {
        await db.insertOrUpdateCampingArea(area);
        added++;
      } catch (e) {
        // Hatalı kayıtları atla
      }
    }
    return { success: true, count: added };
  } catch (e) {
    return { success: false, error: e?.message || 'Eşleştirme hatası' };
  }
}
  // Lokal veritabanını silme fonksiyonu (sadece superadmin)
  const handleDeleteDatabase = async () => {
    try {
      const DatabaseManager = require('../../lib/database').getDatabase();
      const result = await DatabaseManager.deleteDatabaseFile();
      if (result) {
        Alert.alert('Başarılı', 'Veritabanı silindi. Uygulamayı yeniden başlatmanız gerekmektedir.');
      } else {
        Alert.alert('Hata', 'Veritabanı silinemedi veya zaten yok.');
      }
    } catch (e) {
      Alert.alert('Hata', 'Veritabanı silinirken bir hata oluştu.');
    }
  };
import { API_URL } from '@/lib/config';
// Profil ekranı – modernizasyon öncesi kırık yapıyı toparlanmış sürüm
import { syncPendingChanges } from '@/lib/syncPendingChanges';
import React, { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Image, Button, StyleSheet, ActivityIndicator, ScrollView, Switch, Alert, TouchableOpacity, Modal, TextInput, BackHandler } from 'react-native';
import { Friend } from '../../types/friend';
import FriendAvatar from '../../components/FriendAvatar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, ChevronRight, Download as DownloadIcon, Upload, RefreshCw, User, Shield, Mail, UserCheck, Building, Eye, CheckCircle, Clock, XCircle } from 'lucide-react-native';
import { Search, Trash } from 'lucide-react-native';
import * as Location from 'expo-location';
import { getMe, listCommunityMembers, getCommunity as getCommunityById, listCommunities } from '../../lib/userCommunityApi';
import { joinCommunity } from '../../lib/userCommunityApi';
import { getUserById } from '../../lib/userMembership';
import { updateMemberStatus } from '../../lib/updateMemberStatus';
import { /* rejectMember, */ removeMember } from '../../lib/userCommunityApi';
import { Picker } from '@react-native-picker/picker';
import { getToken, removeToken } from '../../lib/auth';
import { useRouter } from 'expo-router';
// Yardımcı: Kullanıcının topluluk üyeliğini getir
async function getUserMembershipRemote(communityId: number, userId: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/communities/${communityId}/members/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  try { return await res.json(); } catch { return null; }
}

// Overpass veri senk helper (varsayılan backend endpoint varsayımı)
async function syncFromOverpass(bounds: string): Promise<{ success: boolean; stats?: any; error?: string }> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/overpass-sync?bounds=${encodeURIComponent(bounds)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!res.ok) return { success: false, error: data.error || `Sunucu hatası (${res.status})` };
      return { success: true, stats: data.stats };
    } catch (e) {
      return { success: false, error: 'Geçersiz JSON yanıtı' };
    }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Ağ hatası' };
  }
}

export default function ProfileScreen(props: any) {
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

  const [pendingLogout, setPendingLogout] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (pendingLogout) {
      router.replace('/(tabs)/checklist?logout=1');
      setPendingLogout(false);
    }
  }, [pendingLogout]);
  const isConnected = useNetworkStatus();
  // İstek gönderilen kullanıcıları tutan state
  const [requestedUserIds, setRequestedUserIds] = useState<number[]>([]);
  // Gelen arkadaşlık istekleri için state
  const [friendRequests, setFriendRequests] = useState<{ id: number; username: string; tag: string; name?: string; email?: string; avatar_url?: string }[]>([]);
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(false);
  const [friendRequestsError, setFriendRequestsError] = useState<string | null>(null);

  // Gelen istekleri getir
  const fetchFriendRequests = async (showNotification = false) => {
    setFriendRequestsLoading(true);
    setFriendRequestsError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
  const data = await res.json();
  console.log('[API FRIENDSHIPS/LIST]', data);
      // Artık API'den tüm bilgiler geliyor: id, username, name, email, avatar_url, tag
      const mapped = Array.isArray(data)
        ? data.map((req: any) => ({
            id: req.id,
            user_id: req.user_id,
            name: req.requester?.name || '',
            username: req.requester?.username || '',
            email: req.requester?.email || '',
            avatar_url: req.requester?.avatar_url || '',
            tag: req.requester?.tag || ''
          }))
        : [];
      // API'den dönen friendRequests'i logla
      console.log('[GELEN ARKADAŞLIK İSTEKLERİ]', mapped);
      setFriendRequests(mapped);
      // Bildirim gösterme mantığı
      if (showNotification && mapped.length > 0) {
        try {
          const shownIdsStr = await AsyncStorage.getItem('shownFriendRequestIds');
          const shownIds = shownIdsStr ? JSON.parse(shownIdsStr) : [];
          const newRequests = mapped.filter(req => !shownIds.includes(req.id));
          if (newRequests.length > 0) {
            Alert.alert(
              'Yeni Arkadaşlık İsteği',
              `${newRequests.length} yeni arkadaşlık isteğiniz var!`,
              [
                { text: 'Tamam', onPress: async () => {
                  const allIds = [...shownIds, ...newRequests.map(r => r.id)];
                  await AsyncStorage.setItem('shownFriendRequestIds', JSON.stringify(allIds));
                }}
              ]
            );
          }
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      setFriendRequestsError('İstekler alınamadı');
    } finally {
      setFriendRequestsLoading(false);
    }
  };

  // İsteğe yanıt ver (kabul/ret)
  const respondFriendRequest = async (request_id: number, status: 'accepted' | 'rejected') => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ request_id, status })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Yanıt gönderilemedi');
      Alert.alert('Başarılı', status === 'accepted' ? 'Arkadaşlık isteği kabul edildi!' : 'İstek reddedildi');
      fetchFriendRequests();
      fetchFriends();
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Yanıt gönderilemedi');
    }
  };

  // İlk yüklemede istekleri getir ve bildirim göster
  useEffect(() => {
    fetchFriendRequests(true);
  }, []);
  // Arkadaşlık yönetimi için state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; tag: string }[]>([]);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  // Arkadaş listesini getir
  const fetchFriends = async () => {
    try {
      setFriendError(null);
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('[API FRIENDSHIPS/LIST]', data);
      if (Array.isArray(data)) {
        const mapped: Friend[] = data.map((f: any) => {
          // tag örneği: "#8" → id: 8
          const idFromTag = typeof f.tag === 'string' && f.tag.startsWith('#') ? Number(f.tag.replace('#', '')) : undefined;
          return {
            id: idFromTag,
            username: f.username,
            tag: f.tag,
            name: f.name || '',
            email: f.email || '',
            avatar_url: f.avatar_url || ''
          };
        });
        setFriends(mapped);
      } else {
        setFriends([]);
      }
    } catch (e) {
      setFriendError('Arkadaşlar alınamadı');
    }
  };

  // Kullanıcı adı ile arama
  const handleFriendSearch = async () => {
    if (!friendSearch.trim()) return;
    setFriendSearchLoading(true);
    setFriendError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/users/search?username=${encodeURIComponent(friendSearch)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      // Giriş yapan kullanıcıyı listeden çıkar
      const filtered = Array.isArray(data)
        ? data.filter((u: any) => {
            if (!user) return true;
            // id veya username ile eşleşen kendi kaydını çıkar
            return u.id !== user.id && u.username !== user.username;
          })
        : [];
      setSearchResults(filtered);
    } catch (e) {
      setFriendError('Arama başarısız');
    } finally {
      setFriendSearchLoading(false);
    }
  };

  // Arkadaşlık isteği gönder
  const sendFriendRequest = async (friend_id: number) => {
    setFriendRequestLoading(true);
    setFriendError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ friend_id })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'İstek gönderilemedi');
      setRequestedUserIds(prev => [...prev, friend_id]);
      Alert.alert('Başarılı', 'Arkadaşlık isteği gönderildi!');
    } catch (e: any) {
      setFriendError(e?.message || 'İstek gönderilemedi');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  // İlk yüklemede arkadaşları getir
  useEffect(() => {
    fetchFriends();
  }, []);
  // Tüm hook'lar en üstte, koşulsuz çağrılır
  const [user, setUser] = useState<any>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  // Profil fotoğrafı yükleme fonksiyonu
  // S3'e fotoğraf yükleme fonksiyonu (presigned URL ile)
  async function uploadImageToS3(fileUri: string): Promise<string | null> {
    try {
      // 1. Backend'den presigned URL al
      const token = await getToken();
      const bodyObj = { filename: 'avatar.jpg', contentType: 'image/jpeg' };
      console.log('Presigned URL için token:', token);
      console.log('Presigned URL için body:', bodyObj);
      const res = await fetch(`${API_URL}/users/avatar/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(bodyObj)
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      console.log('Presigned URL response status:', res.status);
      console.log('Presigned URL response body:', data);
  if (!res.ok || !data?.uploadUrl || !data?.fileName) throw new Error('Presigned URL alınamadı');

      // 2. Fotoğrafı S3'e yükle
      const image = await fetch(fileUri);
      const blob = await image.blob();
      const uploadRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob
      });
      if (!uploadRes.ok) throw new Error('S3 yükleme başarısız');

      // 3. S3 erişim URL'sini döndür
      // S3 public erişim: https://kamp-defterim.s3.amazonaws.com/<fileName>
      const s3PublicUrl = `https://kamp-defterim.s3.amazonaws.com/${data.fileName}`;
      return s3PublicUrl;
    } catch (e) {
      console.error('S3 upload error:', e);
      return null;
    }
  }

  // Backend'e avatar URL'sini kaydet
  async function updateUserAvatar(avatarUrl: string) {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatar_url: avatarUrl })
      });
      return await res.json();
    } catch (e) {
      console.error('Avatar güncelleme hatası:', e);
      return null;
    }
  }

  // Profil fotoğrafı yükleme fonksiyonu
  const handlePickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      setAvatarUploading(true);
      const asset = result.assets[0];
      // 1. S3'e yükle
      const s3Url = await uploadImageToS3(asset.uri);
      if (!s3Url) throw new Error('Fotoğraf yüklenemedi');
      // 2. Backend'e kaydet
      const updateRes = await updateUserAvatar(s3Url);
      if (updateRes?.error) throw new Error(updateRes.error);
      // 3. Lokal avatarı ve user state'ini güncelle
      setLocalAvatar(null);
      setUser((prev: any) => prev ? { ...prev, avatar_url: s3Url } : prev);
      Alert.alert('Başarılı', 'Profil fotoğrafınız güncellendi!');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Fotoğraf yüklenemedi.');
    } finally {
      setAvatarUploading(false);
    }
  };
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<string>('unknown');
  // Manuel Overpass Sync kaldırıldı
  const [backupInfo, setBackupInfo] = useState<{
    userAreasCount: number;
    favoritesCount: number;
  }>({ userAreasCount: 0, favoritesCount: 0 });
  const [backupLoading, setBackupLoading] = useState(false);
  // Topluluk rolü ve durumu
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  // Topluluk detayları
  const [communityDetail, setCommunityDetail] = useState<any>(null);
  // Topluluk arama ve başvuru için ek state'ler
  const [communitySearch, setCommunitySearch] = useState('');
  const [allCommunities, setAllCommunities] = useState<any[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<any[]>([]);
  const [communityApplyLoading, setCommunityApplyLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [loadingCommunities, setLoadingCommunities] = useState(true);

  // İlk açılışta toplulukları çek
  useEffect(() => {
    (async () => {
      try {
        const data = await listCommunities();
        // Sadece public olanları al
        const visible = Array.isArray(data) ? data.filter((c: any) => c.visibility === 'public') : [];
        setAllCommunities(visible);
      } catch (e) {
        setAllCommunities([]);
      } finally {
        setLoadingCommunities(false);
      }
    })();
  }, []);

  // Arama inputu değiştikçe filtrele
  useEffect(() => {
    if (communitySearch.trim().length >= 2) {
      const filtered = allCommunities.filter((c: any) =>
        c.name.toLowerCase().includes(communitySearch.toLowerCase())
      );
      setFilteredCommunities(filtered);
    } else {
      setFilteredCommunities([]);
    }
  }, [communitySearch, allCommunities]);
  // Topluluk üyeleri (lider için)
  const [communityMembers, setCommunityMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  // Üye durum modalı
  const [statusModal, setStatusModal] = useState<{ open: boolean; member: any | null }>({ open: false, member: null });
  const statusOptions = [
    { label: 'Aktif', value: 'active', color: '#16a34a', icon: <CheckCircle size={16} color="#16a34a" /> },
    { label: 'Onay Bekliyor', value: 'pending', color: '#f59e0b', icon: <Clock size={16} color="#f59e0b" /> },
    { label: 'Reddedildi', value: 'rejected', color: '#dc2626', icon: <XCircle size={16} color="#dc2626" /> },
  ];

  // Topluluk lideri ise üyeleri çek
  useEffect(() => {
    if (user && membership && membership.role === 'leader' && user.community_id) {
      setMembersLoading(true);
      listCommunityMembers(user.community_id)
        .then(members => {
          // superadmin ve giriş yapan kullanıcıyı filtrele
          const filtered = Array.isArray(members)
            ? members.filter(m => {
                const role = m.user?.role || m.user?.dataValues?.role;
                // Giriş yapan kullanıcıyı hariç tut
                const isCurrentUser = m.user_id === user.id;
                return role !== 'superadmin' && !isCurrentUser;
              })
            : [];
          setCommunityMembers(filtered);
        })
        .catch(() => setCommunityMembers([]))
        .finally(() => setMembersLoading(false));
    }
  }, [user, membership]);

  // Üye status güncelleme fonksiyonu (Reddedildi ise topluluktan tamamen sil)
  const handleStatusChange = async (member: any, newStatus: string) => {
    try {
      if (newStatus === 'rejected') {
        console.log('[handleStatusChange] Reddedildi seçildi, removeMember çağrılıyor:', member);
        // Backend'de üyeyi tamamen sil
        const result = await removeMember(member.community_id, member.user_id);
        console.log('[handleStatusChange] removeMember sonucu:', result);
        if ((result as any)?.error || !(result as any)?.success) {
          console.log('[handleStatusChange] removeMember beklenmeyen/hatalı yanıt:', result);
          Alert.alert('Hata', (result as any).error || (typeof result === 'object' ? JSON.stringify(result) : String(result)) || 'Üye topluluktan silinemedi');
          return;
        }
        setCommunityMembers(prev => prev.filter(m => m.user_id !== member.user_id));
        Alert.alert('Başarılı', (result as any)?.pending ? 'Üye silme işlemi çevrimdışı kuyruğa alındı, internet bağlantısı sağlandığında sunucuya iletilecek.' : 'Üye topluluktan silindi.');
        // Silme sonrası sync tetikle
        if ((result as any)?.pending) {
          console.log('[handleStatusChange] removeMember pending, syncPendingChanges tetikleniyor...');
          syncPendingChanges().then(() => {
            console.log('[handleStatusChange] syncPendingChanges tamamlandı.');
          }).catch(e => {
            console.log('[handleStatusChange] syncPendingChanges hata:', e);
          });
        }
      } else {
        // Sadece status güncelle
        const result = await updateMemberStatus(member.community_id, member.user_id, newStatus);
        if ((result as any)?.error) {
          Alert.alert('Hata', (result as any).error || 'Durum güncellenemedi');
          return;
        }
        setCommunityMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, status: newStatus } : m));
        Alert.alert('Başarılı', 'Üye durumu güncellendi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Durum güncellenemedi');
      console.log('[handleStatusChange] Hata:', e);
    }
  };

  // Konum durum metni
  const getLocationStatusText = () => {
    if (locationEnabled && locationPermissionStatus === 'granted') return 'Açık';
    if (locationPermissionStatus === 'denied') return 'İzin reddedildi';
    if (locationPermissionStatus === 'undetermined' || locationPermissionStatus === 'unknown') return 'Belirsiz';
    return 'Kapalı';
  };

  // Konum izin toggle
  const handleLocationToggle = async (value: boolean) => {
    if (value) {
      setLocationPermissionStatus(status);
      if (status !== 'granted') {
        setLocationEnabled(false);
        return;
      }
      setLocationEnabled(true);
    } else {
      setLocationEnabled(false);
    }
  };
  // Manuel Overpass Sync kaldırıldı




  // İlk yüklemeler
  useEffect(() => {
    if (!isConnected) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const me = await getMe();
        console.log('getMe yanıtı:', me, 'created_at:', me?.created_at, 'trial_user:', me?.trial_user);
        if (me && me.forceLogout) {
          Alert.alert('Oturum Sonlandırıldı', 'Deneme süreniz dolduğu için oturumunuz kapatıldı. Lütfen tekrar giriş yapın.', [
            {
              text: 'Tamam',
              onPress: async () => {
                await removeToken();
                setUser(null);
                router.replace('/login');
              }
            }
          ]);
          return;
        }
        // Eğer me.user varsa onu, yoksa me'yi set et
        setUser(me.user ? me.user : me || null);
        if (me?.community_id && me?.id) {
          const membershipData = await getUserMembershipRemote(me.community_id, me.id);
          if (membershipData) {
            setMembership({ role: membershipData.role, status: membershipData.status });
          }
          const cDetail = await getCommunityById(me.community_id);
          setCommunityDetail(cDetail || null);
        }
      } catch (e) {
        console.warn('Profil verileri alınamadı', e);
      } finally {
        setLoading(false);
      }
    })();
    // Permission durumunu oku
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        setLocationPermissionStatus(perm.status);
        setLocationEnabled(perm.status === 'granted');
      } catch {}
    })();
  }, [isConnected]);

  // Guest kullanıcı ise sadece profil kartı göster
  const isGuest = user?.role === 'guest';
  // Sadece user rolünde ve trial_user: true/1/'true' ise deneme süresi göster
  const isTrialUser = user?.role === 'user' && (user?.trial_user === true || user?.trial_user === 1 || user?.trial_user === 'true');

  // Deneme süresi kalan gün hesabı (created_at'ten 7 gün geriye)
  let trialDaysLeft: number | null = null;
  let trialExpired = false;
  if (user?.created_at && isTrialUser) {
    try {
      const created = new Date(user.created_at);
      const now = new Date();
      const diffMs = 30 * 24 * 60 * 60 * 1000 - (now.getTime() - created.getTime());
      trialDaysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      if (trialDaysLeft < 0) trialDaysLeft = 0;
      trialExpired = trialDaysLeft === 0;
    } catch {}
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={profileCardStyles.profileCard}>
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 140, height: 140, marginBottom: 8 }}>
              <Image
                source={
                  localAvatar
                    ? { uri: localAvatar }
                    : user?.avatar_url
                    ? { uri: user.avatar_url }
                    : require('../../assets/images/avatar-placeholder.png')
                }
                style={styles.avatar}
                resizeMode="cover"
                defaultSource={require('../../assets/images/avatar-placeholder.png')}
              />
            {/* Edit button as floating icon */}
            <TouchableOpacity
              onPress={handlePickProfilePhoto}
              style={styles.avatarEditFab}
              activeOpacity={0.8}
            >
              <Upload size={20} color="#fff" />
            </TouchableOpacity>
            {/* Loading overlay */}
            {avatarUploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
          </View>
          {/* User Info */}
          {loading ? (
            <ActivityIndicator />
          ) : user ? (
            <View style={{ alignItems: 'center', width: '100%' }}>
              <Text style={profileCardStyles.profileName}>{user.name || 'Kullanıcı'}</Text>
              <Text style={profileCardStyles.profileEmail}>{user.username ? `@${user.username}` : ''}</Text>
              <Text style={profileCardStyles.profileEmail}>{user.email || ''}</Text>
              <View style={profileCardStyles.profileRoleRow}>
                <Shield size={16} color="#2563eb" style={{ marginRight: 6 }} />
                <Text style={profileCardStyles.profileRoleText}>
                  {user.role === 'admin' ? 'Yönetici'
                    : user.role === 'user' ? 'Kullanıcı'
                    : user.role === 'superadmin' ? 'Üst Yönetici'
                    : user.role === 'guest' ? 'Misafir'
                    : 'Bilinmiyor'}
                </Text>
              </View>
              {/* Deneme süresi kalan gün/bilgi satırı (sadece user rolünde trial_user: true ise) */}
              {isTrialUser && user?.created_at && (
                trialExpired ? (
                  // Deneme süresi dolduysa otomatik logout
                  useEffect(() => {
                    Alert.alert('Deneme Süresi Doldu', 'Deneme süreniz sona erdi. Oturumunuz kapatılıyor.', [
                      {
                        text: 'Tamam',
                        onPress: async () => {
                          await removeToken();
                          setUser(null);
                          router.replace('/login');
                        }
                      }
                    ]);
                  }, []),
                  null
                ) : (
                  <View style={{ marginTop: 8, marginBottom: 2, backgroundColor: '#fef3c7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
                    <Text style={{ color: '#b45309', fontWeight: 'bold', fontSize: 14 }}>
                      Deneme süresi: {trialDaysLeft} gün kaldı
                    </Text>
                  </View>
                )
              )}
              {/* Guest ise kısıtlı erişim mesajı */}
              {isGuest && (
                <View style={{ marginTop: 8, marginBottom: 2, backgroundColor: '#fee2e2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
                  <Text style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 14 }}>
                    Kısıtlı erişim: Sadece temel özellikleri kullanabilirsiniz.
                  </Text>
                </View>
              )}
              {membership && (
                <View style={profileCardStyles.profileRoleRow}>
                  <UserCheck size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={[profileCardStyles.profileRoleText, { color: '#059669' }] }>
                    {membership.role === 'leader' ? 'Lider'
                      : membership.role === 'member' ? 'Üye'
                      : 'Bilinmiyor'}
                  </Text>
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                    marginLeft: 8,
                    backgroundColor: membership.status === 'active' ? '#dcfce7' 
                      : membership.status === 'pending' ? '#fef3c7' 
                      : '#fee2e2'
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '500' }}>
                      {membership.status === 'active' ? 'Aktif' 
                        : membership.status === 'pending' ? 'Onay Bekliyor' 
                        : membership.status}
                    </Text>
                  </View>
                </View>
              )}
              {/* Logout Button */}
              <TouchableOpacity style={profileCardStyles.profileLogoutBtn} onPress={() => {
                Alert.alert('Çıkış', 'Çıkış yapmak istediğinize emin misiniz?', [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Çıkış Yap', style: 'destructive', onPress: () => setPendingLogout(true) }
                ]);
              }}>
                <Text style={profileCardStyles.profileLogoutBtnText}>Çıkış Yap</Text>
              </TouchableOpacity>
            </View>
          ) : null}
  </View>

  {/* Guest ise diğer alanları gösterme */}
  {isGuest ? null : (
  <>
  {/* Arkadaşlarım Alanı - Kart Tasarımı */}
  <View style={profileCardStyles.profileCard}>
           <View style={{ 
             flexDirection: 'row', 
             alignItems: 'center', 
             marginBottom: 12,
             borderBottomWidth: 1,
             borderBottomColor: '#e2e8f0',
             paddingBottom: 8
           }}>
             <User size={16} color="#0e7490" />
             <Text style={{ fontWeight: 'bold', fontSize: 16, marginLeft: 8, color: '#0e7490' }}>
               Arkadaşlarım
             </Text>
           </View>
           {friendError && <Text style={{ color: 'red', marginBottom: 8 }}>{friendError}</Text>}
           {friends.length === 0 ? (
             <Text style={{ color: '#64748b' }}>Henüz arkadaşınız yok.</Text>
           ) : (
             friends.map((f, i) => (
               <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10 }}>
                 <View style={{ marginRight: 12 }}>
                   <FriendAvatar
                     avatar_url={f.avatar_url && f.avatar_url.trim() !== '' ? f.avatar_url : undefined}
                     name={f.name || f.username || 'Kullanıcı'}
                     size={48}
                   />
                 </View>
                 <View style={{ flex: 1, justifyContent: 'center' }}>
                   <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#0e7490' }}>{f.name || f.username || 'Kullanıcı'}</Text>
                   {f.username ? (
                     <Text style={{ color: '#64748b', fontSize: 14 }}>{`@${f.username}`}</Text>
                   ) : null}
                   {f.email ? (
                     <Text style={{ color: '#64748b', fontSize: 14 }}>{f.email}</Text>
                   ) : null}
                 </View>
                 {/* Sağda, alt alta sadece ikonlu butonlar */}
                 <View style={{ flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                   <View style={{ marginBottom: 6 }}>
                     <View style={{ backgroundColor: '#dcfce7', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: '#22c55e', alignItems: 'center', justifyContent: 'center' }}>
                       <CheckCircle size={12} color="#22c55e" />
                     </View>
                   </View>
                   <TouchableOpacity
                     onPress={() => {
                       Alert.alert(
                         'Arkadaş Sil',
                         `${f.name || f.username || 'Kullanıcı'} kullanıcısını silmek istediğinize emin misiniz?`,
                         [
                           { text: 'İptal', style: 'cancel' },
                           { text: 'Sil', style: 'destructive', onPress: async () => {
                               try {
                                 console.log('Silinecek friend_id:', f.id);
                                 const token = await getToken();
                                 const res = await fetch(`${API_URL}/friendships/remove`, {
                                   method: 'POST',
                                   headers: {
                                     'Content-Type': 'application/json',
                                     Authorization: `Bearer ${token}`
                                   },
                                   body: JSON.stringify({ friend_id: f.id })
                                 });
                                 const data = await res.json();
                                 console.log('Silme API yanıtı:', data);
                                 if (!res.ok || data.error) throw new Error(data.error || 'Arkadaş silinemedi');
                                 fetchFriends();
                               } catch (e: any) {
                                 console.error('Arkadaş silme hatası:', e);
                                 Alert.alert('Hata', e?.message || 'Arkadaş silinemedi');
                               }
                             }
                           }
                         ]
                       );
                     }}
                     style={{ padding: 0, borderRadius: 16 }}
                   >
                     <View style={{ backgroundColor: '#fee2e2', borderRadius: 16, padding: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ef4444' }}>
                       <Trash size={12} color="#ef4444" />
                     </View>
                   </TouchableOpacity>
                 </View>
               </View>
             ))
           )}
           {/* Gelen Arkadaşlık İstekleri Alanı - Kart içinde */}
           {friendRequests.length > 0 && (
             <View style={{ marginTop: 16, backgroundColor: '#e6e6e6ff', borderRadius: 10, padding: 12, width: '100%' }}>
               <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#a16207' }}>Gelen Arkadaşlık İstekleri</Text>
               {friendRequestsError && <Text style={{ color: 'red', marginBottom: 8 }}>{friendRequestsError}</Text>}
               {friendRequestsLoading ? <ActivityIndicator /> : null}
               {friendRequests.map((req) => (
                 <View key={req.id} style={{ marginBottom: 8, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <View style={{ marginRight: 12 }}>
                       <FriendAvatar avatar_url={req.avatar_url} name={req.name || req.username || 'Kullanıcı'} size={48} />
                     </View>
                     <View style={{ flex: 1, justifyContent: 'center' }}>
                       <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#0e7490' }}>{req.name || req.username || 'Kullanıcı'}</Text>
                       {req.username ? (
                         <Text style={{ color: '#64748b', fontSize: 14 }}>{`@${req.username}`}</Text>
                       ) : null}
                       {req.email ? (
                         <Text style={{ color: '#64748b', fontSize: 14 }}>{req.email}</Text>
                       ) : null}
                       {req.tag ? (
                         <Text style={{ color: '#a16207', fontSize: 13 }}>{req.tag}</Text>
                       ) : null}
                     </View>
                   </View>
                   <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                     <TouchableOpacity onPress={() => respondFriendRequest(req.id, 'accepted')} style={{ backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, marginRight: 10 }}>
                       <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Kabul Et</Text>
                     </TouchableOpacity>
                     <TouchableOpacity onPress={() => respondFriendRequest(req.id, 'rejected')} style={{ backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 }}>
                       <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Reddet</Text>
                     </TouchableOpacity>
                   </View>
                 </View>
               ))}
             </View>
           )}
          {/* Kullanıcı adı ile arama ve istek gönderme */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', marginBottom: 4, color: '#0e7490' }}>Arkadaş ekle</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1 }}>
                <TextInput 
                  placeholder="Kullanıcı adı ara..."
                  placeholderTextColor="#64748b"
                  value={friendSearch}
                  onChangeText={async (text) => {
                    setFriendSearch(text);
                    if (text.trim().length >= 3) {
                      setFriendSearchLoading(true);
                      setFriendError(null);
                      try {
                        const token = await getToken();
                        const res = await fetch(`${API_URL}/friendships/users/search?username=${encodeURIComponent(text)}`, {
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        const data = await res.json();
                        setSearchResults(Array.isArray(data) ? data : []);
                      } catch (e) {
                        setFriendError('Arama başarısız');
                        setSearchResults([]);
                      } finally {
                        setFriendSearchLoading(false);
                      }
                    } else {
                      setSearchResults([]);
                    }
                  }}
                  style={{ backgroundColor: '#fff', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb', width: '100%' }}
                />
              </View>
              {/* Arama butonu kaldırıldı, autocomplete ile çalışıyor */}
            </View>
            {friendSearchLoading && <ActivityIndicator style={{ marginTop: 8 }} />}
            {/* Autocomplete dropdown */}
            {searchResults.length > 0 && friendSearch.trim().length >= 3 && (
              <View style={{ marginTop: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', maxHeight: 180 }}>
                {searchResults.map((u) => {
                  const isRequested = requestedUserIds.includes(u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => !isRequested && sendFriendRequest(u.id)}
                      disabled={isRequested}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', opacity: isRequested ? 0.6 : 1 }}
                    >
                      <User size={20} color="#0ea5e9" style={{ marginRight: 10 }} />
                      <Text style={{ fontWeight: '600', fontSize: 16, color: '#0e7490', marginRight: 8 }}>{u.username}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#64748b', fontSize: 13 }}>{u.tag}</Text>
                      </View>
                      <View style={{ marginLeft: 12, backgroundColor: isRequested ? '#a3e635' : '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>{isRequested ? 'İstek Gönderildi' : 'İstek Gönder'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
        <View style={profileCardStyles.profileCard}>
          {loading ? (
            <ActivityIndicator />
          ) : user ? (
            <>
              {/* Kullanıcı Bilgileri ve Topluluk Bilgisi */}
              <View style={{ marginTop: 8, alignItems: 'center', width: '100%' }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0e7490' }}>{user.name || 'Kullanıcı'}</Text>
                <Text style={{ fontSize: 15, color: '#6b7280', marginBottom: 8 }}>{user.email || ''}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                    <Shield size={16} color="#2563eb" />
                  </View>
                  <Text style={{ fontSize: 14, color: '#2563eb', fontWeight: '600' }}>
                    {user.role === 'admin' ? 'Yönetici'
                      : user.role === 'user' ? 'Kullanıcı'
                      : user.role === 'superadmin' ? 'Üst Yönetici'
                      : user.role === 'guest' ? 'Misafir'
                      : 'Bilinmiyor'}
                  </Text>
                </View>
                {membership ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                        <UserCheck size={16} color="#059669" />
                      </View>
                      <Text style={{ fontSize: 14, color: '#059669', fontWeight: '600' }}>
                        {membership.role === 'leader' ? 'Lider'
                          : membership.role === 'member' ? 'Üye'
                          : 'Bilinmiyor'}
                      </Text>
                      <View style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 12,
                        marginLeft: 8,
                        backgroundColor: membership.status === 'active' ? '#dcfce7' 
                          : membership.status === 'pending' ? '#fef3c7' 
                          : '#fee2e2'
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '500' }}>
                          {membership.status === 'active' ? 'Aktif' 
                          : membership.status === 'pending' ? 'Onay Bekliyor' 
                          : membership.status}
                        </Text>
                      </View>
                    </View>
                    {communityDetail && (
                      <View style={{ 
                        marginTop: 12,
                        backgroundColor: '#f8fafc',
                        borderRadius: 12,
                        padding: 12,
                        width: '100%',
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Building size={16} color="#0e7490" />
                          <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#0e7490', marginLeft: 8 }}>{communityDetail.name}</Text>
                        </View>
                        {/* Açıklama başlığın hemen altında */}
                        {communityDetail.description ? (
                          <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 8, marginTop: 2 }}>{communityDetail.description}</Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Eye size={14} color="#9ca3af" />
                          <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4 }}>{communityDetail.visibility}</Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                  <View style={{ 
                    backgroundColor: '#fef3c7',
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 16,
                    marginTop: 8,
                    marginBottom: 8
                  }}>
                    <Text style={{ fontSize: 13, color: '#b45309', fontWeight: '600' }}>
                      Topluluk üyeliğiniz yok
                    </Text>
                  </View>
                  {/* Topluluk arama ve başvuru alanı, sadece guest ve trial_user olmayanlar için */}
                  {!(isGuest || isTrialUser) && (
                  <View style={{ width: '100%', marginTop: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '500', marginBottom: 4, color: '#0e7490' }}>Topluluğa Katıl</Text>
                    <TextInput
                      placeholder="Topluluk adı ara..."
                      placeholderTextColor="#64748b"
                      value={communitySearch}
                      onChangeText={text => {
                        setCommunitySearch(text);
                        setCommunityError(null);
                      }}
                      style={{ backgroundColor: '#fff', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb', width: '100%' }}
                    />
                    {loadingCommunities && <ActivityIndicator style={{ marginTop: 8 }} />}
                    {communityError && <Text style={{ color: 'red', marginTop: 4 }}>{communityError}</Text>}
                    {/* Autocomplete dropdown */}
                    {filteredCommunities.length > 0 && communitySearch.trim().length >= 2 && (
                      <View style={{ marginTop: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', maxHeight: 180 }}>
                        {filteredCommunities.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={async () => {
                              if (communityApplyLoading) return;
                              setCommunityApplyLoading(true);
                              setCommunityError(null);
                              try {
                                const data = await joinCommunity(c.id);
                                if (data && data.error) throw new Error(data.error || 'Başvuru gönderilemedi');
                                Alert.alert('Başarılı', 'Topluluğa başvuru gönderildi!');
                                setCommunitySearch('');
                              } catch (e: any) {
                                setCommunityError(e?.message || 'Başvuru gönderilemedi');
                              } finally {
                                setCommunityApplyLoading(false);
                              }
                            }}
                            disabled={communityApplyLoading}
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', opacity: communityApplyLoading ? 0.6 : 1 }}
                          >
                            <UserCheck size={20} color="#0ea5e9" style={{ marginRight: 10 }} />
                            <Text style={{ fontWeight: '600', fontSize: 16, color: '#0e7490', marginRight: 8 }}>{c.name}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: '#64748b', fontSize: 13 }}>{c.description}</Text>
                            </View>
                            <View style={{ marginLeft: 12, backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                              <Text style={{ color: '#fff', fontWeight: '600' }}>Başvur</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  )}
                  </>
                )}
                {/* Topluluk lideri ise üyeleri ve status dropdown'u sadece burada göster */}
                {membership && membership.role === 'leader' && (
                  <View style={{ 
                    marginTop: 20, 
                    width: '100%', 
                    backgroundColor: '#f8fafc', 
                    borderRadius: 12, 
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#e2e8f0'
                  }}>
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      marginBottom: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#e2e8f0',
                      paddingBottom: 8
                    }}>
                      <User size={16} color="#0e7490" />
                      <Text style={{ fontWeight: 'bold', fontSize: 16, marginLeft: 8, color: '#0e7490' }}>
                        Topluluk Üyeleri
                      </Text>
                    </View>
                    {membersLoading ? (
                      <ActivityIndicator color="#0e7490" style={{marginVertical: 20}} />
                    ) : communityMembers.length === 0 ? (
                      <Text style={{ fontSize: 14, color: '#6b7280', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
                        Üye bulunamadı.
                      </Text>
                    ) : (
                      communityMembers.map(member => {
                        // Mevcut durumu başa al, diğerlerini sırala
                        const sortedOptions = [
                          ...statusOptions.filter(opt => opt.value === member.status),
                          ...statusOptions.filter(opt => opt.value !== member.status)
                        ];
                        // Bilgiler
                        const memberName = (member.user?.name && member.user.name.trim()) ? member.user.name :
                          (member.user?.dataValues?.name && member.user.dataValues.name.trim()) ? member.user.dataValues.name : null;
                        const memberUsername = (member.user?.username && member.user.username.trim()) ? member.user.username :
                          (member.user?.dataValues?.username && member.user.dataValues.username.trim()) ? member.user.dataValues.username : null;
                        const memberEmail = (member.user?.email && member.user.email.trim()) ? member.user.email :
                          (member.user?.dataValues?.email && member.user.dataValues.email.trim()) ? member.user.dataValues.email : null;
                        return (
                          <View key={member.user_id} style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            marginBottom: 8, 
                            backgroundColor: '#f1f5f9', 
                            borderRadius: 10, 
                            padding: 10 
                          }}>
                            <View style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              backgroundColor: '#e2e8f0',
                              justifyContent: 'center',
                              alignItems: 'center',
                              marginRight: 10
                            }}>
                              <User size={14} color="#64748b" />
                            </View>
                            <View style={{ flex: 1 }}>
                              {memberName && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                  <User size={13} color="#0e7490" style={{ marginRight: 4 }} />
                                  <Text style={{ color: '#0e7490', fontWeight: '600', fontSize: 14 }}>{memberName}</Text>
                                </View>
                              )}
                              {memberUsername && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                  <Shield size={12} color="#64748b" style={{ marginRight: 4 }} />
                                  <Text style={{ color: '#64748b', fontSize: 13 }}>{memberUsername}</Text>
                                </View>
                              )}
                              {memberEmail && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Mail size={12} color="#64748b" style={{ marginRight: 4 }} />
                                  <Text style={{ color: '#64748b', fontSize: 13 }}>{memberEmail}</Text>
                                </View>
                              )}
                              {!(memberName || memberUsername || memberEmail) && (
                                <Text style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>İsimsiz Üye</Text>
                              )}
                            </View>
                            {/* Durum badge ve seçim butonu */}
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: statusOptions.find(opt => opt.value === member.status)?.color + '22', borderWidth: 1, borderColor: statusOptions.find(opt => opt.value === member.status)?.color || '#e5e7eb' }}
                              onPress={() => setStatusModal({ open: true, member })}
                              activeOpacity={0.85}
                            >
                              {statusOptions.find(opt => opt.value === member.status)?.icon}
                              <Text style={{ marginLeft: 6, color: statusOptions.find(opt => opt.value === member.status)?.color, fontWeight: 'bold', fontSize: 13 }}>
                                {statusOptions.find(opt => opt.value === member.status)?.label}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.error}>Kullanıcı bilgisi alınamadı</Text>
          )}
        </View>



        {/* App Info */}
        <View style={styles.appInfoContainer}>
          <Text style={styles.sectionTitle}>Uygulama</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Versiyon</Text>
            <Text style={styles.infoValue}>{Constants.expoConfig?.version || '1.x'}</Text>
          </View>
        </View>

        {/* Development Tools */}
        <View style={styles.menuContainer}>
          {/* Superadmin için sunucu eşleştirme butonu */}
          {user && user.role === 'superadmin' && (
            <TouchableOpacity
              style={[styles.backupButton, { backgroundColor: '#f0fdf4', borderColor: '#059669', marginBottom: 12 }]}
              onPress={async () => {
                try {
                  const res = await syncServerCampgroundsToLocal();
                  if (res.success) {
                    Alert.alert('Başarılı', `${res.count} kamp alanı lokal veritabanına kaydedildi!`);
                  } else {
                    Alert.alert('Hata', res.error || 'Eşleştirme başarısız');
                  }
                } catch (e) {
                  Alert.alert('Hata', e?.message || 'Eşleştirme başarısız');
                }
              }}
            >
              <View style={styles.backupButtonContent}>
                <RefreshCw size={20} color="#059669" />
                <View style={styles.backupButtonText}>
                  <Text style={[styles.backupButtonTitle, { color: '#059669' }]}>Sunucu Eşleştirme</Text>
                  <Text style={styles.backupButtonSubtitle}>Tüm sunucu kamp alanlarını lokal veritabanına kaydet</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          
          

          
          
          {/* Superadmin için veritabanı silme butonu */}
          {user && user.role === 'superadmin' && (
            <TouchableOpacity
              style={[styles.backupButton, { backgroundColor: '#fee2e2', borderColor: '#dc2626', marginTop: 16 }]}
              onPress={handleDeleteDatabase}
            >
              <View style={styles.backupButtonContent}>
                <XCircle size={20} color="#dc2626" />
                <View style={styles.backupButtonText}>
                  <Text style={[styles.backupButtonTitle, { color: '#dc2626' }]}>Veritabanını Sıfırla (Sil)</Text>
                  <Text style={styles.backupButtonSubtitle}>Tüm lokal veriler silinir. Geri alınamaz!</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Manuel Overpass Sync kaldırıldı */}

        {/* Durum seçim modalı */}
        <Modal
          visible={statusModal.open}
          transparent
          animationType="fade"
          onRequestClose={() => setStatusModal({ open: false, member: null })}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, alignItems: 'center', elevation: 4 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 18, color: '#0e7490' }}>Durum Seç</Text>
              {statusOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, marginBottom: 6, backgroundColor: statusModal.member?.status === opt.value ? opt.color + '22' : '#f3f4f6', borderWidth: statusModal.member?.status === opt.value ? 2 : 1, borderColor: statusModal.member?.status === opt.value ? opt.color : '#e5e7eb' }}
                  onPress={async () => {
                    if (statusModal.member && statusModal.member.status !== opt.value) {
                      await handleStatusChange(statusModal.member, opt.value);
                    }
                    setStatusModal({ open: false, member: null });
                  }}
                >
                  {opt.icon}
                  <Text style={{ marginLeft: 10, color: opt.color, fontWeight: 'bold', fontSize: 15 }}>{opt.label}</Text>
                  {statusModal.member?.status === opt.value && (
                    <CheckCircle size={16} color={opt.color} style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setStatusModal({ open: false, member: null })} style={{ marginTop: 10, padding: 8 }}>
                <Text style={{ color: '#64748b', fontWeight: 'bold' }}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: { paddingBottom: 32 },
  gradientHeader: {
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 16,
  },
  profileHeader: { alignItems: 'center', padding: 24, backgroundColor: '#f3f4f6' },
  avatarWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#e0e7ef',
    borderWidth: 2,
    borderColor: '#cbd5e1',
  },
  avatar: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#e0e7ef' },
  avatarEditFab: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#0284c7',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 2,
  },
  avatarOverlayLarge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Küçük overlay (eski header sürümü kullanan kısım için)
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarEditBadge: { display: 'none' },
  avatarEditText: { display: 'none' },
  headerName: { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 4 },
  headerEmail: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 14, flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  badgePrimary: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeNeutral: { backgroundColor: 'rgba(255,255,255,0.15)' },
  badgeSuccess: { backgroundColor: '#16a34a' },
  badgeWarning: { backgroundColor: '#f59e0b' },
  badgeDanger: { backgroundColor: '#dc2626' },
  logoutChip: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 24 },
  logoutChipText: { color: '#fff', fontWeight: '600' },
  communityMini: { marginTop: 20, alignItems: 'center', maxWidth: 320 },
  communityName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  communityDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, textAlign: 'center' },
  errorAlt: { color: '#fecaca' },
  name: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  email: { fontSize: 16, color: '#666', marginBottom: 8 },
  error: { color: '#d32f2f', marginBottom: 8 },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 24,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemBorder: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e5e7eb',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  menuContainer: {
    backgroundColor: 'white',
    marginBottom: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  appInfoContainer: {
    backgroundColor: 'white',
    marginBottom: 16,
    paddingVertical: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  infoLabel: {
    fontSize: 16,
    color: '#374151',
  },
  infoValue: {
    fontSize: 16,
    color: '#6b7280',
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
    backgroundColor: '#f0fdf4',
  },
  devButtonDisabled: {
    backgroundColor: '#f9fafb',
  },
  devButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  devButtonText: {
    marginLeft: 16,
    flex: 1,
  },
  devButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 2,
  },
  devButtonTitleDisabled: {
    color: '#9ca3af',
  },
  devButtonSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  syncStatusContainer: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncStatusSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  syncStatusError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  syncStatusText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  backupInfoContainer: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  backupInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 12,
  },
  backupStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  backupStat: {
    alignItems: 'center',
  },
  backupStatNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },
  backupStatLabel: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },
  backupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  exportButton: {
    backgroundColor: '#f0fdf4',
    borderColor: '#059669',
  },
  importButton: {
    backgroundColor: '#faf5ff',
    borderColor: '#7c3aed',
  },
  shareButton: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0891b2',
  },
  backupButtonDisabled: {
    backgroundColor: '#f9fafb',
    borderColor: '#d1d5db',
  },
  backupButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backupButtonText: {
    marginLeft: 16,
    flex: 1,
  },
  backupButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 2,
  },
  importButtonTitle: {
    color: '#7c3aed',
  },
  shareButtonTitle: {
    color: '#0891b2',
  },
  backupButtonTitleDisabled: {
    color: '#9ca3af',
  },
  backupButtonSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  spinning: {
    // Placeholder for potential Animated rotation
  },
});

// Modern tasarımda kullanılan ancak şu an kaldırılmış kart vs. stiller (ileride yeniden eklenebilir)
const profileCardStyles = StyleSheet.create({
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    margin: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  profileName: { fontSize: 20, fontWeight: '700', color: '#0e7490', marginTop: 8 },
  profileEmail: { fontSize: 15, color: '#6b7280', marginBottom: 8 },
  profileRoleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  profileRoleText: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  profileLogoutBtn: {
    marginTop: 18,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  profileLogoutBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
});