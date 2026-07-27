// lib/appVersion.ts
// Uygulama versiyonunu ve ilk açılış/güncelleme kontrolünü yönetir
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const VERSION_KEY = 'APP_VERSION';

export function getCurrentAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    '0.0.0'
  );
}

export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const parse = (value: string | null | undefined) =>
    String(value || '0')
      .trim()
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => {
        const parsed = Number.parseInt(part.replace(/\D/g, '') || '0', 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });

  const aa = parse(a);
  const bb = parse(b);
  const len = Math.max(aa.length, bb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export async function checkAndHandleAppVersion(onFirstInstallOrUpdate: () => Promise<void>) {
  const currentVersion = getCurrentAppVersion();
  
  if (__DEV__) console.log('[APP_VERSION] Current version:', currentVersion);
  
  const storedVersion = await SecureStore.getItemAsync(VERSION_KEY);
  
  if (__DEV__) console.log('[APP_VERSION] Stored version:', storedVersion);
  
  if (storedVersion !== currentVersion) {
    if (__DEV__) console.log('[APP_VERSION] Version değişti, callback çalıştırılıyor...');
    await onFirstInstallOrUpdate();
    await SecureStore.setItemAsync(VERSION_KEY, currentVersion);
    return true;
  }
  
  if (__DEV__) console.log('[APP_VERSION] Version aynı, güncelleme yok');
  return false;
}
