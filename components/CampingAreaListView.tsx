import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MapPin, Navigation, Info } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './ThemeProvider';
import { createThemedStyles } from '../constants/theme/sharedStyles';
import { eventBus } from '@/lib/eventBus';
import type { CampingArea } from '@/lib/database';
import { getCampingTypeLabel } from '@/lib/categories';
import { getLocationNameFromOSM } from '@/lib/osmReverseGeocode';

const { width } = Dimensions.get('window');

interface CampingAreaListViewProps {
  campingAreas: CampingArea[];
  onSelectArea: (area: CampingArea) => void;
  onNavigate: (area: CampingArea, provider: 'google' | 'yandex') => void;
  currentLocation?: { latitude: number; longitude: number } | null;
  favorites: Set<string | number>;
  onToggleFavorite: (area: CampingArea) => void;
  disabled?: boolean;
  isGuest?: boolean;
  isConnected?: boolean;
  isCampPlanMode?: boolean;
}

const CampingAreaListView: React.FC<CampingAreaListViewProps> = ({
  campingAreas,
  onSelectArea,
  onNavigate,
  currentLocation,
  favorites,
  onToggleFavorite,
  disabled = false,
  isGuest = false,
  isConnected = true,
  isCampPlanMode = false,
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  const themed = createThemedStyles(colors);
  const [loadingImages, setLoadingImages] = useState<Set<string | number>>(new Set());

  // Visible kamp alanları için il/ilçe bilgisi
  const [locationNames, setLocationNames] = useState<Record<string, string | null>>({});
  const [loadingLocationIds, setLoadingLocationIds] = useState<Set<string | number>>(new Set());
  const [visibleIds, setVisibleIds] = useState<Array<string | number>>([]);
  const [showSelectMode, setShowSelectMode] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Camp Plan modunu dinle: sadece planlama sırasında "Bu kampı seç" butonunu göster
  useEffect(() => {
    const onOpen = (payload: any) => {
      setShowSelectMode(true);
    };
    const onSelected = (payload: any) => {
      setShowSelectMode(false);
    };
    const onModeActive = (payload: any) => {
      try {
        setShowSelectMode(!!payload && payload.active === true);
      } catch (e) {}
    };
    eventBus.on('camp-plan:openMap', onOpen);
    eventBus.on('camp-plan:selectedArea', onSelected);
    eventBus.on('camp-plan:modeActive', onModeActive);
    // Eğer event kaçırıldıysa pending payload'a bak ve mode'u aç
    (async () => {
      try {
        const pending = await AsyncStorage.getItem('campPlanPendingOpen');
        if (pending) {
          setShowSelectMode(true);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      eventBus.off('camp-plan:openMap', onOpen);
      eventBus.off('camp-plan:selectedArea', onSelected);
      eventBus.off('camp-plan:modeActive', onModeActive);
    };
  }, []);

  // Eğer parent prop olarak camp-plan modu geliyorsa öncelikle onu uygula
  useEffect(() => {
    setShowSelectMode(!!isCampPlanMode);
  }, [isCampPlanMode]);

  const getTypeLabel = (type: string) => {
    return getCampingTypeLabel(type);
  };

  // Kamp alanlarını reverse geocode ederek il/ilçe için metin döndürür.
  // Aynı lat/lon için cache kullanılır, ayrıca Nominatim isteğini dakikada 60'a sınırlayan
  // rate-limiter ile 429 hatalarının önüne geçiyoruz.
  useEffect(() => {
    if (!isConnected) return;

    const idsToFetch = campingAreas
      .map(area => {
        const rawId = (area as any).id;
        return {
          id: rawId !== undefined && rawId !== null ? String(rawId) : null,
          lat: area.latitude,
          lon: area.longitude,
        };
      })
      .filter(({ id, lat, lon }) => {
        return (
          id !== null &&
          typeof lat === 'number' &&
          typeof lon === 'number' &&
          !(id in locationNames) &&
          !loadingLocationIds.has(id) &&
          visibleIds.includes(id)
        );
      })
      .slice(0, 10); // çok fazla isteğe girmemek için sınırlama

    idsToFetch.forEach(({ id, lat, lon }) => {
      setLoadingLocationIds(prev => new Set(prev).add(id));
      getLocationNameFromOSM(lat, lon)
        .then((name) => {
          if (!isMounted.current) return;
          setLocationNames(prev => ({ ...prev, [id]: name ?? null }));
        })
        .catch((err) => {
          console.warn('[CampingAreaListView] Reverse geocode hatası:', err);
          if (!isMounted.current) return;
          setLocationNames(prev => ({ ...prev, [id]: null }));
        })
        .finally(() => {
          if (!isMounted.current) return;
          setLoadingLocationIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    });
  }, [campingAreas, visibleIds, isConnected, locationNames, loadingLocationIds]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: CampingArea }> }) => {
    const ids = viewableItems.map(v => String((v.item as any).id));
    setVisibleIds(ids);
  }).current;

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
    const distance = item.distance_km ? `~ ${item.distance_km.toFixed(1)} km` : '';
    const areaId = (item as any).id;
    const isFavorite = favorites.has(areaId);
    const isImageLoading = loadingImages.has(areaId);

    const handleImageLoadStart = () => {
      setLoadingImages(prev => new Set(prev).add(areaId));
    };

    const handleImageLoadEnd = () => {
      setLoadingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(areaId);
        return newSet;
      });
    };

    return (
      <TouchableOpacity
        style={[styles.listItem, { backgroundColor: colors.surface }, disabled && styles.listItemDisabled]}
        onPress={() => !disabled && onSelectArea(item)}
        activeOpacity={disabled ? 1 : 0.7}
        disabled={disabled}
      >
        <View style={[styles.imageContainer, { backgroundColor: colors.surfaceVariant }]}>
          <Image
            source={coverImage ? { uri: coverImage } : require('../assets/images/image-placeholder.png')}
            style={coverImage ? styles.coverImage : styles.placeholderCoverImage}
            resizeMode={coverImage ? 'cover' : 'contain'}
            onLoadStart={coverImage ? handleImageLoadStart : undefined}
            onLoadEnd={coverImage ? handleImageLoadEnd : undefined}
            onError={coverImage ? handleImageLoadEnd : undefined}
          />
          {isImageLoading && coverImage && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          <TouchableOpacity
            style={[styles.favoriteButton, { backgroundColor: colors.danger + '18', borderColor: colors.danger }, isFavorite && { backgroundColor: colors.danger }]}
            onPress={() => !disabled && onToggleFavorite(item)}
            disabled={disabled}
          >
            <Feather name="heart" size={18} color={isFavorite ? '#fff' : colors.danger} />
          </TouchableOpacity>
        </View>

        <View style={styles.contentContainer}>
          {/* Başlık */}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {item.name || 'İsimsiz Alan'}
          </Text>

          {/* Kamp Türü */}
          <View style={styles.typeContainer}>
            <View style={[styles.typeBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.typeText, { color: colors.primary }]}>{typeLabel}</Text>
            </View>
          </View>

          {/* Ekleyen Kullanıcı */}
          <View style={styles.infoRow}>
            <Feather name="user" size={14} color={colors.muted} />
            <Text style={[styles.infoText, { color: colors.muted }]}>{ownerName}</Text>
          </View>

          {/* Uzaklık */}
          {distance && (
            <View style={styles.infoRow}>
              <MapPin size={14} color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>{distance}</Text>
            </View>
          )}

          {/* İl / İlçe (reverse geocode) */}
          {locationNames[areaId] !== undefined && locationNames[areaId] !== null ? (
            <View style={styles.infoRow}>
              <MapPin size={14} color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>{locationNames[areaId]}</Text>
            </View>
          ) : loadingLocationIds.has(areaId) ? (
            <View style={styles.infoRow}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>Yükleniyor...</Text>
            </View>
          ) : (areaId in locationNames) ? (
            <View style={styles.infoRow}>
              <MapPin size={14} color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>Konum alınamıyor</Text>
            </View>
          ) : null}

          {/* Aksiyon Butonları */}
          <View style={styles.actionsContainer}>
            {/* Detaylı Bilgi */}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primaryLight }, disabled && styles.actionButtonDisabled]}
              onPress={() => !disabled && onSelectArea(item)}
              disabled={disabled}
            >
              <Info size={16} color={disabled ? colors.muted : colors.primary} />
              <Text style={[styles.actionButtonText, { color: colors.primary }, disabled && { color: colors.muted }]}>Detay</Text>
            </TouchableOpacity>

            {/* Navigasyon */}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.info + '15' }, disabled && styles.actionButtonDisabled]}
              onPress={() => !disabled && handleNavigationMenu(item)}
              disabled={disabled}
            >
              <Navigation size={16} color={disabled ? colors.muted : colors.info} />
              <Text style={[styles.actionButtonText, { color: colors.info }, disabled && { color: colors.muted }]}>Yol Tarifi</Text>
            </TouchableOpacity>

            {/* Bu kampı seç (Camp Plan) - sadece camp-plan modunda görünür */}
            {showSelectMode && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primaryLight }, disabled && styles.actionButtonDisabled]}
                onPress={() => {
                  if (disabled) return;
                  try {
                    const payload = {
                      id: (item as any).id,
                      latitude: item.latitude,
                      longitude: item.longitude,
                      name: item.name,
                      type: getAreaType(item) || undefined,
                      gotoStep: 3,
                    };
                    // Persist pending selection so camp-plan reads it if event is missed
                    AsyncStorage.setItem('campPlanPendingSelected', JSON.stringify(payload)).catch(() => {});
                    eventBus.emit('camp-plan:selectedArea', payload);
                    router.push('/camp-plan');
                  } catch (e) {
                    console.warn('[CampingAreaListView] selectForPlan hata', e);
                  }
                }}
                disabled={disabled}
              >
                <Feather name="check-circle" size={16} color={disabled ? colors.muted : colors.primary} />
                <Text style={[styles.actionButtonText, { color: colors.primary }, disabled && { color: colors.muted }]}>Bu kampı seç</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Guest User Premium Banner - Hide when offline */}
      {isGuest && isConnected && (
        <View style={[styles.guestBanner, { backgroundColor: colors.warning + '20', borderBottomColor: colors.warning }]}>
          <Text style={[styles.guestBannerText, { color: colors.warning }]}>
            Tüm kamp alanlarını görebilmek için Premium aboneliği gerekmektedir.
          </Text>
          <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/premium' as any)}
          >
            <Text style={[styles.premiumButtonText, { color: 'white' }]}>Premium Ol!</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={campingAreas}
        renderItem={renderItem}
        keyExtractor={(item) => String((item as any).id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Feather name="map-pin" size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Kamp alanı bulunamadı</Text>
            <Text style={[styles.emptySubtext, { color: colors.muted }]}>
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
  },
  guestBanner: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestBannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  premiumButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  premiumButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  listItem: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listItemDisabled: {
    opacity: 0.5,
  },
  imageContainer: {
    width: '100%',
    height: 180,
    position: 'relative',
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  favoriteButtonActive: {
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  typeContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  infoText: {
    fontSize: 13,
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtonTextDisabled: {
  },
  navigationButton: {
  },
  navigationButtonText: {
  },
  selectButton: {
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
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default CampingAreaListView;
