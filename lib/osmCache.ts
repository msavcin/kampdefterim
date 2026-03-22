// Basit bir in-memory + async storage cache (expo için)
import { setLargeItemAsync, getLargeItemAsync, removeLargeItemAsync } from './largeStorage';

const CACHE_PREFIX = 'osm_cache_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 saat (ms)

export async function getCachedOsmResult(key: string): Promise<any | null> {
  try {
    const raw = await getLargeItemAsync(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      await removeLargeItemAsync(CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function setCachedOsmResult(key: string, data: any) {
  try {
    await setLargeItemAsync(
      CACHE_PREFIX + key,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {}
}

export function makeOsmCacheKey(lat: number, lon: number) {
  // 4 ondalık hassasiyet (yaklaşık 10m)
  return `${lat.toFixed(4)}_${lon.toFixed(4)}`;
}
