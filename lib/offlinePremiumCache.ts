import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_FEATURE_ENTITLEMENTS, type FeatureEntitlementMap } from './featureEntitlementsApi';

export const CACHED_PREMIUM_KEY = '@cached_is_premium';
export const CACHED_ENTITLEMENTS_KEY = '@cached_feature_entitlements';

export function computeIsPremium(user: any): boolean {
  if (!user) return false;
  return !!(
    user.is_premium ||
    user.isPremium ||
    user.offline_enabled ||
    user.subscription_is_active ||
    user.user?.is_premium ||
    user.user?.isPremium ||
    user.user?.offline_enabled ||
    user.user?.subscription_is_active
  );
}

export function isValidUserPayload(user: any): boolean {
  const id = user?.id ?? user?.user?.id ?? user?.user_id;
  return id !== undefined && id !== null && String(id) !== '' && String(id) !== 'undefined';
}

export async function savePremiumFlag(premium: boolean) {
  try {
    await AsyncStorage.setItem(CACHED_PREMIUM_KEY, premium ? '1' : '0');
  } catch {}
}

export async function loadPremiumFlag(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CACHED_PREMIUM_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveEntitlementsCache(entitlements: FeatureEntitlementMap) {
  try {
    await AsyncStorage.setItem(CACHED_ENTITLEMENTS_KEY, JSON.stringify(entitlements));
  } catch {}
}

export async function loadEntitlementsCache(): Promise<FeatureEntitlementMap | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_ENTITLEMENTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadCachedUser(): Promise<any | null> {
  const premium = await loadPremiumFlag();
  let user: any = null;
  try {
    const local = await SecureStore.getItemAsync('localUser');
    if (local) user = JSON.parse(local);
  } catch {}
  if (!user) {
    try {
      const cached = await SecureStore.getItemAsync('cachedUserData');
      if (cached) user = JSON.parse(cached);
    } catch {}
  }
  if (user && premium) {
    user.isPremium = true;
    user.is_premium = user.is_premium ?? true;
    user.offline_enabled = user.offline_enabled ?? true;
  } else if (!user && premium) {
    user = { isPremium: true, is_premium: true, offline_enabled: true };
  }
  return user;
}
