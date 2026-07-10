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
    }
  }
  // Eğer `input` tam bir URL değilse, proje-wide `API_URL` ile prefixle
  let fetchInput: RequestInfo = input;
  try {
    if (typeof input === 'string') {
      const asStr = input as string;
      if (!asStr.match(/^https?:\/\//i)) {
        // Başında '/' ile gelen path'leri API_BASE ile birleştir
        const path = asStr.startsWith('/') ? asStr : `/${asStr}`;
        fetchInput = `${API_URL}${path}`;
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[apiFetch] URL prefixleme hatası', e);
  }

  if (__DEV__) console.log('[apiFetch] Fetching', fetchInput, init && { headers: init.headers, method: init.method });

  let response = await fetch(fetchInput, init);
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
        const newToken = data?.token ?? null;
        if (newToken) await saveToken(newToken);
        const newRefresh = data?.refreshToken ?? data?.refresh_token ?? null;
        if (newRefresh) await saveRefreshToken(newRefresh);
        // Orijinal isteği yeni token ile tekrar dene (eğer yeni token geldiyse)
        if (typeof headers === 'object') {
          if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        }
        init.headers = headers;
        if (newToken) {
          response = await fetch(input, init);
          if (response.status !== 401) {
            return response;
          }
        }
      }
    }
    // Refresh başarısızsa logout yapılmaz, response döndürülür
  }
  // 403 durumunda token yenilemeyi dene (sunucu bazı durumlarda 403 döner)
  if (response.status === 403) {
    const refreshToken = await getRefreshToken();
    if (__DEV__) console.log('[apiFetch] 403 alındı, refresh token mevcut mu:', !!refreshToken);
    if (refreshToken) {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (__DEV__) console.log('[apiFetch] 403 refresh yanıtı:', refreshRes.status);
      if (refreshRes.ok) {
          const data = await refreshRes.json();
          const newToken = data?.token ?? null;
          if (newToken) {
            await saveToken(newToken);
            if (__DEV__) console.log('[apiFetch] 403 sonrası yeni token kaydedildi, istek tekrarlanıyor...');
          }
          const newRefresh = data?.refreshToken ?? data?.refresh_token ?? null;
          if (newRefresh) await saveRefreshToken(newRefresh);
          // Orijinal isteği yeni token ile tekrar dene
          if (typeof headers === 'object') {
            if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
          }
          init.headers = headers;
          response = await fetch(input, init);
          if (__DEV__) console.log('[apiFetch] 403 retry yanıtı:', response.status);
          // Yine 403 gelirse direkt döndür (gerçek yetki hatası)
          return response;
        }
    }
  }
  return response;
}
