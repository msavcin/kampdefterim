import AsyncStorage from '@react-native-async-storage/async-storage';

export const FRIEND_CONV_MAP_KEY = '@chat_friend_conv_map_v1';

export async function loadFriendConvMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(FRIEND_CONV_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveFriendConvLink(
  friendId: string | number | null | undefined,
  convId: string | number | null | undefined,
) {
  if (friendId == null || convId == null || String(convId) === '') return;
  try {
    const map = await loadFriendConvMap();
    map[String(friendId)] = String(convId);
    await AsyncStorage.setItem(FRIEND_CONV_MAP_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}
