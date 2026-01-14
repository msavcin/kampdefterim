import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MapPin, Navigation, Info } from 'lucide-react-native';
import type { CampingArea } from '@/lib/database';
import { getCampingTypeLabel } from '@/lib/categories';

const { width } = Dimensions.get('window');

interface CampingAreaListViewProps {
  campingAreas: CampingArea[];
  onSelectArea: (area: CampingArea) => void;
  onNavigate: (area: CampingArea, provider: 'google' | 'yandex') => void;
  currentLocation?: { latitude: number; longitude: number } | null;
  favorites: Set<string | number>;
  onToggleFavorite: (area: CampingArea) => void;
}

const CampingAreaListView: React.FC<CampingAreaListViewProps> = ({
  campingAreas,
  onSelectArea,
  onNavigate,
  currentLocation,
  favorites,
  onToggleFavorite,
}) => {
  const getTypeLabel = (type: string) => {
    return getCampingTypeLabel(type);
  };

  const getCoverImage = (area: CampingArea) => {
    if (Array.isArray(area.images) && area.images.length > 0) {
      // Önce S3 linki bul
      let coverImage = area.images.find((img: string) => typeof img === 'string' && img.startsWith('http'));
      // S3 linki yoksa file:// ile başlayanı bul
      if (!coverImage) {
        coverImage = area.images.find((img: string) => typeof img === 'string' && img.startsWith('file://'));
      }
      // Hiçbiri yoksa ilkini kullan
      if (!coverImage && area.images[0]) {
        coverImage = area.images[0];
      }
      return coverImage;
    }
    return null;
  };

  const getAreaType = (area: CampingArea): string => {
    let tag = '';
    if (typeof area.tags === 'string' && (area.tags as string).trim() !== '') {
      tag = area.tags as string;
    } else if (typeof area.tags === 'object' && area.tags !== null && area.tags.type) {
      tag = area.tags.type;
    } else if (typeof area.type === 'string' && area.type.trim() !== '') {
      tag = area.type;
    }
    return tag;
  };

  const isUserSubmitted = (area: CampingArea): boolean => {
    return typeof area.tags === 'object' && area.tags?.user_submitted === 'yes';
  };

  const getOwnerName = (area: CampingArea): string => {
    if ((area as any).owner_username) {
      return (area as any).owner_username;
    }
    if (isUserSubmitted(area)) {
      return 'Kullanıcı Ekledi';
    }
    return 'Kamp Defterim';
  };

  const handleNavigationMenu = (area: CampingArea) => {
    Alert.alert(
      'Navigasyon',
      'Harita uygulaması seçin',
      [
        {
          text: 'Google Maps',
          onPress: () => onNavigate(area, 'google'),
        },
        {
          text: 'Yandex Maps',
          onPress: () => onNavigate(area, 'yandex'),
        },
        {
          text: 'İptal',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const renderItem = ({ item }: { item: CampingArea }) => {
    const coverImage = getCoverImage(item);
    const areaType = getAreaType(item);
    const typeLabel = getTypeLabel(areaType);
    const ownerName = getOwnerName(item);
    const distance = item.distance_km ? `${item.distance_km.toFixed(1)} km` : '';
    const areaId = (item as any).id;
    const isFavorite = favorites.has(areaId);

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => onSelectArea(item)}
        activeOpacity={0.7}
      >
        <View style={styles.imageContainer}>
          <Image
            source={coverImage ? { uri: coverImage } : require('../assets/images/image-placeholder.png')}
            style={coverImage ? styles.coverImage : styles.placeholderCoverImage}
            resizeMode={coverImage ? 'cover' : 'contain'}
          />
          <TouchableOpacity
            style={[styles.favoriteButton, isFavorite && styles.favoriteButtonActive]}
            onPress={() => onToggleFavorite(item)}
          >
            <Feather name="heart" size={18} color={isFavorite ? '#fff' : '#ef4444'} />
          </TouchableOpacity>
        </View>

        <View style={styles.contentContainer}>
          {/* Başlık */}
          <Text style={styles.title} numberOfLines={2}>
            {item.name || 'İsimsiz Alan'}
          </Text>

          {/* Kamp Türü */}
          <View style={styles.typeContainer}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{typeLabel}</Text>
            </View>
          </View>

          {/* Ekleyen Kullanıcı */}
          <View style={styles.infoRow}>
            <Feather name="user" size={14} color="#6b7280" />
            <Text style={styles.infoText}>{ownerName}</Text>
          </View>

          {/* Uzaklık */}
          {distance && (
            <View style={styles.infoRow}>
              <MapPin size={14} color="#6b7280" />
              <Text style={styles.infoText}>{distance}</Text>
            </View>
          )}

          {/* Aksiyon Butonları */}
          <View style={styles.actionsContainer}>
            {/* Detaylı Bilgi */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onSelectArea(item)}
            >
              <Info size={16} color="#059669" />
              <Text style={styles.actionButtonText}>Detay</Text>
            </TouchableOpacity>

            {/* Navigasyon */}
            <TouchableOpacity
              style={[styles.actionButton, styles.navigationButton]}
              onPress={() => handleNavigationMenu(item)}
            >
              <Navigation size={16} color="#3b82f6" />
              <Text style={[styles.actionButtonText, styles.navigationButtonText]}>Yol Tarifi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={campingAreas}
        renderItem={renderItem}
        keyExtractor={(item) => String((item as any).id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Feather name="map-pin" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>Kamp alanı bulunamadı</Text>
            <Text style={styles.emptySubtext}>
              Filtreleri değiştirerek veya farklı bir bölgeye bakarak arama yapabilirsiniz
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  listItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: 180,
    position: 'relative',
    backgroundColor: '#f3f4f6',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCoverImage: {
    width: '60%',
    height: '60%',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  favoriteButtonActive: {
    backgroundColor: '#ef4444',
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  typeContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#059669',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  navigationButton: {
    backgroundColor: '#eff6ff',
  },
  navigationButtonText: {
    color: '#3b82f6',
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default CampingAreaListView;
