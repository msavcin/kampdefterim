// Merkezi API wrapper: fetch ile yapılan isteklerde 401/403 (veya TokenExpiredError) gelirse otomatik logout
import { getToken, getRefreshToken, saveToken, saveRefreshToken, removeToken } from './auth';
import { router } from 'expo-router';

// API_URL importu refresh için gerekli
import { API_URL } from './config';

export async function apiFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  // Otomatik olarak token ekle
  let headers = init.headers ? { ...init.headers } : {};
  if (!headers['Authorization']) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  init.headers = headers;

  // Token kontrolü: Authorization header varsa ve token null/boşsa header'ı kaldır
  if (init && init.headers) {
    let headers = init.headers as any;
    if (headers['Authorization'] && (!headers['Authorization'].replace('Bearer', '').trim())) {
      // Token null veya boşsa header'ı kaldır
      delete headers['Authorization'];
      if (__DEV__) console.warn('[apiFetch] Uyarı: API çağrısında boş token gönderilmeye çalışıldı. Kullanıcı login mi?');
    } else if (headers['Authorization']) {
      // Token gerçekten gönderiliyor mu logla
      console.log('[apiFetch] Authorization header:', headers['Authorization']);
    }
  }
  let response = await fetch(input, init);
  if (response.status === 401) {
    // Token expired olabilir, refresh deneyelim
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.token) await saveToken(data.token);
        if (data.refreshToken) await saveRefreshToken(data.refreshToken);
        // Orijinal isteği yeni token ile tekrar dene
        if (typeof headers === 'object') {
          headers['Authorization'] = `Bearer ${data.token}`;
        }
        init.headers = headers;
        response = await fetch(input, init);
        if (response.status !== 401) {
          return response;
        }
      }
    }
    // Refresh başarısızsa logout yapılmaz, response döndürülür
  }
  // 403 durumunda logout yapılmaz, response döndürülür
  return response;
}
