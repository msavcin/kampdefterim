import { API_URL } from './config';
import { apiFetch } from './apiFetch';
import { getDatabase } from './database';

export type RatingsListOptions = {
  page?: number;
  per_page?: number;
  sort?: 'newest' | 'highest' | 'lowest';
  comments_only?: boolean;
  include_aggregate?: boolean;
  include_user?: boolean;
};

function buildQuery(params: Record<string, any>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const value = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(value));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * Get ratings list (normalized return shape)
 */
export async function getRatingsForCampground(campgroundId: string | number, options?: RatingsListOptions) {
  const defaults = { page: 1, per_page: 20 } as RatingsListOptions;
  const params = { ...defaults, ...(options || {}) } as Record<string, any>;
  const qs = buildQuery(params);
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings${qs}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Ratings load error: ' + txt);
  }
  const data = await res.json();
  // Normalize possible shapes
  if (Array.isArray(data)) {
    return { items: data, aggregate: undefined, pagination: undefined } as any;
  }
  if (data && Array.isArray(data.items)) {
    return { items: data.items, aggregate: data.aggregate, pagination: data.pagination } as any;
  }
  if (data && Array.isArray(data.rows)) {
    return { items: data.rows, aggregate: data.aggregate, pagination: data.pagination } as any;
  }
  return { items: [], aggregate: data?.aggregate ?? undefined, pagination: data?.pagination ?? undefined } as any;
}

export async function postRatingForCampground(
  campgroundId: string | number,
  payload: { rating?: number; comment?: string; anon_name?: string; hide_user?: boolean }
) {
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Ratings post error: ' + txt);
  }
  return res.json();
}

export async function deleteMyRating(campgroundId: string | number) {
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings/mine`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Delete rating error: ' + txt);
  }
  return res.json();
}

export async function getMyRating(campgroundId: string | number) {
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings/mine`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Get my rating error: ' + txt);
  }
  return res.json();
}

export async function getRatingsSummary(campgroundId: string | number) {
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings/summary`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Summary load error: ' + txt);
  }
  return res.json();
}

export async function patchRating(campgroundId: string | number, ratingId: string | number, body: any) {
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings/${ratingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Patch rating error: ' + txt);
  }
  return res.json();
}

export async function flagRating(campgroundId: string | number, ratingId: string | number, body: { reason: string }) {
  const res = await apiFetch(`${API_URL}/campgrounds/${campgroundId}/ratings/${ratingId}/flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Flag rating error: ' + txt);
  }
  return res.json();
}

// ==================== OFFLINE-AWARE WRAPPER FUNCTIONS ====================

/**
 * Offline-first rating ekleme: Online ise API'ya gönder, offline ise pending'e ekle
 */
export async function postRatingOffline(
  campgroundId: string | number,
  payload: { rating?: number; comment?: string; anon_name?: string; hide_user?: boolean },
  isConnected: boolean
) {
  const db = getDatabase();
  
  if (isConnected) {
    try {
      // Online ise direkt API'ya gönder
      const result = await postRatingForCampground(campgroundId, payload);
      
      // Başarılı olursa local database'deki rating bilgisini güncelle
      try {
        const summary = await getRatingsSummary(campgroundId);
        if (summary) {
          const area = await db.getCampingAreaById(Number(campgroundId));
          if (area) {
            await db.insertOrUpdateCampingArea({
              ...area,
              rating: summary.average_rating || summary.avg_rating || area.rating,
              review_count: summary.total_count || summary.count || area.review_count
            });
          }
        }
      } catch (summaryErr) {
        console.warn('[postRatingOffline] Rating summary güncellenemedi:', summaryErr);
      }
      
      return result;
    } catch (error) {
      // API hatası olursa pending'e ekle
      console.warn('[postRatingOffline] API hatası, pending\'e ekleniyor:', error);
      await db.insertPendingChange('rating_create', String(campgroundId), {
        campground_id: campgroundId,
        ...payload
      });
      throw error;
    }
  } else {
    // Offline ise pending'e ekle
    await db.insertPendingChange('rating_create', String(campgroundId), {
      campground_id: campgroundId,
      ...payload
    });
    
    if (__DEV__) console.log('[postRatingOffline] Offline mod: Rating pending kuyruğuna eklendi');
    return { success: true, pending: true };
  }
}

/**
 * Offline-first rating güncelleme: Online ise API'ya gönder, offline ise pending'e ekle
 */
export async function patchRatingOffline(
  campgroundId: string | number,
  ratingId: string | number,
  body: any,
  isConnected: boolean
) {
  const db = getDatabase();
  
  if (isConnected) {
    try {
      // Online ise direkt API'ya gönder
      const result = await patchRating(campgroundId, ratingId, body);
      
      // Başarılı olursa local database'deki rating bilgisini güncelle
      try {
        const summary = await getRatingsSummary(campgroundId);
        if (summary) {
          const area = await db.getCampingAreaById(Number(campgroundId));
          if (area) {
            await db.insertOrUpdateCampingArea({
              ...area,
              rating: summary.average_rating || summary.avg_rating || area.rating,
              review_count: summary.total_count || summary.count || area.review_count
            });
          }
        }
      } catch (summaryErr) {
        console.warn('[patchRatingOffline] Rating summary güncellenemedi:', summaryErr);
      }
      
      return result;
    } catch (error) {
      // API hatası olursa pending'e ekle
      console.warn('[patchRatingOffline] API hatası, pending\'e ekleniyor:', error);
      await db.insertPendingChange('rating_update', String(campgroundId), {
        campground_id: campgroundId,
        rating_id: ratingId,
        ...body
      });
      throw error;
    }
  } else {
    // Offline ise pending'e ekle
    await db.insertPendingChange('rating_update', String(campgroundId), {
      campground_id: campgroundId,
      rating_id: ratingId,
      ...body
    });
    
    if (__DEV__) console.log('[patchRatingOffline] Offline mod: Rating güncellemesi pending kuyruğuna eklendi');
    return { success: true, pending: true };
  }
}

/**
 * Offline-first rating silme: Online ise API'ya gönder, offline ise pending'e ekle
 */
export async function deleteMyRatingOffline(
  campgroundId: string | number,
  isConnected: boolean
) {
  const db = getDatabase();
  
  if (isConnected) {
    try {
      // Online ise direkt API'ya gönder
      const result = await deleteMyRating(campgroundId);
      
      // Başarılı olursa local database'deki rating bilgisini güncelle
      try {
        const summary = await getRatingsSummary(campgroundId);
        if (summary) {
          const area = await db.getCampingAreaById(Number(campgroundId));
          if (area) {
            await db.insertOrUpdateCampingArea({
              ...area,
              rating: summary.average_rating || summary.avg_rating || area.rating || 0,
              review_count: summary.total_count || summary.count || area.review_count || 0
            });
          }
        }
      } catch (summaryErr) {
        console.warn('[deleteMyRatingOffline] Rating summary güncellenemedi:', summaryErr);
      }
      
      return result;
    } catch (error) {
      // API hatası olursa pending'e ekle
      console.warn('[deleteMyRatingOffline] API hatası, pending\'e ekleniyor:', error);
      await db.insertPendingChange('rating_delete', String(campgroundId), {
        campground_id: campgroundId
      });
      throw error;
    }
  } else {
    // Offline ise pending'e ekle
    await db.insertPendingChange('rating_delete', String(campgroundId), {
      campground_id: campgroundId
    });
    
    if (__DEV__) console.log('[deleteMyRatingOffline] Offline mod: Rating silme pending kuyruğuna eklendi');
    return { success: true, pending: true };
  }
}
