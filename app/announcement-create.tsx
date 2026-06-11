import { formatDateTR } from '../components/CustomDatePicker';
import DateRangePicker from '../components/DateRangePicker';
const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(31,41,55,0.15)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 2,
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: -2,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    marginTop: 8,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    fontSize: 16,
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  cancelButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '100',
  },
});

import { API_URL } from '@/lib/config';
import React, { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { optimizeImageForWeb } from '../lib/imageOptimizer';
import { Image } from 'react-native';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
// DatePicker kaldırıldı
import { getToken } from '../lib/auth';
import { getMe } from '../lib/userCommunityApi';
import { getDatabase } from '../lib/database';
import { useTheme } from '../components/ThemeProvider';

// Alttaki styles tanımı kaldırıldı, sadece üstteki styles kullanılacak

interface AnnouncementCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AnnouncementCreate({ visible, onClose, onSuccess }: AnnouncementCreateProps) {
  const { colors } = useTheme();
  const [eventPhoto, setEventPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Fotoğraf seçme ve yükleme
  const pickEventPhoto = async () => {
    if (!user?.community_id && user?.role !== 'superadmin') {
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
        let cid = user?.community_id;
        if (user?.role === 'superadmin') cid = 0;
        formData.append('community_id', String(cid ?? ''));
        formData.append('file', {
          uri: localUri,
          name: 'event-photo.jpg',
          type: mimeType,
        } as any);
        // Debug: FormData içeriğini logla
        console.log('fetch öncesi community_id:', formData.get('community_id'));
        console.log('fetch öncesi file:', formData.get('file'));
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
          console.log('Upload response (text):', text);
        }
        console.log('Upload response (json):', data);
        console.log('Upload status:', res.status);
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
        console.log('Upload error:', err);
      }
      setUploadingPhoto(false);
    }
  };
  type CampingArea = { id: number; name: string; owner_id?: number | string };
  const [campingAreas, setCampingAreas] = useState<CampingArea[]>([]);
  const [searchCampingAreas, setSearchCampingAreas] = useState<CampingArea[]>([]);
  const [campingAreaSearchText, setCampingAreaSearchText] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showCampingAreaSearch, setShowCampingAreaSearch] = useState(false);
  const [selectedCampingAreaId, setSelectedCampingAreaId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [announcementType, setAnnouncementType] = useState<'duyuru' | 'etkinlik'>('duyuru');
  const etkinlikTuruList = ['Kamp', 'Hiking', 'Rafting', 'Tırmanış', 'Bisiklet', 'Diğer'];
  const zorlukSeviyesiList = ['Kolay', 'Orta', 'Orta-Zor', 'Zor'];
  const [etkinlikTuru, setEtkinlikTuru] = useState('');
  const [zorlukSeviyesi, setZorlukSeviyesi] = useState('');
  const [etkinlikSuresi, setEtkinlikSuresi] = useState('');
  const [etkinlikYeri, setEtkinlikYeri] = useState('');
  const defaultIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const [baslama_zamani, setBaslamaZamani] = useState<string>(defaultIso);
  const [bitis_zamani, setBitisZamani] = useState<string>(defaultIso);
  // Sadece birer tane tanımlı olmalı
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);

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
    (async () => {
      try {
        const u = await getMe();
        // getMe bazen { user: {...} } dönebilir
        setUser(u && u.user ? u.user : u);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  // Kamp alanı arama fonksiyonu (ilk 3 harf girilince)
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
    }, 350) as unknown as NodeJS.Timeout;
    // Temizlik
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [campingAreaSearchText]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Hata', 'Başlık ve içerik zorunludur.');
      return;
    }
    // Sadece superadmin değilse community_id zorunlu
    if (user?.role !== 'superadmin' && !user?.community_id) {
      Alert.alert('Hata', 'Duyuru oluşturmak için bir topluluğa üye olmanız gerekmektedir.');
      return;
    }
    setLoading(true);
    try {
      // EK LOG: Form state kontrolü
      console.log('[FORM STATE][ETKINLIK]', {
  etkinlikTuru,
  zorlukSeviyesi,
  etkinlikSuresi,
  etkinlikYeri,
  selectedCampingAreaId
          });
          console.log('[BAŞLANGIÇ][SEÇİLEN]', baslama_zamani);
          console.log('[BİTİŞ][SEÇİLEN]', bitis_zamani);
      const token = await getToken();
      // Superadmin ise community_id zorunlu değil
      const body: any = {
        title,
        message: content,
        event_photos: eventPhoto ? [eventPhoto] : [],
      };
      if (announcementType === 'etkinlik') {
        body.etkinlik_turu = etkinlikTuru;
        body.zorluk_seviyesi = zorlukSeviyesi;
        body.etkinlik_suresi = etkinlikSuresi;
        body.etkinlik_yeri = selectedCampingAreaId
          ? (campingAreas.find(a => a.id === selectedCampingAreaId)?.name || etkinlikYeri)
          : etkinlikYeri;
        body.etkinlik_yeri_id = selectedCampingAreaId || null;
        body.baslama_zamani = baslama_zamani && baslama_zamani !== '' ? baslama_zamani : null;
        body.bitis_zamani = bitis_zamani && bitis_zamani !== '' ? bitis_zamani : null;
        // Aktiflik kontrolü
        if (bitis_zamani) {
          try {
            const now = new Date();
            const bitis = new Date(bitis_zamani);
            body.active = bitis > now;
          } catch {
            body.active = true;
          }
        } else {
          body.active = true;
        }
      }
      if (user?.community_id) {
        body.community_id = user.community_id;
      } else if (user?.role === 'superadmin') {
        body.community_id = 0;
      }
      if (user?.valilik_id) body.valilik_id = user.valilik_id;
      // LOG: Giden body içeriği
      console.log('[DUYURU EKLE][GÖNDERİLEN BODY][ETKINLIK]', {
        etkinlik_turu: body.etkinlik_turu,
        zorluk_seviyesi: body.zorluk_seviyesi,
        etkinlik_tarihi: body.etkinlik_tarihi,
        etkinlik_suresi: body.etkinlik_suresi,
        etkinlik_yeri: body.etkinlik_yeri,
        etkinlik_yeri_id: body.etkinlik_yeri_id
      });
      console.log('[DUYURU EKLE][GÖNDERİLEN BODY]', body);
      const res = await fetch(`${API_URL}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      let apiResponse;
      try {
        apiResponse = await res.clone().json();
      } catch {
        apiResponse = await res.text();
      }
      console.log('[DUYURU EKLE][API YANITI]', res.status, apiResponse);
      if (!res.ok) {
        throw new Error(`Status: ${res.status} | ${JSON.stringify(apiResponse)}`);
      }
      
      // Sunucudan yeni eklenen duyuruyu local'e senkronize et
      try {
        const db = getDatabase();
        await db.fetchAndStoreAnnouncementsFromAPI();
        console.log('[DUYURU EKLE] Delta sync tamamlandı');
      } catch (syncErr) {
        console.warn('[DUYURU EKLE] Delta sync hatası:', syncErr);
      }
      
      Alert.alert('Başarılı', 'Duyuru başarıyla eklendi!', [
        { text: 'Tamam', onPress: () => {
            // Formu resetle (modal kapanmasa bile default tarihler güncel olsun)
            setBaslamaZamani(defaultIso);
            setBitisZamani(defaultIso);
            setTitle('');
            setContent('');
            setEventPhoto(null);
            setEtkinlikTuru('');
            setZorlukSeviyesi('');
            setEtkinlikSuresi('');
            setEtkinlikYeri('');
            setSelectedCampingAreaId(null);
            setAnnouncementType('duyuru');
            onSuccess();
            onClose();
          }
        }
      ]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} keyboardShouldPersistTaps="always">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                <Text style={{ fontSize: 24, color: colors.muted }}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.title, { flex: 1, textAlign: 'center', marginBottom: 0, color: colors.primary }]}>Yeni Duyuru Oluştur</Text>
              <View style={{ width: 40 }} />
            </View>
            {/* Etkinlik fotoğrafı alanı sadece user doluysa gösterilecek */}
            {user && (
              <View style={{ marginBottom: 16, }}>
                <Text style={{ fontWeight: 'bold', marginBottom: 8, color: colors.text }}>Etkinlik Fotoğrafı</Text>
                {eventPhoto ? (
                  <Image source={{ uri: eventPhoto }} style={{ width: 180, height: 120, borderRadius: 8, marginBottom: 8 }} />
                ) : null}
                <TouchableOpacity
                  style={{ backgroundColor: (!user?.community_id && user?.role !== 'superadmin') ? colors.muted : colors.primary, padding: 10, borderRadius: 8, marginBottom: 8 }}
                  onPress={pickEventPhoto}
                  disabled={uploadingPhoto || (!user?.community_id && user?.role !== 'superadmin')}
                >
                  <Text style={{ color: 'white', textAlign: 'center' }}>{uploadingPhoto ? 'Yükleniyor...' : (eventPhoto ? 'Fotoğrafı Değiştir' : 'Fotoğraf Yükle')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Duyuru tipi seçimi */}
            <View style={{ width: '100%', marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', gap: 0, width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: announcementType === 'duyuru' ? colors.primary : colors.border, borderRadius: 10, padding: 10, alignItems: 'center', marginRight: 2 }}
                  onPress={() => setAnnouncementType('duyuru')}
                >
                  <Text style={{ color: announcementType === 'duyuru' ? '#fff' : colors.primary, fontWeight: 'bold' }}>Duyuru</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: announcementType === 'etkinlik' ? colors.primary : colors.border, borderRadius: 10, padding: 10, alignItems: 'center', marginLeft: 2 }}
                  onPress={() => setAnnouncementType('etkinlik')}
                >
                  <Text style={{ color: announcementType === 'etkinlik' ? '#fff' : colors.primary, fontWeight: 'bold' }}>Etkinlik</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Duyuru tipine göre alanlar */}
            <TextInput
              style={[styles.input, { borderColor: colors.primary, backgroundColor: colors.surface, color: colors.text }]}
              placeholder="Başlık"
              value={title}
              onChangeText={setTitle}
              editable={!loading}
              placeholderTextColor={colors.muted}
            />
            {announcementType === 'etkinlik' && (
              <View>
                {/* Etkinlik Türü tag seçimi */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: colors.primary, marginBottom: 6 }}>Etkinlik Türü:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {etkinlikTuruList.map((tur) => (
                      <TouchableOpacity
                        key={tur}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 18,
                          backgroundColor: etkinlikTuru === tur ? colors.primary : colors.border,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                        onPress={() => setEtkinlikTuru(tur)}
                        disabled={loading}
                      >
                        <Text style={{ color: etkinlikTuru === tur ? '#fff' : colors.primary, fontWeight: 'bold' }}>{tur}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {/* Zorluk Seviyesi tag seçimi */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: colors.primary, marginBottom: 6 }}>Zorluk Seviyesi:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {zorlukSeviyesiList.map((zorluk) => (
                      <TouchableOpacity
                        key={zorluk}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 18,
                          backgroundColor: zorlukSeviyesi === zorluk ? colors.primary : colors.border,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                        onPress={() => setZorlukSeviyesi(zorluk)}
                        disabled={loading}
                      >
                        <Text style={{ color: zorlukSeviyesi === zorluk ? '#fff' : colors.primary, fontWeight: 'bold' }}>{zorluk}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {/* Etkinlik Yeri arama ve seçim arayüzü */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: colors.primary, marginBottom: 6 }}>Etkinlik Yeri:</Text>
                  <TouchableOpacity
                    style={{ backgroundColor: showCampingAreaSearch ? colors.primary : colors.border, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 8 }}
                    onPress={() => setShowCampingAreaSearch(v => !v)}
                  >
                    <Text style={{ color: showCampingAreaSearch ? '#fff' : colors.primary, fontWeight: 'bold' }}>
                      {showCampingAreaSearch ? 'Etkinlik Yeri Aramasını Gizle' : 'Etkinlik Yeri Ara'}
                    </Text>
                  </TouchableOpacity>
                  {showCampingAreaSearch && (
                    <>
                      <TextInput
                        style={[styles.input, { borderColor: colors.primary, backgroundColor: colors.surface, color: colors.text }]}
                        placeholder="Etkinlik Yeri ara (en az 3 harf)"
                        value={campingAreaSearchText}
                        onChangeText={setCampingAreaSearchText}
                        placeholderTextColor={colors.muted}
                      />
                      {campingAreaSearchText.length >= 3 && searchCampingAreas.length > 0 && (
                        <View style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.surface, marginTop: 4 }}>
                          {searchCampingAreas.map(area => (
                            <TouchableOpacity
                              key={area.id}
                              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: selectedCampingAreaId === area.id ? colors.surfaceVariant : colors.surface }}
                              onPress={() => {
                                setSelectedCampingAreaId(area.id);
                                setEtkinlikYeri(area.name);
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
                      <View style={{ backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{campingAreas.find(a => a.id === selectedCampingAreaId)?.name || etkinlikYeri}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setSelectedCampingAreaId(null); setEtkinlikYeri(''); }}>
                        <Text style={{ color: colors.danger, fontWeight: 'bold', fontSize: 16 }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    style={[styles.input, { marginTop: 8, borderColor: colors.primary, backgroundColor: colors.surface, color: colors.text }]}
                    placeholder="Etkinlik Yeri"
                    value={etkinlikYeri}
                    onChangeText={text => {
                      setEtkinlikYeri(text);
                      setSelectedCampingAreaId(null);
                    }}
                    editable={!loading}
                    placeholderTextColor={colors.muted}
                  />
                </View>
                {/* Başlangıç ve Bitiş Tarihi alanları */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: colors.primary, marginBottom: 6 }}>Etkinlik Tarihi:</Text>
                  <TouchableOpacity onPress={() => setShowDateRangePicker(true)} style={[styles.input, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>
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
                      setEtkinlikSuresi(diffDays === 1 ? '1 gün' : `${diffDays} gün`);
                    }}
                    initialStartDate={baslama_zamani && baslama_zamani !== defaultIso ? new Date(baslama_zamani) : null}
                    initialEndDate={bitis_zamani && bitis_zamani !== defaultIso ? new Date(bitis_zamani) : null}
                    title="Etkinlik Tarihi Seçin"
                  />
                </View>
                {/* Etkinlik Süresi alanı */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: colors.primary, marginBottom: 6 }}>Etkinlik Süresi:</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.primary, backgroundColor: colors.surface, color: colors.text }]}
                    placeholder="örn. 2 gün, 5 saat"
                    value={etkinlikSuresi}
                    onChangeText={setEtkinlikSuresi}
                    editable={!loading}
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
            )}
            <TextInput
              style={[styles.input, styles.textarea, { borderColor: colors.primary, backgroundColor: colors.surface, color: colors.text }]}
              placeholder="İçerik"
              value={content}
              onChangeText={setContent}
              multiline
              editable={!loading}
                    placeholderTextColor={colors.muted}
            />
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
            ) : (
              <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
                <Text style={styles.buttonText}>Duyuru Ekle</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.border }]} onPress={onClose}>
              <Text style={[styles.cancelButtonText, { color: colors.primary }]}>Vazgeç</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
