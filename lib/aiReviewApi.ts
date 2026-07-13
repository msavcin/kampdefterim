/**
 * AI Review Evaluation API
 * 
 * Kamp alanları için Google Places yorumlarını AI ile değerlendirme
 * - owner_id boş olan alanları kontrol eder
 * - 6 aylık cooldown kontrol eder
 * - Google Places API'den yorumları çeker
 * - AI ile değerlendirir
 * - Sonuçları veritabanına kaydeder
 */

import { apiFetch } from './apiFetch';

export interface CampingAreaReviewEvaluation {
  campground_id: number;
  ai_review_evaluation: string;
  ai_review_generated_at: string;
  google_place_id?: string;
  updated_fields?: {
    rating?: number;
    review_count?: number;
    facilities?: string[];
    price_range?: string;
    website?: string;
    phone?: string;
  };
}

export interface ParsedAIReview {
  summary: string;
  pros: string[];
  cons: string[];
  raw: string;
}

/**
 * Basit bir parser: `ai_review_evaluation` metnini ayırır.
 * Beklenen format: kısa özet, sonra "Artılar:" ve "Eksiler:" başlıkları altında madde listeleri.
 */
export function parseAIReviewText(text: string | null | undefined): ParsedAIReview {
  const raw = typeof text === 'string' ? text.trim() : '';

  // Bölümleri yakalamaya çalış
  const artilarMatch = raw.match(/(?:Artılar|Avantajlar)\s*:\s*([\s\S]*?)(?=(?:\n(?:Eksiler|Dezavantajlar)\s*:)|$)/i);
  const eksilerMatch = raw.match(/(?:Eksiler|Dezavantajlar)\s*:\s*([\s\S]*?)(?=(?:\n(?:Not:|Not)|$))/i);

  // Özet: ilk başlıktan önceki metin
  let summary = raw;
  const firstHeadingIndex = raw.search(/(?:Artılar|Avantajlar|Eksiler|Dezavantajlar)\s*:/i);
  if (firstHeadingIndex !== -1) {
    summary = raw.slice(0, firstHeadingIndex).trim();
  }

  const parseBullets = (block: string | undefined): string[] => {
    if (!block) return [];
    return block
      .split(/\r?\n/) // satırlara böl
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => l.replace(/^[\-\*•\s\d\.]+/, '').trim())
      .filter(l => l.length > 0);
  };

  const pros = parseBullets(artilarMatch ? artilarMatch[1] : undefined);
  const cons = parseBullets(eksilerMatch ? eksilerMatch[1] : undefined);

  return {
    summary: summary || '',
    pros,
    cons,
    raw
  };
}

export interface EvaluateReviewsRequest {
  campground_id?: number; // Belirli bir alan için
  force?: boolean; // Cooldown'u bypass et (sadece superadmin)
}

export interface EvaluateReviewsResponse {
  success: boolean;
  evaluation?: CampingAreaReviewEvaluation;
  error?: string;
  cooldown_remaining?: number; // Saniye cinsinden kalan süre
}

export interface BatchEvaluateResponse {
  success: boolean;
  processed: number;
  failed: number;
  skipped: number;
  results: Array<{
    campground_id: number;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Belirli bir kamp alanı için AI review değerlendirmesi yapar
 */
export async function evaluateCampingAreaReviews(
  campgroundId: number,
  force: boolean = false
): Promise<EvaluateReviewsResponse> {
  try {
    const response = await apiFetch('/camping-areas/evaluate-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campground_id: campgroundId,
        force
      })
    });

