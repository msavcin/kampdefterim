import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { precacheRegionWithRadius } from '@/lib/mapTileCache';
import { Download, MapPin, HardDrive, Trash2, Heart, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '@/lib/database';
import { getLocationNameFromOSM } from '@/lib/osmReverseGeocode';
import type { CampingArea } from '@/lib/database';
import { useFocusEffect } from '@react-navigation/native';

interface CachedRegion {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  sizeMB: number;
  cachedAt: number;
}

interface OfflineRegionSelectorProps {
  user?: {
    offline_radius_km?: number;
  } | null;
}

const CACHED_REGIONS_KEY = 'offline_cached_regions';

export default function OfflineRegionSelector({ user }: OfflineRegionSelectorProps) {
  // offline_radius_km değerine göre yarıçap seçenekleri ve varsayılan değer
  const maxRadius = user?.offline_radius_km || 20;
  const radiusOptions = maxRadius === 50 
    ? [10, 20, 30, 50] 
    : [5, 10, 15, 20];
  const defaultRadius = maxRadius === 50 ? 20 : 10;

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedRadius, setSelectedRadius] = useState(defaultRadius);
  const [cachedRegions, setCachedRegions] = useState<CachedRegion[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentLocationName, setCurrentLocationName] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<CampingArea[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [downloadingFavoriteId, setDownloadingFavoriteId] = useState<number | null>(null);

  useEffect(() => {
    loadCachedRegions();
    getCurrentLocation();
    loadFavorites();
  }, []);

  // Profil sayfası her odaklandığında favorileri yenile
  useFocusEffect(
    React.useCallback(() => {
      console.log('[OfflineRegionSelector] Sayfa odaklandı, favoriler yenileniyor...');
      loadFavorites();
    }, [])
  );

  const loadCachedRegions = async () => {
    try {
      const data = await AsyncStorage.getItem(CACHED_REGIONS_KEY);
      if (data) {
        setCachedRegions(JSON.parse(data));
      }
    } catch (error) {
      console.error('[OfflineRegionSelector] Cache listesi yüklenemedi:', error);
    }
  };

  const saveCachedRegion = async (region: CachedRegion) => {
    try {
      const updated = [...cachedRegions, region];
      await AsyncStorage.setItem(CACHED_REGIONS_KEY, JSON.stringify(updated));
      setCachedRegions(updated);
    } catch (error) {
      console.error('[OfflineRegionSelector] Cache kaydedilemedi:', error);
    }
  };

  const deleteCachedRegion = async (id: string) => {
    try {
      const updated = cachedRegions.filter(r => r.id !== id);
      await AsyncStorage.setItem(CACHED_REGIONS_KEY, JSON.stringify(updated));
      setCachedRegions(updated);
      Alert.alert('Başarılı', 'Bölge silindi.');
    } catch (error) {
      console.error('[OfflineRegionSelector] Cache silinemedi:', error);
    }
  };

  const loadFavorites = async () => {
    setLoadingFavorites(true);
    try {
      const db = getDatabase();
      const favs = await db.getFavorites();
      setFavorites(favs);
      console.log('[OfflineRegionSelector] Favoriler yüklendi:', favs.length);
    } catch (error) {
      console.error('[OfflineRegionSelector] Favoriler yüklenemedi:', error);
    } finally {
      setLoadingFavorites(false);
    }
  };

  const getCurrentLocation = async (retryCount = 0) => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Önce son bilinen konumu dene (hızlı ve error vermez)
      const lastLocation = await Location.getLastKnownPositionAsync();
      let location = lastLocation;

      // Eğer son konum yoksa, o zaman aktif olarak konum al
      if (!location) {
        try {
          // Timeout mekanizması ekle
          const locationPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Location timeout')), 5000)
          );

          location = await Promise.race([locationPromise, timeoutPromise]) as any;
        } catch (positionError: any) {
          // Location services henüz başlamadıysa veya geçici sorun varsa retry et
          if (retryCount < 2) {
            console.debug('[OfflineRegionSelector] Konum alınamadı, 1 saniye sonra retry yapılıyor...');
            setTimeout(() => getCurrentLocation(retryCount + 1), 1000);
            return;
          }
          // 2 retry'dan sonra başarısız
          console.warn('[OfflineRegionSelector] Konum alınamadı (2 retry sonrası):', positionError?.message);
          return;
        }
      }

      if (location) {
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        // Konum adını al (il/ilçe)
        try {
          const locationName = await getLocationNameFromOSM(
            location.coords.latitude,
            location.coords.longitude
          );
          setCurrentLocationName(locationName);
        } catch (geocodeError) {
          console.debug('[OfflineRegionSelector] Konum adı alınamadı (non-critical)');
        }
      }
    } catch (error) {
      console.error('[OfflineRegionSelector] Beklenmeyen hata:', error);
    }
  };

  const estimateSize = (radiusKm: number): number => {
    // Yaklaşık hesaplama: zoom 8-15 arası, tile başına ~20KB
    const areaSqKm = Math.PI * radiusKm * radiusKm;
    const tilesPerSqKm = 500; // Yaklaşık
    const estimatedTiles = areaSqKm * tilesPerSqKm;
    const sizePerTileKB = 20;
    return Math.round((estimatedTiles * sizePerTileKB) / 1024); // MB
  };

  const handleDownloadRegion = async () => {
    if (!currentLocation) {
      Alert.alert('Uyarı', 'Konum alınamadı. Lütfen konum izni verin.');
      return;
    }

    const estimatedSizeMB = estimateSize(selectedRadius);
    
    Alert.alert(
      'Offline Harita İndir',
      `${selectedRadius} km yarıçaplı bölge indirilecek.\n\nTahmini boyut: ~${estimatedSizeMB} MB\nMevcut konum kullanılacak.\n\nDevam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'İndir',
          onPress: async () => {
            setDownloading(true);
            setProgress(0);
            
            try {
              console.log('[OfflineRegionSelector] İndirme başladı:', {
                lat: currentLocation.latitude,
                lng: currentLocation.longitude,
                radius: selectedRadius,
              });

              const result = await precacheRegionWithRadius(
                currentLocation.latitude,
                currentLocation.longitude,
                selectedRadius
              );

              // Cache'lenen bölgeyi kaydet
              const newRegion: CachedRegion = {
                id: Date.now().toString(),
                name: `Bölge ${cachedRegions.length + 1}`,
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                radiusKm: selectedRadius,
                sizeMB: result.totalSizeMB || estimatedSizeMB,
                cachedAt: Date.now(),
              };

              await saveCachedRegion(newRegion);

              Alert.alert(
                'Başarılı!',
                `Harita başarıyla indirildi!\n\n• ${result.cachedTiles || 0} harita parçası\n• Boyut: ~${result.totalSizeMB || estimatedSizeMB} MB`
              );
            } catch (error: any) {
              console.error('[OfflineRegionSelector] İndirme hatası:', error);
              Alert.alert('Hata', error?.message || 'İndirme başarısız oldu. Lütfen internet bağlantınızı kontrol edin.');
            } finally {
              setDownloading(false);
              setProgress(0);
            }
          }
        }
      ]
    );
  };

  const getTotalCacheSize = (): number => {
    return cachedRegions.reduce((sum, region) => sum + region.sizeMB, 0);
  };

  const handleDownloadFavorite = async (favorite: CampingArea, radius: number = 10) => {
    if (!favorite.latitude || !favorite.longitude) {
      Alert.alert('Uyarı', 'Bu favori alanın konum bilgisi eksik.');
      return;
    }

    const estimatedSizeMB = estimateSize(radius);
    
    Alert.alert(
      'Favori Alanı İndir',
      `"${favorite.name}" için ${radius} km yarıçaplı bölge indirilecek.\n\nTahmini boyut: ~${estimatedSizeMB} MB\n\nDevam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'İndir',
          onPress: async () => {
            setDownloadingFavoriteId(favorite.id);
            
            try {
              console.log('[OfflineRegionSelector] Favori indirme başladı:', {
                name: favorite.name,
                lat: favorite.latitude,
                lng: favorite.longitude,
                radius,
              });

              const result = await precacheRegionWithRadius(
                favorite.latitude!,
                favorite.longitude!,
                radius
              );

              // Cache'lenen bölgeyi kaydet
              const newRegion: CachedRegion = {
                id: `fav_${favorite.id}_${Date.now()}`,
                name: favorite.name || `Favori ${favorite.id}`,
                latitude: favorite.latitude!,
                longitude: favorite.longitude!,
                radiusKm: radius,
                sizeMB: result.totalSizeMB || estimatedSizeMB,
                cachedAt: Date.now(),
              };

              await saveCachedRegion(newRegion);

              Alert.alert(
                'Başarılı!',
                `"${favorite.name}" başarıyla indirildi!\n\n• ${result.cachedTiles || 0} harita parçası\n• Boyut: ~${result.totalSizeMB || estimatedSizeMB} MB`
              );
            } catch (error: any) {
              console.error('[OfflineRegionSelector] Favori indirme hatası:', error);
              Alert.alert('Hata', error?.message || 'İndirme başarısız oldu.');
            } finally {
              setDownloadingFavoriteId(null);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>📦 Offline Bölge İndirme</Text>
      <Text style={styles.subtitle}>
        Seçtiğiniz bölgeyi cihazınıza indirerek internet olmadan kullanabilirsiniz.
      </Text>

      {/* Mevcut konum */}
      {currentLocation && (
        <View style={styles.infoBox}>
          <MapPin size={18} color="#10b981" />
          <Text style={styles.infoText}>
            Mevcut konum: {currentLocationName || `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`}
          </Text>
        </View>
      )}

      {/* Yarıçap seçici */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bölge Yarıçapı</Text>
        <View style={styles.radiusGrid}>
          {radiusOptions.map(radius => (
            <TouchableOpacity
              key={radius}
              onPress={() => setSelectedRadius(radius)}
              style={[
                styles.radiusButton,
                selectedRadius === radius && styles.radiusButtonActive
              ]}
            >
              <Text style={[
                styles.radiusText,
                selectedRadius === radius && styles.radiusTextActive
              ]}>
                {radius} km
              </Text>
              <Text style={styles.radiusSize}>~{estimateSize(radius)} MB</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* İndirme butonu */}
      <TouchableOpacity
        onPress={handleDownloadRegion}
        disabled={downloading || !currentLocation}
        style={[
          styles.downloadButton,
          (downloading || !currentLocation) && styles.downloadButtonDisabled
        ]}
      >
        <Download size={20} color="#fff" style={{ marginRight: 10 }} />
        <Text style={styles.downloadButtonText}>
          {downloading ? `İndiriliyor... %${progress}` : 'Bu Bölgeyi İndir'}
        </Text>
      </TouchableOpacity>

      {/* Favori Alanlar */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>❤️ Favori Alanlarım</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.favoriteCount}>{favorites.length} alan</Text>
            <TouchableOpacity
              onPress={() => {
                console.log('[OfflineRegionSelector] Manuel refresh tetiklendi');
                loadFavorites();
              }}
              disabled={loadingFavorites}
              style={styles.refreshButton}
            >
              {loadingFavorites ? (
                <ActivityIndicator size="small" color="#10b981" />
              ) : (
                <RefreshCw size={16} color="#10b981" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.sectionSubtitle}>
          Favori kamp alanlarınızı offline kullanmak için indirin.
        </Text>
        
        {loadingFavorites && favorites.length === 0 ? (
          <ActivityIndicator size="small" color="#10b981" style={{ marginVertical: 20 }} />
        ) : favorites.length === 0 ? (
          <View style={styles.emptyFavorites}>
            <Heart size={32} color="#d1d5db" />
            <Text style={styles.emptyFavoritesText}>Henüz favori alanınız yok</Text>
            <Text style={styles.emptyFavoritesSubtext}>Haritadan kamp alanlarını favorilerinize ekleyin</Text>
          </View>
        ) : (
          favorites.map(favorite => (
            <View key={favorite.id} style={styles.favoriteCard}>
              <View style={styles.favoriteInfo}>
                <Heart size={16} color="#ef4444" fill="#ef4444" />
                <View style={styles.favoriteDetails}>
                  <Text style={styles.favoriteName}>{favorite.name}</Text>
                  {favorite.latitude && favorite.longitude && (
                    <Text style={styles.favoriteMeta}>
                      📍 {favorite.latitude.toFixed(4)}, {favorite.longitude.toFixed(4)}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDownloadFavorite(favorite, defaultRadius)}
                disabled={downloadingFavoriteId === favorite.id}
                style={[
                  styles.favoriteDownloadButton,
                  downloadingFavoriteId === favorite.id && styles.favoriteDownloadButtonDisabled
                ]}
              >
                {downloadingFavoriteId === favorite.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Download size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* İndirilmiş bölgeler */}
      {cachedRegions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💾 İndirilmiş Bölgeler</Text>
            <View style={styles.totalSize}>
              <HardDrive size={16} color="#6b7280" />
              <Text style={styles.totalSizeText}>{getTotalCacheSize()} MB</Text>
            </View>
          </View>
          
          {cachedRegions.map(region => (
            <View key={region.id} style={styles.regionCard}>
              <View style={styles.regionInfo}>
                <MapPin size={16} color="#10b981" />
                <View style={styles.regionDetails}>
                  <Text style={styles.regionName}>{region.name}</Text>
                  <Text style={styles.regionMeta}>
                    {region.radiusKm} km • {region.sizeMB} MB
                  </Text>
                  <Text style={styles.regionDate}>
                    {new Date(region.cachedAt).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Bölgeyi Sil',
                    'Bu bölgeyi silmek istediğinize emin misiniz?',
                    [
                      { text: 'İptal', style: 'cancel' },
                      { text: 'Sil', style: 'destructive', onPress: () => deleteCachedRegion(region.id) }
                    ]
                  );
                }}
                style={styles.deleteButton}
              >
                <Trash2 size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.helpText}>
          💡 İpucu: WiFi bağlantısı kullanarak indirme yapmanız önerilir.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
    color: '#059669',
    marginLeft: 8,
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  totalSize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalSizeText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  radiusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  radiusButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  radiusButtonActive: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  radiusText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  radiusTextActive: {
    color: '#059669',
  },
  radiusSize: {
    fontSize: 12,
    color: '#6b7280',
  },
  downloadButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  downloadButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  regionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  regionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  regionDetails: {
    marginLeft: 10,
    flex: 1,
  },
  regionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  regionMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  regionDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  deleteButton: {
    padding: 8,
  },
  helpText: {
    fontSize: 13,
    color: '#059669',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  favoriteCount: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  favoriteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  favoriteDetails: {
    marginLeft: 10,
    flex: 1,
  },
  favoriteName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  favoriteMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  favoriteDownloadButton: {
    backgroundColor: '#10b981',
    padding: 10,
    borderRadius: 8,
  },
  favoriteDownloadButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  refreshButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  emptyFavorites: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyFavoritesText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
  },
  emptyFavoritesSubtext: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
});
