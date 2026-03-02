import { useState, useEffect } from 'react';
import { getDatabase, CampingArea as OriginalCampingArea } from '@/lib/database';

type CampingArea = OriginalCampingArea & {
  rentech_id?: string;
  // Add any other custom fields here if needed
};
import * as Location from 'expo-location';

interface UseCampingAreasOptions {
  latitude?: number;
  longitude?: number;
  radius?: number;
  tags?: string[];
  autoFetch?: boolean;
  currentUserId?: number | string;
  isSuperAdmin?: boolean;
  hasLocationPermission?: boolean | null; // Konum izni durumu (modal conflict önleme)
}

export function useCampingAreas(options: UseCampingAreasOptions = {}) {
  const [campingAreas, setCampingAreas] = useState<CampingArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  const {
    latitude,
    longitude,
  radius = 20,
  tags = ['campground', 'caravan_site', 'bungalow', 'recreation', 'restaurant', 'camp_store', 'national_park', 'hiking_road', 'touristic_place', 'accommodation', 'parking'],
    autoFetch = true,
    currentUserId,
    hasLocationPermission = null, // Varsayılan null (izin durumu bilinmiyor)
  } = options;

  // Initialize database
  useEffect(() => {
    getDatabase().init().catch(err => {
      console.error('Database initialization error:', err);
      setError('Veritabanı başlatılamadı');
    });
  }, []);

  // Get user location and start watching position
  useEffect(() => {
    // Konum izni yok iken konum işlemlerini başlatma (modal conflict önleme)
    if (hasLocationPermission !== true) {
      if (__DEV__) console.log('[useCampingAreas] Konum izni yok/belirsiz, konum takibi başlatmıyor');
      return;
    }
    
    let locationSubscription: Location.LocationSubscription | null = null;
    
    // Kademeli başlatma (modal kapanışıyla çakışmayı önle)
    const timer = setTimeout(() => {
      if (autoFetch && !latitude && !longitude) {
        (async () => {
          await getCurrentLocation();
          
          // Konum izni varsa arka planda konum takibi başlat
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            try {
              locationSubscription = await Location.watchPositionAsync(
                {
                  accuracy: Location.Accuracy.Balanced,
                  distanceInterval: 100, // 100 metre hareket edince güncelle
                  timeInterval: 30000, // veya en az 30 saniyede bir kontrol et
                },
                (newLocation) => {
                  if (__DEV__) {
                    console.log('[LOCATION] Konum güncellendi:', {
                      lat: newLocation.coords.latitude.toFixed(6),
                      lng: newLocation.coords.longitude.toFixed(6),
                    });
                  }
                  setLocation(newLocation);
                }
              );
            } catch (err) {
              console.error('Konum takibi başlatılamadı:', err);
            }
          }
        })();
      }
    }, 300); // Modal kapandıktan 300ms sonra başlat

    // Cleanup: konum takibini durdur
    return () => {
      clearTimeout(timer);
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [autoFetch, latitude, longitude, hasLocationPermission]);
  // hasLocationPermission dependency'de, permission true olduğunda konum takibi başlar

  // Fetch camping areas when location or parameters change
  useEffect(() => {
    const lat = latitude || location?.coords.latitude;
    const lng = longitude || location?.coords.longitude;
    
    if (autoFetch && lat && lng) {
      fetchCampingAreas(lat, lng, radius, tags);
    }
  }, [latitude, longitude, location, radius, tags, autoFetch]);


  // --- friend_user_ids filtrelemesini fetchCampingAreas fonksiyonuna taşı ---

  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      setError(null);

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Konum izni reddedildi, Türkiye'nin merkezi (Ankara - Anıtkabir) varsayılan olarak ayarla
        const defaultLocation: Location.LocationObject = {
          coords: {
            latitude: 39.9251,
            longitude: 32.8375,
            altitude: null,
            accuracy: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        };
        setLocation(defaultLocation);
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      setLocation(currentLocation);
    } catch (err) {
      // Hata durumunda da varsayılan konumu ayarla
      const defaultLocation: Location.LocationObject = {
        coords: {
          latitude: 39.0,
          longitude: 35.0,
          altitude: null,
          accuracy: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };
      setLocation(defaultLocation);
      setError(err instanceof Error ? err.message : 'Konum alınamadı, varsayılan konum kullanılıyor');
    } finally {
      setLoading(false);
    }
  };

  const fetchCampingAreas = async (
    lat: number,
    lng: number,
    searchRadius: number = radius,
  searchTags: string[] = tags
  ) => {
    try {
      setLoading(true);
      setError(null);

  // tags ile filtreleme
  const normalizedTags = searchTags.map(t => t === 'camping' ? 'campground' : t);
  // log kaldırıldı
  // Superadmin kontrolü için user rolünü options üzerinden al
  const isSuperAdmin = (options as any)?.isSuperAdmin === true;
  const userId = options.currentUserId ? String(options.currentUserId) : undefined;
  let areas = await getDatabase().searchCampingAreasByLocation(lat, lng, searchRadius, normalizedTags, true, userId, isSuperAdmin);
      // --- friend_user_ids istemci filtresi kaldırıldı ---
      // Backend, visibility='friends' kontrolünü sunucu tarafında yapıyor
      // (campground_friend_access tablosu + friend_user_ids::jsonb kontrolü).
      // İstemci tarafı filtre, backend friend_user_ids sütununu null/[] olarak
      // döndürdüğü durumlarda arkadaşın alanı görememesine yol açıyordu.
      console.log('Found camping areas:', areas.length);
      // Debug: Kullanıcı alanlarını logla
      const userAreas = areas.filter(area => 
        (typeof area.tags === 'object' && area.tags?.user_submitted === 'yes' && typeof area.tags.type === 'string' && area.tags.type.trim() !== '')
      );
      console.log('User submitted areas:', userAreas.length, userAreas);
      setCampingAreas(areas);
    } catch (err) {
      console.error('Error fetching camping areas:', err);
      setError(err instanceof Error ? err.message : 'Kamp alanları yüklenemedi');
      setCampingAreas([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => {
    const lat = latitude || location?.coords.latitude;
    const lng = longitude || location?.coords.longitude;
    
    if (lat && lng) {
      fetchCampingAreas(lat, lng, radius, tags);
    } else {
      getCurrentLocation();
    }
  };

  const syncFromOverpass = async (bounds?: string) => {
    try {
      setLoading(true);
      setError(null);

      // Mevcut konum varsa onu kullan, yoksa Türkiye geneli
      let defaultBounds = '35.0,25.0,43.0,45.0'; // Türkiye geneli
      
      if (!bounds && location?.coords) {
        const { latitude, longitude } = location.coords;
        const radiusKm = 100; // 100km yarıçap
        
        const latRadius = radiusKm / 111;
        const lngRadius = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));
        
        const south = latitude - latRadius;
        const north = latitude + latRadius;
        const west = longitude - lngRadius;
        const east = longitude + lngRadius;
        
        defaultBounds = `${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)}`;
      }
      
      const queryBounds = bounds || defaultBounds;
      const [south, west, north, east] = queryBounds.split(',').map(Number);

      // Comprehensive Overpass query for all camping-related areas
      const overpassQuery = `[out:json][timeout:60];
(
  node["tourism"="camp_site"](${south},${west},${north},${east});
  way["tourism"="camp_site"](${south},${west},${north},${east});
  node["tourism"="caravan_site"](${south},${west},${north},${east});
  way["tourism"="caravan_site"](${south},${west},${north},${east});
  node["leisure"="picnic_table"](${south},${west},${north},${east});
  node["amenity"="picnic_site"](${south},${west},${north},${east});
  node["leisure"="park"](${south},${west},${north},${east});
  node["leisure"="recreation_ground"](${south},${west},${north},${east});
  node["amenity"="parking"](${south},${west},${north},${east});
  node["highway"="rest_area"](${south},${west},${north},${east});
);
out center meta;`;

      console.log('Overpass query:', overpassQuery);

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      let recordsProcessed = 0;
      let recordsAdded = 0;
      let recordsUpdated = 0;

      // Process each element
      for (const element of data.elements || []) {
        recordsProcessed++;
        
        if (!element.lat || !element.lon || !element.tags) continue;

        const campingArea = processCampingArea(element);
        if (!campingArea) continue;


        try {
          const result = await getDatabase().insertOrUpdateCampingArea(campingArea);
          if (result === 'inserted') recordsAdded++;
          else if (result === 'updated') recordsUpdated++;
        } catch (err) {
          console.error('Error saving camping area:', err);
        }
      }


      // Refresh the displayed data
      const lat = latitude || location?.coords.latitude;
      const lng = longitude || location?.coords.longitude;
      if (lat && lng) {
  await fetchCampingAreas(lat, lng, radius, tags);
      }

      return {
        success: true,
        stats: { recordsProcessed, recordsAdded, recordsUpdated }
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Senkronizasyon hatası';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    campingAreas,
    loading,
    error,
    location,
    refreshData,
    fetchCampingAreas,
    getCurrentLocation,
    syncFromOverpass,
  };
}

function processCampingArea(element: any) {
  const tags = element.tags || {};
  // Determine area type based on OSM tags
  let type = 'campground';
  if (tags.tourism === 'camp_site') type = 'campground';
  else if (tags.tourism === 'caravan_site') type = 'caravan_site';
  else if (tags.leisure === 'picnic_table' || tags.amenity === 'picnic_site') type = 'picnic';
  else if (tags.leisure === 'park' || tags.leisure === 'recreation_ground') type = 'recreation';
  else if (tags.amenity === 'parking' || tags.highway === 'rest_area') type = 'parking';
  // Skip if not a relevant camping/outdoor area
  if (!['campground', 'caravan_site', 'picnic', 'recreation'].includes(type)) {
    return null;
  }
  // Extract name
  const name = tags.name || tags['name:tr'] || tags['name:en'] || `${getTypeLabel(type)} #${element.id}`;
  // Extract amenities
  const amenities: string[] = [];
  if (tags.toilets === 'yes') amenities.push('tuvalet');
  if (tags.shower === 'yes') amenities.push('duş');
  if (tags.drinking_water === 'yes') amenities.push('içme_suyu');
  if (tags.electricity === 'yes') amenities.push('elektrik');
  if (tags.internet_access === 'yes' || tags.internet_access === 'wlan') amenities.push('wifi');
  if (tags.shop === 'convenience' || tags.shop === 'supermarket') amenities.push('market');
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') amenities.push('restoran');
  if (tags.amenity === 'parking') amenities.push('otopark');
  if (tags.leisure === 'picnic_table') amenities.push('piknik_masası');
  if (tags.bbq === 'yes') amenities.push('barbekü');
  if (tags.fire === 'yes' || tags.fireplace === 'yes') amenities.push('ateş_yeri');
  // Extract other details
  const description = tags.description || tags['description:tr'] || tags['description:en'];
  const website = tags.website || tags['contact:website'];
  const phone = tags.phone || tags['contact:phone'];
  const opening_hours = tags.opening_hours;
  const capacity = tags.capacity ? parseInt(tags.capacity) : undefined;
  // Handle fee information properly
  let fee: boolean | null = null;
  if (tags.fee === 'yes') {
    fee = true;
  } else if (tags.fee === 'no') {
    fee = false;
  }
  // If tags.fee is undefined or any other value, keep fee as null
  return {
    osm_id: element.id,
    name,
    latitude: element.lat,
    longitude: element.lon,
  type: type as 'campground' | 'caravan_site' | 'recreation' | 'picnic',
    amenities,
    tags,
    description,
    website,
    phone,
    opening_hours,
    capacity,
    fee,
    status: 'active' as const,
  };
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'campground': return 'Kamp Alanı';
    case 'caravan_site': return 'Karavan Alanı';
    case 'recreation': return 'Mesire Alanı';
    case 'picnic': return 'Piknik Alanı';
    default: return 'Alan';
  }
}