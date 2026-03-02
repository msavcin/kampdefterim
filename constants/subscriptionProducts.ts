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
    monthly: 'com.spondylus.boltexponativewind.monthly',
    yearly: 'com.spondylus.boltexponativewind.yearly',
  },
};

/**
 * Backend API Endpoints
 * API_URL lib/config.ts dosyasından import edilmelidir
 */
export const SUBSCRIPTION_ENDPOINTS = {
  verify: '/subscriptions/verify',
  status: '/subscriptions/status',
};

/**
 * Offline radius mapping by plan type
 */
export const OFFLINE_RADIUS_KM = {
  monthly: 20,
  yearly: 50,
};
