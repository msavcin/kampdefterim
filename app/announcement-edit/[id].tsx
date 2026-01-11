import React, { useEffect, useState, useRef } from 'react';
import CustomDatePicker, { formatDateTR } from '../../components/CustomDatePicker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { X, Save } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';
import { getMe } from '@/lib/userCommunityApi';
import { getDatabase } from '@/lib/database';

interface AnnouncementEditScreenProps {
  id: number|string;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AnnouncementEditScreen({ id, visible, onClose, onSuccess }: AnnouncementEditScreenProps) {
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
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setUploadingPhoto(true);
      try {
        const localUri = result.assets[0].uri;
        const mimeType = result.assets[0].mimeType || 'image/jpeg';
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
  const [baslama_zamani, setBaslamaZamani] = useState('');
  const [bitis_zamani, setBitisZamani] = useState('');
  const [showBaslamaPicker, setShowBaslamaPicker] = useState(false);
  const [showBitisPicker, setShowBitisPicker] = useState(false);
  const router = require('expo-router').useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState<any>(null);
  const etkinlikTuruList = ['Kamp', 'Hiking', 'Rafting', 'Tırmanış', 'Bisiklet', 'Diğer'];
  const zorlukSeviyesiList = ['Kolay', 'Orta', 'Orta-Zor', 'Zor'];
  const [form, setForm] = useState({
    title: '',
    content: '',
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
          content: data.content || data.message || '',
          etkinlik_turu: data.etkinlik_turu || '',
          zorluk_seviyesi: data.zorluk_seviyesi || '',
          etkinlik_tarihi: data.etkinlik_tarihi || '',
          etkinlik_suresi: data.etkinlik_suresi || '',
          etkinlik_yeri: data.etkinlik_yeri || '',
        });
        setBaslamaZamani(data.baslama_zamani || '');
        setBitisZamani(data.bitis_zamani || '');
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
          content: form.content,
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
          content: form.content,
          message: form.content,
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
        // Sunucuya başarıyla kaydedildiyse local veritabanını da güncelle
        try {
          const db = getDatabase();
          const updatedData = await res.json();
          // Local veritabanında güncelle (announcements tablosunda)
          await db.insertAnnouncement({
            ...updatedData,
            event_photos: typeof updatedData.event_photos === 'string' 
              ? updatedData.event_photos 
              : JSON.stringify(updatedData.event_photos || [])
          });
          console.log('[ANNOUNCEMENT][UPDATE] Local veritabanı güncellendi');
        } catch (e) {
          console.warn('[ANNOUNCEMENT][UPDATE] Local veritabanı güncelleme hatası:', e);
        }
        
        Alert.alert('Başarılı', 'Duyuru güncellendi.', [
          { text: 'Tamam', onPress: () => {
              router.replace('/announcements');
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
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Duyuru Düzenle</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>
        {/* ...Tarih alanı kaldırıldı... */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : (
          <>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Temel Bilgiler</Text>
                {/* Etkinlik fotoğrafı alanı sadece announcement doluysa gösterilecek */}
                {announcement && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Etkinlik Fotoğrafı</Text>
                    {eventPhoto ? (
                      <View style={{ alignItems: 'center' }}>
                        <Image source={{ uri: eventPhoto }} style={{ width: 180, height: 120, borderRadius: 8, marginBottom: 8 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#2563eb', padding: 8, borderRadius: 8, marginRight: 8 }}
                            onPress={pickEventPhoto}
                            disabled={uploadingPhoto}
                          >
                            <Text style={{ color: 'white', textAlign: 'center' }}>{uploadingPhoto ? 'Yükleniyor...' : 'Fotoğrafı Değiştir'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: '#ef4444', padding: 8, borderRadius: 8 }}
                            onPress={removeEventPhoto}
                            disabled={removingPhoto}
                          >
                            <Text style={{ color: 'white', textAlign: 'center' }}>{removingPhoto ? 'Siliniyor...' : 'Fotoğrafı Sil'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{ backgroundColor: (!announcement?.community_id && announcement?.role !== 'superadmin') ? '#a5b4fc' : '#2563eb', padding: 10, borderRadius: 8, marginBottom: 8 }}
                        onPress={pickEventPhoto}
                        disabled={uploadingPhoto || (!announcement?.community_id && announcement?.role !== 'superadmin')}
                      >
                        <Text style={{ color: 'white', textAlign: 'center' }}>{uploadingPhoto ? 'Yükleniyor...' : 'Fotoğraf Yükle'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Başlık *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.title}
                    onChangeText={text => setForm(f => ({ ...f, title: text }))}
                    placeholder="Duyuru başlığı"
                  />
                </View>
                {announcementType === 'etkinlik' && (
                  <>
                    {/* Etkinlik Türü tag seçimi */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Etkinlik Türü</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {etkinlikTuruList.map((tur) => (
                          <TouchableOpacity
                            key={tur}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 16,
                              borderRadius: 18,
                              backgroundColor: form.etkinlik_turu === tur ? '#2563eb' : '#e5e7eb',
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                            onPress={() => setForm(f => ({ ...f, etkinlik_turu: tur }))}
                          >
                            <Text style={{ color: form.etkinlik_turu === tur ? '#fff' : '#2563eb', fontWeight: 'bold' }}>{tur}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {/* Zorluk Seviyesi tag seçimi */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Zorluk Seviyesi</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {zorlukSeviyesiList.map((zorluk) => (
                          <TouchableOpacity
                            key={zorluk}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 16,
                              borderRadius: 18,
                              backgroundColor: form.zorluk_seviyesi === zorluk ? '#2563eb' : '#e5e7eb',
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                            onPress={() => setForm(f => ({ ...f, zorluk_seviyesi: zorluk }))}
                          >
                            <Text style={{ color: form.zorluk_seviyesi === zorluk ? '#fff' : '#2563eb', fontWeight: 'bold' }}>{zorluk}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {/* Süre alanı */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Etkinlik Süresi</Text>
                      <TextInput
                        style={styles.input}
                        value={form.etkinlik_suresi}
                        onChangeText={text => setForm(f => ({ ...f, etkinlik_suresi: text }))}
                        placeholder="örn. 2 gün, 5 saat"
                      />
                    </View>
                    {/* Yer alanı */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Etkinlik Yeri</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: showCampingAreaSearch ? '#2563eb' : '#e5e7eb', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 8 }}
                        onPress={() => setShowCampingAreaSearch(v => !v)}
                      >
                        <Text style={{ color: showCampingAreaSearch ? '#fff' : '#2563eb', fontWeight: 'bold' }}>
                          {showCampingAreaSearch ? 'Etkinlik Yeri Aramasını Gizle' : 'Etkinlik Yeri Ara'}
                        </Text>
                      </TouchableOpacity>
                      {showCampingAreaSearch && (
                        <>
                          <TextInput
                            style={styles.input}
                            placeholder="Etkinlik Yeri ara (en az 3 harf)"
                            value={campingAreaSearchText}
                            onChangeText={setCampingAreaSearchText}
                            placeholderTextColor="#1f1f1fff"
                          />
                          {campingAreaSearchText.length >= 3 && searchCampingAreas.length > 0 && (
                            <View style={{ borderWidth: 1, borderColor: '#2563eb', borderRadius: 12, backgroundColor: '#fff', marginTop: 4 }}>
                              {searchCampingAreas.map(area => (
                                <TouchableOpacity
                                  key={area.id}
                                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: selectedCampingAreaId === area.id ? '#f3f4f6' : '#fff' }}
                                  onPress={() => {
                                    setSelectedCampingAreaId(area.id);
                                    setForm(f => ({ ...f, etkinlik_yeri: area.name }));
                                    setCampingAreaSearchText('');
                                    setSearchCampingAreas([]);
                                  }}
                                >
                                  <Text style={{ color: '#1f2937', fontSize: 15 }}>{area.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                      {/* Seçilen kamp alanı tag olarak gösterilsin */}
                      {selectedCampingAreaId && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                          <View style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{campingAreas.find(a => a.id === selectedCampingAreaId)?.name || form.etkinlik_yeri}</Text>
                          </View>
                          <TouchableOpacity onPress={() => { setSelectedCampingAreaId(null); setForm(f => ({ ...f, etkinlik_yeri: '' })); }}>
                            <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 16 }}>×</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <TextInput
                        style={[styles.input, { marginTop: 8 }]}
                        placeholder="Etkinlik Yeri"
                        value={form.etkinlik_yeri}
                        onChangeText={text => {
                          setForm(f => ({ ...f, etkinlik_yeri: text }));
                          setSelectedCampingAreaId(null);
                        }}
                        placeholderTextColor="#1f1f1fff"
                      />
                    </View>
                    {/* Başlangıç ve Bitiş Tarihi alanları */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Duyuru Başlangıç Tarihi</Text>
                      <TouchableOpacity onPress={() => setShowBaslamaPicker(true)} style={styles.input}>
                        <Text style={{ color: '#2563eb', fontSize: 16 }}>
                          {baslama_zamani ? formatDateTR(baslama_zamani) : 'Tarih seçiniz'}
                        </Text>
                      </TouchableOpacity>
                      <CustomDatePicker
                        value={baslama_zamani ? new Date(baslama_zamani) : null}
                        visible={showBaslamaPicker}
                        onChange={date => {
                          if (date) {
                            const now = new Date();
                            date.setHours(now.getHours(), now.getMinutes(), 0, 0);
                            const iso = date.toISOString().replace('T', ' ').slice(0, 19);
                            setBaslamaZamani(iso);
                          }
                        }}
                        onClose={() => setShowBaslamaPicker(false)}
                        title="Başlangıç Tarihi Seç"
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Duyuru Bitiş Tarihi</Text>
                      <TouchableOpacity onPress={() => setShowBitisPicker(true)} style={styles.input}>
                        <Text style={{ color: '#2563eb', fontSize: 16 }}>
                          {bitis_zamani ? formatDateTR(bitis_zamani) : 'Tarih seçiniz'}
                        </Text>
                      </TouchableOpacity>
                      <CustomDatePicker
                        value={bitis_zamani ? new Date(bitis_zamani) : null}
                        visible={showBitisPicker}
                        onChange={date => {
                          if (date) {
                            const now = new Date();
                            date.setHours(now.getHours(), now.getMinutes(), 0, 0);
                            const iso = date.toISOString().replace('T', ' ').slice(0, 19);
                            setBitisZamani(iso);
                          }
                        }}
                        onClose={() => setShowBitisPicker(false)}
                        title="Bitiş Tarihi Seç"
                      />
                    </View>
                  </>
                )}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>İçerik</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={form.content}
                    onChangeText={text => setForm(f => ({ ...f, content: text }))}
                    placeholder="Duyuru içeriği"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.submitButton, saving && styles.submitButtonDisabled]}
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
  footer: {
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
