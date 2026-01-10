/**
 * Delta Sync için son senkronizasyon zamanını yöneten yardımcı fonksiyonlar
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_CAMPING_AREA_SYNC_KEY = 'lastCampingAreaSync';

/**
 * Son kamp alanı senkronizasyon zamanını kaydeder
 * @param timestamp ISO 8601 formatında tarih (örn: 2026-01-10T12:00:00Z)
 */
export async function setLastCampingAreaSync(timestamp: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CAMPING_AREA_SYNC_KEY, timestamp);
    console.log('[deltaSyncStorage] Son sync zamanı kaydedildi:', timestamp);
  } catch (error) {
    console.error('[deltaSyncStorage] Son sync zamanı kaydedilemedi:', error);
  }
}

/**
 * Son kamp alanı senkronizasyon zamanını getirir
 * @returns ISO 8601 formatında tarih veya null (ilk senkronizasyon ise)
 */
export async function getLastCampingAreaSync(): Promise<string | null> {
  try {
    const timestamp = await AsyncStorage.getItem(LAST_CAMPING_AREA_SYNC_KEY);
    return timestamp;
  } catch (error) {
    console.error('[deltaSyncStorage] Son sync zamanı alınamadı:', error);
    return null;
  }
}

/**
 * Son senkronizasyon zamanını siler (test veya reset için)
 */
export async function clearLastCampingAreaSync(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_CAMPING_AREA_SYNC_KEY);
    console.log('[deltaSyncStorage] Son sync zamanı temizlendi');
  } catch (error) {
    console.error('[deltaSyncStorage] Son sync zamanı temizlenemedi:', error);
  }
}
