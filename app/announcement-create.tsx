import CustomDatePicker, { formatDateTR } from '../components/CustomDatePicker';
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
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    shadowColor: '#2563eb',
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
    backgroundColor: '#e5e7eb',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 22,
    color: '#2563eb',
    fontWeight: 'bold',
    marginTop: -2,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 24,
    textAlign: 'center',
    marginTop: 8,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#1f2937',
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  button: {
    width: '100%',
    backgroundColor: '#2563eb',
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
    backgroundColor: '#e5e7eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '100',
  },
});

import { API_URL } from '@/lib/config';
import React, { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
// DatePicker kaldırıldı
import { useRouter } from 'expo-router';
import { getToken } from '../lib/auth';
import { getMe } from '../lib/userCommunityApi';
import { getDatabase } from '../lib/database';

// Alttaki styles tanımı kaldırıldı, sadece üstteki styles kullanılacak

export default function AnnouncementCreate() {
  const [eventPhoto, setEventPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Fotoğraf seçme ve yükleme
  const pickEventPhoto = async () => {
    if (!user?.community_id && user?.role !== 'superadmin') {
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
  const [baslama_zamani, setBaslamaZamani] = useState('');
  const [bitis_zamani, setBitisZamani] = useState('');
  // Sadece birer tane tanımlı olmalı
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(true);
  const [showBaslamaPicker, setShowBaslamaPicker] = useState(false);
  const [showBitisPicker, setShowBitisPicker] = useState(false);
  const router = useRouter();

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
      Alert.alert('Başarılı', 'Duyuru başarıyla eklendi!', [
        { text: 'Tamam', onPress: () => {
            router.replace('/announcements?refresh=1');
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
      visible={modalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        setModalVisible(false);
        router.back();
      }}
    >
      <View style={styles.modalBg}>
        <KeyboardAvoidingView
          style={styles.modalCard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, width: '100%' }} keyboardShouldPersistTaps="always">
            <TouchableOpacity style={styles.closeButton} onPress={() => { setModalVisible(false); router.back(); }}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Yeni Duyuru Oluştur</Text>
            {/* Etkinlik fotoğrafı alanı sadece user doluysa gösterilecek */}
            {user && (
              <View style={{ marginBottom: 16, }}>
                <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Etkinlik Fotoğrafı</Text>
                {eventPhoto ? (
                  <Image source={{ uri: eventPhoto }} style={{ width: 180, height: 120, borderRadius: 8, marginBottom: 8 }} />
                ) : null}
                <TouchableOpacity
                  style={{ backgroundColor: (!user?.community_id && user?.role !== 'superadmin') ? '#a5b4fc' : '#2563eb', padding: 10, borderRadius: 8, marginBottom: 8 }}
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
                  style={{ flex: 1, backgroundColor: announcementType === 'duyuru' ? '#2563eb' : '#e5e7eb', borderRadius: 10, padding: 10, alignItems: 'center', marginRight: 2 }}
                  onPress={() => setAnnouncementType('duyuru')}
                >
                  <Text style={{ color: announcementType === 'duyuru' ? '#fff' : '#2563eb', fontWeight: 'bold' }}>Duyuru</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: announcementType === 'etkinlik' ? '#2563eb' : '#e5e7eb', borderRadius: 10, padding: 10, alignItems: 'center', marginLeft: 2 }}
                  onPress={() => setAnnouncementType('etkinlik')}
                >
                  <Text style={{ color: announcementType === 'etkinlik' ? '#fff' : '#2563eb', fontWeight: 'bold' }}>Etkinlik</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Duyuru tipine göre alanlar */}
            <TextInput
              style={styles.input}
              placeholder="Başlık"
              value={title}
              onChangeText={setTitle}
              editable={!loading}
              placeholderTextColor="#64748b"
            />
            {announcementType === 'etkinlik' && (
              <View>
                {/* Etkinlik Türü tag seçimi */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: '#2563eb', marginBottom: 6 }}>Etkinlik Türü:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {etkinlikTuruList.map((tur) => (
                      <TouchableOpacity
                        key={tur}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 18,
                          backgroundColor: etkinlikTuru === tur ? '#2563eb' : '#e5e7eb',
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                        onPress={() => setEtkinlikTuru(tur)}
                        disabled={loading}
                      >
                        <Text style={{ color: etkinlikTuru === tur ? '#fff' : '#2563eb', fontWeight: 'bold' }}>{tur}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {/* Zorluk Seviyesi tag seçimi */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: '#2563eb', marginBottom: 6 }}>Zorluk Seviyesi:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {zorlukSeviyesiList.map((zorluk) => (
                      <TouchableOpacity
                        key={zorluk}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 18,
                          backgroundColor: zorlukSeviyesi === zorluk ? '#2563eb' : '#e5e7eb',
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                        onPress={() => setZorlukSeviyesi(zorluk)}
                        disabled={loading}
                      >
                        <Text style={{ color: zorlukSeviyesi === zorluk ? '#fff' : '#2563eb', fontWeight: 'bold' }}>{zorluk}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {/* Etkinlik Süresi alanı */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: '#2563eb', marginBottom: 6 }}>Etkinlik Süresi:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="örn. 2 gün, 5 saat"
                    value={etkinlikSuresi}
                    onChangeText={setEtkinlikSuresi}
                    editable={!loading}
                    placeholderTextColor="#64748b"
                  />
                </View>
                {/* Etkinlik Yeri arama ve seçim arayüzü */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: '#2563eb', marginBottom: 6 }}>Etkinlik Yeri:</Text>
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
                        placeholderTextColor="#64748b"
                      />
                      {campingAreaSearchText.length >= 3 && searchCampingAreas.length > 0 && (
                        <View style={{ borderWidth: 1, borderColor: '#2563eb', borderRadius: 12, backgroundColor: '#fff', marginTop: 4 }}>
                          {searchCampingAreas.map(area => (
                            <TouchableOpacity
                              key={area.id}
                              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: selectedCampingAreaId === area.id ? '#f3f4f6' : '#fff' }}
                              onPress={() => {
                                setSelectedCampingAreaId(area.id);
                                setEtkinlikYeri(area.name);
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
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{campingAreas.find(a => a.id === selectedCampingAreaId)?.name || etkinlikYeri}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setSelectedCampingAreaId(null); setEtkinlikYeri(''); }}>
                        <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 16 }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    placeholder="Etkinlik Yeri"
                    value={etkinlikYeri}
                    onChangeText={text => {
                      setEtkinlikYeri(text);
                      setSelectedCampingAreaId(null);
                    }}
                    editable={!loading}
                    placeholderTextColor="#64748b"
                  />
                </View>
                {/* Başlangıç ve Bitiş Tarihi alanları */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: '#2563eb', marginBottom: 6 }}>Duyuru Başlangıç Tarihi:</Text>
                  <TouchableOpacity onPress={() => setShowBaslamaPicker(true)} style={styles.input}>
                    <Text style={{ color: '#2563eb', fontSize: 16 }}>
                      {baslama_zamani ? formatDateTR(baslama_zamani) : 'Tarih seçiniz'}
                    </Text>
                  </TouchableOpacity>
                  <CustomDatePicker
                    value={baslama_zamani ? new Date(baslama_zamani) : undefined}
                    visible={showBaslamaPicker}
                    onChange={(date) => {
                      if (date && date instanceof Date) {
                        const now = new Date();
                        date.setHours(now.getHours(), now.getMinutes(), 0, 0);
                        const iso = date.toISOString().replace('T', ' ').slice(0, 19);
                        setBaslamaZamani(iso);
                      } else if (typeof date === 'string') {
                        setBaslamaZamani(date);
                      } else {
                        setBaslamaZamani('');
                      }
                    }}
                    onClose={() => setShowBaslamaPicker(false)}
                    title="Başlangıç Tarihi Seç"
                  />
                </View>
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ fontWeight: 'bold', color: '#2563eb', marginBottom: 6 }}>Duyuru Bitiş Tarihi:</Text>
                  <TouchableOpacity onPress={() => setShowBitisPicker(true)} style={styles.input}>
                    <Text style={{ color: '#2563eb', fontSize: 16 }}>
                      {bitis_zamani ? formatDateTR(bitis_zamani) : 'Tarih seçiniz'}
                    </Text>
                  </TouchableOpacity>
                  <CustomDatePicker
                    value={bitis_zamani ? new Date(bitis_zamani) : undefined}
                    visible={showBitisPicker}
                    onChange={(date) => {
                      if (date && date instanceof Date) {
                        const now = new Date();
                        date.setHours(now.getHours(), now.getMinutes(), 0, 0);
                        const iso = date.toISOString().replace('T', ' ').slice(0, 19);
                        setBitisZamani(iso);
                      } else if (typeof date === 'string') {
                        setBitisZamani(date);
                      } else {
                        setBitisZamani('');
                      }
                    }}
                    onClose={() => setShowBitisPicker(false)}
                    title="Bitiş Tarihi Seç"
                  />
                </View>
              </View>
            )}
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="İçerik"
              value={content}
              onChangeText={setContent}
              multiline
              editable={!loading}
                    placeholderTextColor="#64748b"
            />
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color="#1f1f1fff" />
            ) : (
              <TouchableOpacity style={styles.button} onPress={handleSubmit}>
                <Text style={styles.buttonText}>Duyuru Ekle</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelButton} onPress={() => { setModalVisible(false); router.back(); }}>
              <Text style={styles.cancelButtonText}>Vazgeç</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
