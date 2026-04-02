import * as SecureStore from 'expo-secure-store';
import { setLargeItemAsync, getLargeItemAsync, removeLargeItemAsync } from '@/lib/largeStorage';
import Constants from 'expo-constants';
import { clearTileCache, getTileCacheStats } from '@/lib/mapTileCache';
import OfflineRegionSelector from '@/components/OfflineRegionSelector';
import * as IAPManager from '@/lib/iapManager';
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
import { syncAll } from '@/lib/syncManager';
import React, { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { eventBus } from '@/lib/eventBus';

import { View, Text, Image, Button, StyleSheet, ActivityIndicator, ScrollView, Switch, Alert, TouchableOpacity, Modal, TextInput, BackHandler, Linking, Platform } from 'react-native';
import { Friend } from '../../types/friend';
import FriendAvatar from '../../components/FriendAvatar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, ChevronRight, Download as DownloadIcon, Upload, RefreshCw, User, Shield, Mail, UserCheck, Building, Eye, CheckCircle, Clock, XCircle, Edit2, X, BookOpen } from 'lucide-react-native';
import { Search, Trash } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTheme } from '../../components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';
import { getMe, listCommunityMembers, getCommunity as getCommunityById, listCommunities, deleteAccount } from '../../lib/userCommunityApi';
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
  const { colors } = useTheme();
  const themed = createThemedStyles(colors);
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
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
          const shownIdsStr = await getLargeItemAsync('shownFriendRequestIds');
          const shownIds = shownIdsStr ? JSON.parse(shownIdsStr) : [];
          const newRequests = mapped.filter(req => !shownIds.includes(req.id));
          if (newRequests.length > 0) {
            Alert.alert(
              'Yeni Arkadaşlık İsteği',
              `${newRequests.length} yeni arkadaşlık isteğiniz var!`,
              [
                { text: 'Tamam', onPress: async () => {
                  const allIds = [...shownIds, ...newRequests.map(r => r.id)];
                  await setLargeItemAsync('shownFriendRequestIds', JSON.stringify(allIds));
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
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; name?: string; tag?: string; avatar_url?: string }[]>([]);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  // Arkadaş listesi yüksekliği sabitleri
  const FRIEND_ITEM_HEIGHT = 56;
  const MAX_VISIBLE_FRIENDS = 5;

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
      console.log('[FRIEND SEARCH] Backend response:', JSON.stringify(data, null, 2));
      // Backend'den gelen veriyi frontend formatına map et ve giriş yapan kullanıcıyı çıkar
      const mapped = Array.isArray(data)
        ? data
            .filter((u: any) => {
              if (!user) return true;
              // isSelf flag'i veya id/username kontrolü ile filtrele
              if (u.isSelf === true || u.isSelf === 'true') return false;
              const userId = u.userId || u.id;
              return userId !== user.id && u.username !== user.username;
            })
            .map((u: any) => {
              console.log('[FRIEND SEARCH] Mapping user:', JSON.stringify(u, null, 2));
              return {
                id: u.userId || u.id,
                username: u.username || '',
                name: u.name || u.fullName || '',
                tag: u.tag || '',
                avatar_url: u.avatarUrl || u.image || u.avatar_url || ''
              };
            })
        : [];
      console.log('[FRIEND SEARCH] Mapped results:', JSON.stringify(mapped, null, 2));
      // Arkadaş listesinde olmayan kullanıcıları filtrele
      const filtered = mapped.filter(u => !friends.some(f => f.id === u.id));
      console.log('[FRIEND SEARCH] Filtered results (excluding friends):', JSON.stringify(filtered, null, 2));
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
  // Profil düzenleme state'leri
  const [editNameModal, setEditNameModal] = useState(false);
  const [editUsernameModal, setEditUsernameModal] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [editUsernameValue, setEditUsernameValue] = useState('');
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);
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

  // Profil fotoğrafı kaldırma fonksiyonu
  const handleRemoveAvatar = async () => {
    Alert.alert(
      'Fotoğrafı Kaldır',
      'Profil fotoğrafınızı kaldırmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            try {
              setAvatarUploading(true);
              const updateRes = await updateUserAvatar('');
              if (updateRes?.error) throw new Error(updateRes.error);
              setLocalAvatar(null);
              setUser((prev: any) => prev ? { ...prev, avatar_url: '' } : prev);
              Alert.alert('Başarılı', 'Profil fotoğrafınız kaldırıldı!');
            } catch (e: any) {
              Alert.alert('Hata', e?.message || 'Fotoğraf kaldırılamadı.');
            } finally {
              setAvatarUploading(false);
            }
          }
        }
      ]
    );
  };

  // İsim güncelleme fonksiyonu
  const handleUpdateName = async () => {
    if (!editNameValue.trim()) {
      Alert.alert('Hata', 'İsim boş olamaz');
      return;
    }
    try {
      setProfileUpdateLoading(true);
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editNameValue.trim() })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Güncelleme başarısız');
      setUser((prev: any) => prev ? { ...prev, name: editNameValue.trim() } : prev);
      setEditNameModal(false);
      Alert.alert('Başarılı', 'İsminiz güncellendi!');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'İsim güncellenemedi');
    } finally {
      setProfileUpdateLoading(false);
    }
  };

  // Kullanıcı adı güncelleme fonksiyonu
  const handleUpdateUsername = async () => {
    if (user?.role === 'guest') {
      Alert.alert('Kısıtlı Erişim', 'Misafir hesabıyla kullanıcı adı değiştirilemez.');
      return;
    }
    if (!editUsernameValue.trim()) {
      Alert.alert('Hata', 'Kullanıcı adı boş olamaz');
      return;
    }
    // Kullanıcı adı formatı kontrolü (sadece harf, rakam, alt çizgi)
    if (!/^[a-zA-Z0-9_]+$/.test(editUsernameValue.trim())) {
      Alert.alert('Hata', 'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir');
      return;
    }
    try {
      setProfileUpdateLoading(true);
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: editUsernameValue.trim() })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Güncelleme başarısız');
      setUser((prev: any) => prev ? { ...prev, username: editUsernameValue.trim() } : prev);
      setEditUsernameModal(false);
      Alert.alert('Başarılı', 'Kullanıcı adınız güncellendi!');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Kullanıcı adı güncellenemedi');
    } finally {
      setProfileUpdateLoading(false);
    }
  };

  const [loading, setLoading] = useState(true);
  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);
  // İptal edilmiş ama süresi dolmamış abonelik banner' için
  const [cancelledSubDaysLeft, setCancelledSubDaysLeft] = useState<number | null>(null);
  const [cancelledSubExpiresAt, setCancelledSubExpiresAt] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<string>('unknown');
  // Manuel Overpass Sync kaldırıldı
  const [backupInfo, setBackupInfo] = useState<{
    userAreasCount: number;
    favoritesCount: number;
  }>({ userAreasCount: 0, favoritesCount: 0 });
  const [backupLoading, setBackupLoading] = useState(false);
  const [fullSyncLoading, setFullSyncLoading] = useState(false);
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
  // Dinamik liste yüksekliği için sabitler
  const COMMUNITY_ITEM_HEIGHT = 56; // tahmini bir satır yüksekliği
  const MAX_VISIBLE_MEMBERS = 5;
  // Üye durum modalı
  const [statusModal, setStatusModal] = useState<{ open: boolean; member: any | null }>({ open: false, member: null });
  const statusOptions = [
    { label: 'Aktif', value: 'active', color: colors.success, icon: <CheckCircle size={16} color={colors.success} /> },
    { label: 'Onay Bekliyor', value: 'pending', color: colors.warning, icon: <Clock size={16} color={colors.warning} /> },
    { label: 'Reddedildi', value: 'rejected', color: colors.danger, icon: <XCircle size={16} color={colors.danger} /> },
  ];

  // Topluluk lideri veya üyesi ise üyeleri çek
  useEffect(() => {
    if (user && membership && (membership.role === 'leader' || membership.role === 'member') && user.community_id) {
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

  // Konum izinlerini yenile
  const refreshLocationPermissions = async () => {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      setLocationPermissionStatus(foreground.status);
      setLocationEnabled(foreground.status === 'granted');
      return { foreground: foreground.status };
    } catch (e) {
      console.error('[refreshLocationPermissions] Hata:', e);
      setLocationPermissionStatus('unknown');
      setLocationEnabled(false);
      return { foreground: 'unknown' };
    }
  };

  // Konum izni isteme
  const requestLocationPermissions = async () => {
    try {
      // Önce mevcut izin durumunu kontrol et
      const currentPermission = await Location.getForegroundPermissionsAsync();
      
      // Eğer izin daha önce reddedilmişse ve tekrar sorulamıyorsa, direkt ayarları aç
      if (currentPermission.status === 'denied' && !currentPermission.canAskAgain) {
        setTimeout(() => {
          Alert.alert(
            'Konum İzni Gerekli',
            'Konum izni daha önce reddedilmiş. Lütfen uygulama ayarlarından konum iznini aktif edin.',
            [
              { text: 'İptal', style: 'cancel' },
              {
                text: 'Ayarları Aç',
                onPress: () => {
                  if (Platform.OS === 'ios') {
                    Linking.openURL('app-settings:');
                  } else {
                    Linking.openSettings();
                  }
                }
              }
            ]
          );
        }, 100);
        return false;
      }
      
      // Foreground izni iste
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        setTimeout(() => {
          Alert.alert(
            'Konum İzni Gerekli',
            'Konum izni verilmedi. Lütfen uygulama ayarlarından konum iznini aktif edin.',
            [
              { text: 'İptal', style: 'cancel' },
              {
                text: 'Ayarları Aç',
                onPress: () => {
                  if (Platform.OS === 'ios') {
                    Linking.openURL('app-settings:');
                  } else {
                    Linking.openSettings();
                  }
                }
              }
            ]
          );
        }, 100);
        await refreshLocationPermissions();
        return false;
      }

      // Background izni istemi kaldırıldı
      // Sadece foreground izni yeterli
      setTimeout(() => {
        Alert.alert('Başarılı', 'Konum izni verildi!');
      }, 100);

      await refreshLocationPermissions();
      
      // Ana ekrandaki haritayı güncelle
      try {
        eventBus.emit('locationPermissionGranted', { fromProfile: true });
      } catch (eventError) {
        console.error('[Location Permission] EventBus hatası:', eventError);
      }
      
      return true;
    } catch (error) {
      console.error('[Location Permission] Hata:', error);
      await refreshLocationPermissions();
      Alert.alert('Hata', 'Konum izni istenemedi.');
      return false;
    }
  };
  // Manuel Overpass Sync kaldırıldı




      // Store'dan aylık fiyat çek (premium kart için)
  useEffect(() => {
    (async () => {
      try {
        const ready = await IAPManager.initIAP();
        if (ready) {
          const subs = await IAPManager.getSubscriptions();
          setMonthlyPrice(IAPManager.getPriceForPlan('monthly', subs));
        } else {
          setMonthlyPrice(IAPManager.getPriceForPlan('monthly', []));
        }
      } catch (e) {
        setMonthlyPrice(IAPManager.getPriceForPlan('monthly', []));
      }
    })();
  }, []);

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
        // Normalize user object and ensure `role` comes from users table (me.member.user or me.user or me.role) if available
        const resolvedUser = (function() {
          if (!me) return null;
          // Account-level user may be at me.member.user (membership include) or me.user or top-level me
          const accountUser = me?.member?.user ?? me?.user ?? null;
          // Merge so accountUser fields override top-level me when present, but keep other top-level flags (offline_enabled etc.)
          if (accountUser) {
            // offline_enabled'ı accountUser spread'i ezmemesi için açıkça koru:
            // me.offline_enabled veya accountUser.offline_enabled true ise erişim verilir.
            return {
              ...me,
              ...accountUser,
              role: accountUser.role ?? me.role,
              offline_enabled: !!(me.offline_enabled || accountUser.offline_enabled),
            };
          }
          return { ...me, role: me.role };
        })();
        setUser(resolvedUser);
        // İptal edilmiş ama süresi dolmamış abonelik: expiresAt + autoRenewing=false
        try {
          const subStatus = await IAPManager.checkSubscriptionStatus();
          if (
            subStatus?.isActive &&
            subStatus?.autoRenewing === false &&
            subStatus?.expiresAt
          ) {
            const msLeft = new Date(subStatus.expiresAt).getTime() - Date.now();
            const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            setCancelledSubDaysLeft(daysLeft);
            setCancelledSubExpiresAt(new Date(subStatus.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }));
          } else {
            setCancelledSubDaysLeft(null);
            setCancelledSubExpiresAt(null);
          }
        } catch (_) {}
        if (resolvedUser?.community_id && resolvedUser?.id) {
          const membershipData = await getUserMembershipRemote(resolvedUser.community_id, resolvedUser.id);
          if (membershipData) {
            setMembership({ role: membershipData.role, status: membershipData.status });
          }
          const cDetail = await getCommunityById(resolvedUser.community_id);
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
        const foreground = await Location.getForegroundPermissionsAsync();
        setLocationPermissionStatus(foreground.status);
        setLocationEnabled(foreground.status === 'granted');
      } catch (e) {
        console.error('[Profile useEffect] Permission okuma hatası:', e);
        setLocationPermissionStatus('unknown');
        setLocationEnabled(false);
      }
    })();
  }, [isConnected]);

  // subscription:statusUpdated event'ini dinle (index.tsx'ten gelen AppState / startup güncellemeleri)
  useEffect(() => {
    const handleSubStatusUpdated = (subStatus: any) => {
      if (
        subStatus?.isActive &&
        subStatus?.autoRenewing === false &&
        subStatus?.expiresAt
      ) {
        const msLeft = new Date(subStatus.expiresAt).getTime() - Date.now();
        const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
        setCancelledSubDaysLeft(daysLeft);
        setCancelledSubExpiresAt(new Date(subStatus.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }));
      } else {
        setCancelledSubDaysLeft(null);
        setCancelledSubExpiresAt(null);
      }
    };
    eventBus.on('subscription:statusUpdated', handleSubStatusUpdated);
    return () => { eventBus.off('subscription:statusUpdated', handleSubStatusUpdated); };
  }, []);

  // Guest kullanıcı ise sadece profil kartı göster
  const isGuest = user?.role === 'guest';
  // Sadece user rolünde, trial_user: true, ve premium değilse deneme süresi göster
  const isTrialUser = user?.role === 'user'
    && (user?.trial_user === true || user?.trial_user === 1 || user?.trial_user === 'true')
    && !user?.offline_enabled; // Premium aboneler trial expire'dan etkilenmez

  // Deneme süresi kalan gün hesabı
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

  // Deneme süresi dolduysa oturumu kapat (useEffect, JSX içinde değil burada)
  useEffect(() => {
    if (!trialExpired || !user) return;
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
  }, [trialExpired]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[profileCardStyles.profileCard, { backgroundColor: colors.surface }]}>
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
            {/* Edit and Remove buttons */}
            <View style={{ position: 'absolute', bottom: 0, right: 0, flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity
                onPress={handlePickProfilePhoto}
                style={[styles.avatarEditFab, { backgroundColor: colors.info }]}
                activeOpacity={0.8}
              >
                <Upload size={18} color="#fff" />
              </TouchableOpacity>
              {(user?.avatar_url || localAvatar) && (
                <TouchableOpacity
                  onPress={handleRemoveAvatar}
                  style={[styles.avatarEditFab, { backgroundColor: colors.danger }]}
                  activeOpacity={0.8}
                >
                  <X size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
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
              {/* İsim - düzenlenebilir */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[profileCardStyles.profileName, { color: colors.primary }]}>{user.name || 'Kullanıcı'}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditNameValue(user.name || '');
                    setEditNameModal(true);
                  }}
                  style={{ marginLeft: 8, padding: 6, backgroundColor: colors.surfaceVariant, borderRadius: 8 }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Edit2 size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
              {/* Kullanıcı adı - düzenlenebilir (misafirde sadece göster) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <Text style={[profileCardStyles.profileEmail, { color: colors.muted }]}>{user.username ? `@${user.username}` : '@kullaniciadi'}</Text>
                {!isGuest && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditUsernameValue(user.username || '');
                      setEditUsernameModal(true);
                    }}
                    style={{ marginLeft: 6, padding: 6, backgroundColor: colors.surfaceVariant, borderRadius: 8 }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Edit2 size={14} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[profileCardStyles.profileEmail, { color: colors.muted }]}>{user.email || ''}</Text>
              <View style={profileCardStyles.profileRoleRow}>
                <Shield size={16} color={colors.info} style={{ marginRight: 6 }} />
                <Text style={[profileCardStyles.profileRoleText, { color: colors.info }]}>
                  {user.role === 'admin' ? 'Yönetici'
                    : user.role === 'user' ? 'Kullanıcı'
                    : user.role === 'superadmin' ? 'Üst Yönetici'
                    : user.role === 'guest' ? 'Misafir'
                    : 'Bilinmiyor'}
                </Text>
              </View>
              {/* Deneme süresi kalan gün/bilgi satırı (sadece user rolünde trial_user: true ve premium değilse) */}
              {isTrialUser && user?.created_at && !trialExpired && (
                <View style={{ marginTop: 8, marginBottom: 2, backgroundColor: colors.warning + '20', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
                  <Text style={{ color: colors.warning, fontWeight: 'bold', fontSize: 14 }}>
                    Deneme süresi: {trialDaysLeft} gün kaldı
                  </Text>
                </View>
              )}
              {/* Guest ise kısıtlı erişim mesajı */}
              {isGuest && (
                <View style={{ marginTop: 8, marginBottom: 2, backgroundColor: colors.danger + '20', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
                  <Text style={{ color: colors.danger, fontWeight: 'bold', fontSize: 14 }}>
                    Kısıtlı erişim: Sadece temel özellikleri kullanabilirsiniz.
                  </Text>
                </View>
              )}
              {membership && (
                <View style={profileCardStyles.profileRoleRow}>
                  <UserCheck size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[profileCardStyles.profileRoleText, { color: colors.primary }] }>
                    {membership.role === 'leader' ? 'Topluluk Lideri'
                      : membership.role === 'member' ? 'Topluluk Üyesi'
                      : 'Bilinmiyor'}
                  </Text>
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                    marginLeft: 8,
                    backgroundColor: membership.status === 'active' ? colors.success + '20' 
                      : membership.status === 'pending' ? colors.warning + '20' 
                      : colors.danger + '20'
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
              <TouchableOpacity style={[profileCardStyles.profileLogoutBtn, { backgroundColor: colors.surfaceVariant }]} onPress={() => {
                Alert.alert('Çıkış', 'Çıkış yapmak istediğinize emin misiniz?', [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Çıkış Yap', style: 'destructive', onPress: () => setPendingLogout(true) }
                ]);
              }}>
                <Text style={[profileCardStyles.profileLogoutBtnText, { color: colors.danger }]}>Çıkış Yap</Text>
              </TouchableOpacity>
              {/* Delete Account Button */}
              <TouchableOpacity
                style={{ marginTop: 14, alignItems: 'center', paddingVertical: 4 }}
                disabled={isDeletingAccount}
                onPress={async () => {
                  // Aktif abonelik kontrolü
                  // Manuel olarak tanımlanan premium hesaplarda subscription_expired_at (expiresAt) null gelir.
                  // expiresAt null ise gerçek bir mağaza aboneliği yoktur — mağaza yönetim sayfasına yönlendirme yapılmaz.
                  let hasActiveAutoRenewingSub = false;
                  try {
                    const subStatus = await IAPManager.checkSubscriptionStatus();
                    hasActiveAutoRenewingSub = !!(
                      subStatus?.isActive &&
                      subStatus?.autoRenewing !== false &&
                      subStatus?.expiresAt != null
                    );
                  } catch (_) {}

                  const subscriptionWarning = hasActiveAutoRenewingSub
                    ? Platform.OS === 'ios'
                      ? '\n\n⚠️ Aktif bir aboneliğiniz var. Hesabınızı silmeden önce aboneliğinizi App Store üzerinden iptal etmeniz gerekir; aksi hâlde ücretlendirilmeye devam edersiniz.'
                      : '\n\n⚠️ Aktif bir aboneliğiniz var. Hesabınızı silmeden önce aboneliğinizi Google Play üzerinden iptal etmeniz gerekir; aksi hâlde ücretlendirilmeye devam edersiniz.'
                    : '';

                  const subscriptionButtons = hasActiveAutoRenewingSub
                    ? [
                        { text: 'İptal', style: 'cancel' as const },
                        {
                          text: Platform.OS === 'ios' ? 'Aboneliği Yönet (App Store)' : 'Aboneliği Yönet (Google Play)',
                          onPress: () => {
                            const url = Platform.OS === 'ios'
                              ? 'itms-apps://apps.apple.com/account/subscriptions'
                              : 'https://play.google.com/store/account/subscriptions';
                            Linking.openURL(url).catch(() =>
                              Alert.alert('Hata', 'Abonelik yönetim sayfası açılamadı.')
                            );
                          }
                        },
                        {
                          text: 'Yine de Devam Et',
                          style: 'destructive' as const,
                          onPress: () => confirmDelete(),
                        },
                      ]
                    : [
                        { text: 'İptal', style: 'cancel' as const },
                        { text: 'Evet, Sil', style: 'destructive' as const, onPress: () => confirmDelete() },
                      ];

                  const confirmDelete = () => {
                    Alert.alert(
                      'Son Onay',
                      'Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Onaylıyor musunuz?',
                      [
                        { text: 'İptal', style: 'cancel' },
                        {
                          text: 'Hesabımı Sil',
                          style: 'destructive',
                          onPress: async () => {
                            setIsDeletingAccount(true);
                            try {
                              await deleteAccount();
                              // Lokal SQLite cache'i temizle
                              try {
                                const db = require('../../lib/database').getDatabase();
                                await db.dropAllTables();
                              } catch (_) {}
                              // Tile cache temizle
                              try { await clearTileCache(); } catch (_) {}
                              // SecureStore anahtarlarını temizle
                              try {
                                await SecureStore.deleteItemAsync('doNotShowLocationPermissionModal');
                              } catch (_) {}
                              // LargeStorage (AsyncStorage) anahtarlarını temizle
                              try {
                                await removeLargeItemAsync('shownFriendRequestIds');
                              } catch (_) {}
                              // Token'ı sil ve login'e yönlendir
                              await removeToken();
                              router.replace('/(auth)/login' as any);
                            } catch (e: any) {
                              Alert.alert('Hata', e?.message || 'Hesap silinemedi. Lütfen tekrar deneyin.');
                            } finally {
                              setIsDeletingAccount(false);
                            }
                          }
                        }
                      ]
                    );
                  };

                  Alert.alert(
                    'Hesabı Sil',
                    `Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve tüm verileriniz silinecektir.${subscriptionWarning}`,
                    subscriptionButtons
                  );
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 13, textDecorationLine: 'underline' }}>
                  {isDeletingAccount ? 'Siliniyor...' : 'Hesabımı Sil'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
  </View>

  {/* Premium Feature Card - Premium olmayan kullanıcılar için */}
  {/* İptal edilmiş ama süresi dolmamış abonelik uyarısı */}
  {user?.offline_enabled && cancelledSubDaysLeft !== null && (
    <View style={{
      marginHorizontal: 16,
      marginTop: 16,
      backgroundColor: colors.warning + '10',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1.5,
      borderColor: colors.warning,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    }}>
      <Text style={{ fontSize: 28 }}>⏳</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.warning, marginBottom: 4 }}>
          {cancelledSubDaysLeft > 0
            ? `Premium hesabının bitmesine ${cancelledSubDaysLeft} gün kaldı.`
            : 'Premium erişiminiz bugün sona eriyor.'}
        </Text>
        <Text style={{ fontSize: 12, color: colors.warning }}>
          Aboneliğiniz yenilenmeyecek.{cancelledSubExpiresAt ? ` ${cancelledSubExpiresAt} tarihinde sona erecek.` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push('/premium' as any)}
        style={{
          backgroundColor: colors.warning,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 10,
        }}
        activeOpacity={0.8}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Premium Ol</Text>
      </TouchableOpacity>
    </View>
  )}

  {!user?.offline_enabled && (
    <TouchableOpacity 
      style={{
        marginHorizontal: 16,
        marginTop: 16,
        backgroundColor: colors.primaryLight,
        borderRadius: 16,
        padding: 20,
        borderWidth: 2,
        borderColor: colors.primary,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
      onPress={() => router.push('/premium' as any)}
      activeOpacity={0.8}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.warning + '30',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}>
          <Text style={{ fontSize: 24 }}>⭐</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.primary, marginBottom: 2 }}>
            Premium'a Yükseltin
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            Tüm özelliklerin kilidini açın
          </Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.primary, marginRight: 6 }}>✓</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Offline harita erişimi</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.primary, marginRight: 6 }}>✓</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Gelişmiş arama ve filtreleme</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.primary, marginRight: 6 }}>✓</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Tüm premium özelliklere erişim</Text>
        </View>
      </View>
      <View style={{
        marginTop: 16,
        backgroundColor: colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: 'center',
      }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>
          {monthlyPrice
            ? `Premium Ol - ${monthlyPrice}/ay'dan başlayan fiyatlarla`
            : 'Premium Ol - Fiyatlar yükleniyor...'}
        </Text>
      </View>
    </TouchableOpacity>
  )}

  {/* Guest ise diğer alanları gösterme */}
  {isGuest ? null : (
  <>
  {/* Arkadaşlarım Alanı - Kart Tasarımı */}
  <View style={[profileCardStyles.profileCard, { backgroundColor: colors.surface }]}>
           <View style={{ 
             flexDirection: 'row', 
             alignItems: 'center', 
             marginBottom: 12,
             borderBottomWidth: 1,
             borderBottomColor: colors.border,
             paddingBottom: 8
           }}>
             <User size={16} color={colors.primary} />
             <Text style={{ fontWeight: 'bold', fontSize: 16, marginLeft: 8, color: colors.primary }}>
               Arkadaşlarım
             </Text>
           </View>
           {friendError && <Text style={{ color: colors.danger, marginBottom: 8 }}>{friendError}</Text>}
           {friends.length === 0 ? (
             <Text style={{ color: colors.muted }}>Henüz arkadaşınız yok.</Text>
           ) : (
             <View style={{ width: '100%', height: Math.min(friends.length * FRIEND_ITEM_HEIGHT, MAX_VISIBLE_FRIENDS * FRIEND_ITEM_HEIGHT), borderRadius: 8, backgroundColor: colors.surfaceVariant, overflow: 'hidden' }}>
               <ScrollView nestedScrollEnabled={true} style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                 {friends.map((f, i) => (
                   <React.Fragment key={i}>
                   <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 0, backgroundColor: colors.surfaceVariant, borderRadius: 10, padding: 10 }}>
                 <View style={{ marginRight: 12 }}>
                   <FriendAvatar
                     avatar_url={f.avatar_url && f.avatar_url.trim() !== '' ? f.avatar_url : undefined}
                     name={f.name || f.username || 'Kullanıcı'}
                     size={48}
                   />
                 </View>
                 <View style={{ flex: 1, justifyContent: 'center' }}>
                   <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.primary }}>{f.name || f.username || 'Kullanıcı'}</Text>
                   {f.username ? (
                     <Text style={{ color: colors.muted, fontSize: 14 }}>{`@${f.username}`}</Text>
                   ) : null}
                   {f.email ? (
                     <Text style={{ color: colors.muted, fontSize: 14 }}>{f.email}</Text>
                   ) : null}
                 </View>
                 {/* Sağda, alt alta sadece ikonlu butonlar */}
                 <View style={{ flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                   <View style={{ marginBottom: 6 }}>
                     <View style={{ backgroundColor: colors.success + '20', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
                       <CheckCircle size={12} color={colors.success} />
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
                     <View style={{ backgroundColor: colors.danger + '20', borderRadius: 16, padding: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger }}>
                       <Trash size={12} color={colors.danger} />
                     </View>
                   </TouchableOpacity>
                 </View>
               </View>
                   {i < friends.length - 1 && (
                     <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 6, marginVertical: 4 }} />
                   )}
                   </React.Fragment>
             ))}
             </ScrollView>
             </View>
           )}
           {/* Gelen Arkadaşlık İstekleri Alanı - Kart içinde */}
           {friendRequests.length > 0 && (
             <View style={{ marginTop: 16, backgroundColor: colors.warning + '20', borderRadius: 10, padding: 12, width: '100%' }}>
               <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: colors.warning }}>Gelen Arkadaşlık İstekleri</Text>
               {friendRequestsError && <Text style={{ color: colors.danger, marginBottom: 8 }}>{friendRequestsError}</Text>}
               {friendRequestsLoading ? <ActivityIndicator /> : null}
               {friendRequests.map((req) => (
                 <View key={req.id} style={{ marginBottom: 8, backgroundColor: colors.surfaceVariant, borderRadius: 10, padding: 10 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <View style={{ marginRight: 12 }}>
                       <FriendAvatar avatar_url={req.avatar_url} name={req.name || req.username || 'Kullanıcı'} size={48} />
                     </View>
                     <View style={{ flex: 1, justifyContent: 'center' }}>
                       <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.primary }}>{req.name || req.username || 'Kullanıcı'}</Text>
                       {req.username ? (
                         <Text style={{ color: colors.muted, fontSize: 14 }}>{`@${req.username}`}</Text>
                       ) : null}
                       {req.email ? (
                         <Text style={{ color: colors.muted, fontSize: 14 }}>{req.email}</Text>
                       ) : null}
                       {req.tag ? (
                         <Text style={{ color: colors.warning, fontSize: 13 }}>{req.tag}</Text>
                       ) : null}
                     </View>
                   </View>
                   <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                     <TouchableOpacity onPress={() => respondFriendRequest(req.id, 'accepted')} style={{ backgroundColor: colors.success, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, marginRight: 10 }}>
                       <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Kabul Et</Text>
                     </TouchableOpacity>
                     <TouchableOpacity onPress={() => respondFriendRequest(req.id, 'rejected')} style={{ backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 }}>
                       <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Reddet</Text>
                     </TouchableOpacity>
                   </View>
                 </View>
               ))}
             </View>
           )}
          {/* Kullanıcı adı ile arama ve istek gönderme */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', marginBottom: 4, color: colors.primary }}>Arkadaş ekle</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1 }}>
                <TextInput 
                  placeholder="Kullanıcı adı ara..."
                  placeholderTextColor={colors.muted}
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
                        // Backend'den gelen veriyi frontend formatına map et ve kendini filtrele
                        const mapped = Array.isArray(data) ? data
                          .filter((u: any) => {
                            // isSelf flag'i varsa filtrele
                            if (u.isSelf === true || u.isSelf === 'true') return false;
                            return true;
                          })
                          .map((user: any) => {
                            console.log('[FRIEND SEARCH] Mapping user:', JSON.stringify(user, null, 2));
                            return {
                              id: user.userId || user.id,
                              username: user.username || '',
                              name: user.name || user.fullName || '',
                              tag: user.tag || '',
                              avatar_url: user.avatarUrl || user.image || user.avatar_url || ''
                            };
                          }) : [];
                        console.log('[FRIEND SEARCH] Mapped results:', JSON.stringify(mapped, null, 2));
                        // Arkadaş listesinde olmayan kullanıcıları filtrele
                        const filtered = mapped.filter(u => !friends.some(f => f.id === u.id));
                        console.log('[FRIEND SEARCH] Filtered results (excluding friends):', JSON.stringify(filtered, null, 2));
                        setSearchResults(filtered);
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
                  style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border, width: '100%', color: colors.text }}
                />
              </View>
              {/* Arama butonu kaldırıldı, autocomplete ile çalışıyor */}
            </View>
            {friendSearchLoading && <ActivityIndicator style={{ marginTop: 8 }} />}
            {/* Autocomplete dropdown */}
            {searchResults.length > 0 && friendSearch.trim().length >= 3 && (
              <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, maxHeight: 240 }}>
                {searchResults.map((u) => {
                  const isRequested = requestedUserIds.includes(u.id);
                  const displayName = u.name || u.username || 'Kullanıcı';
                  return (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => !isRequested && sendFriendRequest(u.id)}
                      disabled={isRequested}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceVariant, opacity: isRequested ? 0.6 : 1 }}
                    >
                      <View style={{ marginRight: 12 }}>
                        <FriendAvatar
                          avatar_url={u.avatar_url && u.avatar_url.trim() !== '' ? u.avatar_url : undefined}
                          name={displayName}
                          size={48}
                        />
                      </View>
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.primary, marginBottom: 2 }}>{displayName}</Text>
                        {u.username && (
                          <Text style={{ color: colors.muted, fontSize: 14 }}>{`@${u.username}`}</Text>
                        )}
                      </View>
                      <View style={{ marginLeft: 12, backgroundColor: isRequested ? colors.success + '80' : colors.success, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{isRequested ? 'Gönderildi' : 'Ekle'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
        <View style={[profileCardStyles.profileCard, { backgroundColor: colors.surface }]}>
          {loading ? (
            <ActivityIndicator />
          ) : user ? (
            <>
              {/* Kullanıcı Bilgileri ve Topluluk Bilgisi */}
              <View style={{ marginTop: 8, alignItems: 'center', width: '100%' }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.primary }}>{user.name || 'Kullanıcı'}</Text>
                <Text style={{ fontSize: 15, color: colors.muted, marginBottom: 8 }}>{user.email || ''}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                    <Shield size={16} color={colors.info} />
                  </View>
                  <Text style={{ fontSize: 14, color: colors.info, fontWeight: '600' }}>
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
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                        <UserCheck size={16} color={colors.primary} />
                      </View>
                      <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>
                        {membership.role === 'leader' ? 'Topluluk Lideri'
                          : membership.role === 'member' ? 'Topluluk Üyesi'
                          : 'Bilinmiyor'}
                      </Text>
                      <View style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 12,
                        marginLeft: 8,
                        backgroundColor: membership.status === 'active' ? colors.success + '20' 
                          : membership.status === 'pending' ? colors.warning + '20' 
                          : colors.danger + '20'
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
                        backgroundColor: colors.surfaceVariant,
                        borderRadius: 12,
                        padding: 12,
                        width: '100%',
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Building size={16} color={colors.primary} />
                          <Text style={{ fontSize: 15, fontWeight: 'bold', color: colors.primary, marginLeft: 8 }}>{communityDetail.name}</Text>
                        </View>
                        {/* Açıklama başlığın hemen altında */}
                        {communityDetail.description ? (
                          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8, marginTop: 2 }}>{communityDetail.description}</Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Eye size={14} color={colors.muted} />
                          <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>{communityDetail.visibility}</Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                  <View style={{ 
                    backgroundColor: colors.warning + '20',
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 16,
                    marginTop: 8,
                    marginBottom: 8
                  }}>
                    <Text style={{ fontSize: 13, color: colors.warning, fontWeight: '600' }}>
                      Topluluk üyeliğiniz yok
                    </Text>
                  </View>
                  {/* Topluluk arama ve başvuru alanı, sadece guest ve trial_user olmayanlar için */}
                  {!(isGuest || isTrialUser) && (
                  <View style={{ width: '100%', marginTop: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '500', marginBottom: 4, color: colors.info }}>Topluluğa Katıl</Text>
                    <TextInput
                      placeholder="Topluluk adı ara..."
                      placeholderTextColor={colors.muted}
                      value={communitySearch}
                      onChangeText={text => {
                        setCommunitySearch(text);
                        setCommunityError(null);
                      }}
                      style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border, width: '100%', color: colors.text }}
                    />
                    {loadingCommunities && <ActivityIndicator style={{ marginTop: 8 }} />}
                    {communityError && <Text style={{ color: colors.danger, marginTop: 4 }}>{communityError}</Text>}
                    {/* Autocomplete dropdown */}
                    {filteredCommunities.length > 0 && communitySearch.trim().length >= 2 && (
                      <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, maxHeight: 180 }}>
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
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceVariant, opacity: communityApplyLoading ? 0.6 : 1 }}
                          >
                            <UserCheck size={20} color={colors.info} style={{ marginRight: 10 }} />
                            <Text style={{ fontWeight: '600', fontSize: 16, color: colors.info, marginRight: 8 }}>{c.name}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.muted, fontSize: 13 }}>{c.description}</Text>
                            </View>
                            <View style={{ marginLeft: 12, backgroundColor: colors.success, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
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
                {/* Topluluk lideri veya üyesi ise üyeleri göster, admin yetkileri sadece liderde */}
                {membership && (membership.role === 'leader' || membership.role === 'member') && (
                  <View style={{ 
                    marginTop: 20, 
                    width: '100%', 
                    backgroundColor: colors.surfaceVariant, 
                    borderRadius: 12, 
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}>
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      marginBottom: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      paddingBottom: 8
                    }}>
                      <User size={16} color={colors.primary} />
                      <Text style={{ fontWeight: 'bold', fontSize: 16, marginLeft: 8, color: colors.primary }}>
                        Topluluk Üyeleri
                      </Text>
                    </View>
                    {membersLoading ? (
                      <ActivityIndicator color={colors.primary} style={{marginVertical: 20}} />
                    ) : communityMembers.length === 0 ? (
                      <Text style={{ fontSize: 14, color: colors.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
                        Üye bulunamadı.
                      </Text>
                    ) : (
                      <View style={{ height: Math.min(communityMembers.length * COMMUNITY_ITEM_HEIGHT, MAX_VISIBLE_MEMBERS * COMMUNITY_ITEM_HEIGHT), borderRadius: 8, backgroundColor: colors.surfaceVariant, overflow: 'hidden' }}>
                        <ScrollView nestedScrollEnabled={true} style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                          {communityMembers.map((member, memberIdx) => {
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
                        const memberAvatar = (member.user?.avatar_url && member.user.avatar_url.trim()) ? member.user.avatar_url :
                          (member.user?.dataValues?.avatar_url && member.user.dataValues.avatar_url.trim()) ? member.user.dataValues.avatar_url : undefined;
                        return (
                          <React.Fragment key={member.user_id}>
                          <View style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            marginBottom: 0, 
                            backgroundColor: colors.surfaceVariant, 
                            borderRadius: 10, 
                            padding: 10 
                          }}>
                            <View style={{ marginRight: 12 }}>
                              <FriendAvatar
                                avatar_url={memberAvatar}
                                name={memberName || memberUsername || 'Üye'}
                                size={36}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              {memberName && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                  <User size={13} color={colors.primary} style={{ marginRight: 4 }} />
                                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>{memberName}</Text>
                                </View>
                              )}
                              {memberUsername && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                  <Shield size={12} color={colors.muted} style={{ marginRight: 4 }} />
                                  <Text style={{ color: colors.muted, fontSize: 13 }}>{memberUsername}</Text>
                                </View>
                              )}
                              {memberEmail && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Mail size={12} color={colors.muted} style={{ marginRight: 4 }} />
                                  <Text style={{ color: colors.muted, fontSize: 13 }}>{memberEmail}</Text>
                                </View>
                              )}
                              {!(memberName || memberUsername || memberEmail) && (
                                <Text style={{ color: colors.muted, fontSize: 13, fontStyle: 'italic' }}>İsimsiz Üye</Text>
                              )}
                            </View>
                            {/* Durum badge ve seçim butonu: sadece lider/admin için, üye rolünde hiç gösterme */}
                            {(membership.role === 'leader') && (
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: statusOptions.find(opt => opt.value === member.status)?.color + '22', borderWidth: 1, borderColor: statusOptions.find(opt => opt.value === member.status)?.color || colors.border }}
                                onPress={() => setStatusModal({ open: true, member })}
                                activeOpacity={0.85}
                              >
                                {statusOptions.find(opt => opt.value === member.status)?.icon}
                                <Text style={{ marginLeft: 6, color: statusOptions.find(opt => opt.value === member.status)?.color, fontWeight: 'bold', fontSize: 13 }}>
                                  {statusOptions.find(opt => opt.value === member.status)?.label}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          {memberIdx < communityMembers.length - 1 && (
                            <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 6, marginVertical: 4 }} />
                          )}
                          </React.Fragment>
                        );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>
          ) : (
            <Text style={[styles.error, { color: colors.danger }]}>Kullanıcı bilgisi alınamadı</Text>
          )}
        </View>



        {/* App Info */}
        <View style={[styles.appInfoContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, backgroundColor: colors.surfaceVariant }]}>Uygulama</Text>
          
          <View style={[styles.infoRow, { borderBottomColor: colors.surfaceVariant }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Versiyon</Text>
            <Text style={[styles.infoValue, { color: colors.muted }]}>{Constants.expoConfig?.version || '1.x'}</Text>
          </View>

          {/* Uygulama Rehberi */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.primaryLight,
              borderRadius: 12,
              padding: 14,
              marginTop: 10,
              borderWidth: 1,
              borderColor: colors.primaryLight,
              gap: 12,
            }}
            onPress={() => router.push('/guide' as any)}
            activeOpacity={0.75}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primaryDark }}>Uygulama Rehberi</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Ana ekrandaki tüm özellikleri öğren</Text>
            </View>
            <ChevronRight size={18} color={colors.primary} />
          </TouchableOpacity>

          {user?.offline_enabled && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 14,
                marginTop: 12,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 12,
              }}
              disabled={fullSyncLoading}
              onPress={async () => {
                if (!isConnected) {
                  Alert.alert('Çevrimdışı', 'İnternet bağlantısı yok. Lütfen çevrimiçi iken tekrar deneyin.');
                  return;
                }
                try {
                  // Günlük limit kontrolü: son tetikleme SecureStore'da saklanır
                  const lastStr = await SecureStore.getItemAsync('lastManualFullSyncAt');
                  if (lastStr) {
                    const lastDate = new Date(lastStr);
                    const now = new Date();
                    const diff = now.getTime() - lastDate.getTime();
                    const dayMs = 24 * 60 * 60 * 1000;
                    if (diff < dayMs) {
                      const nextAllowed = new Date(lastDate.getTime() + dayMs);
                      Alert.alert(
                        'Sınır',
                        `Tam eşitlemeyi günde sadece bir kez başlatabilirsiniz. Son: ${lastDate.toLocaleString('tr-TR')}. Bir sonraki deneme: ${nextAllowed.toLocaleString('tr-TR')}`
                      );
                      return;
                    }
                  }

                  setFullSyncLoading(true);
                  // Kayıt: şimdi tetikleme zamanını sakla
                  await SecureStore.setItemAsync('lastManualFullSyncAt', new Date().toISOString());

                  // Harita ekranına geç ve orada ilk full sync davranışını tetikle
                  router.push('/' as any);
                  setTimeout(() => {
                    try { eventBus.emit('trigger:initialFullSync'); } catch (e) { console.warn('emit trigger:initialFullSync hata', e); }
                  }, 250);
                } catch (e: any) {
                  console.error('[Profile] trigger full sync error', e);
                  Alert.alert('Hata', e?.message || 'Eşitleme başlatılamadı');
                } finally {
                  setFullSyncLoading(false);
                }
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primaryDark }}>Tam Eşitlemeyi Başlat</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Kamp alanları senkronizasyonunda sorun yaşadıysanız, tekrar eşitleme yapabilirsiniz.</Text>
              </View>
              {fullSyncLoading ? <ActivityIndicator color={colors.primary} /> : <ChevronRight size={18} color={colors.primary} />}
            </TouchableOpacity>
          )}
        </View>

        {/* Development Tools */}
        <View style={[styles.menuContainer, { backgroundColor: colors.surface }]}>
          {/* Superadmin için sunucu eşleştirme butonu */}
          {user && user.role === 'superadmin' && (
            <TouchableOpacity
              style={[styles.backupButton, { backgroundColor: colors.primaryLight, borderColor: colors.primary, marginBottom: 12 }]}
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
                <RefreshCw size={20} color={colors.primary} />
                <View style={styles.backupButtonText}>
                  <Text style={[styles.backupButtonTitle, { color: colors.primary }]}>Sunucu Eşleştirme</Text>
                  <Text style={[styles.backupButtonSubtitle, { color: colors.muted }]}>Tüm sunucu kamp alanlarını lokal veritabanına kaydet</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          
          
          {/* Konum İzni Yönetimi - Tüm kullanıcılar için */}
          <View style={[styles.menuContainer, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, backgroundColor: colors.surfaceVariant }]}>Konum İzinleri</Text>
            
            <View style={{ backgroundColor: colors.surfaceVariant, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 }}>
              <View style={{ gap: 12 }}>
                {/* Mevcut Durum */}
                <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Mevcut Durum:</Text>
                  {/* Foreground ve Background başlıkları */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: user?.offline_enabled ? 4 : 0 }}>
                    <Text style={{ fontWeight: 'bold', color: colors.info, fontSize: 14 }}>Foreground:</Text>
                    <View style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: locationPermissionStatus === 'granted' ? colors.success : colors.danger
                    }} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                      {locationPermissionStatus === 'granted' ? '✅ İzin Verildi' : 
                       locationPermissionStatus === 'denied' ? '❌ İzin Reddedildi' : '⚠️ İzin Bekleniyor'}
                    </Text>
                  </View>
                  {/* Background durumu kaldırıldı - foreground izni yeterli */}
                </View>

                {/* Açıklama */}
                <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                  {user?.offline_enabled ? 
                    'Offline mod için konum izninin "Her zaman izin ver" olarak ayarlanması gerekmektedir.' :
                    'Kamp alanlarını haritada görebilmek ve size en yakın noktaları sunabilmek için konum izni gereklidir.'}
                </Text>

                {/* İşlem Butonları */}
                <View style={{ gap: 8 }}>
                  {locationPermissionStatus !== 'granted' && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: colors.info,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        alignItems: 'center'
                      }}
                      onPress={() => requestLocationPermissions()}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                        Konum İzni Ver
                      </Text>
                    </TouchableOpacity>
                  )}

                <TouchableOpacity
                  style={{
                    backgroundColor: colors.surface,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: colors.border
                  }}
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      Linking.openURL('app-settings:');
                    } else {
                      Linking.openSettings();
                    }
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Sistem Ayarlarını Aç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: colors.surface,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                  onPress={async () => {
                    const statuses = await refreshLocationPermissions();
                    Alert.alert(
                      'Konum İzni Durumu',
                      `Foreground: ${statuses.foreground}`,
                      [{ text: 'Tamam' }]
                    );
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 13 }}>🔄 Durumu Yenile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: colors.surface,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginTop: 8
                  }}
                  onPress={async () => {
                    await SecureStore.deleteItemAsync('doNotShowLocationPermissionModal');
                    Alert.alert(
                      'Başarılı',
                      'Konum izni bildirimi tekrar aktif edildi. Ana sayfaya döndüğünüzde modal açılacak.',
                      [{ text: 'Tamam' }]
                    );
                  }}
                >
                  <Text style={{ color: colors.info, fontSize: 13, fontWeight: '500' }}>🔔 Konum İzni Bildirimini Aktif Et</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

          

          {/* Offline Bölge İndirme (Sadece offline_enabled kullanıcılar için) */}
          {user && user.offline_enabled && (
            <View style={{ marginTop: 24, marginBottom: 16 }}>
              <OfflineRegionSelector user={user} />
            </View>
          )}

          {/* Cache Temizleme Butonu sadece offline_enabled kullanıcılar için */}
          {user && user.offline_enabled && (
            <TouchableOpacity
              style={[styles.backupButton, { backgroundColor: colors.warning + '20', borderColor: colors.warning, marginTop: 16 }]}
              onPress={async () => {
                try {
                  const stats = await getTileCacheStats();
                  const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
                  Alert.alert(
                    'Harita Cache Temizle',
                    `${stats.tileCount} tile (${sizeMB} MB) silinecek. Devam edilsin mi?`,
                    [
                      { text: 'İptal', style: 'cancel' },
                      {
                        text: 'Temizle',
                        style: 'destructive',
                        onPress: async () => {
                          await clearTileCache();
                          Alert.alert('Başarılı', 'Harita cache temizlendi!');
                        }
                      }
                    ]
                  );
                } catch (error) {
                  Alert.alert('Hata', 'Cache temizlenirken bir hata oluştu.');
                }
              }}
            >
              <View style={styles.backupButtonContent}>
                <Trash size={20} color={colors.warning} />
                <View style={styles.backupButtonText}>
                  <Text style={[styles.backupButtonTitle, { color: colors.warning }]}>Harita Cache Temizle</Text>
                  <Text style={[styles.backupButtonSubtitle, { color: colors.muted }]}>Offline harita tile'ları temizlenir</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          
          {/* Superadmin için veritabanı silme butonu */}
          {user && user.role === 'superadmin' && (
            <TouchableOpacity
              style={[styles.backupButton, { backgroundColor: colors.danger + '20', borderColor: colors.danger, marginTop: 16 }]}
              onPress={handleDeleteDatabase}
            >
              <View style={styles.backupButtonContent}>
                <XCircle size={20} color={colors.danger} />
                <View style={styles.backupButtonText}>
                  <Text style={[styles.backupButtonTitle, { color: colors.danger }]}>Veritabanını Sıfırla (Sil)</Text>
                  <Text style={[styles.backupButtonSubtitle, { color: colors.muted }]}>Tüm lokal veriler silinir. Geri alınamaz!</Text>
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
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, minWidth: 260, alignItems: 'center', elevation: 4 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 18, color: colors.info }}>Durum Seç</Text>
              {statusOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, marginBottom: 6, backgroundColor: statusModal.member?.status === opt.value ? opt.color + '22' : colors.surfaceVariant, borderWidth: statusModal.member?.status === opt.value ? 2 : 1, borderColor: statusModal.member?.status === opt.value ? opt.color : colors.border }}
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
                <Text style={{ color: colors.muted, fontWeight: 'bold' }}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* İsim Düzenleme Modalı */}
        <Modal
          visible={editNameModal}
          transparent
          animationType="slide"
          onRequestClose={() => setEditNameModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 16, color: colors.info }}>İsminizi Düzenleyin</Text>
              <TextInput
                value={editNameValue}
                onChangeText={setEditNameValue}
                placeholder="İsim Soyisim"
                style={{ backgroundColor: colors.surfaceVariant, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, color: colors.text }}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setEditNameModal(false)}
                  style={{ flex: 1, backgroundColor: colors.surfaceVariant, borderRadius: 8, padding: 12, alignItems: 'center' }}
                  disabled={profileUpdateLoading}
                >
                  <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 16 }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUpdateName}
                  style={{ flex: 1, backgroundColor: colors.info, borderRadius: 8, padding: 12, alignItems: 'center' }}
                  disabled={profileUpdateLoading}
                >
                  {profileUpdateLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Kullanıcı Adı Düzenleme Modalı */}
        <Modal
          visible={editUsernameModal}
          transparent
          animationType="slide"
          onRequestClose={() => setEditUsernameModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8, color: colors.info }}>Kullanıcı Adınızı Düzenleyin</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>Sadece harf, rakam ve alt çizgi kullanabilirsiniz</Text>
              <TextInput
                value={editUsernameValue}
                onChangeText={setEditUsernameValue}
                placeholder="kullaniciadi"
                autoCapitalize="none"
                style={{ backgroundColor: colors.surfaceVariant, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, color: colors.text }}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setEditUsernameModal(false)}
                  style={{ flex: 1, backgroundColor: colors.surfaceVariant, borderRadius: 8, padding: 12, alignItems: 'center' }}
                  disabled={profileUpdateLoading}
                >
                  <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 16 }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUpdateUsername}
                  style={{ flex: 1, backgroundColor: colors.info, borderRadius: 8, padding: 12, alignItems: 'center' }}
                  disabled={profileUpdateLoading}
                >
                  {profileUpdateLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
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
  profileHeader: { alignItems: 'center', padding: 24 },
  avatarWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
  },
  avatar: { width: 140, height: 140, borderRadius: 70 },
  avatarEditFab: {
    position: 'absolute',
    bottom: 8,
    right: 8,
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
  badgeSuccess: { },
  badgeWarning: { },
  badgeDanger: { },
  logoutChip: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 24 },
  logoutChipText: { color: '#fff', fontWeight: '600' },
  communityMini: { marginTop: 20, alignItems: 'center', maxWidth: 320 },
  communityName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  communityDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, textAlign: 'center' },
  errorAlt: { },
  name: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  email: { fontSize: 16, marginBottom: 8 },
  error: { marginBottom: 8 },
  statsContainer: {
    flexDirection: 'row',
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
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  menuContainer: {
    marginBottom: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 14,
  },
  appInfoContainer: {
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
  },
  infoLabel: {
    fontSize: 16,
  },
  infoValue: {
    fontSize: 16,
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  devButtonDisabled: {
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
    marginBottom: 2,
  },
  devButtonTitleDisabled: {
  },
  devButtonSubtitle: {
    fontSize: 14,
  },
  syncStatusContainer: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncStatusSuccess: {
  },
  syncStatusError: {
  },
  syncStatusText: {
    fontSize: 14,
    lineHeight: 20,
  },
  backupInfoContainer: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  backupInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 4,
  },
  backupStatLabel: {
    fontSize: 12,
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
  },
  importButton: {
  },
  shareButton: {
  },
  backupButtonDisabled: {
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
    marginBottom: 2,
  },
  importButtonTitle: {
  },
  shareButtonTitle: {
  },
  backupButtonTitleDisabled: {
  },
  backupButtonSubtitle: {
    fontSize: 14,
  },
  spinning: {
    // Placeholder for potential Animated rotation
  },
});

// Modern tasarımda kullanılan kart stiller (runtime'da colors.* ile override edilir)
const profileCardStyles = StyleSheet.create({
  profileCard: {
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
  profileName: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  profileEmail: { fontSize: 15, marginBottom: 8 },
  profileRoleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  profileRoleText: { fontSize: 14, fontWeight: '600' },
  profileLogoutBtn: {
    marginTop: 18,
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
  profileLogoutBtnText: { fontWeight: '700', fontSize: 15 },
});