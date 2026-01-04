
import axios from 'axios';
import { API_URL } from './config';
import { getCachedOsmResult, setCachedOsmResult, makeOsmCacheKey } from './osmCache';

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
    const res = await axios.get(url, { headers: { 'User-Agent': 'KampApp/1.0' } });
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
