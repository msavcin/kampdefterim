import React, { useEffect, useState, useRef } from 'react';
import { formatDateTR } from '../../components/CustomDatePicker';
import DateRangePicker from '../../components/DateRangePicker';
import * as ImagePicker from 'expo-image-picker';
import { optimizeImageForWeb } from '@/lib/imageOptimizer';
import { Image } from 'react-native';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { X, Save } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';
import { getMe } from '@/lib/userCommunityApi';
import { getDatabase } from '@/lib/database';
import { useTheme } from '../../components/ThemeProvider';

interface AnnouncementEditScreenProps {
  id: number|string;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AnnouncementEditScreen({ id, visible, onClose, onSuccess }: AnnouncementEditScreenProps) {
  const { colors } = useTheme();
  const [eventPhoto, setEventPhoto] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Fotoğraf seçme ve yükleme
  const pickEventPhoto = async () => {
    if (!announcement?.community_id && announcement?.role !== 'superadmin') {
      Alert.alert('Hata', 'Fotoğraf yüklemek için bir topluluğa üye olmanız gerekmektedir.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
      preferSystemPhotoPicker: true,
    } as unknown as ImagePicker.ImagePickerOptions);
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setUploadingPhoto(true);
      try {
        const rawUri = result.assets[0].uri;
        const localUri = await optimizeImageForWeb(rawUri);
        const mimeType = 'image/jpeg';
        const formData = new FormData();
        let cid = announcement?.community_id;
        if (announcement?.role === 'superadmin') cid = 0;
        formData.append('community_id', String(cid ?? ''));
        formData.append('file', {
          uri: localUri,
          name: 'event-photo.jpg',
          type: mimeType,
        } as any);
        const token = await getToken();
        const res = await fetch(`${API_URL}/announcements/upload-event-photo`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          body: formData,
        });
        let data;
        try {
          data = await res.json();
        } catch (e) {
          const text = await res.text();
        }
        if (!res.ok) {
          Alert.alert('Fotoğraf yüklenemedi', `Sunucu hata kodu: ${res.status}`);
          return;
        }
        if (data?.image_url) {
          setEventPhoto(data.image_url);
        } else {
          Alert.alert('Fotoğraf yüklenemedi', 'Sunucu yanıtı alınamadı.');
        }
      } catch (err) {
        Alert.alert('Fotoğraf yüklenemedi', 'Bir hata oluştu.');
      }
      setUploadingPhoto(false);
    }
  };

  // Fotoğrafı silme fonksiyonu
  const removeEventPhoto = async () => {
    if (!eventPhoto) return;
    setRemovingPhoto(true);
    try {
      const token = await getToken();
      // API endpoint örnek: /announcements/remove-event-photo
      const res = await fetch(`${API_URL}/announcements/remove-event-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          announcement_id: id,
          photo_url: eventPhoto,
          community_id: announcement?.community_id ?? undefined,
        }),
      });
      if (res.ok) {
        setEventPhoto(null);
        Alert.alert('Fotoğraf silindi');
      } else {
        const err = await res.text();
        Alert.alert('Fotoğraf silinemedi', err || 'Sunucu hatası.');
      }
    } catch (e) {
      Alert.alert('Fotoğraf silinemedi', 'Bir hata oluştu.');
    }
    setRemovingPhoto(false);
  };
  type CampingArea = { id: number; name: string; owner_id?: number | string };
  const [campingAreas, setCampingAreas] = useState<CampingArea[]>([]);
  const [searchCampingAreas, setSearchCampingAreas] = useState<CampingArea[]>([]);
  const [campingAreaSearchText, setCampingAreaSearchText] = useState('');
  const searchTimeoutRef = useRef<number | null>(null);
  const [showCampingAreaSearch, setShowCampingAreaSearch] = useState(false);
  const [selectedCampingAreaId, setSelectedCampingAreaId] = useState<number | null>(null);
  const defaultIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const [baslama_zamani, setBaslamaZamani] = useState<string>(defaultIso);
  const [bitis_zamani, setBitisZamani] = useState<string>(defaultIso);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const router = require('expo-router').useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState<any>(null);
  const etkinlikTuruList = ['Kamp', 'Hiking', 'Rafting', 'Tırmanış', 'Bisiklet', 'Diğer'];
  const zorlukSeviyesiList = ['Kolay', 'Orta', 'Orta-Zor', 'Zor'];
  const [form, setForm] = useState({
    title: '',
    message: '',
    etkinlik_turu: '',
    zorluk_seviyesi: '',
    etkinlik_tarihi: '',
    etkinlik_suresi: '',
    etkinlik_yeri: '',
  });
  const [announcementType, setAnnouncementType] = useState<'duyuru' | 'etkinlik'>('duyuru');

  useEffect(() => {
    // Kamp alanlarını yükle (sadece kullanıcının oluşturdukları)
    (async () => {
      try {
        const db = getDatabase();
        let userId = null;
        try {
          const u = await getMe();
          userId = u && u.user ? u.user.id : u?.id;
        } catch {}
        const areas = await db.listCampingAreas?.();
        const filteredAreas = Array.isArray(areas)
          ? (areas as CampingArea[]).filter(a => String(a.owner_id ?? '') === String(userId ?? ''))
          : [];
        setCampingAreas(filteredAreas);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (campingAreaSearchText.length < 3) {
      setSearchCampingAreas([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const db = getDatabase();
        const allAreas = await db.listCampingAreas?.();
        const filtered = Array.isArray(allAreas)
          ? (allAreas as CampingArea[]).filter(a => a.name.toLowerCase().includes(campingAreaSearchText.toLowerCase()))
          : [];
        setSearchCampingAreas(filtered);
      } catch {
        setSearchCampingAreas([]);
      }
    }, 350);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [campingAreaSearchText]);

  useEffect(() => {
    async function fetchAnnouncement() {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/announcements/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setAnnouncement(data);
        // Fotoğrafı state'e aktar
        if (Array.isArray(data.event_photos) && data.event_photos.length > 0) {
          setEventPhoto(data.event_photos[0]);
        } else {
          setEventPhoto(null);
        }
        // Etkinlik alanlarından en az biri doluysa veya type 'etkinlik' ise mutlaka etkinlik alanlarını göster
        const etkinlikAlanlari = [
          data.etkinlik_turu,
          data.zorluk_seviyesi,
          data.etkinlik_tarihi,
          data.etkinlik_suresi,
          data.etkinlik_yeri
        ];
        const isEtkinlik = (data.type === 'etkinlik') || etkinlikAlanlari.some(x => typeof x === 'string' && x.trim().length > 0);
        setAnnouncementType(isEtkinlik ? 'etkinlik' : 'duyuru');
        setForm({
          title: data.title || '',
          message: data.message || data.content || '',
          etkinlik_turu: data.etkinlik_turu || '',
          zorluk_seviyesi: data.zorluk_seviyesi || '',
          etkinlik_tarihi: data.etkinlik_tarihi || '',
          etkinlik_suresi: data.etkinlik_suresi || '',
          etkinlik_yeri: data.etkinlik_yeri || '',
        });
        setBaslamaZamani(data.baslama_zamani || defaultIso);
        setBitisZamani(data.bitis_zamani || defaultIso);
      } catch (e) {
        Alert.alert('Hata', 'Duyuru bilgisi alınamadı.');
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchAnnouncement();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const user = await getMe();
      // baslama_zamani ve bitis_zamani alanlarını null olarak gönder (boşsa)
      const baslamaZamaniValue = baslama_zamani && baslama_zamani.trim() !== '' ? baslama_zamani : null;
      const bitisZamaniValue = bitis_zamani && bitis_zamani.trim() !== '' ? bitis_zamani : null;
      // Local offline güncelleme ve pending_changes'a ekleme
      try {
        const db = getDatabase();
        // user_id alanını local güncellemeye ekleme
        const { user_id, ...rest } = {
          ...announcement,
          title: form.title,
          message: form.message,
          etkinlik_turu: form.etkinlik_turu,
          zorluk_seviyesi: form.zorluk_seviyesi,
          etkinlik_tarihi: form.etkinlik_tarihi,
          etkinlik_suresi: form.etkinlik_suresi,
          etkinlik_yeri: form.etkinlik_yeri,
          baslama_zamani: baslamaZamaniValue,
          bitis_zamani: bitisZamaniValue,
          event_photos: JSON.stringify(eventPhoto ? [eventPhoto] : (announcement?.event_photos || [])),
        };
        await db.updateAnnouncementOffline(Number(id), rest);
      } catch (e) {
        console.warn('[ANNOUNCEMENT][OFFLINE][UPDATE] Local güncelleme başarısız:', e);
      }
      // Sunucuya da gönder
      const res = await fetch(`${API_URL}/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...announcement,
          title: form.title,
          message: form.message,
          etkinlik_turu: form.etkinlik_turu,
          zorluk_seviyesi: form.zorluk_seviyesi,
          etkinlik_tarihi: form.etkinlik_tarihi,
          etkinlik_suresi: form.etkinlik_suresi,
          etkinlik_yeri: form.etkinlik_yeri,
          baslama_zamani: baslamaZamaniValue,
          bitis_zamani: bitisZamaniValue,
          user_id: user?.id,
          event_photos: eventPhoto ? [eventPhoto] : (announcement?.event_photos || []),
        })
      });
      if (res.status === 200) {
        // Sunucudan güncellenmiş duyuruyu local'e senkronize et
        try {
          const db = getDatabase();
          await db.fetchAndStoreAnnouncementsFromAPI();
          console.log('[ANNOUNCEMENT][UPDATE] Delta sync tamamlandı');
        } catch (e) {
          console.warn('[ANNOUNCEMENT][UPDATE] Delta sync hatası:', e);
        }
        
        Alert.alert('Başarılı', 'Duyuru güncellendi.', [
          { text: 'Tamam', onPress: () => {
              router.replace('/announcements?refresh=1');
              onSuccess();
              onClose();
            }
          }
        ]);
      } else {
        const err = await res.text();
        Alert.alert('Hata', err || 'Duyuru güncellenemedi.');
      }
    } catch (e) {
      Alert.alert('Hata', 'Duyuru güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Duyuru Düzenle</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>
        {/* ...Tarih alanı kaldırıldı... */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Temel Bilgiler</Text>
                {/* Etkinlik fotoğrafı alanı sadece announcement doluysa gösterilecek */}
                {announcement && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Etkinlik Fotoğrafı</Text>
                    {eventPhoto ? (
                      <View style={{ alignItems: 'center' }}>
                        <Image source={{ uri: eventPhoto }} style={{ width: 180, height: 120, borderRadius: 8, marginBottom: 8 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                          <TouchableOpacity
                            style={{ backgroundColor: colors.info, padding: 8, borderRadius: 8, marginRight: 8 }}
                            onPress={pickEventPhoto}
                            disabled={uploadingPhoto}
                          >
                            <Text style={{ color: 'white', textAlign: 'center' }}>{uploadingPhoto ? 'Yükleniyor...' : 'Fotoğrafı Değiştir'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: colors.danger, padding: 8, borderRadius: 8 }}
                            onPress={removeEventPhoto}
                            disabled={removingPhoto}
                          >
                            <Text style={{ color: 'white', textAlign: 'center' }}>{removingPhoto ? 'Siliniyor...' : 'Fotoğrafı Sil'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{ backgroundColor: (!announcement?.community_id && announcement?.role !== 'superadmin') ? colors.muted : colors.info, padding: 10, borderRadius: 8, marginBottom: 8 }}
                        onPress={pickEventPhoto}
                        disabled={uploadingPhoto || (!announcement?.community_id && announcement?.role !== 'superadmin')}
                      >
                        <Text style={{ color: 'white', textAlign: 'center' }}>{uploadingPhoto ? 'Yükleniyor...' : 'Fotoğraf Yükle'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Başlık *</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    value={form.title}
                    onChangeText={text => setForm(f => ({ ...f, title: text }))}
                    placeholder="Duyuru başlığı"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                {announcementType === 'etkinlik' && (
                  <>
                    {/* Etkinlik Türü tag seçimi */}
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Etkinlik Türü</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {etkinlikTuruList.map((tur) => (
                          <TouchableOpacity
                            key={tur}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 16,
                              borderRadius: 18,
                              backgroundColor: form.etkinlik_turu === tur ? colors.info : colors.border,
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                            onPress={() => setForm(f => ({ ...f, etkinlik_turu: tur }))}
                          >
                            <Text style={{ color: form.etkinlik_turu === tur ? '#fff' : colors.info, fontWeight: 'bold' }}>{tur}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {/* Zorluk Seviyesi tag seçimi */}
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Zorluk Seviyesi</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {zorlukSeviyesiList.map((zorluk) => (
                          <TouchableOpacity
                            key={zorluk}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 16,
                              borderRadius: 18,
                              backgroundColor: form.zorluk_seviyesi === zorluk ? colors.info : colors.border,
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                            onPress={() => setForm(f => ({ ...f, zorluk_seviyesi: zorluk }))}
                          >
                            <Text style={{ color: form.zorluk_seviyesi === zorluk ? '#fff' : colors.info, fontWeight: 'bold' }}>{zorluk}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {/* Yer alanı */}
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Etkinlik Yeri</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: showCampingAreaSearch ? colors.info : colors.border, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 8 }}
                        onPress={() => setShowCampingAreaSearch(v => !v)}
                      >
                        <Text style={{ color: showCampingAreaSearch ? '#fff' : colors.info, fontWeight: 'bold' }}>
                          {showCampingAreaSearch ? 'Etkinlik Yeri Aramasını Gizle' : 'Etkinlik Yeri Ara'}
                        </Text>
                      </TouchableOpacity>
                      {showCampingAreaSearch && (
                        <>
                          <TextInput
                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                            placeholder="Etkinlik Yeri ara (en az 3 harf)"
                            value={campingAreaSearchText}
                            onChangeText={setCampingAreaSearchText}
                            placeholderTextColor={colors.muted}
                          />
                          {campingAreaSearchText.length >= 3 && searchCampingAreas.length > 0 && (
                            <View style={{ borderWidth: 1, borderColor: colors.info, borderRadius: 12, backgroundColor: colors.surface, marginTop: 4 }}>
                              {searchCampingAreas.map(area => (
                                <TouchableOpacity
                                  key={area.id}
                                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: selectedCampingAreaId === area.id ? colors.surfaceVariant : colors.surface }}
                                  onPress={() => {
                                    setSelectedCampingAreaId(area.id);
                                    setForm(f => ({ ...f, etkinlik_yeri: area.name }));
                                    setCampingAreaSearchText('');
                                    setSearchCampingAreas([]);
                                  }}
                                >
                                  <Text style={{ color: colors.text, fontSize: 15 }}>{area.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                      {/* Seçilen kamp alanı tag olarak gösterilsin */}
                      {selectedCampingAreaId && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                          <View style={{ backgroundColor: colors.info, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{campingAreas.find(a => a.id === selectedCampingAreaId)?.name || form.etkinlik_yeri}</Text>
                          </View>
                          <TouchableOpacity onPress={() => { setSelectedCampingAreaId(null); setForm(f => ({ ...f, etkinlik_yeri: '' })); }}>
                            <Text style={{ color: colors.danger, fontWeight: 'bold', fontSize: 16 }}>×</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <TextInput
                        style={[styles.input, { marginTop: 8, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        placeholder="Etkinlik Yeri"
                        value={form.etkinlik_yeri}
                        onChangeText={text => {
                          setForm(f => ({ ...f, etkinlik_yeri: text }));
                          setSelectedCampingAreaId(null);
                        }}
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                    {/* Başlangıç ve Bitiş Tarihi alanları */}
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Etkinlik Tarihi</Text>
                      <TouchableOpacity onPress={() => setShowDateRangePicker(true)} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Text style={{ color: colors.info, fontSize: 16 }}>
                          {baslama_zamani && bitis_zamani && baslama_zamani !== defaultIso
                            ? `${formatDateTR(baslama_zamani)} - ${formatDateTR(bitis_zamani)}`
                            : 'Tarih aralığı seçiniz'}
                        </Text>
                      </TouchableOpacity>
                      <DateRangePicker
                        visible={showDateRangePicker}
                        onClose={() => setShowDateRangePicker(false)}
                        onConfirm={(start, end) => {
                          const toIso = (d: Date) => {
                            const now = new Date();
                            d.setHours(now.getHours(), now.getMinutes(), 0, 0);
                            return d.toISOString().replace('T', ' ').slice(0, 19);
                          };
                          setBaslamaZamani(toIso(start));
                          setBitisZamani(toIso(end));
                          const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                          setForm(f => ({ ...f, etkinlik_suresi: diffDays === 1 ? '1 gün' : `${diffDays} gün` }));
                        }}
                        initialStartDate={baslama_zamani && baslama_zamani !== defaultIso ? new Date(baslama_zamani) : null}
                        initialEndDate={bitis_zamani && bitis_zamani !== defaultIso ? new Date(bitis_zamani) : null}
                        title="Etkinlik Tarihi Seçin"
                      />
                    </View>
                    {/* Süre alanı */}
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Etkinlik Süresi</Text>
                      <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        value={form.etkinlik_suresi}
                        onChangeText={text => setForm(f => ({ ...f, etkinlik_suresi: text }))}
                        placeholder="örn. 2 gün, 5 saat"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  </>
                )}
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>İçerik</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    value={form.message}
                    onChangeText={text => setForm(f => ({ ...f, message: text }))}
                    placeholder="Duyuru içeriği"
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </ScrollView>
            <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary }, saving && styles.submitButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Save size={20} color="white" style={{ marginRight: 8 }} />
                <Text style={styles.submitButtonText}>
                  {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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
    opacity: 0.5,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
