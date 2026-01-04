import React, { useEffect, useState } from 'react';
import { SvgXml } from 'react-native-svg';
import { getSVGIcon } from './icons/svgIcons';
import { Image } from 'react-native';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Modal, TouchableOpacity, Alert } from 'react-native';
import { Shield, Tag, Info, AlertTriangle, X } from 'lucide-react-native';
import { provinceNameToValilikId } from '../lib/provinceMap';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_URL } from '../lib/config';
import { getToken } from '../lib/auth';
import { getDatabase } from '../lib/database';

// Anahtar kelimeye göre ikon eşlemesi
const keywordIcon = (keyword: string) => {
  switch (keyword.toLowerCase()) {
    case 'deprem':
      return <AlertTriangle size={18} color="#f59e0b" style={styles.icon} />;
    case 'gönüllü':
      return <Shield size={18} color="#059669" style={styles.icon} />;
    case 'yardım':
      return <Info size={18} color="#2563eb" style={styles.icon} />;
    default:
      return <Tag size={18} color="#6b7280" style={styles.icon} />;
  }
};

// Plaka numarasından il adı + Valiliği
const plakaToIlMap: Record<number, string> = Object.entries(provinceNameToValilikId)
  .reduce((acc, [il, plaka]) => { acc[plaka] = il.charAt(0).toUpperCase() + il.slice(1); return acc; }, {} as Record<number, string>);
const getValilik = (valilik_id: number | string) => {
  const plaka = typeof valilik_id === 'string' ? parseInt(valilik_id) : valilik_id;
  const il = plakaToIlMap[plaka] || '';
  return il ? `${capitalizeTurkish(il)} Valiliği` : '';
};
function capitalizeTurkish(str: string) {
  if (!str) return '';
  // Türkçe karakterler için özel büyük harf
  return str.charAt(0).toLocaleUpperCase('tr-TR') + str.slice(1);
}


interface AnnouncementDetailProps {
  visible: boolean;
  announcement: any;
  onClose: () => void;
}

const AnnouncementDetail: React.FC<AnnouncementDetailProps> = ({ visible, announcement, onClose }) => {
  if (!announcement) return null;
  // Kamp alanı adı (varsa)
  let campingAreaName = '';
  if (announcement.camping_areas && Array.isArray(announcement.camping_areas) && announcement.etkinlik_yeri_id) {
    const found = announcement.camping_areas.find((a: any) => String(a.id) === String(announcement.etkinlik_yeri_id));
    if (found) campingAreaName = found.name;
  } else if (announcement.etkinlik_yeri) {
    campingAreaName = announcement.etkinlik_yeri;
  }

  // Fotoğrafları al
  let photos: string[] = [];
  if (Array.isArray(announcement.event_photos)) {
    photos = announcement.event_photos.filter((p: any) => typeof p === 'string' && p.startsWith('http'));
  } else if (typeof announcement.event_photos === 'string') {
    try {
      const arr = JSON.parse(announcement.event_photos);
      if (Array.isArray(arr)) photos = arr.filter((p: any) => typeof p === 'string' && p.startsWith('http'));
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Kapat">
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0 }}>
          {/* Fotoğraf tam genişlikte */}
          {photos.length > 0 && (
            <View style={{ width: '100%', aspectRatio: 1.6, backgroundColor: '#e5e7eb', marginBottom: 0 }}>
              <Image source={{ uri: photos[0] }} style={{ width: '100%', height: 250, borderRadius: 0 }} resizeMode="cover" />
            </View>
          )}
          <View style={styles.card}>
            <Text style={styles.title}>{announcement.title}</Text>
            {/* Valilik bilgisi */}
            {announcement.valilik_id ? (
              <Text style={styles.valilik}>{getValilik(announcement.valilik_id)}</Text>
            ) : null}
            {/* Etkinlik bilgileri chip ve SVG ile */}
            {(announcement.etkinlik_turu || announcement.zorluk_seviyesi || announcement.etkinlik_suresi || campingAreaName) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, marginTop: 2, flexWrap: 'wrap' }}>
                {announcement.etkinlik_turu && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
                    <SvgXml xml={getSVGIcon('etkinlik_turu', { width: 20, height: 20 })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{announcement.etkinlik_turu}</Text>
                  </View>
                )}
                {announcement.zorluk_seviyesi && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
                    <SvgXml xml={getSVGIcon('zorluk_seviyesi', { width: 20, height: 20 })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{announcement.zorluk_seviyesi}</Text>
                  </View>
                )}
                {announcement.etkinlik_suresi && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SvgXml xml={getSVGIcon('etkinlik_suresi', { width: 20, height: 20 })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{announcement.etkinlik_suresi}</Text>
                  </View>
                )}
                {campingAreaName && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SvgXml xml={getSVGIcon('etkinlik_yeri', { width: 20, height: 20 })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: '#3f3f3fff', fontWeight: 'bold' }}>{campingAreaName}</Text>
                  </View>
                )}
              </View>
            )}
            {/* Anahtar kelimeler chip tarzı */}
            {announcement.community_id === 0 && announcement.keywords && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                {(Array.isArray(announcement.keywords) ? announcement.keywords : String(announcement.keywords).split(',').map(k => k.trim()).filter(Boolean)).map((kw: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4 }}>
                    {keywordIcon(kw)}
                    <Text style={{ fontSize: 13, color: '#374151', marginLeft: 2 }}>{kw}</Text>
                  </View>
                ))}
              </View>
            )}
            {/* Eski açıklama alanı */}
            <Text style={styles.description}>{announcement.description || announcement.content || announcement.message}</Text>
            {/* Detaylı bilgi butonu */}
            {announcement.link && typeof announcement.link === 'string' && announcement.link.trim() !== '' && (
              <TouchableOpacity
                style={{ backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 10, marginBottom: 2 }}
                onPress={() => {
                  let url = announcement.link;
                  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                  try {
                    // @ts-ignore
                    import('react-native').then(RN => RN.Linking.openURL(url));
                  } catch {
                    Alert.alert('Hata', 'Bağlantı açılamadı.');
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Detaylı bilgi</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};
const styles = StyleSheet.create({
  photoScroll: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 0,
    minHeight: 160,
    maxHeight: 180,
  },
  photoCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 8,
    backgroundColor: '#f3f4f6',
    shadowColor: '#6366f1',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  photoShadow: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#374151',
    marginLeft: 4,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#6366f1',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'left',
  },
  valilik: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
    marginBottom: 12,
  },
  keywordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  keywordText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 4,
  },
  icon: {
    marginRight: 2,
  },
  description: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
    marginTop: 8,
    textAlign: 'left',
  },
});

export default AnnouncementDetail;
