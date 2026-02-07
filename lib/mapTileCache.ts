/**
 * Harita Tile Cache Yönetimi
 * Offline kullanım için OSM tile'larını cache'ler
 */
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { setLargeItemAsync, getLargeItemAsync, removeLargeItemAsync } from './largeStorage';
import { API_URL } from './config';

const TILE_CACHE_DIR = FileSystem.documentDirectory + 'map_tiles/';
const TILE_INDEX_KEY = 'map_tile_index';
const CACHED_REGIONS_KEY = 'cached_regions';
const MAX_CACHED_TILES = 500; // Maksimum cache'lenecek tile sayısı
const TILE_CACHE_VERSION = '2.0-cartodb'; // Versiyon değişti: OSM -> CartoDB
const REGION_CACHE_THRESHOLD = 5000; // 5 km - Bu mesafeden daha yakın bölgeler tekrar cache'lenmez

export interface TileInfo {
  z: number;
  x: number;
  y: number;
  timestamp: number;
  size: number;
}

export interface CachedRegion {
  latitude: number;
  longitude: number;
  timestamp: number;
  radius: number; // km cinsinden
}

export interface TileIndex {
  version: string;
  tiles: Record<string, TileInfo>;
  totalSize: number;
}

/**
 * Tile cache dizinini oluştur
 */
async function ensureCacheDirectory() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(TILE_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TILE_CACHE_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error('[MapTileCache] Dizin oluşturma hatası:', error);
  }
}

/**
 * Tile index'i yükle
 */
async function loadTileIndex(): Promise<TileIndex> {
  try {
    const raw = await getLargeItemAsync(TILE_INDEX_KEY);
    if (!raw) {
      return { version: TILE_CACHE_VERSION, tiles: {}, totalSize: 0 };
    }
    const index = JSON.parse(raw);
    if (index.version !== TILE_CACHE_VERSION) {
      // Versiyon uyumsuzluğu - cache'i temizle
      await clearTileCache();
      return { version: TILE_CACHE_VERSION, tiles: {}, totalSize: 0 };
    }
    return index;
  } catch {
    return { version: TILE_CACHE_VERSION, tiles: {}, totalSize: 0 };
  }
}

/**
 * Tile index'i kaydet
 */
