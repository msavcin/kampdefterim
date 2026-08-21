import { apiFetch } from './apiFetch';

export type FeatureKey =
  | 'announcements'
  | 'checklist'
  | 'chat'
  | 'offline_mode'
  | 'camping_area_limit'
  | 'free_trial';

export type FeatureEntitlement = {
  featureKey: FeatureKey;
  enabled: boolean;
  limitValue?: number | null;
  expiresAt?: string | null;
  source?: 'default' | 'global' | 'user' | string;
  description?: string;
};

export type FeatureEntitlementMap = Record<FeatureKey, FeatureEntitlement>;

export type FeatureUpdateValue = {
  enabled: boolean;
  limitValue?: number | null;
  expiresAt?: string | null;
};

export type EntitlementUser = {
  id: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  trial_user?: boolean;
  offline_enabled?: boolean;
  subscription_is_active?: boolean;
  subscription_expires_at?: string | null;
  trial_started_at?: string | null;
  trial_expires_at?: string | null;
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  announcements: 'Duyurular',
  checklist: 'Checklist',
  chat: 'Sohbet',
  offline_mode: 'Offline Mode',
  camping_area_limit: 'Kamp alanı ekleme limiti',
  free_trial: 'Ücretsiz deneme süresi',
};

export const DEFAULT_FEATURE_ENTITLEMENTS: FeatureEntitlementMap = {
  announcements: { featureKey: 'announcements', enabled: false, source: 'default' },
  checklist: { featureKey: 'checklist', enabled: false, source: 'default' },
  chat: { featureKey: 'chat', enabled: false, source: 'default' },
  offline_mode: { featureKey: 'offline_mode', enabled: false, source: 'default' },
  camping_area_limit: { featureKey: 'camping_area_limit', enabled: true, limitValue: 10, source: 'default' },
  free_trial: { featureKey: 'free_trial', enabled: true, limitValue: 30, source: 'default' },
};

function isFeatureKey(value: any): value is FeatureKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_ENTITLEMENTS, value);
}

function normalizeEnabled(value: any): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeMap(raw: any): FeatureEntitlementMap {
  const merged: any = { ...DEFAULT_FEATURE_ENTITLEMENTS };

  // Backend'in eski bazı cevapları `updated: FeatureEntitlementRow[]` şeklinde dizi dönebiliyor.
  // Yeni cevaplar ise `entitlements: { chat: {...}, ... }` map formatında.
  // İkisini de aynı map'e çeviriyoruz; aksi halde save sonrası panel varsayılan false değerlere düşer.
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.entries(raw).map(([key, value]: [string, any]) => ({
          ...(value && typeof value === 'object' ? value : {}),
          feature_key: value?.feature_key ?? value?.featureKey ?? key,
        }))
      : [];

  for (const item of rows) {
    const key = item?.featureKey ?? item?.feature_key;
    if (!isFeatureKey(key)) continue;

    merged[key] = {
      ...DEFAULT_FEATURE_ENTITLEMENTS[key],
      featureKey: key,
      enabled: normalizeEnabled(item.enabled),
      limitValue:
        item.limitValue ??
        item.limit_value ??
        DEFAULT_FEATURE_ENTITLEMENTS[key].limitValue ??
        null,
      expiresAt: item.expiresAt ?? item.expires_at ?? null,
      source: item.source ?? merged[key].source ?? 'default',
      description: item.description ?? merged[key].description,
    };
  }

  return merged as FeatureEntitlementMap;
}

export async function getMyFeatureEntitlements(): Promise<FeatureEntitlementMap> {
  try {
    const response = await apiFetch('/feature-entitlements/me', { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const mapped = normalizeMap(data.entitlements);
    try {
      const { saveEntitlementsCache } = require('./offlinePremiumCache');
      await saveEntitlementsCache(mapped);
    } catch {}
    return mapped;
  } catch (error) {
    if (__DEV__) console.warn('[FeatureEntitlements] getMy fallback:', error);
    try {
      const { loadEntitlementsCache } = require('./offlinePremiumCache');
      const cached = await loadEntitlementsCache();
      if (cached) return cached;
    } catch {}
    return DEFAULT_FEATURE_ENTITLEMENTS;
  }
}

export async function listEntitlementUsers(query = ''): Promise<EntitlementUser[]> {
  const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  const response = await apiFetch(`/feature-entitlements/admin/users${qs}`, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.users) ? data.users : [];
}

export async function getGlobalFeatureEntitlements(): Promise<FeatureEntitlementMap> {
  const response = await apiFetch('/feature-entitlements/admin/global', { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeMap(data.entitlements);
}

export async function updateGlobalFeatureEntitlements(features: Partial<Record<FeatureKey, FeatureUpdateValue>>): Promise<FeatureEntitlementMap> {
  const response = await apiFetch('/feature-entitlements/admin/global', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeMap(data.entitlements ?? data.updated);
}

export async function getUserFeatureEntitlements(userId: number | string): Promise<{ user: EntitlementUser; entitlements: FeatureEntitlementMap }> {
  const response = await apiFetch(`/feature-entitlements/admin/users/${userId}`, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return { user: data.user, entitlements: normalizeMap(data.entitlements) };
}

export async function updateUserFeatureEntitlements(
  userId: number | string,
  features: Partial<Record<FeatureKey, FeatureUpdateValue>>,
): Promise<FeatureEntitlementMap> {
  const response = await apiFetch(`/feature-entitlements/admin/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeMap(data.entitlements);
}

export async function startUserFreeTrial(userId: number | string, days?: number | null): Promise<any> {
  const response = await apiFetch(`/feature-entitlements/admin/users/${userId}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: days ?? undefined }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}


export async function revokeUserFreeTrial(userId: number | string): Promise<any> {
  const response = await apiFetch(`/feature-entitlements/admin/users/${userId}/revoke-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function clearUserFeatureEntitlement(userId: number | string, featureKey: FeatureKey): Promise<FeatureEntitlementMap> {
  const response = await apiFetch(`/feature-entitlements/admin/users/${userId}/${featureKey}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeMap(data.entitlements);
}
