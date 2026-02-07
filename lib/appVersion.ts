// lib/appVersion.ts
// Uygulama versiyonunu ve ilk açılış/güncelleme kontrolünü yönetir
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const VERSION_KEY = 'APP_VERSION';

export async function checkAndHandleAppVersion(onFirstInstallOrUpdate: () => Promise<void>) {
  // Modern Expo SDK ile uyumlu version alma
  const currentVersion = 
    Constants.expoConfig?.version || 
    Constants.manifest?.version || 
    Constants.manifest2?.extra?.expoClient?.version || 
    '0.0.0';
  
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