async function saveTileIndex(index: TileIndex) {
  try {
    await setLargeItemAsync(TILE_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('[MapTileCache] Index kaydetme hatası:', error);
  }
}

/**
 * Tile key oluştur
 */
function getTileKey(z: number, x: number, y: number): string {
  return `${z}_${x}_${y}`;
}

/**
 * Tile dosya yolu
 */
function getTilePath(z: number, x: number, y: number): string {
  return `${TILE_CACHE_DIR}${z}_${x}_${y}.png`;
}

/**
 * Tile'ı cache'den al (varsa)
 */
export async function getCachedTile(z: number, x: number, y: number): Promise<string | null> {
  try {
    const path = getTilePath(z, x, y);
    const fileInfo = await FileSystem.getInfoAsync(path);
    
    if (fileInfo.exists) {
      // Dosya varsa, base64 olarak döndür
      const base64 = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/png;base64,${base64}`;
    }
    
    return null;
  } catch (error) {
    console.error('[MapTileCache] Tile okuma hatası:', error);
    return null;
  }
}

/**
 * Tile'ı indir ve cache'le
 * NOT: Bu fonksiyon çağrılmadan önce network kontrolü yapılmalı
 */
export async function cacheTile(z: number, x: number, y: number): Promise<boolean> {
  try {
    await ensureCacheDirectory();
    
    // Tile zaten cache'de mi kontrol et (gereksiz indirmeleri önle)
    const existingTile = await getCachedTile(z, x, y);
    if (existingTile) {
      // console.log(`[MapTileCache] Tile zaten cache'de: ${z}/${x}/${y}`);
      return true;
    }
    
    // Backend proxy üzerinden tile çek (backend'de CartoDB'ye yönlendirilecek)
    const url = `${API_URL}/tiles/${z}/${x}/${y}.png?v=cartodb`;
    const path = getTilePath(z, x, y);
    const key = getTileKey(z, x, y);
    
    // Tile'ı indir
    const downloadResult = await FileSystem.downloadAsync(url, path);
    
    if (downloadResult.status !== 200) {
      return false;
    }
    
    // Index'i güncelle
    const index = await loadTileIndex();
    const fileInfo = await FileSystem.getInfoAsync(path);
    const size = (fileInfo as any).size || 0;
    
    index.tiles[key] = {
      z,
      x,
      y,
      timestamp: Date.now(),
      size,
    };
    index.totalSize += size;
    
    // Cache limiti aşıldıysa en eski tile'ları sil
    await enforceMaxCacheSize(index);
    
    await saveTileIndex(index);
    return true;
  } catch (error) {
    // Hata durumunda sessizce fail et (network hatası normal)
    console.log(`[MapTileCache] Tile cache başarısız (${z}/${x}/${y}): ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Cache boyut limitini zorla (en eski tile'ları sil)
 */
async function enforceMaxCacheSize(index: TileIndex) {
  const tileKeys = Object.keys(index.tiles);
  
  if (tileKeys.length <= MAX_CACHED_TILES) {
    return;
  }
  
  // Timestamp'e göre sırala (en eski önce)
  const sortedKeys = tileKeys.sort((a, b) => {
    return index.tiles[a].timestamp - index.tiles[b].timestamp;
  });
  
  // Fazla tile'ları sil
  const tilesToDelete = sortedKeys.slice(0, tileKeys.length - MAX_CACHED_TILES);
  
  for (const key of tilesToDelete) {
    const tile = index.tiles[key];
    const path = getTilePath(tile.z, tile.x, tile.y);
    
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
      index.totalSize -= tile.size;
      delete index.tiles[key];
    } catch {
      // Hata olsa bile devam et
    }
  }
}

/**
 * Tüm cache'i temizle
 */
export async function clearTileCache() {
  try {
    await FileSystem.deleteAsync(TILE_CACHE_DIR, { idempotent: true });
    await removeLargeItemAsync(TILE_INDEX_KEY);
    await removeLargeItemAsync(CACHED_REGIONS_KEY);
    console.log('[MapTileCache] Cache temizlendi (tile index ve cached regions dahil)');
  } catch (error) {
    console.error('[MapTileCache] Cache temizleme hatası:', error);
  }
}

/**
 * Cache istatistiklerini al
 */
export async function getTileCacheStats(): Promise<{
  tileCount: number;
  totalSize: number;
  maxTiles: number;
}> {
  const index = await loadTileIndex();
  return {
    tileCount: Object.keys(index.tiles).length,
    totalSize: index.totalSize,
    maxTiles: MAX_CACHED_TILES,
  };
}

/**
 * İki nokta arası mesafe hesaplama (Haversine formülü, metre cinsinden)
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000; // Dünya yarıçapı (metre)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Cache edilmiş bölgeleri yükle
 */
async function loadCachedRegions(): Promise<CachedRegion[]> {
  try {
    const raw = await getLargeItemAsync(CACHED_REGIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Cache edilmiş bölgeleri kaydet
 */
async function saveCachedRegions(regions: CachedRegion[]) {
  try {
    await setLargeItemAsync(CACHED_REGIONS_KEY, JSON.stringify(regions));
  } catch (error) {
    console.error('[MapTileCache] Cached regions kaydetme hatası:', error);
  }
}

/**
 * Belirtilen konumun daha önce cache'lenip cache'lenmediğini kontrol et
 */
async function isRegionCached(lat: number, lon: number, radiusKm: number): Promise<boolean> {
  const regions = await loadCachedRegions();
  
  for (const region of regions) {
    const distance = getDistanceMeters(lat, lon, region.latitude, region.longitude);
    const distanceKm = distance / 1000;
    
    // Eğer bu bölge daha önce cache'lenmişse ve threshold içindeyse
    if (distanceKm < REGION_CACHE_THRESHOLD / 1000) {
      return true;
    }
  }
  
  return false;
}

/**
 * Yeni bir bölgeyi cache edilmiş olarak işaretle
 */
async function markRegionAsCached(lat: number, lon: number, radiusKm: number) {
  const regions = await loadCachedRegions();
  
  // Yeni bölgeyi ekle
  regions.push({
    latitude: lat,
    longitude: lon,
    timestamp: Date.now(),
    radius: radiusKm,
  });
  
  // Son 50 bölgeyi tut (hafıza tasarrufu)
  const recentRegions = regions.slice(-50);
  
  await saveCachedRegions(recentRegions);
}

/**
 * Belirli bir bölge için tile'ları ön-cache'le
 * @param centerLat Merkez enlem
 * @param centerLon Merkez boylam
 * @param zoom Zoom seviyesi
 * @param radius Kaç tile yarıçapı (varsayılan: 2)
 */
export async function precacheTilesForRegion(
  centerLat: number,
  centerLon: number,
  zoom: number,
  radius: number = 2
): Promise<number> {
  try {
    // Lat/Lon'dan tile koordinatlarını hesapla
    const centerX = Math.floor((centerLon + 180) / 360 * Math.pow(2, zoom));
    const centerY = Math.floor((1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    
    let cachedCount = 0;
    const promises: Promise<boolean>[] = [];
    
    // Merkez etrafındaki tile'ları cache'le
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        if (x >= 0 && x < Math.pow(2, zoom) && y >= 0 && y < Math.pow(2, zoom)) {
          promises.push(
            cacheTile(zoom, x, y).then(success => {
              if (success) cachedCount++;
              return success;
            })
          );
        }
      }
    }
    
    await Promise.all(promises);
    console.log(`[MapTileCache] Zoom ${zoom}: ${cachedCount} tile ön-cache'lendi`);
    
    return cachedCount;
  } catch (error) {
    console.error('[MapTileCache] Ön-cache hatası:', error);
    return 0;
  }
}

/**
 * 20 km çapında bir bölge için birden fazla zoom seviyesinde tile cache'le
 * @param centerLat Merkez enlem
 * @param centerLon Merkez boylam
 * @param radiusKm Çap (km, varsayılan: 20)
 */
export async function precacheRegionWithRadius(
  centerLat: number,
  centerLon: number,
  radiusKm: number = 20
): Promise<{ totalTiles: number; alreadyCached: boolean; cachedTiles?: number; totalSizeMB?: number }> {
  try {
    // Daha önce cache'lenmiş mi kontrol et
    const alreadyCached = await isRegionCached(centerLat, centerLon, radiusKm);
    
    if (alreadyCached) {
      console.log('[MapTileCache] Bu bölge daha önce cache\'lendi, atlanıyor');
      return { totalTiles: 0, alreadyCached: true };
    }
    
    let totalCached = 0;
    
    // 20 km çap için zoom seviyeleri ve tile radius'ları
    // Zoom 9: ~19.2 km per tile -> 1 tile radius (3x3 grid)
    // Zoom 10: ~9.6 km per tile -> 2 tile radius (5x5 grid)
    // Zoom 11: ~4.8 km per tile -> 3 tile radius (7x7 grid)
    // Zoom 12: ~2.4 km per tile -> 4 tile radius (9x9 grid)
    // Zoom 13: ~1.2 km per tile -> 8 tile radius (17x17 grid)
    
    const zoomConfigs = [
      { zoom: 9, tileRadius: 1 },   // 9 tile
      { zoom: 10, tileRadius: 2 },  // 25 tile
      { zoom: 11, tileRadius: 3 },  // 49 tile
      { zoom: 12, tileRadius: 4 },  // 81 tile
      { zoom: 13, tileRadius: 8 },  // 289 tile
    ];
    
    console.log(`[MapTileCache] ${radiusKm} km çapında bölge cache'leniyor...`);
    
    // Her zoom seviyesi için cache işlemi
    for (const config of zoomConfigs) {
      const count = await precacheTilesForRegion(
        centerLat,
        centerLon,
        config.zoom,
        config.tileRadius
      );
      totalCached += count;
      
      // Biraz bekle (API rate limiting ve performans için)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Bu bölgeyi cache'lenmiş olarak işaretle
    await markRegionAsCached(centerLat, centerLon, radiusKm);
    
    // Tahmini boyut hesapla (tile başına ortalama 20 KB)
    const estimatedSizeMB = Math.round((totalCached * 20) / 1024);
    
    console.log(`[MapTileCache] Toplam ${totalCached} tile cache'lendi (${radiusKm} km çap, ~${estimatedSizeMB} MB)`);
    
    return { 
      totalTiles: totalCached, 
      alreadyCached: false,
      cachedTiles: totalCached,
      totalSizeMB: estimatedSizeMB,
    };
  } catch (error) {
    console.error('[MapTileCache] Bölge cache hatası:', error);
    return { totalTiles: 0, alreadyCached: false };
  }
}
