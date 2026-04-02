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
import { useTheme } from '../components/ThemeProvider';

// Anahtar kelimeye göre ikon eşlemesi (colors dışarıdan verilir)
const keywordIconFn = (keyword: string, colors: any) => {
  switch (keyword.toLowerCase()) {
    case 'deprem':
      return <AlertTriangle size={18} color={colors.warning} style={styles.icon} />;
    case 'gönüllü':
      return <Shield size={18} color={colors.primary} style={styles.icon} />;
    case 'yardım':
      return <Info size={18} color={colors.info} style={styles.icon} />;
    default:
      return <Tag size={18} color={colors.muted} style={styles.icon} />;
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
  const { colors } = useTheme();
  if (!announcement) return null;
  // Kamp alanı adı (varsa)
  let campingAreaName = '';
  if (announcement.camping_areas && Array.isArray(announcement.camping_areas) && announcement.etkinlik_yeri_id) {
    const found = announcement.camping_areas.find((a: any) => String(a.id) === String(announcement.etkinlik_yeri_id));
    if (found) campingAreaName = found.name;
  } else if (announcement.etkinlik_yeri) {
    campingAreaName = announcement.etkinlik_yeri;
  }

  // Fotoğrafları al - event_photos, images veya photo_links alanlarından
  let photos: string[] = [];
  
  const photoSources = [
    announcement.event_photos,
    announcement.images,
    announcement.photo_links
  ];
  
  for (const source of photoSources) {
    if (!source) continue;
    
    if (Array.isArray(source)) {
      photos = source.filter((p: any) => typeof p === 'string' && p.trim() !== '' && (p.startsWith('http://') || p.startsWith('https://')));
      if (photos.length > 0) break;
    } else if (typeof source === 'string' && source.trim() !== '' && source !== '[]') {
      try {
        const arr = JSON.parse(source);
        if (Array.isArray(arr)) {
          photos = arr.filter((p: any) => typeof p === 'string' && p.trim() !== '' && (p.startsWith('http://') || p.startsWith('https://')));
          if (photos.length > 0) break;
        }
      } catch (e) {
        // JSON parse hatası, devam et
      }
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surface }]} accessibilityLabel="Kapat">
            <X size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0 }}>
          {/* Fotoğraf tam genişlikte */}
          {photos.length > 0 && (
            <View style={{ width: '100%', aspectRatio: 1.6, backgroundColor: colors.border, marginBottom: 0 }}>
              <Image source={{ uri: photos[0] }} style={{ width: '100%', height: 250, borderRadius: 0 }} resizeMode="cover" />
            </View>
          )}
          <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.primary }]}>
            <Text style={[styles.title, { color: colors.text }]}>{announcement.title}</Text>
            {/* Valilik bilgisi */}
            {announcement.valilik_id ? (
              <Text style={[styles.valilik, { color: colors.info }]}>{getValilik(announcement.valilik_id)}</Text>
            ) : null}
            {/* Etkinlik bilgileri chip ve SVG ile */}
            {(announcement.etkinlik_turu || announcement.zorluk_seviyesi || announcement.etkinlik_suresi || campingAreaName) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, marginTop: 2, flexWrap: 'wrap' }}>
                {announcement.etkinlik_turu && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
                    <SvgXml xml={getSVGIcon('etkinlik_turu', { width: 20, height: 20, stroke: colors.text })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: 'bold' }}>{announcement.etkinlik_turu}</Text>
                  </View>
                )}
                {announcement.zorluk_seviyesi && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
                    <SvgXml xml={getSVGIcon('zorluk_seviyesi', { width: 20, height: 20, stroke: colors.text })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: 'bold' }}>{announcement.zorluk_seviyesi}</Text>
                  </View>
                )}
                {announcement.etkinlik_suresi && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SvgXml xml={getSVGIcon('etkinlik_suresi', { width: 20, height: 20, stroke: colors.text })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: 'bold' }}>{announcement.etkinlik_suresi}</Text>
                  </View>
                )}
                {campingAreaName && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SvgXml xml={getSVGIcon('etkinlik_yeri', { width: 20, height: 20, stroke: colors.text })} width={20} height={20} />
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: 'bold' }}>{campingAreaName}</Text>
                  </View>
                )}
              </View>
            )}
            {/* Anahtar kelimeler chip tarzı */}
            {announcement.community_id === 0 && announcement.keywords && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                {(Array.isArray(announcement.keywords) ? announcement.keywords : String(announcement.keywords).split(',').map(k => k.trim()).filter(Boolean)).map((kw: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceVariant, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4 }}>
                    {keywordIconFn(kw, colors)}
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 2 }}>{kw}</Text>
                  </View>
                ))}
              </View>
            )}
            {/* Eski açıklama alanı */}
            <Text style={[styles.description, { color: colors.textSecondary }]}>{announcement.description || announcement.content || announcement.message}</Text>
            {/* Detaylı bilgi butonu */}
            {announcement.link && typeof announcement.link === 'string' && announcement.link.trim() !== '' && (
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 10, marginBottom: 2 }}
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
                <Text style={{ color: colors.surface, fontWeight: 'bold', fontSize: 14 }}>Detaylı bilgi</Text>
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
  },
  photoShadow: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
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
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'left',
  },
  valilik: {
    fontSize: 16,
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
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  keywordText: {
    fontSize: 14,
    marginLeft: 4,
  },
  icon: {
    marginRight: 2,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
    textAlign: 'left',
  },
});

export default AnnouncementDetail;
