import { SvgXml } from 'react-native-svg';
import { campingTypes, getCampingTypeLabel, getCampingTypeIcon } from '@/lib/categories';
import { TYPE_COLORS } from '../app/icons/svgIcons';
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { X, MapPin, Camera, Star, DollarSign, Wifi, Car, Utensils, ShowerHead as Shower, Zap, TreePine, Image as ImageIcon, Trash2, ChevronUp, ChevronDown } from 'lucide-react-native';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { optimizeImageForWeb } from '@/lib/imageOptimizer';
import { uploadCampgroundImage } from '@/lib/campgroundImageApi';

// React Native ortamı için basit id üretici
function generateImageId() {
  return 'photo_' + Date.now() + '_' + Math.floor(Math.random() * 1e8);
}
import { getDatabase } from '@/lib/database';
import { generateUUID } from '@/lib/uuid';
import { getDeviceId } from '@/lib/deviceId';
import { addPendingChange } from '@/lib/pendingChanges';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { createCampingAreaOnServer, sanitizeCampingAreaData } from '@/lib/campingAreaApi';
import { getMe } from '@/lib/userCommunityApi';
import * as SecureStore from 'expo-secure-store';
import { getLargeItemAsync, setLargeItemAsync } from '@/lib/largeStorage';
import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';

// Arkadaş tipi
// API /friends?user_id=X endpoint'i { id, name, email, avatar_url } formatında döner
// (types/friend.ts ile uyumlu). user_id de olabilir — her iki alanı destekliyoruz.
type Friend = {
  id?: string | number;
  user_id?: string | number;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  avatar_url?: string;
  email?: string;
  name?: string;
};

