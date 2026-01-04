// API'ya gönderilecek veriyi temizle (sanitize) fonksiyonu
export function sanitizeCampingAreaData(data: any) {
  // API şemasında olmayan alanları gönderme
  const allowedKeys = [
    'name', 'latitude', 'longitude', 'type', 'description', 'website', 'phone', 'opening_hours',
    'capacity', 'fee', 'status', 'rating', 'review_count', 'price_range', 'facilities', 'accessibility',
    'social_media', 'booking_url', 'contact_email', 'last_verified', 'visibility', 'owner_id',
    'external_id', 'source_id', 'photo_links', 'amenities', 'tags', 'images',
    'friend_user_ids' // Arkadaş paylaşımı için friend_user_ids de gönderilsin
  ];
  const sanitized: any = {};
  // Varsayılan olarak boş değerleri null'a çevir (opsiyonel alanlar için)

  // Her zaman string olarak gönderilecek alanlar (TEXT/STRING):
  const stringifiedFields = ['facilities', 'accessibility', 'social_media', 'images', 'tags'];
  // Her zaman dizi olarak gönderilecek alan:
  const arrayFields = ['amenities'];
  // photo_links ve images alanlarını her zaman string olarak bırak
  if (data && typeof data === 'object' && 'photo_links' in data) {
    if (typeof data['photo_links'] !== 'string') {
      sanitized['photo_links'] = JSON.stringify(data['photo_links'] ?? []);
    } else {
      sanitized['photo_links'] = data['photo_links'];
    }
  }
  if (data && typeof data === 'object' && 'images' in data) {
    if (typeof data['images'] !== 'string') {
      sanitized['images'] = JSON.stringify(data['images'] ?? []);
    } else {
      sanitized['images'] = data['images'];
    }
  }

  for (const key of allowedKeys) {
    // photo_links ve images yukarıda işlendi, tekrar işleme
    if (key === 'photo_links' || key === 'images') continue;
    let value = data[key];
    if (typeof value === 'undefined') continue;

    // INTEGER alanlar: owner_id, rating, review_count, capacity, source_id
    if ([ 'owner_id', 'rating', 'review_count', 'capacity', 'source_id' ].includes(key)) {
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        sanitized[key] = null;
        continue;
      }
      sanitized[key] = Number(value);
      continue;
    }

    // Her zaman string olarak gönderilecek alanlar (TEXT/STRING)
    if (stringifiedFields.includes(key)) {
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && Object.keys(value).length === 0)) {
        sanitized[key] = '';
      } else if (typeof value === 'string') {
        sanitized[key] = value;
      } else {
        sanitized[key] = JSON.stringify(value);
      }
      continue;
    }

    // Her zaman dizi olarak gönderilecek alan (ARRAY)
    if (arrayFields.includes(key)) {
      if (Array.isArray(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'string') {
        try {
          const arr = JSON.parse(value);
          sanitized[key] = Array.isArray(arr) ? arr : [];
        } catch {
          sanitized[key] = [];
        }
      } else {
        sanitized[key] = [];
      }
      continue;
    }

    // opening_hours: boşsa null, nesne/dizi ise stringe çevir
    if (key === 'opening_hours') {
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        sanitized[key] = null;
      } else if (typeof value === 'object') {
        sanitized[key] = JSON.stringify(value);
      } else {
        sanitized[key] = value;
      }
      continue;
    }

    // created_at ve updated_at asla gönderilmesin
    if (key === 'created_at' || key === 'updated_at') {
      continue;
    }

    // fee: boolean ise 1/0, null/boşsa null
    if (key === 'fee') {
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        sanitized[key] = null;
      } else if (value === true || value === 1 || value === '1') sanitized[key] = 1;
      else if (value === false || value === 0 || value === '0') sanitized[key] = 0;
      else sanitized[key] = null;
      continue;
    }

    // Diğer TEXT/STRING alanlar: null ise boş string gönder (özellikle allowNull: false için)
    if (typeof value === 'string' && value === null) {
      sanitized[key] = '';
      continue;
    }
    // Diğer alanlar: boş obje ise null, aksi halde olduğu gibi
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
      sanitized[key] = null;
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}
// Kamp alanı güncelleme (PUT)
export async function updateCampingAreaOnServer(id: string | number, data: any) {
  const token = await getToken();
    const sanitized = sanitizeCampingAreaData(data);
    // API'ya gönderilen body'yi logla
    console.log('[updateCampingAreaOnServer] API request body:', data);
  // Her zaman external_id ile güncelleme yapılacaksa by parametresi zorunlu
  const query = '?by=external_id';
  console.log('[API][PUT] /campgrounds/' + id + query, sanitized);
  const res = await fetch(`${API_URL}/campgrounds/${id}${query}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(sanitized),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('API Hatası: ' + err);
  }
  return res.json();
}
export async function deleteCampingAreaOnServer(id: string | number, by?: 'external_id' | 'id') {
  const token = await getToken();
  const query = by ? `?by=${by}` : '';
  console.log('[API][DELETE] /campgrounds/' + id + query);
  const res = await fetch(`${API_URL}/campgrounds/${id}${query}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    console.error('[API][DELETE][ERROR]', { id, by, status: res.status, text });
    throw new Error('API Hatası: ' + text);
  }
  console.log('[API][DELETE][SUCCESS]', { id, by, status: res.status, json });
  return json;
}
import { API_URL } from './config';
import { getToken } from './auth';
import { apiFetch } from './apiFetch';

export async function createCampingAreaOnServer(data: any) {
  const token = await getToken();
    const sanitized = sanitizeCampingAreaData(data);
    // API'ya gönderilen body'yi logla
    console.log('[createCampingAreaOnServer] API request body:', data);
  console.log('[API][POST] /campgrounds', sanitized);
  console.log('[API PAYLOAD]', JSON.stringify(sanitized, null, 2));
  const res = await apiFetch(`${API_URL}/campgrounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(sanitized),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('API Hatası: ' + err);
  }
  return res.json();
}
