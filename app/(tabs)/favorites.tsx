import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, BackHandler, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Heart } from 'lucide-react-native';
import { getDatabase, CampingArea } from '../../lib/database';
import CampingAreaDetailModal from '../../components/CampingAreaDetailModal';
import EditCampingAreaModal from '../../components/EditCampingAreaModal';
import CampingAreaListView from '../../components/CampingAreaListView';
import { getMe } from '../../lib/userCommunityApi';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export default function FavoritesScreen() {
  const isConnected = useNetworkStatus();
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
      const me = await getMe();
      setUser(me);
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

  const handleToggleFavorite = async (area: CampingArea) => {
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

  const handleNavigate = (area: CampingArea, provider: 'google' | 'yandex') => {
    const lat = (area as any).latitude;
    const lng = (area as any).longitude;
    
    if (!lat || !lng) return;
    
    const url = provider === 'google'
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `yandexmaps://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
    
    Linking.openURL(url).catch(err => console.error('Navigation error:', err));
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
        <CampingAreaListView
          campingAreas={favorites}
          onSelectArea={handleShowDetail}
          onNavigate={handleNavigate}
          favorites={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          isGuest={user?.role === 'guest'}
          isConnected={isConnected}
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