import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, BackHandler } from 'react-native';
import { getCachedImagePath } from '../../lib/imageCache';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Heart, MapPin, Star, Navigation } from 'lucide-react-native'; // useFocusEffect already imported
import { getDatabase, CampingArea } from '../../lib/database';
import CampingAreaDetailModal from '../../components/CampingAreaDetailModal';
import EditCampingAreaModal from '../../components/EditCampingAreaModal';


import { getCampingTypeLabel } from '../../lib/categories';
import { getMe } from '../../lib/userCommunityApi';

const getTypeLabel = (type: string) => getCampingTypeLabel(type);

export default function FavoritesScreen() {
  const [user, setUser] = useState<any>(null);
  const [favorites, setFavorites] = useState<CampingArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampingArea, setSelectedCampingArea] = useState<CampingArea | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const navigation = useNavigation();

  // Swipe-back gesture ve geri tuşunu devre dışı bırak
  useFocusEffect(
    React.useCallback(() => {
      if (navigation && navigation.setOptions) {
        navigation.setOptions({ gestureEnabled: false });
      }
      
      // Android geri tuşunu engelle
      const onBackPress = () => {
        return true; // true döndürerek geri tuşunu engelle
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => backHandler.remove();
    }, [navigation])
  );

  useEffect(() => {
    loadFavorites();
  }, []);
  
  // Tab'a her odaklandığında favorileri yeniden yükle
  useFocusEffect(
    React.useCallback(() => {
      loadFavorites();
    }, [])
  );

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const favoriteAreas = await getDatabase().getFavorites();
      setFavorites(favoriteAreas);
  const favoriteIdSet = new Set(favoriteAreas.map(area => (area as any).id));
      setFavoriteIds(favoriteIdSet);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (area: CampingArea) => {
    try {
      await getDatabase().removeFromFavorites((area as any).id);
      setFavorites(favorites.filter(fav => (fav as any).id !== (area as any).id));
      setFavoriteIds(prev => {
        const newSet = new Set(prev);
        newSet.delete((area as any).id);
        return newSet;
      });
    } catch (error) {
      console.error('Error removing from favorites:', error);
    }
  };

  const handleShowDetail = (area: CampingArea) => {
    setSelectedCampingArea(area);
    setShowDetailModal(true);
  };

  const handleEditCampingArea = (area: CampingArea) => {
    setSelectedCampingArea(area);
    setShowDetailModal(false);
    setShowEditModal(true);
  };

  const handleDeleteCampingArea = (area: CampingArea) => {
    setShowDetailModal(false);
    // Remove from favorites list
    setFavorites(favorites.filter(fav => (fav as any).id !== (area as any).id));
    setFavoriteIds(prev => {
      const newSet = new Set(prev);
      newSet.delete((area as any).id);
      return newSet;
    });
  };

  const handleToggleFavorite = (area: CampingArea) => {
    toggleFavorite(area);
  };

  const FavoriteCard = ({ item }: { item: CampingArea }) => {
    const [imageUri, setImageUri] = React.useState<string | null>(null);
    const [imageLoading, setImageLoading] = React.useState(false);
    const [imageError, setImageError] = React.useState(false);

    React.useEffect(() => {
      let isMounted = true;
      const loadImage = async () => {
        if (item.images && item.images.length > 0 && typeof item.images[0] === 'string') {
          setImageLoading(true);
          setImageError(false);
          try {
            const imgUrl = item.images[0];
            let image_id = '';
            if (/photo_\d+_\d+/.test(imgUrl)) {
              image_id = imgUrl.match(/photo_\d+_\d+/)?.[0] || '';
            } else {
              image_id = imgUrl.split('/').pop()?.split('.')[0] || '';
            }
            const localPath = await getCachedImagePath(image_id, imgUrl);
            if (isMounted) setImageUri(localPath);
          } catch {
            if (isMounted) setImageError(true);
          } finally {
            if (isMounted) setImageLoading(false);
          }
        } else {
          setImageUri(null);
        }
      };
      loadImage();
      return () => { isMounted = false; };
    }, [item.images]);

    return (
      <View style={styles.favoriteCard}>
        <View style={styles.imageContainer}>
          {imageLoading ? (
            <View style={[styles.placeholderImage, { justifyContent: 'center', alignItems: 'center' }]}> 
              <ActivityIndicator size="large" color="#059669" />
            </View>
          ) : imageError || !imageUri ? (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderIcon}>🏕️</Text>
              <Text style={styles.placeholderText}>Fotoğraf Yok</Text>
            </View>
          ) : (
            <Image 
              source={{ uri: imageUri }} 
              style={styles.cardImage}
              onError={() => setImageError(true)}
            />
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitle}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardType}>{getTypeLabel(item.type)}</Text>
            </View>
            <TouchableOpacity 
              style={styles.favoriteButton}
              onPress={() => toggleFavorite(item)}
            >
              <Heart size={20} color="#ef4444" fill="#ef4444" />
            </TouchableOpacity>
          </View>
 
          <View style={styles.cardLocation}>
            <MapPin size={14} color="#6b7280" />
            <Text style={styles.locationText}>
              {(item as any).latitude?.toFixed(4)}, {(item as any).longitude?.toFixed(4)}
            </Text>
          </View>

          <View style={styles.cardStats}>
            {(item.rating && item.rating > 0) ? (
              <View style={styles.statItem}>
                <Star size={14} color="#fbbf24" fill="#fbbf24" />
                <Text style={styles.statText}>{item.rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {item.distance_km ? (
              <View style={styles.statItem}>
                <Navigation size={14} color="#6b7280" />
                <Text style={styles.statText}>{item.distance_km.toFixed(1)} km</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.amenitiesContainer}>
            {item.amenities && item.amenities.slice(0, 3).map((amenity, index) => (
              <View key={index} style={styles.amenityChip}>
                <Text style={styles.amenityText}>
                  {amenity === 'tuvalet' ? '🚻' : 
                   amenity === 'duş' ? '🚿' : 
                   amenity === 'market' ? '🏪' : 
                   amenity === 'piknik_masası' ? '🍽️' : 
                   amenity === 'otopark' ? '🅿️' : '📍'} {amenity}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity 
            style={styles.detailButton}
            onPress={() => handleShowDetail(item)}
          >
            <Text style={styles.detailButtonText}>Detayları Gör</Text>
            <Navigation size={16} color="#059669" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  useEffect(() => {
    (async () => {
      try {
        const userData = await getMe();
        setUser(userData);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Favorilerim</Text>
        <Text style={styles.headerSubtitle}>{favorites.length} favori kamp alanı</Text>
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyState}>
          <Heart size={48} color="#d1d5db" />
          <Text style={styles.emptyTitle}>
            {loading ? 'Favoriler yükleniyor...' : 'Henüz favori alanınız yok'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {loading ? 'Lütfen bekleyin...' : 'Beğendiğiniz kamp alanlarını favorilere ekleyin'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => ((item as any).id ?? '').toString()}
          renderItem={({ item }) => <FavoriteCard item={item} />}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={loadFavorites}
        />
      )}
      
      <CampingAreaDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        campingArea={selectedCampingArea}
        onEdit={handleEditCampingArea}
        onDelete={handleDeleteCampingArea}
        onToggleFavorite={handleToggleFavorite}
        isFavorite={selectedCampingArea ? favoriteIds.has((selectedCampingArea as any).id) : false}
      />

      <EditCampingAreaModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        campingArea={selectedCampingArea}
        onSuccess={() => {
          setShowEditModal(false);
          loadFavorites(); // Refresh favorites list
        }}
        currentUserId={user?.id}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  listContainer: {
    padding: 20,
  },
  favoriteCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  imageContainer: {
    width: '100%',
    height: 160,
  },
  cardImage: {
    width: '100%',
    height: 160,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 8,
    opacity: 0.5,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  cardType: {
    fontSize: 12,
    color: '#059669',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  favoriteButton: {
    padding: 4,
  },
  cardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: '#6b7280',
  },
  cardStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  amenitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  amenityChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  amenityText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#059669',
  },
  detailButtonText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});