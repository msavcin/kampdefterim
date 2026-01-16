import * as SecureStore from 'expo-secure-store';


const TOKEN_KEY = 'jwt_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
// Refresh token işlemleri
export async function saveRefreshToken(token: string) {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken() {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
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
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
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
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}
