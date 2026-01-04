// lib/appVersion.ts
// Uygulama versiyonunu ve ilk açılış/güncelleme kontrolünü yönetir
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const VERSION_KEY = 'APP_VERSION';

export async function checkAndHandleAppVersion(onFirstInstallOrUpdate: () => Promise<void>) {
  const currentVersion = Constants.manifest?.version || '0.0.0';
  const storedVersion = await SecureStore.getItemAsync(VERSION_KEY);
  if (storedVersion !== currentVersion) {
    await onFirstInstallOrUpdate();
    await SecureStore.setItemAsync(VERSION_KEY, currentVersion);
    return true;
  }
  return false;
}
