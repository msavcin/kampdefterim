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

// --- ANNOUNCEMENTS DELTA SYNC ---

const LAST_ANNOUNCEMENT_SYNC_KEY = 'lastAnnouncementSync';
const ANNOUNCEMENT_SYNC_COUNTER_KEY = 'announcementSyncCounter';
const FULL_SYNC_INTERVAL = 10; // Her 10 delta sync'de bir full check

/**
 * Sync counter'ı arttırır ve her 10 sync'de true döner (full check için)
 * @returns Full check yapılmalı mı
 */
export async function incrementAnnouncementSyncCounter(): Promise<boolean> {
  try {
    const counterStr = await AsyncStorage.getItem(ANNOUNCEMENT_SYNC_COUNTER_KEY);
    const counter = counterStr ? parseInt(counterStr, 10) : 0;
    const newCounter = counter + 1;
    
    if (newCounter >= FULL_SYNC_INTERVAL) {
      await AsyncStorage.setItem(ANNOUNCEMENT_SYNC_COUNTER_KEY, '0');
      console.log('[deltaSyncStorage] Sync counter reset, full check gerekli');
      return true;
    } else {
      await AsyncStorage.setItem(ANNOUNCEMENT_SYNC_COUNTER_KEY, String(newCounter));
      console.log('[deltaSyncStorage] Sync counter:', newCounter);
      return false;
    }
  } catch (error) {
    console.error('[deltaSyncStorage] Sync counter hatası:', error);
    return false;
  }
}

/**
 * Son duyuru senkronizasyon zamanını kaydeder
 * @param timestamp ISO 8601 formatında tarih (örn: 2026-01-10T12:00:00Z)
 */
export async function setLastAnnouncementSync(timestamp: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ANNOUNCEMENT_SYNC_KEY, timestamp);
    console.log('[deltaSyncStorage] Son duyuru sync zamanı kaydedildi:', timestamp);
  } catch (error) {
    console.error('[deltaSyncStorage] Son duyuru sync zamanı kaydedilemedi:', error);
  }
}

/**
 * Son duyuru senkronizasyon zamanını getirir
 * @returns ISO 8601 formatında tarih veya null (ilk senkronizasyon ise)
 */
export async function getLastAnnouncementSync(): Promise<string | null> {
  try {
    const timestamp = await AsyncStorage.getItem(LAST_ANNOUNCEMENT_SYNC_KEY);
    return timestamp;
  } catch (error) {
    console.error('[deltaSyncStorage] Son duyuru sync zamanı alınamadı:', error);
    return null;
  }
}

/**
 * Son duyuru senkronizasyon zamanını siler (test veya reset için)
 */
export async function clearLastAnnouncementSync(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_ANNOUNCEMENT_SYNC_KEY);
    console.log('[deltaSyncStorage] Son duyuru sync zamanı temizlendi');
  } catch (error) {
    console.error('[deltaSyncStorage] Son duyuru sync zamanı temizlenemedi:', error);
  }
}
