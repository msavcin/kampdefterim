import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_KNOWN_LOCATION_KEY = 'lastKnownLocation';

export async function setLargeItemAsync(key: string, value: string) {
  return AsyncStorage.setItem(key, value);
}

export async function getLargeItemAsync(key: string) {
  return AsyncStorage.getItem(key);
}

export async function removeLargeItemAsync(key: string) {
  return AsyncStorage.removeItem(key);
}

export async function setLastKnownLocationAsync(lat: number, lng: number) {
  return AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify({ latitude: lat, longitude: lng, timestamp: Date.now() }));
}

export async function getLastKnownLocationAsync() {
  const value = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return parsed as { latitude: number; longitude: number; timestamp: number };
    }
  } catch (error) {
    console.warn('[largeStorage] getLastKnownLocationAsync parse error', error);
  }
  return null;
}

export async function clearLastKnownLocationAsync() {
  return AsyncStorage.removeItem(LAST_KNOWN_LOCATION_KEY);
}
