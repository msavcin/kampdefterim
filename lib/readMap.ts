import AsyncStorage from '@react-native-async-storage/async-storage';

const READ_KEY = '@chat_read_v1';

export async function loadReadMap() {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed || {};
  } catch (e) {
    return {};
  }
}

export async function markRead(convId: string | number) {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    existing[String(convId)] = Date.now();
    await AsyncStorage.setItem(READ_KEY, JSON.stringify(existing));
  } catch (e) {
    // ignore
  }
}
