/**
 * Akıllı Offline Cache Sistemi
 * - Favori yerleri otomatik cache'ler
 * - WiFi bağlantısında çalışır
 * - Background location izni gerektirmez
 */

import { getDatabase } from './database';
import { precacheRegionWithRadius } from './mapTileCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

const LAST_SMART_CACHE_KEY = 'last_smart_cache_timestamp';
const SMART_CACHE_INTERVAL = 24 * 60 * 60 * 1000; // 24 saat

export interface SmartCacheOptions {
  maxRegions?: number;        // Maksimum cache'lenecek bölge sayısı
  radiusPerRegion?: number;   // Her bölge için yarıçap (km)
  onlyWiFi?: boolean;         // Sadece WiFi'da indirsin mi?
  silent?: boolean;           // Sessiz mod (bildirim gösterme)
}

export interface SmartCacheResult {
  success: boolean;
  cachedRegions?: number;
  totalFavorites?: number;
  reason?: string;
  error?: any;
}

/**
 * Favori kamp alanlarını otomatik cache'ler
 */
export async function smartCacheFavorites(
  options: SmartCacheOptions = {}
): Promise<SmartCacheResult> {
  const {
    maxRegions = 5,
    radiusPerRegion = 10,
    onlyWiFi = true,
    silent = false,
  } = options;

  try {
    // İnternet kontrolü
    const networkState = await Network.getNetworkStateAsync();
    
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      console.log('[SmartCache] İnternet yok');
      return { success: false, reason: 'no_internet' };
    }
    
    if (onlyWiFi && networkState.type !== Network.NetworkStateType.WIFI) {
      console.log('[SmartCache] WiFi beklemede, atlandı');
      return { success: false, reason: 'waiting_for_wifi' };
    }

    // Son cache zamanını kontrol et (24 saat kuralı)
    const lastCacheStr = await AsyncStorage.getItem(LAST_SMART_CACHE_KEY);
    const lastCache = lastCacheStr ? parseInt(lastCacheStr) : 0;
    const now = Date.now();

    if (now - lastCache < SMART_CACHE_INTERVAL) {
      console.log('[SmartCache] 24 saat dolmadı, atlandı');
      return { success: false, reason: 'too_soon' };
    }

    // Favori kamp alanlarını getir
    const db = getDatabase();
    const favorites = await db.getFavorites();
    
    if (favorites.length === 0) {
      console.log('[SmartCache] Favori yok');
      return { success: false, reason: 'no_favorites' };
    }

    // En son eklenen favorileri önceliklendir
    const topFavorites = favorites
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .slice(0, maxRegions);

    console.log(`[SmartCache] ${topFavorites.length} favori bölge cache'lenecek`);

    let cachedCount = 0;
    for (const fav of topFavorites) {
      try {
        console.log(`[SmartCache] Cache başlatıldı: ${fav.name || 'İsimsiz'}`);
        
        await precacheRegionWithRadius(
          fav.latitude,
          fav.longitude,
          radiusPerRegion
        );
        
        cachedCount++;
        console.log(`[SmartCache] ✅ ${fav.name || 'İsimsiz'} cache'lendi`);
      } catch (error) {
        console.error(`[SmartCache] ❌ ${fav.name || 'İsimsiz'} cache hatası:`, error);
      }
    }

    // Son cache zamanını kaydet
    await AsyncStorage.setItem(LAST_SMART_CACHE_KEY, now.toString());

    return {
      success: true,
      cachedRegions: cachedCount,
      totalFavorites: favorites.length,
    };
  } catch (error) {
    console.error('[SmartCache] Hata:', error);
    return { success: false, error };
  }
}

/**
 * Otomatik WiFi cache sistemini başlatır
 * WiFi'ya bağlanınca favorileri cache'ler
 */
export function initSmartCache(options: SmartCacheOptions = {}) {
  console.log('[SmartCache] Otomatik sistem başlatıldı');

  // Periyodik kontrol (WiFi'da favorileri cache'le)
  let intervalId: ReturnType<typeof setInterval> | null = null;
  
  const checkAndCache = async () => {
    const networkState = await Network.getNetworkStateAsync();
    
    // Sadece WiFi bağlantısında çalış
    if (networkState.type === Network.NetworkStateType.WIFI && networkState.isConnected) {
      console.log('[SmartCache] WiFi bağlantısı tespit edildi, cache başlatılıyor...');
      
      const result = await smartCacheFavorites({
        maxRegions: 5,
        radiusPerRegion: 10,
        onlyWiFi: true,
        silent: true,
        ...options,
      });
      
      if (result.success) {
        console.log(`[SmartCache] ✅ Otomatik cache tamamlandı: ${result.cachedRegions} bölge`);
      } else {
        console.log(`[SmartCache] ℹ️ Cache atlandı: ${result.reason}`);
      }
    }
  };
  
  // İlk kontrolü 5 saniye sonra yap
  setTimeout(checkAndCache, 5000);
  
  // Her 30 dakikada bir kontrol et
  intervalId = setInterval(checkAndCache, 30 * 60 * 1000);

  // Cleanup fonksiyonu
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Smart cache istatistiklerini döndürür
 */
export async function getSmartCacheStats() {
  try {
    const lastCacheStr = await AsyncStorage.getItem(LAST_SMART_CACHE_KEY);
    const lastCache = lastCacheStr ? parseInt(lastCacheStr) : null;
    
    const db = getDatabase();
    const favorites = await db.getFavorites();
    
    return {
      lastCacheDate: lastCache ? new Date(lastCache) : null,
      totalFavorites: favorites.length,
      nextCacheAvailable: lastCache 
        ? new Date(lastCache + SMART_CACHE_INTERVAL)
        : new Date(),
    };
  } catch (error) {
    console.error('[SmartCache] Stats alınamadı:', error);
    return null;
  }
}

/**
 * Smart cache'i manuel tetikle
 */
export async function triggerSmartCache(force: boolean = false) {
  if (force) {
    // 24 saat kuralını bypass et
    await AsyncStorage.removeItem(LAST_SMART_CACHE_KEY);
  }
  
  return await smartCacheFavorites({
    maxRegions: 10,
    radiusPerRegion: 15,
    onlyWiFi: false, // Manuel tetiklemede WiFi zorunluluğu yok
    silent: false,
  });
}
