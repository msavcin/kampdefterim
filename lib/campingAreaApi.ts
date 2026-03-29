// Spec: docs/API/campground_api_spec.md
// Dizi/obje alanları için gerçek dizi/obje gönder (spec: "frontend için diziler tercih edin")

/** Herhangi bir değeri gerçek diziye normalize eder */
function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

/** Herhangi bir değeri gerçek objeye normalize eder */
function toObject(value: any): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'string') {
    try { const p = JSON.parse(value); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; } catch { return {}; }
  }
  return {};
}

// API'ya gönderilecek veriyi temizle (sanitize) fonksiyonu
export function sanitizeCampingAreaData(data: any) {
  const sanitized: any = {};

  // ── Zorunlu alanlar ────────────────────────────────────────────────────
  sanitized.name      = data.name      ?? '';
  sanitized.latitude  = Number(data.latitude);
  sanitized.longitude = Number(data.longitude);
  sanitized.type      = data.type      ?? 'campground';

  // ── Visibility ──────────────────────────────────────────────────────────
  const visibility = data.visibility ?? 'private';
  sanitized.visibility = visibility;

  // friend_user_ids: SADECE visibility==="friends" için STRING dizisi olarak gönder.
  // Backend JSONB sorgusu: friend_user_ids::jsonb @> '["userId"]'
  // Bu sorguda userId string olarak aranır. Integer gönderirsek ([123]) eşleşmez.
  // Doğru format: ["123", "456"] — string ID'ler.
  if (visibility === 'friends') {
    const rawFriends = data.friend_user_ids ?? data.friends ?? [];
    sanitized.friend_user_ids = toArray(rawFriends)
      .map(v => String(v).trim())
      .filter(s => s !== '' && !isNaN(Number(s)) && Number(s) > 0);
  }
  // community_id: frontend göndermek zorunda değil (spec), gönderilmişse ekle
  if (data.community_id !== undefined && data.community_id !== null && data.community_id !== '') {
    sanitized.community_id = Number(data.community_id);
  }

  // ── owner_id (source_id===0 için zorunlu) ──────────────────────────────
  if (data.owner_id !== undefined && data.owner_id !== null && data.owner_id !== '') {
    sanitized.owner_id = Number(data.owner_id);
  }

  // ── source_id ──────────────────────────────────────────────────────────
  if (data.source_id !== undefined && data.source_id !== null) {
    sanitized.source_id = Number(data.source_id);
  }

  // ── external_id (string) ───────────────────────────────────────────────
  if (data.external_id !== undefined) sanitized.external_id = data.external_id ?? '';

  // ── Opsiyonel string alanlar ────────────────────────────────────────────
  const stringFields = ['description', 'phone', 'status', 'price_range', 'last_verified'];
  for (const key of stringFields) {
    if (data[key] !== undefined) sanitized[key] = data[key] ?? '';
  }

  // ── URL / Email alanlar: boş string yerine null gönder (Sequelize isUrl/isEmail validator) ──
  const urlEmailFields = ['website', 'booking_url', 'contact_email'];
  for (const key of urlEmailFields) {
    if (data[key] !== undefined) {
      const val = data[key];
      sanitized[key] = (val === '' || val === null || val === undefined) ? null : val;
    }
  }

  // ── opening_hours: DB'ye JSON-string kaydedilir (spec md-14) ──────────
  if (data.opening_hours !== undefined) {
    const oh = data.opening_hours;
    if (oh === null || oh === undefined || oh === '' ||
        (Array.isArray(oh) && oh.length === 0)) {
      sanitized.opening_hours = null;
    } else if (typeof oh === 'object') {
      sanitized.opening_hours = JSON.stringify(oh);
    } else {
      sanitized.opening_hours = oh; // zaten string
    }
  }

  // ── Integer alanlar ─────────────────────────────────────────────────────
  if (data.rating !== undefined)      sanitized.rating       = Number(data.rating)       || 0;
  if (data.review_count !== undefined) sanitized.review_count = Number(data.review_count) || 0;
  if (data.capacity !== undefined && data.capacity !== '' && data.capacity !== null) {
    sanitized.capacity = Number(data.capacity);
  }

  // ── fee: 0 veya 1 ────────────────────────────────────────────────────
  if (data.fee !== undefined) {
    const f = data.fee;
    sanitized.fee = (f === true || f === 1 || f === '1') ? 1 : 0;
  }

  // ── Dizi alanlar — gerçek array gönder (spec: "frontend için diziler tercih edin") ──
  if (data.facilities    !== undefined) sanitized.facilities    = toArray(data.facilities);
  if (data.accessibility !== undefined) sanitized.accessibility = toArray(data.accessibility);
  if (data.amenities     !== undefined) sanitized.amenities     = toArray(data.amenities);
  if (data.images        !== undefined) sanitized.images        = toArray(data.images);
  // photo_links: backend TEXT sütunu — JSON-encoded string olarak göndermek zorunlu
  if (data.photo_links   !== undefined) sanitized.photo_links   = JSON.stringify(toArray(data.photo_links));

  // ── Obje alanlar — gerçek object gönder ────────────────────────────────
  if (data.social_media !== undefined) sanitized.social_media = toObject(data.social_media);
  if (data.tags         !== undefined) sanitized.tags         = toObject(data.tags);

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
  const res = await apiFetch(`${API_URL}/campgrounds/${id}${query}`, {
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
    // Eğer kaynak zaten sunucuda yoksa (404), silme işlemi idempotent kabul edilir — hata yerine success say.
    if (res.status === 404) {
      console.warn('[API][DELETE][NOT_FOUND] Kaynak bulunamadı, idempotent başarı sayılıyor', { id, by, status: res.status, text });
      return { status: res.status, notFound: true, json };
    }
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
