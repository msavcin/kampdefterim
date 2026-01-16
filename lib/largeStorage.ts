import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setLargeItemAsync(key: string, value: string) {
  return AsyncStorage.setItem(key, value);
}

export async function getLargeItemAsync(key: string) {
  return AsyncStorage.getItem(key);
}

export async function removeLargeItemAsync(key: string) {
  return AsyncStorage.removeItem(key);
}
