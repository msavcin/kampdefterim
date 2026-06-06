/**
 * Subscription Product IDs
 * 
 * Bu product ID'ler App Store Connect ve Google Play Console'da tanımlanmalıdır.
 * 
 * iOS Bundle ID: com.spondylus.kampdefterim
 * Android Package Name: com.spondylus.boltexponativewind
 * 
 * Offline Radius Mapping:
 * - Monthly subscription: 20 km
 * - Yearly subscription: 50 km
 */

export const SUBSCRIPTION_PRODUCTS = {
  ios: {
    monthly: 'com.spondylus.kampdefterim.monthly',
    yearly: 'com.spondylus.kampdefterim.yearly',
  },
  android: {
    // Google Play'de TEK bir subscription urun var: com.spondylus.boltexponativewind
    // Aylik / yillik ayrimi base plan ID'leri ile yapilir (ANDROID_BASE_PLAN_IDS)
    monthly: 'com.spondylus.boltexponativewind',
    yearly: 'com.spondylus.boltexponativewind',
  },
};

/**
 * Android Play Billing v5+: Base Plan ID'leri
 * Play Console > Abonelik > Temel planlar'daki kimlik degerlerini buraya yazin.
 */
export const ANDROID_BASE_PLAN_IDS: Record<'monthly' | 'yearly', string> = {
  monthly: 'monthly',
  yearly: 'yearly',
};

/**

 * Backend API Endpoints
 * API_URL lib/config.ts dosyasından import edilmelidir
 */
export const SUBSCRIPTION_ENDPOINTS = {
  verify: '/subscriptions/verify',
  status: '/subscriptions/status',
  refresh: '/subscriptions/refresh',
  prices: '/subscriptions/prices',
};

/**
 * Offline radius mapping by plan type
 */
export const OFFLINE_RADIUS_KM = {
  monthly: 20,
  yearly: 50,
};

/**
 * Fallback fiyatlar — store'a bağlanılamazsa veya fiyat alınamazsa gösterilir.
 * App Store Connect / Google Play Console'daki gerçek fiyatlarla eşleştirin.
 */
export const FALLBACK_PRICES: Record<'ios' | 'android', Record<'monthly' | 'yearly', string>> = {
  ios: {
    monthly: '₺14,99',
    yearly: '₺144,99',
  },
  android: {
    monthly: '₺14,99',
    yearly: '₺144,99',
  },
};

/**
 * Fallback kampanya bilgileri — sunucu campaign verisi gelene kadar kullanılır.
 *
 * Sunucu GET /node/subscriptions/prices yanıtında "campaigns" alanı döndürmeye
 * başladığında bu sabit yalnızca yedek olarak kalır.
 *
 * Kampanya YOKSA ilgili planı null yapın; uygulama normal fiyatı gösterir.
 *
 * Alan açıklamaları:
 *   price         — gösterilecek indirimli fiyat (₺9,99)
 *   durationMonths — kaç ay sürecek (3)
 *   label         — hazır etiket metni, örn. "İlk 3 ay"
 */
export const FALLBACK_CAMPAIGNS: Record<
  'ios' | 'android',
  Record<'monthly' | 'yearly', { price: string; durationMonths: number; label: string; promoOfferId?: string } | null>
> = {
  ios: {
    monthly: null, // iOS kampanyası varsa buraya ekleyin
    yearly: null,
  },
  android: {
    monthly: {
      price: '₺9,99',
      durationMonths: 3,
      label: 'İlk 3 ay',
      promoOfferId: 'yeni-abone-monthly',
    },
    yearly: null,
  },
};
