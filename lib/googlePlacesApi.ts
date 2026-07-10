/**
 * Google Places API Entegrasyonu
 * 
 * Bu modül Google Places API ile etkileşim kurar ve kamp alanları için:
 * - Yorumları çeker
 * - Detay bilgilerini alır (rating, olanaklar, vb.)
 * - Place ID'yi booking_url'den parse eder
 */

import { API_URL } from './config';
import { apiFetch } from './apiFetch';

export interface GooglePlaceReview {
  author_name: string;
  author_url?: string;
  language: string;
  profile_photo_url?: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
}

export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  reviews?: GooglePlaceReview[];
  website?: string;
  formatted_phone_number?: string;
  types?: string[];
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

export interface GooglePlaceIdParseResult {
  place_id: string | null;
  source: 'url' | 'search' | null;
}

/**
 * booking_url'den Google Place ID'yi parse eder
 * Desteklenen formatlar:
 * - https://maps.google.com/?cid=123456789
 * - https://www.google.com/maps/place/?q=place_id:ChIJxxxxx
 * - https://goo.gl/maps/xxxxx (kısa link)
 */
export function parseGooglePlaceIdFromUrl(bookingUrl: string): string | null {
  if (!bookingUrl) return null;

  try {
    const url = new URL(bookingUrl);
    
    // Format 1: cid parametresi
    const cid = url.searchParams.get('cid');
    if (cid) {
      return `cid:${cid}`;
    }

    // Format 2: place_id parametresi
    const placeId = url.searchParams.get('place_id');
    if (placeId) {
      return placeId;
    }

    // Format 3: q parametresinde place_id
    const q = url.searchParams.get('q');
    if (q && q.includes('place_id:')) {
      const match = q.match(/place_id:([A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }

    // Format 4: URL path'de place ID
    const pathMatch = url.pathname.match(/place\/([A-Za-z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

  } catch (e) {
    console.warn('[GooglePlaces] URL parse hatası:', e);
  }

  return null;
}

/**
 * Backend'den Google Place detaylarını çeker
 * Backend, API key'i güvenli bir şekilde yönetir
 */
export async function getGooglePlaceDetails(
  placeIdOrCid: string
): Promise<GooglePlaceDetails | null> {
  try {
    const response = await apiFetch(`/google-places/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        place_id: placeIdOrCid,
        fields: [
          'place_id',
          'name',
          'formatted_address',
          'rating',
          'user_ratings_total',
          'price_level',
          'opening_hours',
          'photos',
          'reviews',
          'website',
          'formatted_phone_number',
          'types',
          'geometry'
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.warn('[GooglePlaces] API hatası:', error);
      return null;
    }

    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.error('[GooglePlaces] getGooglePlaceDetails hatası:', error);
    return null;
  }
}

/**
 * Koordinat ve isim ile Google Place arar
 * booking_url yoksa veya place_id parse edilemezse kullanılır
 */
export async function searchGooglePlace(
  name: string,
  lat: number,
  lng: number
): Promise<GooglePlaceIdParseResult> {
  try {
    const response = await apiFetch(`/google-places/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: name,
        location: { lat, lng },
        radius: 1000 // 1km yarıçap
      })
    });

    if (!response.ok) {
      return { place_id: null, source: null };
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0) {
      return {
        place_id: data.candidates[0].place_id,
        source: 'search'
      };
    }

    return { place_id: null, source: null };
  } catch (error) {
    console.error('[GooglePlaces] searchGooglePlace hatası:', error);
    return { place_id: null, source: null };
  }
}

/**
 * Kamp alanı için Google Place ID'yi belirler
 * Önce booking_url'den parse eder, bulamazsa isim ve koordinat ile arar
 */
export async function resolveGooglePlaceId(
  campingArea: {
    booking_url?: string;
    name: string;
    latitude: number;
    longitude: number;
  }
): Promise<GooglePlaceIdParseResult> {
  // Önce URL'den parse etmeyi dene
  if (campingArea.booking_url) {
    const parsedId = parseGooglePlaceIdFromUrl(campingArea.booking_url);
    if (parsedId) {
      return { place_id: parsedId, source: 'url' };
    }
  }

  // Bulamazsa arama yap
  return await searchGooglePlace(
    campingArea.name,
    campingArea.latitude,
    campingArea.longitude
  );
}

/**
 * Google Places yorumlarını özetler (AI'a göndermek için)
 */
export function summarizeReviewsForAI(reviews: GooglePlaceReview[]): string {
  if (!reviews || reviews.length === 0) {
    return 'Bu kamp alanı için Google Places üzerinde henüz yorum bulunmuyor.';
  }

  const summary = reviews.map((review, index) => {
    return `[Yorum ${index + 1}] ${review.author_name} (${review.rating}/5):\n${review.text}\n`;
  }).join('\n');

  return summary;
}
