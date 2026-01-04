import AsyncStorage from '@react-native-async-storage/async-storage';


const TOKEN_KEY = 'jwt_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
// Refresh token işlemleri
export async function saveRefreshToken(token: string) {
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken() {
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function saveToken(token: string) {
  // Çağıran fonksiyonu bulmak için stack trace kullan
  const stack = new Error().stack;
  let caller = '';
  if (stack) {
    const lines = stack.split('\n');
    if (lines.length > 2) {
      caller = lines[2].trim();
    }
  }
  console.log(`[AUTH] saveToken çağrıldı. Token: ${token ? token.substring(0, 20) + '...' : 'BOŞ'} | Çağıran: ${caller}`);
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function removeToken() {
  // Çağıran fonksiyonu bulmak için stack trace kullan
  const stack = new Error().stack;
  let caller = '';
  if (stack) {
    const lines = stack.split('\n');
    if (lines.length > 2) {
      caller = lines[2].trim();
    }
  }
  console.log(`[AUTH] removeToken çağrıldı. Çağıran: ${caller}`);
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}
