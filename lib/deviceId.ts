import * as SecureStore from 'expo-secure-store';
import { generateUUID } from './uuid';

const DEVICE_ID_KEY = 'device_id';

export async function getDeviceId(): Promise<string> {
  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${generateUUID()}`;
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    // Fallback: rastgele UUID (volatile) — SecureStore erişimi başarısızsa
    return `dev_${generateUUID()}`;
  }
}
