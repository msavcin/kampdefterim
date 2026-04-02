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
import { useTheme } from '@/components/ThemeProvider';

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
  const { colors } = useTheme();
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
    <ScrollView style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>📦 Offline Bölge İndirme</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Seçtiğiniz bölgeyi cihazınıza indirerek internet olmadan kullanabilirsiniz.
      </Text>

      {/* Mevcut konum */}
      {currentLocation && (
        <View style={[styles.infoBox, { backgroundColor: colors.success + '15' }]}>
          <MapPin size={18} color={colors.success} />
          <Text style={[styles.infoText, { color: colors.success }]}>
            Mevcut konum: {currentLocationName || `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`}
          </Text>
        </View>
      )}

      {/* Yarıçap seçici */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Bölge Yarıçapı</Text>
        <View style={styles.radiusGrid}>
          {radiusOptions.map(radius => (
            <TouchableOpacity
              key={radius}
              onPress={() => setSelectedRadius(radius)}
              style={[
                styles.radiusButton,
                { backgroundColor: colors.surfaceVariant },
                selectedRadius === radius && [styles.radiusButtonActive, { backgroundColor: colors.success + '20', borderColor: colors.success }]
              ]}
            >
              <Text style={[
                styles.radiusText,
                { color: colors.text },
                selectedRadius === radius && { color: colors.success }
              ]}>
                {radius} km
              </Text>
              <Text style={[styles.radiusSize, { color: colors.textSecondary }]}>~{estimateSize(radius)} MB</Text>
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
          { backgroundColor: colors.success },
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>❤️ Favori Alanlarım</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.favoriteCount, { color: colors.textSecondary }]}>{favorites.length} alan</Text>
            <TouchableOpacity
              onPress={() => {
                console.log('[OfflineRegionSelector] Manuel refresh tetiklendi');
                loadFavorites();
              }}
              disabled={loadingFavorites}
              style={[styles.refreshButton, { backgroundColor: colors.success + '15', borderColor: colors.success }]}
            >
              {loadingFavorites ? (
                <ActivityIndicator size="small" color={colors.success} />
              ) : (
                <RefreshCw size={16} color={colors.success} />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Favori kamp alanlarınızı offline kullanmak için indirin.
        </Text>
        
        {loadingFavorites && favorites.length === 0 ? (
          <ActivityIndicator size="small" color={colors.success} style={{ marginVertical: 20 }} />
        ) : favorites.length === 0 ? (
          <View style={styles.emptyFavorites}>
            <Heart size={32} color={colors.muted} />
            <Text style={[styles.emptyFavoritesText, { color: colors.textSecondary }]}>Henüz favori alanınız yok</Text>
            <Text style={[styles.emptyFavoritesSubtext, { color: colors.muted }]}>Haritadan kamp alanlarını favorilerinize ekleyin</Text>
          </View>
        ) : (
          favorites.map(favorite => (
            <View key={favorite.id} style={[styles.favoriteCard, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
              <View style={styles.favoriteInfo}>
                <Heart size={16} color={colors.danger} fill={colors.danger} />
                <View style={styles.favoriteDetails}>
                  <Text style={[styles.favoriteName, { color: colors.text }]}>{favorite.name}</Text>
                  {favorite.latitude && favorite.longitude && (
                    <Text style={[styles.favoriteMeta, { color: colors.textSecondary }]}>
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
                  { backgroundColor: colors.success },
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
            <Text style={[styles.sectionTitle, { color: colors.text }]}>💾 İndirilmiş Bölgeler</Text>
            <View style={styles.totalSize}>
              <HardDrive size={16} color={colors.textSecondary} />
              <Text style={[styles.totalSizeText, { color: colors.textSecondary }]}>{getTotalCacheSize()} MB</Text>
            </View>
          </View>
          
          {cachedRegions.map(region => (
            <View key={region.id} style={[styles.regionCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <View style={styles.regionInfo}>
                <MapPin size={16} color={colors.success} />
                <View style={styles.regionDetails}>
                  <Text style={[styles.regionName, { color: colors.text }]}>{region.name}</Text>
                  <Text style={[styles.regionMeta, { color: colors.textSecondary }]}>
                    {region.radiusKm} km • {region.sizeMB} MB
                  </Text>
                  <Text style={[styles.regionDate, { color: colors.muted }]}>
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
                <Trash2 size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.infoBox, { backgroundColor: colors.success + '15' }]}>
        <Text style={[styles.helpText, { color: colors.success }]}>
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
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
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
    marginBottom: 12,
  },
  totalSize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalSizeText: {
    fontSize: 13,
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
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  radiusButtonActive: {
  },
  radiusText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  radiusSize: {
    fontSize: 12,
  },
  downloadButton: {
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
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
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
    marginBottom: 2,
  },
  regionMeta: {
    fontSize: 12,
    marginBottom: 2,
  },
  regionDate: {
    fontSize: 11,
  },
  deleteButton: {
    padding: 8,
  },
  helpText: {
    fontSize: 13,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  favoriteCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
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
    marginBottom: 2,
  },
  favoriteMeta: {
    fontSize: 12,
  },
  favoriteDownloadButton: {
    padding: 10,
    borderRadius: 8,
  },
  favoriteDownloadButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  refreshButton: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyFavorites: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyFavoritesText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyFavoritesSubtext: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});
