

import { syncAll } from '@/lib/syncManager';
import { campingTypes, getCampingTypeLabel, getCampingTypeIcon, getCampingAreaBgColor } from '@/lib/categories';
import { TYPE_COLORS } from '../app/icons/svgIcons';
import { SvgXml } from 'react-native-svg';

import { uploadCampgroundImage } from '@/lib/campgroundImageApi';
import { useState, useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from './ThemeProvider';
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
function FriendAvatar({ avatar, name }: { avatar?: string; name: string }) {
  const { colors } = useTheme();
  return avatar ? (
    <Image source={{ uri: avatar }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: colors.border }} />
  ) : (
    <View style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.muted, fontWeight: 'bold', fontSize: 18 }}>{(name && name.length > 0) ? name[0].toUpperCase() : '?'}</Text>
    </View>
  );
}

import { API_URL } from '@/lib/config';
import { setLargeItemAsync, getLargeItemAsync } from '@/lib/largeStorage';

// Arkadaş listesini fetch eden yardımcı fonksiyon (user_id ile)
import { getToken } from '@/lib/auth';
async function fetchFriendsList(userId: string | number | undefined): Promise<Friend[]> {
  if (!userId) {
    console.log('[fetchFriendsList] userId yok, fetch yapılmayacak.');
    return [];
  }
  try {
    // Token'ı getToken ile oku
    const token = await getToken();
    if (!token) {
      console.error('[fetchFriendsList] Token yok, fetch yapılamaz.');
      throw new Error('Oturum bulunamadı (token eksik)');
    }
    const res = await fetch(`${API_URL}/friends?user_id=${userId}`, {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('[fetchFriendsList] status:', res.status);
    if (!res.ok) {
      const text = await res.text();
      console.error('[fetchFriendsList] Response not ok:', res.status, text);
      throw new Error('Arkadaşlar yüklenemedi');
    }
    const data = await res.json();
    console.log('[fetchFriendsList] data:', data);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[fetchFriendsList] Hata:', err);
    throw err;
  }
}
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { X, Save, Camera, Trash2, ChevronUp, ChevronDown } from 'lucide-react-native';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { optimizeImageForWeb } from '@/lib/imageOptimizer';
import { getDatabase, CampingArea } from '@/lib/database';
import * as SecureStore from 'expo-secure-store';
import { updateCampingAreaOnServer, sanitizeCampingAreaData } from '@/lib/campingAreaApi';
import { getMe } from '@/lib/userCommunityApi';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import AmenitySvgIcon from './AmenitySvgIcon';

interface EditCampingAreaModalProps {
  visible: boolean;
  onClose: () => void;
  campingArea: CampingArea | null;
  onSuccess?: () => void;
  currentUserId?: string | number;
}



const availableAmenities = [
  { id: 'tuvalet', label: 'Tuvalet', icon: '🚻' },
  { id: 'duş', label: 'Duş', icon: '🚿' },
  { id: 'içme_suyu', label: 'İçme Suyu', icon: '💧' },
  { id: 'elektrik', label: 'Elektrik', icon: '⚡' },
  { id: 'wifi', label: 'WiFi', icon: '📶' },
  { id: 'market', label: 'Market', icon: '🏪' },
  { id: 'restoran', label: 'Restoran', icon: '🍽️' },
  { id: 'otopark', label: 'Otopark', icon: '🅿️' },
  { id: 'piknik_masası', label: 'Piknik Masası', icon: '🪑' },
  { id: 'barbekü', label: 'Barbekü', icon: '🔥' },
  { id: 'ateş_yeri', label: 'Ateş Yeri', icon: '🔥' },
];

const priceRanges = [
  { id: 'free', label: 'Ücretsiz' },
  { id: 'budget', label: 'Ekonomik (0-500₺)' },
  { id: 'mid', label: 'Orta (500-1500₺)' },
  { id: 'premium', label: 'Premium (1500₺+)' },
];

export default function EditCampingAreaModal({ visible, onClose, campingArea, onSuccess, currentUserId }: EditCampingAreaModalProps) {
  const { colors } = useTheme();
  const isConnected = useNetworkStatus();
  // Hazır saat dilimi şablonları
  const timeOptions = [
    { label: 'Kapalı', value: JSON.stringify({ open: '', close: '' }) },
    { label: '24 Saat Açık (00:00 - 23:59)', value: JSON.stringify({ open: '00:00', close: '23:59' }) },
    { label: '08:00 - 22:00', value: JSON.stringify({ open: '08:00', close: '22:00' }) },
    { label: '09:00 - 23:00', value: JSON.stringify({ open: '09:00', close: '23:00' }) },
    { label: '10:00 - 20:00', value: JSON.stringify({ open: '10:00', close: '20:00' }) },
  ];

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: campingTypes[0]?.id || 'campground',
    amenities: [] as string[],
    website: '',
    phone: '',
    opening_hours: {
      weekday: { open: '', close: '' },
      weekend: { open: '', close: '' },
    },
    capacity: '',
    fee: false,
    price_range: '',
    contact_email: '',
    booking_url: '',
    facilities: [] as string[],
    accessibility: [] as string[],
    images: [] as string[],
    photo_links: [] as string[],
    visibility: 'private',
    friends: [] as string[],
  });

  const [loading, setLoading] = useState(false);
  const [imagePickerLoading, setImagePickerLoading] = useState(false);
  const [userCommunityId, setUserCommunityId] = useState<number | undefined>(undefined);
  // Arkadaş seçimi için
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  // Arkadaş listesi için yüksekliği hesaplamak üzere sabitler
  const FRIEND_ITEM_HEIGHT = 56; // yaklaşık satır yüksekliği (avatar + paddings)
  const MAX_VISIBLE_FRIENDS = 5;

  // Arkadaş listesini yükle.
  // ÖNEMLI: İki ayrı effect yerine tek bir effect kullanılıyor.
  // Sebep: [campingArea, visible] effect formData'yı async günceller. Eğer friends fetch
  // sadece formData.visibility'e bağlıysa, formData henüz 'private' durumundayken erken
  // dönülüyor ve friends hiç yüklenmiyor (waterfall race condition).
  // Çözüm: campingArea.visibility (anlık kayıt değeri) veya formData.visibility 'friends'
  // ise fetch yap. Modal kapandığında listeyi sıfırla.
  useEffect(() => {
    if (!visible) {
      // Modal kapanınca sıfırla — sonraki açılışta stale veri gösterilmesin
      setAllFriends([]);
      setFriendsError(null);
      return;
    }
    // campingArea'dan gelen değeri öncelikli kullan (formData henüz güncel olmayabilir)
    const effectiveVisibility =
      (campingArea as any)?.visibility === 'friends' || formData.visibility === 'friends';
    if (!effectiveVisibility) {
      setAllFriends([]);
      setFriendsError(null);
      return;
    }
    if (!currentUserId) {
      setFriendsError('Kullanıcı oturumu bulunamadı.');
      setAllFriends([]);
      setLoadingFriends(false);
      return;
    }
    let cancelled = false;
    setLoadingFriends(true);
    setFriendsError(null);
    fetchFriendsList(currentUserId)
      .then(list => { if (!cancelled) setAllFriends(list); })
      .catch(e => { if (!cancelled) setFriendsError(e.message || 'Arkadaşlar yüklenemedi'); })
      .finally(() => { if (!cancelled) setLoadingFriends(false); });
    return () => { cancelled = true; };
  }, [visible, campingArea, formData.visibility, currentUserId]);

  // Modal açıldığında user community_id'sini fetch et
  useEffect(() => {
    if (!visible) return;
    const fetchUserCommunityId = async () => {
      try {
        const user = await getMe();
        setUserCommunityId(user?.community_id);
      } catch (e) {
        console.warn('[useEffect] User community_id alınamadı:', e);
        setUserCommunityId(undefined);
      }
    };
    fetchUserCommunityId();
  }, [visible]);

useEffect(() => {
  if (campingArea && visible) {
    // opening_hours alanını nesneye dönüştür
    let opening_hours = { weekday: { open: '', close: '' }, weekend: { open: '', close: '' } };
    console.log('[EditModal][DEBUG] Raw opening_hours from campingArea:', JSON.stringify(campingArea.opening_hours), typeof campingArea.opening_hours);
    
    try {
      if (typeof campingArea.opening_hours === 'string') {
        const trimmed = campingArea.opening_hours.trim();
        console.log('[EditModal][DEBUG] Trimmed string:', trimmed);
        
        if (trimmed.length > 0) {
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              // Önce düzgün JSON formatında mı deneyelim
              opening_hours = JSON.parse(trimmed);
              console.log('[EditModal][DEBUG] Successfully parsed opening_hours from string:', opening_hours);
            } catch (parseErr) {
              console.warn('[EditModal][DEBUG] Standard JSON parse failed, trying custom parser...');
              // Eğer Java/Kotlin benzeri format ise (örn: {weekday={open=10:00, close=20:00}})
              // Manuel parse et
              try {
                const weekdayMatch = trimmed.match(/weekday=\{([^}]+)\}/);
                const weekendMatch = trimmed.match(/weekend=\{([^}]+)\}/);
                
                if (weekdayMatch && weekendMatch) {
                  const parseTimeObj = (str: string) => {
                    const openMatch = str.match(/open=([^,\s]+)/);
                    const closeMatch = str.match(/close=([^,\s]+)/);
                    return {
                      open: openMatch ? openMatch[1] : '',
                      close: closeMatch ? closeMatch[1] : ''
                    };
                  };
                  
                  opening_hours = {
                    weekday: parseTimeObj(weekdayMatch[1]),
                    weekend: parseTimeObj(weekendMatch[1])
                  };
                  console.log('[EditModal][DEBUG] Successfully parsed with regex:', opening_hours);
                } else {
                  console.error('[EditModal][DEBUG] Could not match weekday/weekend pattern');
                }
              } catch (convertErr) {
                console.error('[EditModal][DEBUG] Custom parse also failed:', convertErr);
                console.error('[EditModal][DEBUG] Failed to parse string:', trimmed);
              }
            }
          } else {
            console.warn('[EditModal][DEBUG] String does not start with { or [, using default:', trimmed);
          }
        }
      } else if (typeof campingArea.opening_hours === 'object' && campingArea.opening_hours !== null) {
        // Zaten object ise direkt kullan
        opening_hours = campingArea.opening_hours as any;
        console.log('[EditModal][DEBUG] Using opening_hours as object:', opening_hours);
      } else {
        console.log('[EditModal][DEBUG] opening_hours is neither string nor object, using default');
      }
    } catch (e) {
      console.error('[EditModal][DEBUG] Error in opening_hours processing:', e);
    }
    console.log('[EditModal][DEBUG] Final opening_hours:', JSON.stringify(opening_hours));
    // friend_user_ids'yi friends olarak yükle
    let friendsList: string[] = [];
    if ((campingArea as any).friend_user_ids) {
      const friendUserIds = (campingArea as any).friend_user_ids;
      if (Array.isArray(friendUserIds)) {
        friendsList = friendUserIds.map(String);
      } else if (typeof friendUserIds === 'string') {
        try {
          const parsed = JSON.parse(friendUserIds);
          friendsList = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          friendsList = [];
        }
      }
    } else if (Array.isArray((campingArea as any).friends)) {
      friendsList = (campingArea as any).friends.map((f: any) =>
        typeof f === 'object' && f !== null && f.user_id !== undefined
          ? String(f.user_id)
          : String(f)
      );
    }

    // type alanını belirleme: önce campingArea.type, sonra tags.type kontrol et
    let campingType = campingArea.type || '';
    if (!campingType && (campingArea as any).tags && typeof (campingArea as any).tags === 'object') {
      campingType = (campingArea as any).tags.type || '';
    }
    if (!campingType && (campingArea as any).tags && typeof (campingArea as any).tags === 'string') {
      try {
        const parsedTags = JSON.parse((campingArea as any).tags);
        campingType = parsedTags.type || '';
      } catch {}
    }
    console.log('[EditModal][DEBUG] campingArea.type:', campingArea.type);
    console.log('[EditModal][DEBUG] campingArea.tags:', (campingArea as any).tags);
    console.log('[EditModal][DEBUG] Final campingType:', campingType);

    setFormData(prev => ({
      ...prev,
      name: campingArea.name || '',
      description: campingArea.description || '',
      // type alanı: kayıttaki değer varsa ve campingTypes dizisinde varsa onunla aç
      type: (campingType && campingTypes.some(t => t.id === campingType)
        ? campingType
        : campingTypes[0]?.id || 'campground'),
      amenities: Array.isArray(campingArea.amenities) ? campingArea.amenities : [],
      website: campingArea.website || '',
      phone: campingArea.phone || '',
      opening_hours,
      capacity: campingArea.capacity?.toString() || '',
      fee: campingArea.fee || false,
      price_range: campingArea.price_range || '',
      contact_email: campingArea.contact_email || '',
      booking_url: campingArea.booking_url || '',
      facilities: Array.isArray(campingArea.facilities) ? campingArea.facilities : [],
      accessibility: Array.isArray(campingArea.accessibility) ? campingArea.accessibility : [],
      images: Array.isArray(campingArea.images) ? campingArea.images : [],
      photo_links: Array.isArray((campingArea as any).photo_links) ? (campingArea as any).photo_links : [],
      // Geçerli bir değer yoksa (null, undefined, boş string) 'private' kullan
      visibility: (['public', 'private', 'community', 'friends'].includes((campingArea as any).visibility)
        ? (campingArea as any).visibility
        : 'private'),
      friends: friendsList,
    }));
  }
}, [campingArea, visible]);

  const toggleAmenity = (amenityId: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenityId)
        ? prev.amenities.filter(id => id !== amenityId)
        : [...prev.amenities, amenityId]
    }));
  };

  // Yeni: Sadece formData'ya local olarak ekle, sync işlemi merkezi yöneticide yapılacak
  // Galeriden fotoğraf seçme
  const pickImage = async () => {
    try {
      setImagePickerLoading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
        preferSystemPhotoPicker: true,
      } as unknown as ImagePicker.ImagePickerOptions);
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const optimizedUris: string[] = [];
        for (const asset of result.assets) {
          if (!asset.uri) continue;
          try {
            const response = await fetch(asset.uri);
            if (response.status === 200 || response.ok) {
              const optimizedUri = await optimizeImageForWeb(asset.uri);
              optimizedUris.push(optimizedUri);
            }
          } catch {
            // Erişilemeyen fotoğrafı atla
          }
        }
        if (optimizedUris.length === 0) {
          Alert.alert('Yetki Hatası', 'Seçtiğiniz fotoğraflara erişilemiyor. Farklı fotoğraflar deneyin.');
          return;
        }
        setFormData(prev => {
          const combined = [...optimizedUris, ...prev.images];
          return { ...prev, images: combined.slice(0, 5) }; // Max 5 images
        });
      } else {
        // Kullanıcı iptal etti veya geçersiz sonuç
        return;
      }
    } catch (error) {
      Alert.alert('Hata', 'Fotoğraf seçilirken bir hata oluştu.');
    } finally {
      setImagePickerLoading(false);
    }
  };

  // Kamera ile fotoğraf çekme
  const takePhoto = async () => {
    try {
      setImagePickerLoading(true);
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('İzin Gerekli', 'Kamera ile fotoğraf çekmek için izin gereklidir.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
        const imageUri = result.assets[0].uri;
        // Fotoğraf çekildiğinde genellikle erişim sorunu olmaz, yine de kontrol ekleyelim
        try {
          const response = await fetch(imageUri);
          if (response.status === 200 || response.ok) {
            const optimizedUri = await optimizeImageForWeb(imageUri);
            setFormData(prev => ({
              ...prev,
              images: [optimizedUri, ...prev.images.slice(0, 4)] // Max 5 images
            }));
          } else {
            Alert.alert('Yetki Hatası', 'Çektiğiniz fotoğrafa erişilemiyor. Lütfen farklı bir fotoğraf deneyin.');
            return;
          }
        } catch (err) {
          Alert.alert('Yetki Hatası', 'Çektiğiniz fotoğrafa erişilemiyor veya yetki kısıtlaması var. Farklı bir fotoğraf deneyin.');
          return;
        }
      } else {
        // Kullanıcı iptal etti veya geçersiz sonuç
        return;
      }
    } catch (error) {
      Alert.alert('Hata', 'Kamera ile fotoğraf çekilirken bir hata oluştu.');
    } finally {
      setImagePickerLoading(false);
    }
  };

  const removeImage = async (index: number) => {
    setFormData(prev => {
      // Sadece ilgili index'teki görseli kaldır
      const newImages = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images: newImages
      };
    });
    // DB'de de güncelle (görsel silindiğinde local DB'deki images dizisinden de çıkar)
    if (campingArea && campingArea.id) {
      try {
        const db = getDatabase();
        let area = await db.getCampingAreaById(campingArea.id);
        if (area) {
          let imagesArr: any[] = [];
          try {
            imagesArr = Array.isArray(area.images) ? area.images : JSON.parse(area.images);
          } catch { imagesArr = []; }
          imagesArr = imagesArr.filter((_: any, i: number) => i !== index);
          await db.insertOrUpdateCampingArea({ ...area, images: imagesArr });
        }
      } catch (e) {
        console.warn('[removeImage] DB güncellenemedi:', e);
      }
    }
  };