    // Önce response durumunu kontrol et
    if (!response.ok) {
      // Hata durumunda response body'yi oku (JSON veya text)
      let errorMessage = 'Değerlendirme yapılamadı';
      let cooldownRemaining: string | undefined;
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
          cooldownRemaining = data.cooldown_remaining;
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}`;
          if (__DEV__) console.warn('[AIReview] Non-JSON error response:', text);
        }
      } catch (parseError) {
        if (__DEV__) console.warn('[AIReview] Error parsing response:', parseError);
        errorMessage = `HTTP ${response.status}`;
      }

      return {
        success: false,
        error: errorMessage,
        cooldown_remaining: cooldownRemaining
      };
    }

    // Başarılı durumda JSON parse et
    const data = await response.json();
    return {
      success: true,
      evaluation: data.evaluation
    };
  } catch (error) {
    console.error('[AIReview] evaluateCampingAreaReviews hatası:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    };
  }
}

/**
 * owner_id boş olan tüm kamp alanları için toplu değerlendirme yapar
 * Günlük limiti kontrol eder, 6 aylık cooldown'u dikkate alır
 */
export async function batchEvaluateCampingAreaReviews(
  options?: {
    limit?: number; // Kaç alan işlenecek (default: günlük limit)
    force?: boolean; // Cooldown'u bypass et
  }
): Promise<BatchEvaluateResponse> {
  try {
    const response = await apiFetch('/camping-areas/batch-evaluate-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });

    // Önce response durumunu kontrol et
    if (!response.ok) {
      let errorMessage = 'Toplu değerlendirme başarısız';
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}`;
          if (__DEV__) console.warn('[AIReview] Non-JSON batch error response:', text);
        }
      } catch (parseError) {
        if (__DEV__) console.warn('[AIReview] Error parsing batch response:', parseError);
        errorMessage = `HTTP ${response.status}`;
      }

      console.error('[AIReview] Batch evaluation failed:', errorMessage);
      return {
        success: false,
        processed: 0,
        failed: 0,
        skipped: 0,
        results: []
      };
    }

    // Başarılı durumda JSON parse et
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[AIReview] batchEvaluateCampingAreaReviews hatası:', error);
    return {
      success: false,
      processed: 0,
      failed: 0,
      skipped: 0,
      results: []
    };
  }
}

/**
 * Bir kamp alanının AI review değerlendirmesini getirir
 */
export async function getCampingAreaAIReview(
  campgroundId: number
): Promise<CampingAreaReviewEvaluation | null> {
  try {
    const response = await apiFetch(`/camping-areas/${campgroundId}/ai-review`, {
      method: 'GET'
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      
      // Hata durumunda detaylı log
      const bodyText = await response.text().catch(() => null);
      if (__DEV__) console.warn(`[AIReview] getCampingAreaAIReview HTTP ${response.status}:`, bodyText || response.statusText);
      return null;
    }

    const data = await response.json();
    return data.review || null;
  } catch (error) {
    console.error('[AIReview] getCampingAreaAIReview hatası:', error);
    return null;
  }
}

/**
 * Sunucudan AI review çekip `parseAIReviewText` ile ayrıştırılmış sonucu döndürür.
 */
export async function getParsedCampingAreaAIReview(
  campgroundId: number
): Promise<ParsedAIReview | null> {
  const review = await getCampingAreaAIReview(campgroundId);
  if (!review) return null;
  return parseAIReviewText(review.ai_review_evaluation);
}

/**
 * Değerlendirmeye uygun kamp alanlarını listeler
 * (owner_id boş ve 6 ay geçmiş olanlar)
 */
export async function getEligibleCampingAreasForReview(): Promise<Array<{
  id: number;
  name: string;
  booking_url?: string;
  last_evaluated?: string;
}>> {
  try {
    const response = await apiFetch('/camping-areas/eligible-for-review', {
      method: 'GET'
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => null);
      console.error(`[AIReview] eligible-for-review HTTP ${response.status}:`, bodyText || response.statusText);
      throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    const data = await response.json();
    return data.areas || [];
  } catch (error) {
    console.error('[AIReview] getEligibleCampingAreasForReview hatası:', error);
    return [];
  }
}

/**
 * Bir kamp alanının AI review değerlendirmesini siler
 * (Sadece superadmin, hatalı değerlendirmeleri temizlemek için)
 */
export async function deleteCampingAreaAIReview(
  campgroundId: number
): Promise<boolean> {
  try {
    const response = await apiFetch(`/camping-areas/${campgroundId}/ai-review`, {
      method: 'DELETE'
    });

    return response.ok;
  } catch (error) {
    console.error('[AIReview] deleteCampingAreaAIReview hatası:', error);
    return false;
  }
}

/**
 * Bir kamp alanı için AI review'u manuel olarak aktif/pasif yapar
 */
export async function toggleCampingAreaAIReview(
  campgroundId: number,
  enabled: boolean
): Promise<boolean> {
  try {
    const response = await apiFetch(`/camping-areas/${campgroundId}/ai-review-toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    return response.ok;
  } catch (error) {
    console.error('[AIReview] toggleCampingAreaAIReview hatası:', error);
    return false;
  }
}
