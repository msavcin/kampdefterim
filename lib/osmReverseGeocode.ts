
import axios from 'axios';
import { getCachedOsmResult, setCachedOsmResult, makeOsmCacheKey } from './osmCache';

// Nominatim rate limit: 1 request/s.
// Bu basit queue ile istemci tarafında hızlı scroll/yeniden render'dan dolayı
// oluşabilecek 429 hatalarının önüne geçiyoruz.
let lastOsmRequestTime = 0;
let pendingOsmPromise: Promise<any> | null = null;

async function throttledOsmRequest<T>(fn: () => Promise<T>): Promise<T> {
  const schedule = async () => {
    const now = Date.now();
    const waitMs = Math.max(0, 1100 - (now - lastOsmRequestTime));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    const result = await fn();
    lastOsmRequestTime = Date.now();
    return result;
  };

  const currentPromise = pendingOsmPromise
    ? pendingOsmPromise.finally(() => schedule())
    : schedule();

  pendingOsmPromise = currentPromise;

  try {
    return await currentPromise;
  } finally {
    // Eğer bu çağrı en son planlanan çağrıysa, queue'yu sıfırla
    if (pendingOsmPromise === currentPromise) {
      pendingOsmPromise = null;
    }
  }
}

// En kapsamlı ve cache'li OSM province bulucu
export async function getProvinceFromOSM(lat: number, lon: number): Promise<string | null> {
  const cacheKey = makeOsmCacheKey(lat, lon);
  const cached = await getCachedOsmResult?.(cacheKey);
  if (cached && typeof cached === 'string') {
    return cached;
  }
  try {
    // Doğrudan OSM Nominatim API kullanılıyor
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=tr`;
    const res = await throttledOsmRequest(() => axios.get(url, { headers: { 'User-Agent': 'KampApp/1.0' } }));
    const address = res.data.address;
    // OSM'de il: state, city, town, village, county, region
    const province = (
      address.state ||
      address.city ||
      address.town ||
      address.village ||
      address.county ||
      address.region ||
      null
    );
    if (province) {
      await setCachedOsmResult?.(cacheKey, province);
    }
    return province;
  } catch (e) {
    console.log('[OSM] Reverse geocode error:', e);
    return null;
  }
}

// İl ve İlçe bilgisi döndürür (örn: "Antalya, Kemer")
export async function getLocationNameFromOSM(lat: number, lon: number): Promise<string | null> {
  const cacheKey = makeOsmCacheKey(lat, lon) + '_location_name';
  const cached = await getCachedOsmResult?.(cacheKey);
  if (cached && typeof cached === 'string') {
    return cached;
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=tr`;
    const res = await throttledOsmRequest(() => axios.get(url, { headers: { 'User-Agent': 'KampApp/1.0' } }));
    const maybeError = res.data?.error || res.data?.message;
    if (typeof maybeError === 'string' && /rate|limit|too many/i.test(maybeError)) {
      throw new Error('Nominatim rate limit');
    }

    const address = res.data.address;
    // İl (state/province/city)
    const province = address?.state || address?.province || address?.city || null;

    // İlçe (county/town/district)
    const district = address?.county || address?.town || address?.district || address?.city_district || null;

    let locationName = null;
    if (province && district && province !== district) {
      locationName = `${province}, ${district}`;
    } else if (province) {
      locationName = province;
    } else if (district) {
      locationName = district;
    }

    // Nominatim bazen garip placeholderlar dönebilir (ör. "_RATE_LIMIT_")
    if (typeof locationName === 'string' && /rate[_\s-]?limit/i.test(locationName)) {
      throw new Error('Nominatim rate limit placeholder');
    }

    if (locationName) {
      await setCachedOsmResult?.(cacheKey, locationName);
    }

    return locationName;
  } catch (e) {
    console.log('[OSM] Reverse geocode error:', e);
    return null;
  }
}

// İl, ilçe ve plaka (valilik id) bilgilerini obje olarak döndürür
export async function getProvinceInfoFromOSM(lat: number, lon: number): Promise<{ il: string | null; ilce: string | null; plaka: string | null } | null> {
  const cacheKey = makeOsmCacheKey(lat, lon) + '_province_obj';
  const cached = await getCachedOsmResult?.(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=tr&addressdetails=1`;
    const res = await throttledOsmRequest(() => axios.get(url, { headers: { 'User-Agent': 'KampApp/1.0' } }));
    const address = res.data?.address || {};

    const il = address.state || address.province || address.city || address.region || null;
    const ilce = address.county || address.town || address.district || address.city_district || address.suburb || null;

    // Plaka kodunu provinceMap'den bul
    let plaka: string | null = null;
    try {
      const { getValilikIdFromProvinceName } = require('./provinceMap');
      const vid = getValilikIdFromProvinceName(il || ilce || '');
      if (vid) plaka = String(vid);
    } catch (e) {
      // ignore
    }

    const obj = { il: il || null, ilce: ilce || null, plaka };
    // Cache'le
    if (obj.il || obj.ilce || obj.plaka) {
      await setCachedOsmResult?.(cacheKey, JSON.stringify(obj));
    }
    return obj;
  } catch (e) {
    console.log('[OSM] Reverse geocode error:', e);
    return null;
  }
}