// Güncel arkadaş listesini parametre olarak alabilen handleSubmit
  const handleSubmit = async (overrideFriends?: string[]) => {
    if (loading || imagePickerLoading) return;
    console.log('[DEBUG][HANDLE_SUBMIT] tetiklendi');
    setLoading(true);
    const friendsToUse = overrideFriends ?? formData.friends;

    try {
      let ownerId: number | undefined = undefined;
      if (campingArea?.owner_id) {
        ownerId = typeof campingArea.owner_id === 'number' ? campingArea.owner_id : Number(campingArea.owner_id) || undefined;
      }
      if (!ownerId) {
        try {
          const user = await getMe();
          ownerId = typeof user?.id === 'number' ? user.id : Number(user?.id) || undefined;
        } catch (e) {
          // getMe başarısızsa localUser'dan dene
          try {
            const { getLargeItemAsync } = await import('@/lib/largeStorage');
            const localUserStr = await getLargeItemAsync('localUser');
            if (localUserStr) {
              const localUser = JSON.parse(localUserStr);
              ownerId = typeof localUser?.id === 'number' ? localUser.id : Number(localUser?.id) || undefined;
              console.log('[EditCampingAreaModal] [OFFLINE] localUser.id ile ownerId atandı:', ownerId);
            } else {
              console.log('[EditCampingAreaModal] [OFFLINE] localUser bulunamadı. ownerId atanamadı.');
            }
          } catch (err) {
            console.log('[EditCampingAreaModal] [OFFLINE] localUser okunamadı:', err);
          }
        }
      }


      // Görselleri: file:// ile başlayanları S3'e yükle, diğerlerini aynen bırak
      const openingHoursForDb = typeof formData.opening_hours === 'string'
        ? formData.opening_hours
        : JSON.stringify(formData.opening_hours);

      let allImages: string[] = Array.isArray(formData.images) ? [...formData.images] : [];
      allImages = allImages.slice(0, 5);
      if (!isConnected && allImages.some(img => img && img.startsWith('file://'))) {
        const pendingImagesStr = await getLargeItemAsync('pendingImages');
        let pendingImages = pendingImagesStr ? JSON.parse(pendingImagesStr) : [];
        const newPending = allImages
          .filter(img => img && img.startsWith('file://'))
          .map(img => ({ local_uri: img, campingAreaId: campingArea?.id || null }));
        pendingImages = [...pendingImages, ...newPending];
        await setLargeItemAsync('pendingImages', JSON.stringify(pendingImages));
      } else if (isConnected) {
        // S3 upload işlemi (online)
        for (let i = 0; i < allImages.length; i++) {
          const img = allImages[i];
          if (img && typeof img === 'string' && img.startsWith('file://')) {
            try {
              const user = await getMe();
              const userIdNum = user?.id ? Number(user.id) : 0;
              const uploadResult = await uploadCampgroundImage({
                campground_id: campingArea?.id || 0,
                local_uri: img,
                image_id: `edit_${Date.now()}_${i}`,
                uploaded_by: userIdNum,
                created_by: userIdNum,
              });
              if (uploadResult.image_url) {
                allImages[i] = uploadResult.image_url;
              }
            } catch (e) {
              // Hata olursa local URI bırakılır
            }
          }
        }
      }

      // Eğer görünürlük 'friends' seçili ama paylaşılacak kimse yoksa,
      // kaydedilen görünürlüğü 'private' (Sadece Ben) yap.
      const finalVisibility = (formData.visibility === 'friends' && (!friendsToUse || friendsToUse.length === 0))
        ? 'private'
        : formData.visibility;

      // community_id'yi belirle: visibility 'community' ise kullanıcının community_id'si
      let communityIdValue: number | undefined = undefined;
      if (finalVisibility === 'community') {
        communityIdValue = userCommunityId;
        if (!communityIdValue) {
          console.warn('[handleSubmit] community_id eksik, visibility community seçilmiş ama kullanıcının topluluğu yok!');
        }
      }

      const localId = (campingArea as any).id;
      const resolvedOwnerId = ownerId || (campingArea as any).owner_id;
      // source_id DB'den string "0" veya number 0 gelebilir — Number() ile normalize et
      const sourceId = Number((campingArea as any).source_id);
      // external_id öncelik sırası:
      // 1. DB'de kayıtlı proper external_id (sayısal olmayan, örn. "user_5_34")
      // 2. source_id===0 olan kullanıcı alanları için user_{ownerId}_{localId} hesapla
      //    (localId artık sunucu ID'si olabilir — sync sonrası güncellenir)
      // 3. Diğer durumlar için DB'deki ham external_id (sayısal olsa bile)
      // NOT: Bazı eski kayıtlarda external_id yalnızca sunucunun sayısal ID'si olarak
      //      saklanmış olabilir ("2081" gibi). Bu geçerli bir external_id formatı değil;
      //      source_id===0 alanlarda sunucu user_{ownerId}_{id} formatı bekler.
      const savedExternalId = (campingArea as any).external_id;
      const isProperExternalId = savedExternalId &&
        typeof savedExternalId === 'string' &&
        isNaN(Number(savedExternalId));
      const resolvedExternalId =
        isProperExternalId
          ? savedExternalId
          : (sourceId === 0 && resolvedOwnerId && localId
              ? `user_${resolvedOwnerId}_${localId}`
              : savedExternalId);

      // API'ya gönderilecek veri (tipler uyumlu)
      const rawApiUpdateData = {
        id: localId,
        name: formData.name,
        latitude: (campingArea as any).latitude,
        longitude: (campingArea as any).longitude,
        type: formData.type,
        amenities: formData.amenities,
        tags: { type: formData.type },
        description: formData.description,
        website: formData.website,
        phone: formData.phone,
        opening_hours: openingHoursForDb,
        capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        fee: formData.fee,
        images: allImages,
        photo_links: allImages,
        rating: campingArea.rating,
        review_count: campingArea.review_count,
        price_range: formData.price_range,
        facilities: formData.facilities,
        accessibility: formData.accessibility,
        booking_url: formData.booking_url,
        contact_email: formData.contact_email,
        social_media: campingArea.social_media ?? {},
        status: 'active',
        visibility: finalVisibility,
        community_id: communityIdValue,
        friends: friendsToUse,
        friend_user_ids: friendsToUse,
        external_id: resolvedExternalId,
        owner_id: String(resolvedOwnerId),
        source_id: sourceId,
      };
      const apiUpdateData = sanitizeCampingAreaData(rawApiUpdateData);

      const localUpdateData = {
        id: (campingArea as any).id,
        name: formData.name,
        latitude: (campingArea as any).latitude,
        longitude: (campingArea as any).longitude,
        type: formData.type,
        amenities: formData.amenities,
        tags: { type: formData.type },
        description: formData.description,
        website: formData.website,
        phone: formData.phone,
        opening_hours: openingHoursForDb,
        capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        fee: formData.fee,
        images: allImages,
        photo_links: allImages,
        rating: campingArea.rating,
        review_count: campingArea.review_count,
        price_range: formData.price_range,
        facilities: formData.facilities,
        accessibility: formData.accessibility,
        booking_url: formData.booking_url,
        contact_email: formData.contact_email,
        social_media: campingArea.social_media,
        status: 'active',
        visibility: finalVisibility,
        community_id: communityIdValue,
        friends: friendsToUse,
        friend_user_ids: friendsToUse,
        // Lokal DB güncellemesinde DB'de saklı gerçek external_id kullanılmalı.
        // resolvedExternalId sunucu senkronizasyonu için user_X_Y formatındadır;
        // bu format DB'deki kayıtla eşleşmediğinden yanlışlıkla yeni kayıt oluşur.
        external_id: (campingArea as any).external_id ?? resolvedExternalId,
        uuid: (campingArea as any).uuid,
        owner_id: String(resolvedOwnerId),
        owner_username: (campingArea as any).owner_username ?? '',
        source_id: String(sourceId),
      };

      await getDatabase().insertOrUpdateCampingArea(localUpdateData);

      // Offline-first: pending_changes tablosuna ekle veya doğrudan sunucuya gönder
      if (!isConnected) {
        await getDatabase().insertPendingChange('update', String(localUpdateData.id), apiUpdateData);
        Alert.alert('Bilgi', 'Güncellemeniz cihazda kaydedildi. İnternet bağlantısı sağlandığında sunucuya gönderilecek.', [
          {
            text: 'Tamam',
            onPress: async () => {
              try {
                await syncAll({ userId: ownerId });
              } catch (e) {
                // ignore
              }
              if (onSuccess) onSuccess();
              onClose();
            }
          }
        ]);
      } else {
        try {
          await updateCampingAreaOnServer(apiUpdateData.external_id, apiUpdateData);
          Alert.alert('Başarılı', 'Kamp alanı başarıyla güncellendi.', [
            {
              text: 'Tamam',
              onPress: () => {
                if (onSuccess) onSuccess();
                onClose();
              }
            }
          ]);
        } catch (e: any) {
          console.warn('[EditCampingAreaModal] update failed, falling back to pending:', e);
          const errMsg = e && e.message ? e.message : String(e);
          if (errMsg.includes('Kamp alanı bulunamadı')) {
            try {
              await getDatabase().insertPendingChange('update', String(localUpdateData.id), apiUpdateData);
              Alert.alert('Bilgi', 'Kamp alanı sunucuda bulunamadı — değişiklik cihazda pending olarak saklandı.', [
                {
                  text: 'Tamam',
                  onPress: () => {
                    if (onSuccess) onSuccess();
                    onClose();
                  }
                }
              ]);
            } catch (pdErr) {
              console.error('[EditCampingAreaModal] pending fallback failed:', pdErr);
              Alert.alert('Hata', 'Güncelleme yapılamadı ve pending olarak kaydedilemedi.');
            }
          } else {
            console.error('[EditCampingAreaModal] update error:', e);
            Alert.alert('Hata', 'Kamp alanı güncellenirken sunucu hatası oluştu.');
          }
        }
      }
    } catch (error) {
      console.error('Error updating camping area:', error);
      Alert.alert('Hata', 'Kamp alanı güncellenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  if (!campingArea) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Başlık ve Kapat */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Kamp Alanını Düzenle</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
          {/* Temel Bilgiler */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Temel Bilgiler</Text>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Alan Adı *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.name}
                onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="Örn: Göl Kenarı Kamp Alanı"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Açıklama</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.description}
                onChangeText={text => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Kamp alanı hakkında detaylı bilgi..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
              />
            </View>
            {/* Görünürlük Seçimi */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Görünürlük</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    { key: 'private', label: 'Sadece Ben (Private)' },
                    { key: 'public', label: 'Herkes (Public)' },
                    { key: 'community', label: 'Topluluk (Community)', disabled: !userCommunityId },
                    { key: 'friends', label: 'Arkadaşlar (Friends)', disabled: !isConnected },
                  ] as { key: string; label: string; disabled?: boolean }[]
                ).map(({ key, label, disabled }) => {
                  const selected = formData.visibility === key;
                  const color = getCampingAreaBgColor({ owner_id: 'user', visibility: key });
                  // Renk #RRGGBBAA (9 karakter) veya #RRGGBB (7 karakter) olabilir;
                  // arka plan için RGB kısmını alıp %13 alpha uygula
                  const rgbPart = color.length >= 7 ? color.slice(0, 7) : color;
                  const bgColor = rgbPart + '22';
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.priceChip,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        selected && { borderColor: rgbPart, backgroundColor: bgColor },
                        disabled && { opacity: 0.5 },
                      ]}
                      onPress={() => {
                        if (disabled) {
                          if (key === 'community') {
                            Alert.alert('Uyarı', 'Toplulukla paylaşmak için bir topluluğa üye olmanız gerekiyor.');
                          } else if (key === 'friends') {
                            Alert.alert('Uyarı', 'Çevrimdışı modda arkadaşlarla paylaşım devre dışıdır.');
                          }
                          return;
                        }
                        setFormData(prev => ({
                          ...prev,
                          visibility: key,
                          ...(key !== 'friends' ? { friends: [] } : {}),
                        }));
                      }}
                      disabled={!!disabled}
                    >
                      <Text style={[
                        styles.priceLabel,
                        { color: colors.muted },
                        selected && { color: rgbPart, fontWeight: '600' },
                      ]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Arkadaş seçimi alanı */}
              {formData.visibility === 'friends' && isConnected && (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '500', marginBottom: 8 }}>Paylaşılacak Arkadaşlar</Text>
                  {loadingFriends ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : friendsError ? (
                    <Text style={{ color: colors.danger }}>{friendsError}</Text>
                  ) : allFriends.length === 0 ? (
                    <Text style={{ color: colors.muted }}>Hiç arkadaşınız yok.</Text>
                  ) : (
                    <View style={{ height: Math.min(allFriends.length * FRIEND_ITEM_HEIGHT, MAX_VISIBLE_FRIENDS * FRIEND_ITEM_HEIGHT), borderRadius: 8, backgroundColor: colors.surfaceVariant, overflow: 'hidden' }}>
                      <ScrollView nestedScrollEnabled={true} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={true} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {allFriends.map((f, idx) => {
                          // API user_id veya id döndürebilir. Güvenilir ID: önce user_id, sonra id.
                          // Sadece geçerli sayısal bir ID kullan; yoksa index (hiç seçilmez).
                          const rawFriendId = f.user_id ?? f.id;
                          const friendId = (rawFriendId !== undefined && rawFriendId !== null && !isNaN(Number(rawFriendId)) && Number(rawFriendId) > 0)
                            ? String(rawFriendId)
                            : String(idx);
                          const selected = Array.isArray(formData.friends) && formData.friends.includes(friendId);
                          return (
                            <View key={friendId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, backgroundColor: selected ? colors.primaryLight : 'transparent', borderRadius: 8, marginBottom: 2 }}>
                              <FriendAvatar avatar={(f as any).avatar_url || f.avatar} name={(f as any).name || f.first_name || f.email || ''} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: '600', color: colors.textSecondary }}>{(f as any).name || f.first_name || ''} {f.last_name || ''}</Text>
                                <Text style={{ color: colors.muted, fontSize: 13 }}>{f.email}</Text>
                              </View>
                              {selected ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    setFormData(prev => {
                                      const prevFriends = Array.isArray(prev.friends) ? prev.friends.map(String) : [];
                                      const newFriends = prevFriends.filter(id => id !== friendId);
                                      return {
                                        ...prev,
                                        friends: newFriends
                                      };
                                    });
                                  }}
                                  style={{ marginLeft: 8, backgroundColor: colors.success + '20', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.success }}
                                >
                                  <Text style={{ color: colors.success, fontWeight: 'bold', fontSize: 13 }}>✓ Paylaşıldı</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  onPress={() => {
                                    setFormData(prev => {
                                      const prevFriends = Array.isArray(prev.friends) ? prev.friends.map(String) : [];
                                      const newFriends = [...prevFriends, friendId];
                                      return {
                                        ...prev,
                                        friends: newFriends
                                      };
                                    });
                                  }}
                                  style={{ marginLeft: 8, backgroundColor: colors.surfaceVariant, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}
                                >
                                  <Text style={{ color: colors.muted, fontWeight: 'bold', fontSize: 13 }}>Paylaş</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
            </View>
            <View style={[styles.locationInfo, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>Konum:</Text>
              <Text style={[styles.locationText, { color: colors.muted }]}>
                {(campingArea as any).latitude?.toFixed(6)}, {(campingArea as any).longitude?.toFixed(6)}
              </Text>
            </View>
          </View>

          {/* Fotoğraflar */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Fotoğraflar</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.imagePickerButton, imagePickerLoading && styles.imagePickerButtonDisabled, { backgroundColor: colors.primaryLight, borderColor: colors.primary }, imagePickerLoading && { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={pickImage}
                disabled={imagePickerLoading || formData.images.length >= 5}
              >
                <Camera size={20} color={formData.images.length >= 5 ? colors.muted : colors.primary} />
                <Text style={[styles.imagePickerText, formData.images.length >= 5 && styles.imagePickerTextDisabled, { color: colors.primary }, formData.images.length >= 5 && { color: colors.muted }]}>
                  {imagePickerLoading ? 'Fotoğraf seçiliyor...' :
                    formData.images.length >= 5 ? 'Maksimum 5 fotoğraf eklenebilir' : 'Fotoğraf Ekle'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imagePickerButton, imagePickerLoading && styles.imagePickerButtonDisabled, { backgroundColor: colors.primaryLight, borderColor: colors.primary }, imagePickerLoading && { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={takePhoto}
                disabled={imagePickerLoading || formData.images.length >= 5}
              >
                <Camera size={20} color={formData.images.length >= 5 ? colors.muted : colors.primary} />
                <Text style={[styles.imagePickerText, formData.images.length >= 5 && styles.imagePickerTextDisabled, { color: colors.primary }, formData.images.length >= 5 && { color: colors.muted }]}>
                  {imagePickerLoading ? 'Kamera açılıyor...' :
                    formData.images.length >= 5 ? 'Maksimum 5 fotoğraf eklenebilir' : 'Kamera ile Çek'}
                </Text>
              </TouchableOpacity>
            </View>
            {formData.images.length > 0 && (
              <View style={styles.imageGrid}>
                {formData.images.map((imageUri, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image source={{ uri: imageUri }} style={styles.previewImage} />
                    {(campingArea?.source_id === '1' || (imageUri && imageUri.includes('googleusercontent'))) && (
                      <View style={styles.googleBadge}>
                        <Text style={styles.googleBadgeText}>G</Text>
                      </View>
                    )}
                    {/* Sıralama: Yukarı/Aşağı Taşı */}
                    <View style={{ position: 'absolute', left: 4, top: 4, flexDirection: 'row', gap: 2 }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (index > 0) {
                            setFormData(prev => {
                              const imgs = [...prev.images];
                              const temp = imgs[index - 1];
                              imgs[index - 1] = imgs[index];
                              imgs[index] = temp;
                              return { ...prev, images: imgs };
                            });
                          }
                        }}
                        disabled={index === 0}
                        style={{ opacity: index === 0 ? 0.3 : 1, marginRight: 2 }}
                      >
                        <ChevronUp size={18} color={index === 0 ? colors.border : colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (index < formData.images.length - 1) {
                            setFormData(prev => {
                              const imgs = [...prev.images];
                              const temp = imgs[index + 1];
                              imgs[index + 1] = imgs[index];
                              imgs[index] = temp;
                              return { ...prev, images: imgs };
                            });
                          }
                        }}
                        disabled={index === formData.images.length - 1}
                        style={{ opacity: index === formData.images.length - 1 ? 0.3 : 1 }}
                      >
                        <ChevronDown size={18} color={index === formData.images.length - 1 ? colors.border : colors.primary} />
                      </TouchableOpacity>
                    </View>
                    {/* Kapak Fotoğrafı Seç */}
                    <TouchableOpacity
                      style={{ position: 'absolute', left: 4, bottom: 4, backgroundColor: index === 0 ? colors.primary : colors.surfaceVariant, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}
                      onPress={() => {
                        if (index !== 0) {
                          setFormData(prev => {
                            const imgs = [...prev.images];
                            const [selected] = imgs.splice(index, 1);
                            imgs.unshift(selected);
                            return { ...prev, images: imgs };
                          });
                        }
                      }}
                    >
                      <Text style={{ color: index === 0 ? 'white' : colors.primary, fontWeight: 'bold', fontSize: 12 }}>{index === 0 ? 'Kapak' : 'Kapak Yap'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(index)}
                    >
                      <Trash2 size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Kamp Türü */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Kamp Türü</Text>
            <View style={styles.typeGrid}>
              {campingTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeCard,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    formData.type === type.id && { borderColor: colors.primary, backgroundColor: colors.primaryLight }
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, type: type.id as any }))}
                >
                  <SvgXml xml={getCampingTypeIcon(type.id, { color: colors.text })} width={24} height={24} style={styles.typeIcon} />
                  <Text style={[
                    styles.typeLabel,
                    { color: colors.muted },
                    formData.type === type.id && { color: colors.primary, fontWeight: '600' }
                  ]}>
                    {getCampingTypeLabel(type.id)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Olanaklar */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Olanaklar</Text>
            <View style={styles.amenitiesGrid}>
              {availableAmenities.map((amenity) => (
                <TouchableOpacity
                  key={amenity.id}
                  style={[
                    styles.amenityChip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    formData.amenities.includes(amenity.id) && { borderColor: colors.primary, backgroundColor: colors.primaryLight }
                  ]}
                  onPress={() => toggleAmenity(amenity.id)}
                >
                  <AmenitySvgIcon
                    amenity={amenity.id}
                    size={30}
                    color={formData.amenities.includes(amenity.id) ? colors.primary : colors.textSecondary}
                    backgroundColor={formData.amenities.includes(amenity.id) ? colors.surface : colors.surfaceVariant}
                    strokeWidth={2.4}
                  />
                  <Text style={[
                    styles.amenityLabel,
                    { color: colors.muted },
                    formData.amenities.includes(amenity.id) && { color: colors.primary, fontWeight: '600' }
                  ]}>
                    {amenity.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* İletişim Bilgileri */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>İletişim Bilgileri</Text>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Telefon</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.phone}
                onChangeText={text => setFormData(prev => ({ ...prev, phone: text }))}
                placeholder="+90 555 123 45 67"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>E-posta</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.contact_email}
                onChangeText={text => setFormData(prev => ({ ...prev, contact_email: text }))}
                placeholder="info@kampalani.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Website</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.website}
                onChangeText={text => setFormData(prev => ({ ...prev, website: text }))}
                placeholder="https://www.kampalani.com"
                placeholderTextColor={colors.muted}
                keyboardType="url"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Rezervasyon Linki</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.booking_url}
                onChangeText={text => setFormData(prev => ({ ...prev, booking_url: text }))}
                placeholder="https://rezervasyon.com"
                placeholderTextColor={colors.muted}
                keyboardType="url"
              />
            </View>
          </View>

          {/* Diğer Bilgiler */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Diğer Bilgiler</Text>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Açılış Saatleri</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 2 }}>Hafta İçi</Text>
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: Platform.OS === 'ios' ? 'visible' : 'hidden', backgroundColor: colors.surface }}>
                    <Picker
                      selectedValue={(() => {
                        const current = formData.opening_hours?.weekday || { open: '', close: '' };
                        console.log('[Picker][Weekday] Current value:', current);
                        const match = timeOptions.find(opt => {
                          try {
                            const optVal = JSON.parse(opt.value);
                            const isMatch = optVal.open === current.open && optVal.close === current.close;
                            if (isMatch) console.log('[Picker][Weekday] Match found:', opt.label, optVal);
                            return isMatch;
                          } catch {
                            return false;
                          }
                        });
                        const result = match ? match.value : timeOptions[0].value;
                        console.log('[Picker][Weekday] Selected value:', match ? match.label : 'Default (Kapalı)');
                        return result;
                      })()}
                      onValueChange={val => {
                        const obj = val ? JSON.parse(val) : { open: '', close: '' };
                        console.log('[Picker][Weekday] Value changed to:', obj);
                        setFormData(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, weekday: obj } }));
                      }}
                      style={Platform.OS === 'ios' ? { color: colors.text } : { height: 52, color: colors.text }}
                      itemStyle={Platform.OS === 'ios' ? { height: 120, fontSize: 15, color: colors.text } : undefined}
                    >
                      {timeOptions.map(opt => (
                        <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                      ))}
                    </Picker>
                  </View>
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 2 }}>Hafta Sonu</Text>
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: Platform.OS === 'ios' ? 'visible' : 'hidden', backgroundColor: colors.surface }}>
                    <Picker
                      selectedValue={(() => {
                        const current = formData.opening_hours?.weekend || { open: '', close: '' };
                        console.log('[Picker][Weekend] Current value:', current);
                        const match = timeOptions.find(opt => {
                          try {
                            const optVal = JSON.parse(opt.value);
                            const isMatch = optVal.open === current.open && optVal.close === current.close;
                            if (isMatch) console.log('[Picker][Weekend] Match found:', opt.label, optVal);
                            return isMatch;
                          } catch {
                            return false;
                          }
                        });
                        const result = match ? match.value : timeOptions[0].value;
                        console.log('[Picker][Weekend] Selected value:', match ? match.label : 'Default (Kapalı)');
                        return result;
                      })()}
                      onValueChange={val => {
                        const obj = val ? JSON.parse(val) : { open: '', close: '' };
                        console.log('[Picker][Weekend] Value changed to:', obj);
                        setFormData(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, weekend: obj } }));
                      }}
                      style={Platform.OS === 'ios' ? { color: colors.text } : { height: 52, color: colors.text }}
                      itemStyle={Platform.OS === 'ios' ? { height: 120, fontSize: 15, color: colors.text } : undefined}
                    >
                      {timeOptions.map(opt => (
                        <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                Sadece hazır saat dilimlerinden seçim yapabilirsiniz.
              </Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Kapasite (kişi)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={formData.capacity}
                onChangeText={text => setFormData(prev => ({ ...prev, capacity: text }))}
                placeholder="100"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Fiyat Aralığı</Text>
              <View style={styles.priceGrid}>
                {priceRanges.map((price) => (
                  <TouchableOpacity
                    key={price.id}
                    style={[
                      styles.priceChip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      formData.price_range === price.id && { borderColor: colors.primary, backgroundColor: colors.primaryLight }
                    ]}
                    onPress={() => setFormData(prev => ({
                      ...prev,
                      price_range: price.id,
                      fee: price.id !== 'free' && price.id !== ''
                    }))}
                  >
                    <Text style={[
                      styles.priceLabel,
                      { color: colors.muted },
                      formData.price_range === price.id && { color: colors.primary, fontWeight: '600' }
                    ]}>
                      {price.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.feeToggle, !!formData.price_range && { opacity: 0.55 }]}
              onPress={() => {
                if (!formData.price_range) setFormData(prev => ({ ...prev, fee: !prev.fee }));
              }}
              disabled={!!formData.price_range}
            >
              <View style={[styles.checkbox, { borderColor: colors.border }, formData.fee && { borderColor: colors.primary, backgroundColor: colors.primary }]}>
                {formData.fee && <Text style={[styles.checkmark, { color: 'white' }]}>✓</Text>}
              </View>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Ücretli alan</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }, (loading || imagePickerLoading) && { backgroundColor: colors.muted }]}
            onPress={() => handleSubmit()}
            disabled={loading || imagePickerLoading}
          >
            <Save size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.submitButtonText}>
              {imagePickerLoading ? 'Görseller yükleniyor...' : loading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  locationText: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 96,
  },
  typeCardSelected: {
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 12,
    textAlign: 'center',
    flexShrink: 0,
    includeFontPadding: true,
    paddingHorizontal: 2,
  },
  typeLabelSelected: {
    fontWeight: '600',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 74,
  },
  amenityChipSelected: {
  },
  amenityIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  amenityLabel: {
    fontSize: 12,
    flexShrink: 0,
    includeFontPadding: true,
    paddingRight: 2,
  },
  amenityLabelSelected: {
    fontWeight: '600',
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priceChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  priceChipSelected: {
  },
  priceLabel: {
    fontSize: 12,
  },
  priceLabelSelected: {
    fontWeight: '600',
  },
  feeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
  },
  checkmark: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  feeLabel: {
    fontSize: 14,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
  },
  submitButtonDisabled: {
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  imagePickerButtonDisabled: {
  },
  imagePickerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imagePickerTextDisabled: {
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageContainer: {
    position: 'relative',
    width: 100,
    height: 80,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImageBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(5, 150, 105, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coverImageText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  googleBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#4285F4',
    zIndex: 2,
  },
  googleBadgeText: {
    color: '#4285F4',
    fontWeight: 'bold',
    fontSize: 13,
    fontFamily: 'monospace',
  },
});