// Basit avatar bileşeni
const FriendAvatar = ({ avatar, name }: { avatar?: string; name: string }) => (
  avatar ? (
    <Image source={{ uri: avatar }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#e5e7eb' }} />
  ) : (
    <View style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#6b7280', fontWeight: 'bold', fontSize: 18 }}>{(name && name.length > 0) ? name[0].toUpperCase() : '?'}</Text>
    </View>
  )
);

// Arkadaş listesini fetch eden yardımcı fonksiyon
async function fetchFriendsList(userId: string | number | undefined): Promise<Friend[]> {
  if (!userId) return [];
  try {
    const token = await getToken();
    if (!token) throw new Error('Oturum bulunamadı (token eksik)');
    const res = await fetch(`${API_URL}/friends?user_id=${userId}`, {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error('Arkadaşlar yüklenemedi');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[fetchFriendsList] Hata:', err);
    throw err;
  }
}

interface AddCampingAreaModalProps {
  visible: boolean;
  onClose: () => void;
  initialLocation?: { latitude: number; longitude: number };
  onSuccess?: () => void;
  user?: any;
  isGuest?: boolean;
  remainingAreas?: number;
  guestLimit?: number;
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'white',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
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
    borderColor: '#d1d5db',
    backgroundColor: 'white',
    minWidth: 80,
  },
  typeCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: '#059669',
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
    borderColor: '#d1d5db',
    backgroundColor: 'white',
  },
  amenityChipSelected: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  amenityIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  amenityLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  amenityLabelSelected: {
    color: '#059669',
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
    borderColor: '#d1d5db',
    backgroundColor: 'white',
  },
  priceChipSelected: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  priceLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  priceLabelSelected: {
    color: '#059669',
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
    borderColor: '#d1d5db',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  checkmark: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  feeLabel: {
    fontSize: 14,
    color: '#374151',
  },
  footer: {
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  submitButton: {
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
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
    backgroundColor: '#f0fdf4',
    borderWidth: 2,
    borderColor: '#059669',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  imagePickerButtonDisabled: {
    backgroundColor: '#f9fafb',
    borderColor: '#d1d5db',
  },
  imagePickerText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  imagePickerTextDisabled: {
    color: '#9ca3af',
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
});

export default function AddCampingAreaModal({ visible, onClose, initialLocation, onSuccess, user, isGuest = false, remainingAreas = Infinity, guestLimit = 10 }: AddCampingAreaModalProps) {
  const isConnected = useNetworkStatus();
  const [userCommunityId, setUserCommunityId] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (visible) {
      (async () => {
        try {
          const user = await getMe();
          setUserCommunityId(user?.community_id);
        } catch {
          setUserCommunityId(undefined);
        }
      })();
    }
  }, [visible]);
  // Hazır saat dilimi şablonları
  const timeOptions = [
    { label: 'Seçiniz', value: '' },
    { label: '24 Saat Açık (00:00 - 23:59)', value: JSON.stringify({ open: '00:00', close: '23:59' }) },
    { label: '08:00 - 22:00', value: JSON.stringify({ open: '08:00', close: '22:00' }) },
    { label: '09:00 - 23:00', value: JSON.stringify({ open: '09:00', close: '23:00' }) },
    { label: '10:00 - 20:00', value: JSON.stringify({ open: '10:00', close: '20:00' }) },
    { label: 'Kapalı', value: JSON.stringify({ open: '', close: '' }) },
  ];

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    latitude: '',
    longitude: '',
    type: 'campground' as 'campground' | 'caravan_site' | 'recreation' | 'picnic',
    amenities: [] as string[],
    website: '',
    phone: '',
    // opening_hours artık bir nesne olacak
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
    images: [] as { image_id: string; local_uri: string; image_url: string | null; status: 'pending' | 'uploaded' | 'failed' }[],
  visibility: 'private' as 'private' | 'public' | 'community' | 'friends',
  friends: [] as string[],
  });

  // Arkadaş seçimi için state
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  // Arkadaş listesi için yüksekliği hesaplamak üzere sabitler
  const FRIEND_ITEM_HEIGHT = 56; // yaklaşık satır yüksekliği (avatar + paddings)
  const MAX_VISIBLE_FRIENDS = 5;

  const [loading, setLoading] = useState(false);
  const [imagePickerLoading, setImagePickerLoading] = useState(false);

  // Arkadaş listesini yükle (sadece 'friends' görünürlüğü seçiliyse)
  useEffect(() => {
    if (!visible || formData.visibility !== 'friends') return;
    const currentUserId = user?.id;
    if (!currentUserId) {
      setFriendsError('Kullanıcı oturumu bulunamadı.');
      setAllFriends([]);
      return;
    }
    setLoadingFriends(true);
    setFriendsError(null);
    fetchFriendsList(currentUserId)
      .then(list => setAllFriends(list))
      .catch(e => setFriendsError(e.message || 'Arkadaşlar yüklenemedi'))
      .finally(() => setLoadingFriends(false));
  }, [visible, formData.visibility, user?.id]);

  // Modal her açıldığında formu sıfırla
  useEffect(() => {
    if (visible) {
      setFormData({
        name: '',
        description: '',
        latitude: initialLocation ? initialLocation.latitude.toFixed(6) : '',
        longitude: initialLocation ? initialLocation.longitude.toFixed(6) : '',
        type: 'campground',
        amenities: [],
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
        facilities: [],
        accessibility: [],
        images: [],
        visibility: 'private',
        friends: [],
      });
      setAllFriends([]);
      setFriendsError(null);
    }
  }, [visible, initialLocation]);
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
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('İzin Gerekli', 'Fotoğraf seçmek için galeri erişim izni gereklidir.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages: { image_id: string; local_uri: string; image_url: null; status: 'pending' }[] = [];
        for (const asset of result.assets) {
          if (!asset.uri) continue;
          try {
            const response = await fetch(asset.uri);
            if (response.status === 200 || response.ok) {
              const optimizedUri = await optimizeImageForWeb(asset.uri);
              newImages.push({
                image_id: generateImageId(),
                local_uri: optimizedUri,
                image_url: null,
                status: 'pending' as const,
              });
            }
          } catch {
            // Erişilemeyen fotoğrafı atla
          }
        }
        if (newImages.length === 0) {
          Alert.alert('Yetki Hatası', 'Seçtiğiniz fotoğraflara erişilemiyor. Farklı fotoğraflar deneyin.');
          return;
        }
        setFormData(prev => {
          const combined = [...newImages, ...prev.images];
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
            const newImage = {
              image_id: generateImageId(),
              local_uri: optimizedUri,
              image_url: null,
              status: 'pending' as const,
            };
            setFormData(prev => ({
              ...prev,
              images: [newImage, ...prev.images.slice(0, 4)] // Max 5 images
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

// Artık tüm sync işlemleri merkezi syncManager ile yapılacak. Burada ek bir useEffect'e gerek yok.

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
    // Burada ayrıca sunucudan da silmek için deleteCampgroundImage fonksiyonu çağrılabilir.
  };


  const handleSubmit = async () => {
    if (loading || imagePickerLoading) return;
    console.log('[AddCampingArea] handleSubmit başladı');
    
    // Guest kullanıcı limit kontrolü
    if (isGuest && remainingAreas !== Infinity && remainingAreas <= 0) {
      Alert.alert(
        'Kamp Alanı Limiti',
        `Guest kullanıcılar en fazla ${guestLimit} kamp alanı oluşturabilir. Premium abonelik ile sınırsız kamp alanı oluşturabilirsiniz.`,
        [
          { text: 'Tamam', style: 'cancel' },
          { 
            text: 'Premium Ol!', 
            onPress: () => {
              onClose();
              // Premium sayfasına yönlendir (router import edilmeli)
              const { router } = require('expo-router');
              router.push('/premium');
            },
            style: 'default'
          }
        ]
      );
      return;
    }
    
    // DEBUG: localUser ve userId logları kaldırıldı
    // Kullanıcı bilgisini çek
    let userId: number | undefined = undefined;
    let user = null;
    try {
      // Öncelik: getMe ile kullanıcıyı çek
      user = await getMe();
      userId = typeof user?.id === 'number' ? user.id : Number(user?.id) || undefined;
      // Eğer online ve getMe'den kullanıcı geldiyse localUser'ı her zaman güncelle
      if (userId && user) {
        await setLargeItemAsync('localUser', JSON.stringify(user));
        console.log('[AddCampingArea] localUser güncellendi:', userId);
      }
      if (!userId) {
        // getMe başarısızsa localUser'dan dene
        const localUserStr = await getLargeItemAsync('localUser');
        if (localUserStr) {
          const localUser = JSON.parse(localUserStr);
          userId = typeof localUser?.id === 'number' ? localUser.id : Number(localUser?.id) || undefined;
        }
        // localUser da yoksa cachedUserData'dan dene (index.tsx'te kaydedilir)
        if (!userId) {
          const cachedDataStr = await SecureStore.getItemAsync('cachedUserData');
          if (cachedDataStr) {
            const cachedData = JSON.parse(cachedDataStr);
            userId = typeof cachedData?.id === 'number' ? cachedData.id : Number(cachedData?.id) || undefined;
            console.log('[AddCampingArea] cachedUserData\'dan userId alındı:', userId);
          }
        }
      }
      console.log('[AddCampingArea] Kullanıcı ID:', userId);
    } catch (e) {
      // getMe başarısızsa localUser veya cachedUserData'dan dene (OFFLINE mod)
      try {
        const localUserStr = await getLargeItemAsync('localUser');
        if (localUserStr) {
          const localUser = JSON.parse(localUserStr);
          userId = typeof localUser?.id === 'number' ? localUser.id : Number(localUser?.id) || undefined;
          console.log('[AddCampingArea] [OFFLINE] localUser.id ile userId atandı:', userId);
        }
        if (!userId) {
          // localUser yoksa cachedUserData'dan dene (index.tsx'te kaydedilir)
          const cachedDataStr = await SecureStore.getItemAsync('cachedUserData');
          if (cachedDataStr) {
            const cachedData = JSON.parse(cachedDataStr);
            userId = typeof cachedData?.id === 'number' ? cachedData.id : Number(cachedData?.id) || undefined;
            console.log('[AddCampingArea] [OFFLINE] cachedUserData\'dan userId atandı:', userId);
          } else {
            console.log('[AddCampingArea] [OFFLINE] localUser ve cachedUserData bulunamadı. userId atanamadı.');
          }
        }
      } catch (err) {
        console.log('[AddCampingArea] [OFFLINE] userId okunamadı:', err);
      }
    }

    // Zorunlu alan kontrolleri
    if (!formData.name.trim()) {
      Alert.alert('Hata', 'Alan adı zorunludur.');
      return;
    }
    if (!formData.latitude || isNaN(Number(formData.latitude))) {
      Alert.alert('Hata', 'Enlem (latitude) zorunludur ve sayısal olmalıdır.');
      return;
    }
    if (!formData.longitude || isNaN(Number(formData.longitude))) {
      Alert.alert('Hata', 'Boylam (longitude) zorunludur ve sayısal olmalıdır.');
      return;
    }
    if (!formData.type) {
      Alert.alert('Hata', 'Kamp türü (type) zorunludur.');
      return;
    }
    if (!userId) {
      Alert.alert('Hata', 'Kullanıcı bilgisi alınamadı. Lütfen tekrar deneyin.');
      return;
    }

    setLoading(true);
    // Offline modda file:// ile başlayan görselleri pendingImages kuyruğuna ekle
    if (!isConnected && formData.images.some(img => img.local_uri && img.local_uri.startsWith('file://'))) {
      const pendingImagesStr = await getLargeItemAsync('pendingImages');
      let pendingImages = pendingImagesStr ? JSON.parse(pendingImagesStr) : [];
      const newPending = formData.images
        .filter(img => img.local_uri && img.local_uri.startsWith('file://'))
        .map(img => ({ local_uri: img.local_uri, campingAreaId: null }));
      pendingImages = [...pendingImages, ...newPending];
      await setLargeItemAsync('pendingImages', JSON.stringify(pendingImages));
    }
    console.log('[AddCampingArea] Form verileri:', formData);

    // Online'da: Görselleri önce S3'e yükle, ardından image_url ile güncelle
    let imagesForDb = formData.images;
    if (isConnected && imagesForDb.some(img => !img.image_url && img.local_uri)) {
      // Yükleme başlarken tüm görselleri 'pending' yap
      setFormData(prev => ({
        ...prev,
        images: prev.images.map(img => ({ ...img, status: 'pending' }))
      }));
      const uploadedImages = await Promise.all(imagesForDb.map(async (img, idx) => {
        if (!img.image_url && img.local_uri) {
          try {
            const user = await getMe();
            const userIdNum = user?.id ? Number(user.id) : 0;
            const uploadResult = await uploadCampgroundImage({
              campground_id: 0, // henüz alan oluşmadı
              local_uri: img.local_uri,
              image_id: img.image_id,
              uploaded_by: userIdNum,
              created_by: userIdNum,
            });
            if (uploadResult.status === 'uploaded') {
              setFormData(prev => {
                const newImgs = [...prev.images];
                newImgs[idx] = { ...newImgs[idx], image_url: uploadResult.image_url, status: 'uploaded' as const };
                return { ...prev, images: newImgs };
              });
              return { ...img, image_url: uploadResult.image_url, status: 'uploaded' as const };
            } else {
              setFormData(prev => {
                const newImgs = [...prev.images];
                newImgs[idx] = { ...newImgs[idx], status: 'failed' as const };
                return { ...prev, images: newImgs };
              });
              Alert.alert('Fotoğraf Yükleme Hatası', 'Bir fotoğraf yüklenemedi. Lütfen tekrar deneyin.');
              return { ...img, status: 'failed' as const };
            }
          } catch (e) {
            setFormData(prev => {
              const newImgs = [...prev.images];
              newImgs[idx] = { ...newImgs[idx], status: 'failed' as const };
              return { ...prev, images: newImgs };
            });
            Alert.alert('Fotoğraf Yükleme Hatası', 'Bir fotoğraf yüklenemedi. Lütfen tekrar deneyin.');
            return { ...img, status: 'failed' as const };
          }
        }
        return img;
      }));
      imagesForDb = uploadedImages;
    }
  // images alanını string[]'e dönüştür (öncelik image_url, yoksa local_uri)
  const imagesForDbStrings = imagesForDb.map(img => img.image_url || img.local_uri);
    // Açılış saatleri tamamen boşsa null/boş string gönder
    const isOpeningHoursEmpty =
      (!formData.opening_hours?.weekday?.open && !formData.opening_hours?.weekday?.close &&
       !formData.opening_hours?.weekend?.open && !formData.opening_hours?.weekend?.close);
    const openingHoursForDb = isOpeningHoursEmpty ? null : formData.opening_hours;

    // Eğer görünürlük 'friends' seçili ama paylaşılacak kimse yoksa,
    // kaydedilen görünürlüğü 'private' (Sadece Ben) yap.
    const finalVisibility = (formData.visibility === 'friends' && (!formData.friends || formData.friends.length === 0))
      ? 'private'
      : formData.visibility;

    // community_id'yi belirle: visibility 'community' ise kullanıcının community_id'si
    let communityIdValue: number | undefined = undefined;
    if (finalVisibility === 'community') {
      communityIdValue = userCommunityId;
      if (!communityIdValue) {
        console.warn('[AddCampingArea] community_id eksik, visibility community seçilmiş ama kullanıcının topluluğu yok!');
      }
    }

    // Prepare external_id using persistent device id + uuid early so local DB and API use same value
    let externalIdToSend: string | undefined = undefined;
    try {
      const deviceId = await getDeviceId();
      externalIdToSend = `${deviceId}:${generateUUID()}`;
    } catch (e) {
      // fallback will be filled after local insert if needed
      externalIdToSend = undefined;
    }

    // Yeni kamp alanı verisi
    // uuid burada üretiliyor; hem lokal DB'ye hem apiData'ya ekleniyor.
    // Bu sayede syncPendingChanges, CREATE sonrası updateCampingAreaIdByUuid ile
    // lokal kaydı sunucu id/external_id'siyle güncelleyebilir → uygulama yeniden
    // açıldığında delta sync duplicate kayıt oluşturmaz.
    const campingAreaUUID = generateUUID();
    const campingAreaData = {
      uuid: campingAreaUUID,
      rentech_id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      external_id: externalIdToSend,
      name: formData.name,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      type: formData.type,
      amenities: formData.amenities,
      tags: { type: formData.type },
      description: formData.description,
      website: formData.website,
      phone: formData.phone,
      opening_hours: openingHoursForDb, // localde nesne olarak tut
      capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
      fee: formData.fee,
      images: imagesForDbStrings,
      rating: 0,
      review_count: 0,
      price_range: formData.price_range,
      facilities: formData.facilities,
      accessibility: formData.accessibility,
      booking_url: formData.booking_url,
      contact_email: formData.contact_email,
      social_media: {},
      status: 'active',
      source_id: '0',
      owner_id: userId ? userId.toString() : '',
      // username: getMe() veya localUser'dan gelen kullanıcı adı
      owner_username: (user as any)?.username || '',
      visibility: finalVisibility,
      community_id: communityIdValue,
      friends: finalVisibility === 'friends' ? formData.friends : [],
      friend_user_ids: finalVisibility === 'friends' ? formData.friends : [],
    };


    try {
      // Alert.alert('Bilgi', 'Local veritabanına kaydediliyor...');
      const db = getDatabase();
      await db.insertOrUpdateCampingArea({
        ...campingAreaData,
        opening_hours: openingHoursForDb ? JSON.stringify(campingAreaData.opening_hours) : null,
      });
      // Alert.alert('Bilgi', 'Local kayıt tamamlandı.');


      if (onSuccess) onSuccess();
      onClose();

      // Alert.alert('Bilgi', 'Son eklenen alan bulunuyor...');
      const allAreas = await db.getAllCampingAreas();
      const lastArea = allAreas.reverse().find(area =>
        area.name === campingAreaData.name &&
        Math.abs((area as any).latitude - campingAreaData.latitude) < 0.0001 &&
        Math.abs((area as any).longitude - campingAreaData.longitude) < 0.0001
      );
      const localId = lastArea ? (lastArea as any).id : undefined;
      //Alert.alert('Bilgi', `Local ID: ${localId}`);


      // Artık pendingImages güncellemesi yapılmıyor. Sync işlemi merkezi syncManager tarafından yönetilecek.

      // S3 linki yoksa local URI'ları gönder, varsa sadece S3 linkleri gönder
      const s3ImageUrls = imagesForDb.map(img => img.image_url).filter(url => !!url);
      let imagesToSend: string[] = [];
      if (s3ImageUrls.length > 0) {
        imagesToSend = s3ImageUrls;
      } else {
        imagesToSend = imagesForDb.map(img => img.local_uri).filter(uri => !!uri);
      }
      const rawApiData = {
        ...campingAreaData,
        type: 'campground',
        fee: campingAreaData.fee ? 1 : 0,
        opening_hours: openingHoursForDb ? campingAreaData.opening_hours : null,
        facilities: campingAreaData.facilities ? campingAreaData.facilities : [],
        accessibility: campingAreaData.accessibility ? campingAreaData.accessibility : [],
        amenities: Array.isArray(campingAreaData.amenities) ? campingAreaData.amenities : [],
        images: imagesToSend,
        photo_links: imagesToSend,
        social_media: campingAreaData.social_media ? campingAreaData.social_media : {},
        tags: { type: formData.type },
        // external_id: deviceId:uuid — cihazlar arası çakışmayı önlemek için kalıcı cihaz id'si + uuid
        external_id: externalIdToSend || (localId ? `user_${userId}_${localId}` : undefined),
        // created_at ve updated_at kesinlikle gönderilmesin!
      };
      const apiData = { ...sanitizeCampingAreaData(rawApiData), uuid: campingAreaUUID };
      // Alert.alert('Bilgi', 'API veri hazırlanıyor (sanitize):\n' + JSON.stringify(apiData, null, 2));

      // Sunucuya arka planda gönder

      (async () => {
        // Alert.alert('Bilgi', `Sunucuya gönderim başlıyor...\nisConnected: ${isConnected}`);
        if (!isConnected) {
          await addPendingChange({ type: 'create', campground_id: null, data: apiData });
          Alert.alert('Bilgi', 'Kamp alanınız cihazda kaydedildi. İnternet bağlantısı sağlandığında sunucuya gönderilecek.');
          return;
        }
        try {
          const apiResult = await createCampingAreaOnServer(apiData);
          console.log('[createCampingAreaOnServer][SUCCESS]', apiResult);
          // Server'dan dönen external_id'yi local DB'ye kaydet
          // Server external_id döndürmezse gönderilen değeri (apiData.external_id) fallback olarak kullan
          const resolvedExternalId = apiResult?.external_id || apiData.external_id;
          if (localId && resolvedExternalId) {
            try {
              const db2 = getDatabase();
              await db2.updateCampingAreaExternalIdByLocalId(Number(localId), resolvedExternalId);
              console.log('[AddCampingArea] external_id local DB\'ye kaydedildi:', resolvedExternalId);
            } catch (e) {
              console.warn('[AddCampingArea] external_id güncellenemedi:', e);
            }
          }
          Alert.alert('Başarılı', 'Kamp alanı başarıyla sunucuya kaydedildi.');
        } catch (e: any) {
          let errorMsg = 'API kaydı başarısız:';
          let extra = '';
          if (e && typeof e === 'object') {
            if (typeof e.message === 'string') {
              errorMsg = e.message;
              try {
                const errObj = JSON.parse(e.message.replace('API Hatası: ', ''));
                if (errObj && errObj.detail && errObj.detail.includes('amenities')) {
                  Alert.alert('API Hatası', 'Sunucu tarafında "amenities" alanı ile ilgili bir hata oluştu. Lütfen sistem yöneticisine bildiriniz.');
                  return;
                }
                extra += '\n[API Error JSON] ' + JSON.stringify(errObj, null, 2);
              } catch (jsonErr) {
                // JSON parse hatası önemli değil, devam et
              }
            }
            if ('response' in e && e.response) {
              extra += `\n[API Error Response] Status: ${e.response.status}, Body: ${JSON.stringify(e.response.data)}`;
            }
          }
          console.log('[createCampingAreaOnServer][ERROR]', errorMsg, extra, e);
          Alert.alert('API Hatası', `${errorMsg}${extra}`);
          await addPendingChange({ type: 'create', campground_id: null, data: apiData });
        }
      })();

      // Ek kontrol: Eklenen alan ekranda görünmüyorsa kullanıcıya bilgi ver
      setTimeout(async () => {
        try {
          // Son veritabanı listesini çek
          const allAreas = await getDatabase().getAllCampingAreas();
          const exists = allAreas.some(area =>
            area.name === campingAreaData.name &&
            Math.abs((area as any).latitude - campingAreaData.latitude) < 0.0001 &&
            Math.abs((area as any).longitude - campingAreaData.longitude) < 0.0001
          );
          if (!exists) {
            Alert.alert('Uyarı', 'Eklediğiniz kamp alanı mevcut filtreler veya konum nedeniyle haritada görünmeyebilir. Filtreleri ve yakınlığı kontrol edin.');
          }
        } catch {}
      }, 1200);

    } catch (error) {
      console.error('Error submitting camping area:', error);
      Alert.alert('Hata', 'Kamp alanı eklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Yeni Kamp Alanı Ekle</Text>
            {isGuest && remainingAreas !== Infinity && (
              <Text style={{ fontSize: 12, color: remainingAreas <= 3 ? '#dc2626' : '#6b7280', marginTop: 2 }}>
                Kalan hak: {remainingAreas}/{guestLimit}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Temel Bilgiler */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Temel Bilgiler</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Alan Adı *</Text>
              <TextInput
                style={[styles.input, { color: '#222' }]}
                value={formData.name}
                onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="Örn: Göl Kenarı Kamp Alanı"
                placeholderTextColor="#64748b"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Açıklama</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: '#222' }]}
                value={formData.description}
                onChangeText={text => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Kamp alanı hakkında detaylı bilgi..."
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={3}
              />
            </View>
            {/* Görünürlük Seçimi - Temel Bilgiler altında */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Görünürlük</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: formData.visibility === 'private' ? '#059669' : '#d1d5db',
                    backgroundColor: formData.visibility === 'private' ? '#f0fdf4' : 'white',
                    marginBottom: 8,
                  }}
                  onPress={() => setFormData(prev => ({ ...prev, visibility: 'private' }))}
                >
                  <Text style={{ color: formData.visibility === 'private' ? '#059669' : '#6b7280', fontWeight: formData.visibility === 'private' ? '600' : '400' }}>
                    Sadece Ben (Private)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: formData.visibility === 'public' ? '#059669' : '#d1d5db',
                    backgroundColor: formData.visibility === 'public' ? '#f0fdf4' : 'white',
                    marginBottom: 8,
                  }}
                  onPress={() => setFormData(prev => ({ ...prev, visibility: 'public' }))}
                >
                  <Text style={{ color: formData.visibility === 'public' ? '#059669' : '#6b7280', fontWeight: formData.visibility === 'public' ? '600' : '400' }}>
                    Herkes (Public)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: formData.visibility === 'community' ? '#059669' : '#d1d5db',
                    backgroundColor: formData.visibility === 'community' ? '#f0fdf4' : 'white',
                    marginBottom: 8,
                    opacity: userCommunityId ? 1 : 0.5,
                  }}
                  onPress={() => {
                    if (!userCommunityId) {
                      Alert.alert('Uyarı', 'Toplulukla paylaşmak için bir topluluğa üye olmanız gerekiyor.');
                      return;
                    }
                    setFormData(prev => ({ ...prev, visibility: 'community', friends: [] }));
                  }}
                  disabled={!userCommunityId}
                >
                  <Text style={{ color: formData.visibility === 'community' ? '#059669' : '#6b7280', fontWeight: formData.visibility === 'community' ? '600' : '400' }}>
                    Topluluk (Community)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: formData.visibility === 'friends' ? '#059669' : '#d1d5db',
                    backgroundColor: formData.visibility === 'friends' ? '#f0fdf4' : 'white',
                    marginBottom: 8,
                  }}
                  onPress={() => setFormData(prev => ({ ...prev, visibility: 'friends' }))}
                >
                  <Text style={{ color: formData.visibility === 'friends' ? '#059669' : '#6b7280', fontWeight: formData.visibility === 'friends' ? '600' : '400' }}>
                    Arkadaşlar (Friends)
                  </Text>
                </TouchableOpacity>
              </View>
              {/* Arkadaş seçimi alanı */}
              {formData.visibility === 'friends' && (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ fontSize: 14, color: '#374151', fontWeight: '500', marginBottom: 8 }}>Paylaşılacak Arkadaşlar</Text>
                  {loadingFriends ? (
                    <ActivityIndicator size="small" color="#059669" />
                  ) : friendsError ? (
                    <Text style={{ color: '#dc2626' }}>{friendsError}</Text>
                  ) : allFriends.length === 0 ? (
                    <Text style={{ color: '#6b7280' }}>Hiç arkadaşınız yok.</Text>
                  ) : (
                    <View style={{ height: Math.min(allFriends.length * FRIEND_ITEM_HEIGHT, MAX_VISIBLE_FRIENDS * FRIEND_ITEM_HEIGHT), borderRadius: 8, backgroundColor: '#f9fafb', overflow: 'hidden' }}>
                      <ScrollView nestedScrollEnabled={true} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                        {allFriends.map((f, idx) => {
                          // API user_id veya id döndürebilir. Güvenilir ID: önce user_id, sonra id.
                          // Sadece geçerli sayısal bir ID kullan; yoksa index (hiç seçilmez).
                          const rawFriendId = f.user_id ?? f.id;
                          const friendId = (rawFriendId !== undefined && rawFriendId !== null && !isNaN(Number(rawFriendId)) && Number(rawFriendId) > 0)
                            ? String(rawFriendId)
                            : String(idx);
                          const selected = Array.isArray(formData.friends) && formData.friends.includes(friendId);
                          return (
                            <View key={friendId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, backgroundColor: selected ? '#f0fdf4' : 'transparent', borderRadius: 8, marginBottom: 2 }}>
                              <FriendAvatar avatar={f.avatar_url || f.avatar} name={f.name || f.first_name || f.email || ''} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: '600', color: '#374151' }}>{f.name || f.first_name || ''} {f.last_name || ''}</Text>
                                <Text style={{ color: '#6b7280', fontSize: 13 }}>{f.email}</Text>
                              </View>
                              {selected ? (
                                <TouchableOpacity
                                  onPress={() => setFormData(prev => ({ ...prev, friends: prev.friends.filter(id => id !== friendId) }))}
                                  style={{ marginLeft: 8, backgroundColor: '#dcfce7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#22c55e' }}
                                >
                                  <Text style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 13 }}>✓ Ekli</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  onPress={() => setFormData(prev => ({ ...prev, friends: [...prev.friends, friendId] }))}
                                  style={{ marginLeft: 8, backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#d1d5db' }}
                                >
                                  <Text style={{ color: '#6b7280', fontWeight: 'bold', fontSize: 13 }}>Ekle</Text>
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
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Enlem</Text>
              <TextInput
                style={[styles.input, { color: '#222' }]}
                value={formData.latitude}
                onChangeText={text => setFormData(prev => ({ ...prev, latitude: text }))}
                placeholder="Enlem"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Boylam</Text>
              <TextInput
                style={[styles.input, { color: '#222' }]}
                value={formData.longitude}
                onChangeText={text => setFormData(prev => ({ ...prev, longitude: text }))}
                placeholder="Boylam"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Fotoğraflar */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotoğraflar</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.imagePickerButton, imagePickerLoading && styles.imagePickerButtonDisabled]}
                onPress={pickImage}
                disabled={imagePickerLoading || formData.images.length >= 5}
              >
                <ImageIcon size={20} color={formData.images.length >= 5 ? "#9ca3af" : "#059669"} />
                <Text style={[styles.imagePickerText, formData.images.length >= 5 && styles.imagePickerTextDisabled]}>
                  {imagePickerLoading ? 'Fotoğraf seçiliyor...' :
                   formData.images.length >= 5 ? 'Maksimum 5 fotoğraf eklenebilir' : 'Fotoğraf Ekle'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imagePickerButton, imagePickerLoading && styles.imagePickerButtonDisabled]}
                onPress={takePhoto}
                disabled={imagePickerLoading || formData.images.length >= 5}
              >
                <Camera size={20} color={formData.images.length >= 5 ? "#9ca3af" : "#059669"} />
                <Text style={[styles.imagePickerText, formData.images.length >= 5 && styles.imagePickerTextDisabled]}>
                  {imagePickerLoading ? 'Kamera açılıyor...' :
                   formData.images.length >= 5 ? 'Maksimum 5 fotoğraf eklenebilir' : 'Kamera ile Çek'}
                </Text>
              </TouchableOpacity>
            </View>
            {formData.images.length > 0 && (
              <View style={styles.imageGrid}>
                {formData.images.map((img, index) => (
                  <View key={img.image_id} style={styles.imageContainer}>
                    <Image source={{ uri: img.local_uri }} style={styles.previewImage} />
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
                        <ChevronUp size={18} color={index === 0 ? '#d1d5db' : '#580d0dff'} />
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
                        <ChevronDown size={18} color={index === formData.images.length - 1 ? '#d1d5db' : '#059669'} />
                      </TouchableOpacity>
                    </View>
                    {/* Kapak Fotoğrafı Seç */}
                    <TouchableOpacity
                      style={{ position: 'absolute', left: 4, bottom: 4, backgroundColor: index === 0 ? '#059669' : '#f3f4f6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}
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
                      <Text style={{ color: index === 0 ? 'white' : '#059669', fontWeight: 'bold', fontSize: 12 }}>{index === 0 ? 'Kapak' : 'Kapak Yap'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(index)}
                    >
                      <Trash2 size={16} color="white" />
                    </TouchableOpacity>
                    {index === 0 && (
                      <View style={styles.coverImageBadge}>
                        <Text style={styles.coverImageText}>Kapak</Text>
                      </View>
                    )}
                    {img.status === 'pending' && (
                      <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                        <Text style={{ color: 'white', fontSize: 10 }}>Hazır</Text>
                      </View>
                    )}
                    {img.status === 'failed' && (
                      <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: '#dc2626', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                        <Text style={{ color: 'white', fontSize: 10 }}>Hata</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Kamp Türü */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kamp Türü</Text>
            <View style={styles.typeGrid}>
              {campingTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeCard,
                    formData.type === type.id && styles.typeCardSelected
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, type: type.id as any }))}
                >
                  <SvgXml xml={getCampingTypeIcon(type.id)} width={24} height={24} style={styles.typeIcon} />
                  <Text style={[
                    styles.typeLabel,
                    formData.type === type.id && styles.typeLabelSelected
                  ]}>
                    {getCampingTypeLabel(type.id)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Olanaklar */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Olanaklar</Text>
            <View style={styles.amenitiesGrid}>
              {availableAmenities.map((amenity) => (
                <TouchableOpacity
                  key={amenity.id}
                  style={[
                    styles.amenityChip,
                    formData.amenities.includes(amenity.id) && styles.amenityChipSelected
                  ]}
                  onPress={() => toggleAmenity(amenity.id)}
                >
                  <Text style={styles.amenityIcon}>{amenity.icon}</Text>
                  <Text style={[
                    styles.amenityLabel,
                    formData.amenities.includes(amenity.id) && styles.amenityLabelSelected
                  ]}>
                    {amenity.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* İletişim Bilgileri */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefon</Text>
              <TextInput
                style={[styles.input, { color: '#222' }]}
                value={formData.phone}
                onChangeText={text => setFormData(prev => ({ ...prev, phone: text }))}
                placeholder="+90 555 123 45 67"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-posta</Text>
              <TextInput
                style={[styles.input, { color: '#222' }]}
                value={formData.contact_email}
                onChangeText={text => setFormData(prev => ({ ...prev, contact_email: text }))}
                placeholder="info@kampalani.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Website</Text>
              <TextInput
                style={[styles.input, { color: '#222' }]}
                value={formData.website}
                onChangeText={text => setFormData(prev => ({ ...prev, website: text }))}
                placeholder="https://www.kampalani.com"
                placeholderTextColor="#64748b"
                keyboardType="url"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Rezervasyon Linki</Text>
              <TextInput
                style={[styles.input, { color: '#64748b' }]}
                value={formData.booking_url}
                onChangeText={text => setFormData(prev => ({ ...prev, booking_url: text }))}
                placeholder="https://rezervasyon.com"
                placeholderTextColor="#64748b"
                keyboardType="url"
              />
            </View>
          </View>

          {/* Diğer Bilgiler */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Diğer Bilgiler</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Açılış Saatleri</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>Hafta İçi</Text>
                  <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: Platform.OS === 'ios' ? 'visible' : 'hidden', backgroundColor: 'white' }}>
                    <Picker
                      selectedValue={JSON.stringify(formData.opening_hours.weekday)}
                      onValueChange={val => {
                        const obj = val ? JSON.parse(val) : { open: '', close: '' };
                        setFormData(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, weekday: obj } }));
                      }}
                      style={Platform.OS === 'ios' ? { color: '#64748b' } : { height: 55, color: '#64748b' }}
                      itemStyle={Platform.OS === 'ios' ? { height: 120, fontSize: 15, color: '#64748b' } : undefined}
                    >
                      {timeOptions.map(opt => (
                        <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                      ))}
                    </Picker>
                  </View>
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>Hafta Sonu</Text>
                  <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: Platform.OS === 'ios' ? 'visible' : 'hidden', backgroundColor: 'white' }}>
                    <Picker
                      selectedValue={JSON.stringify(formData.opening_hours.weekend)}
                      onValueChange={val => {
                        const obj = val ? JSON.parse(val) : { open: '', close: '' };
                        setFormData(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, weekend: obj } }));
                      }}
                      style={Platform.OS === 'ios' ? { color: '#64748b' } : { height: 55, color: '#64748b' }}
                      itemStyle={Platform.OS === 'ios' ? { height: 120, fontSize: 15, color: '#64748b' } : undefined}
                    >
                      {timeOptions.map(opt => (
                        <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Sadece hazır saat dilimlerinden seçim yapabilirsiniz.
              </Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kapasite (kişi)</Text>
              <TextInput
                style={[styles.input, { color: '#64748b' }]}
                value={formData.capacity}
                onChangeText={text => setFormData(prev => ({ ...prev, capacity: text }))}
                placeholder="100"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Fiyat Aralığı</Text>
              <View style={styles.priceGrid}>
                {priceRanges.map((price) => (
                  <TouchableOpacity
                    key={price.id}
                    style={[
                      styles.priceChip,
                      formData.price_range === price.id && styles.priceChipSelected
                    ]}
                    onPress={() => setFormData(prev => ({
                      ...prev,
                      price_range: price.id,
                      fee: price.id !== 'free' && price.id !== ''
                    }))}
                  >
                    <Text style={[
                      styles.priceLabel,
                      formData.price_range === price.id && styles.priceLabelSelected
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
              <View style={[styles.checkbox, formData.fee && styles.checkboxChecked]}>
                {formData.fee && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.feeLabel}>Ücretli alan</Text>
            </TouchableOpacity>
            {/* Görünürlük Seçimi kaldırıldı, Temel Bilgiler altına taşındı */}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {isGuest && remainingAreas !== Infinity && (
            <View style={{ 
              backgroundColor: remainingAreas <= 3 ? '#fef2f2' : '#f0fdf4', 
              padding: 12, 
              borderRadius: 8, 
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ 
                  fontSize: 13, 
                  color: remainingAreas <= 3 ? '#dc2626' : '#059669',
                  fontWeight: '600' 
                }}>
                  {remainingAreas > 0 
                    ? `${remainingAreas} kamp alanı daha ekleyebilirsiniz` 
                    : 'Kamp alanı ekleme limitine ulaştınız'}
                </Text>
                <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  Premium ile sınırsız kamp alanı oluşturun
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: '#059669',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginLeft: 8,
                }}
                onPress={() => {
                  onClose();
                  const { router } = require('expo-router');
                  router.push('/premium');
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Premium</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={[styles.submitButton, (loading || imagePickerLoading) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading || imagePickerLoading}
          >
            <Text style={styles.submitButtonText}>
              {imagePickerLoading ? 'Görseller yükleniyor...' : loading ? 'Kaydediliyor...' : 'Kaydet'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
