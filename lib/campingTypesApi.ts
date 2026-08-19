import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';
import { getToken } from './auth';
import {
  CampingType,
  DEFAULT_CAMPING_TYPES,
  getAllCampingTypes,
  normalizeCampingType,
  setCampingTypesCatalog,
} from './categories';

const CACHE_KEY = 'campingTypesCatalog:v1';
const LAST_SYNC_KEY = 'campingTypesCatalog:lastSyncAt:v1';

function mergeCampingTypes(current: CampingType[], incoming: any[]): CampingType[] {
  const map = new Map<string, CampingType>();
  current.forEach((item) => {
    const normalized = normalizeCampingType(item);
    if (normalized) map.set(normalized.id, normalized);
  });

  incoming.forEach((raw) => {
    const normalized = normalizeCampingType(raw);
    if (!normalized) return;
    map.set(normalized.id, normalized);
  });

  return Array.from(map.values()).sort((a, b) => {
    const sa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999;
    const sb = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label, 'tr');
  });
}

async function saveCatalog(items: CampingType[], serverTime?: string | null) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items));
  if (serverTime) await AsyncStorage.setItem(LAST_SYNC_KEY, serverTime);
}

export async function hydrateCampingTypesFromCache(): Promise<CampingType[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) {
      setCampingTypesCatalog(DEFAULT_CAMPING_TYPES);
      return DEFAULT_CAMPING_TYPES;
    }
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? mergeCampingTypes([], parsed) : DEFAULT_CAMPING_TYPES;
    setCampingTypesCatalog(list);
    return list;
  } catch (error) {
    console.warn('[campingTypes] Lokal cache okunamadı:', error);
    setCampingTypesCatalog(DEFAULT_CAMPING_TYPES);
    return DEFAULT_CAMPING_TYPES;
  }
}

export async function syncCampingTypes({ forceFull = false }: { forceFull?: boolean } = {}): Promise<boolean> {
  try {
    const lastSync = !forceFull ? await AsyncStorage.getItem(LAST_SYNC_KEY) : null;
    const url = lastSync
      ? `${API_URL}/camping_types/sync?updated_after=${encodeURIComponent(lastSync)}`
      : `${API_URL}/camping_types/sync`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kamp türleri alınamadı (${res.status})`);
    const data = await res.json();
    const incoming = Array.isArray(data?.campingTypes)
      ? data.campingTypes
      : Array.isArray(data)
        ? data
        : [];

    const base = lastSync ? getAllCampingTypes(true) : [];
    const merged = mergeCampingTypes(base, incoming);
    setCampingTypesCatalog(merged.length > 0 ? merged : DEFAULT_CAMPING_TYPES);
    await saveCatalog(merged.length > 0 ? merged : DEFAULT_CAMPING_TYPES, data?.serverTime || new Date().toISOString());
    if (__DEV__) console.log('[campingTypes] ✅ Senkronize edildi:', incoming.length);
    return true;
  } catch (error) {
    console.warn('[campingTypes] Senkronizasyon başarısız, lokal cache kullanılacak:', error);
    await hydrateCampingTypesFromCache();
    return false;
  }
}

async function authHeaders() {
  const token = await getToken();
  if (!token) throw new Error('Oturum bulunamadı.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseApiError(res: Response) {
  try {
    const data = await res.json();
    return data?.error || data?.message || `Sunucu hatası (${res.status})`;
  } catch {
    return `Sunucu hatası (${res.status})`;
  }
}

export async function listCampingTypesAdmin(): Promise<CampingType[]> {
  const res = await fetch(`${API_URL}/camping_types/admin`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.campingTypes || [];
  return mergeCampingTypes([], list);
}

export async function createCampingTypeAdmin(payload: {
  code: string;
  name: string;
  svg: string;
  color?: string;
  sort_order?: number;
  active?: boolean;
}): Promise<CampingType> {
  const res = await fetch(`${API_URL}/camping_types/admin`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  const normalized = normalizeCampingType(data?.campingType);
  if (!normalized) throw new Error('Sunucu geçersiz kamp türü döndürdü.');
  await syncCampingTypes({ forceFull: true });
  return normalized;
}

export async function updateCampingTypeAdmin(idOrCode: string | number, payload: Partial<{
  name: string;
  svg: string;
  color: string;
  sort_order: number;
  active: boolean;
}>): Promise<CampingType> {
  const res = await fetch(`${API_URL}/camping_types/admin/${encodeURIComponent(String(idOrCode))}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  const normalized = normalizeCampingType(data?.campingType);
  if (!normalized) throw new Error('Sunucu geçersiz kamp türü döndürdü.');
  await syncCampingTypes({ forceFull: true });
  return normalized;
}

export async function deleteCampingTypeAdmin(idOrCode: string | number, force = false): Promise<any> {
  const url = `${API_URL}/camping_types/admin/${encodeURIComponent(String(idOrCode))}${force ? '?force=true' : ''}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    const err: any = new Error(body?.error || `Sunucu hatası (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const data = await res.json();
  await syncCampingTypes({ forceFull: true });
  return data;
}
