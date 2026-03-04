/**
 * In-App Purchase Manager
 * Handles iOS and Android subscription purchases
 */

import { Platform, Alert } from 'react-native';
import { getToken } from './auth';
import { API_URL } from './config';
import { SUBSCRIPTION_PRODUCTS, SUBSCRIPTION_ENDPOINTS, FALLBACK_PRICES } from '@/constants/subscriptionProducts';

// Conditional import - paket yüklenmemişse mock types kullan
let RNIap: any;
let isIAPPackageAvailable = false;

try {
  RNIap = require('react-native-iap');
  isIAPPackageAvailable = true;
} catch (e) {
  console.warn('[IAP] react-native-iap paketi yüklü değil. Mock mode aktif.');
  RNIap = {
    initConnection: async () => { console.warn('[IAP Mock] initConnection called'); },
    endConnection: async () => {},
    getSubscriptions: async () => { console.warn('[IAP Mock] getSubscriptions called'); return []; },
    requestSubscription: async () => { 
      throw new Error('IAP paketi yüklenmemiş. Lütfen npm install react-native-iap çalıştırın.'); 
    },
    getAvailablePurchases: async () => { console.warn('[IAP Mock] getAvailablePurchases called'); return []; },
    purchaseUpdatedListener: () => ({ remove: () => {} }),
    purchaseErrorListener: () => ({ remove: () => {} }),
    finishTransaction: async () => {},
    acknowledgePurchaseAndroid: async () => {},
  };
}

// Type definitions (fallback)
export interface Subscription {
  productId: string;
  price: string;
  currency: string;
  localizedPrice?: string;
  subscriptionOffers?: Array<{ offerToken: string }>;
}

export interface Purchase {
  productId: string;
  transactionId?: string;
  transactionReceipt?: string;
  purchaseToken?: string;
  transactionDate?: number;
  isAcknowledgedAndroid?: boolean;
}

// Product IDs - Store'larda tanımlanmalı (Backend ile aynı format)
// iOS Bundle ID: com.spondylus.kampdefterim
// Android Package Name: com.spondylus.boltexponativewind
const PRODUCT_IDS = Platform.select({
  ios: SUBSCRIPTION_PRODUCTS.ios,
  android: SUBSCRIPTION_PRODUCTS.android,
}) || { monthly: '', yearly: '' };

export type SubscriptionPlan = 'monthly' | 'yearly';

let purchaseUpdateSubscription: any = null;
let purchaseErrorSubscription: any = null;
let cachedSubscriptions: Subscription[] = [];

// API'den çekilen fiyat önbelleği
let cachedApiPrices: Record<'ios' | 'android', Record<'monthly' | 'yearly', string>> | null = null;

/**
 * Backend'den fiyatları çek ve önbelleğe al.
 * Auth gerektirmez — public endpoint.
 * Başarısız olursa null döner, çağıran FALLBACK_PRICES kullanır.
 */
export async function fetchPricesFromAPI(): Promise<typeof cachedApiPrices> {
  try {
    const response = await fetch(`${API_URL}${SUBSCRIPTION_ENDPOINTS.prices}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      console.warn('[IAP] Prices endpoint HTTP', response.status);
      return null;
    }
    const data = await response.json();

    // Sarmalayıcı varsa: { success, prices: { ios, android } }
    const payload = data?.prices ?? data;

    // Format A — nested object: { ios: { monthly, yearly }, android: { monthly, yearly } }
    if (payload?.ios?.monthly && payload?.android?.monthly) {
      cachedApiPrices = {
        ios: { monthly: payload.ios.monthly, yearly: payload.ios.yearly },
        android: { monthly: payload.android.monthly, yearly: payload.android.yearly },
      };
      console.log('[IAP] API fiyatları yüklendi (object format):', cachedApiPrices);
      return cachedApiPrices;
    }

    // Format B — array: [{ platform, plan, price }, ...]
    if (Array.isArray(payload) && payload.length > 0) {
      const built: any = { ios: {}, android: {} };
      for (const row of payload) {
        const plat: string = row.platform;
        const plan: string = row.plan;
        const price: string = row.price ?? row.formatted_price;
        if ((plat === 'ios' || plat === 'android') && plan && price) {
          built[plat][plan] = price;
        }
      }
      if (built.ios.monthly && built.android.monthly) {
        cachedApiPrices = built;
        console.log('[IAP] API fiyatları yüklendi (array format):', cachedApiPrices);
        return cachedApiPrices;
      }
    }

    console.warn('[IAP] Prices endpoint beklenmedik format:', JSON.stringify(data));
    return null;
  } catch (e) {
    console.warn('[IAP] Prices endpoint erişilemedi, fallback kullanılıyor.', e);
    return null;
  }
}

/**
 * IAP sistemini başlat
 */
export async function initIAP(): Promise<boolean> {
  try {
    // API fiyatlarını bekleyerek çek; getPriceForPlan cçağrılmadan önce cachedApiPrices dolsun
    await fetchPricesFromAPI();

    if (!isIAPPackageAvailable) {
      console.warn('[IAP] react-native-iap paketi yüklü değil. Mock mode - satın alma özellikleri çalışmayacak.');
      return false;
    }
    
    await RNIap.initConnection();
    console.log('[IAP] Bağlantı başarılı');

    // Purchase update listener
    purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase) => {
      console.log('[IAP] Purchase update:', purchase);
      const receipt = purchase.transactionReceipt || purchase.purchaseToken;

      if (receipt) {
        try {
          // Backend'e receipt gönder ve doğrulat
          await verifyPurchase(purchase);
          
          // iOS için transaction'ı sonlandır
          if (Platform.OS === 'ios') {
            await RNIap.finishTransaction(purchase, false);
          }
          // Android için acknowledge et
          else if (Platform.OS === 'android' && !purchase.isAcknowledgedAndroid) {
            await RNIap.acknowledgePurchaseAndroid(purchase.purchaseToken!);
          }

          Alert.alert(
            '✅ Başarılı!',
            'Premium aboneliğiniz aktif edildi. Tüm özelliklere erişebilirsiniz.'
          );
        } catch (error) {
          console.error('[IAP] Verify error:', error);
          Alert.alert('Hata', 'Satın alma doğrulanamadı. Lütfen support ile iletişime geçin.');
        }
      }
    });

    // Purchase error listener
    purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
      console.warn('[IAP] Purchase error:', error);
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert('Satın Alma Hatası', error.message || 'Bir hata oluştu.');
      }
    });

    return true;
  } catch (error: any) {
    console.error('[IAP] Init error:', error);
    return false;
  }
}

/**
 * IAP bağlantısını kapat
 */
export async function endIAP() {
  try {
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }
    await RNIap.endConnection();
    console.log('[IAP] Bağlantı kapatıldı');
  } catch (error) {
    console.error('[IAP] End connection error:', error);
  }
}

/**
 * Mevcut abonelikleri getir
 */
export async function getSubscriptions(): Promise<Subscription[]> {
  try {
    const productIds = Object.values(PRODUCT_IDS);
    const subscriptions = await RNIap.getSubscriptions({ skus: productIds });
    console.log('[IAP] Subscriptions:', subscriptions);
    cachedSubscriptions = subscriptions || [];
    return subscriptions;
  } catch (error) {
    console.error('[IAP] Get subscriptions error:', error);
    return [];
  }
}

function getAndroidOfferToken(productId: string): string | null {
  const sub = cachedSubscriptions.find((item) => item.productId === productId);
  const offerToken = sub?.subscriptionOffers?.[0]?.offerToken || null;
  return offerToken;
}

/**
 * Satın alma işlemini başlat
 */
export async function purchaseSubscription(plan: SubscriptionPlan): Promise<void> {
  try {
    const productId = PRODUCT_IDS[plan];
    
    if (!productId) {
      throw new Error('Product ID bulunamadı');
    }

    console.log('[IAP] Purchasing:', productId);
    
    if (Platform.OS === 'android') {
      if (cachedSubscriptions.length === 0) {
        await getSubscriptions();
      }
      const offerToken = getAndroidOfferToken(productId);
      if (!offerToken) {
        throw new Error('Google Play teklif bilgisi bulunamadi. Lütfen Play Console base plan/offer ayarlarini kontrol edin.');
      }
      await RNIap.requestSubscription({
        sku: productId,
        subscriptionOffers: [{ sku: productId, offerToken }],
      });
    } else {
      await RNIap.requestSubscription({ sku: productId });
    }
  } catch (error: any) {
    console.error('[IAP] Purchase error:', error);
    if (error.code !== 'E_USER_CANCELLED') {
      throw error;
    }
  }
}

/**
 * Backend'e receipt gönder ve doğrulat
 */
async function verifyPurchase(purchase: Purchase): Promise<void> {
  try {
    const token = await getToken();
    const response = await fetch(`${API_URL}${SUBSCRIPTION_ENDPOINTS.verify}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: Platform.OS,
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        transactionReceipt: purchase.transactionReceipt,
        purchaseToken: purchase.purchaseToken,
        transactionDate: purchase.transactionDate,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Verification failed');
    }

    const data = await response.json();
    console.log('[IAP] Verification success:', data);
  } catch (error) {
    console.error('[IAP] Verification error:', error);
    throw error;
  }
}

/**
 * Mevcut aktif abonelikleri getir
 */
export async function getAvailablePurchases(): Promise<Purchase[]> {
  try {
    const purchases = await RNIap.getAvailablePurchases();
    console.log('[IAP] Available purchases:', purchases);
    return purchases;
  } catch (error) {
    console.error('[IAP] Get available purchases error:', error);
    return [];
  }
}

/**
 * Aboneliği restore et (iOS ve Android)
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const purchases = await getAvailablePurchases();
    
    if (purchases.length === 0) {
      Alert.alert('Bilgi', 'Daha önce yapılmış bir satın alma bulunamadı.');
      return false;
    }

    // Her purchase için backend'e verify gönder
    for (const purchase of purchases) {
      await verifyPurchase(purchase);
    }

    Alert.alert('✅ Başarılı', 'Aboneliğiniz geri yüklendi.');
    return true;
  } catch (error: any) {
    console.error('[IAP] Restore error:', error);
    Alert.alert('Hata', 'Abonelik geri yüklenemedi: ' + error.message);
    return false;
  }
}

/**
 * Fiyat formatla
 * Android yeni IAP sürümlerinde fiyat subscriptionOffers içinde gelir
 */
export function formatPrice(subscription: Subscription): string {
  // Android: subscriptionOffers[0].pricingPhases[0].formattedPrice
  if (Platform.OS === 'android') {
    const offer = (subscription as any).subscriptionOffers?.[0];
    const phase = offer?.pricingPhases?.pricingPhaseList?.[0] ?? offer?.pricingPhases?.[0];
    if (phase?.formattedPrice) {
      return phase.formattedPrice;
    }
  }
  // iOS ve Android fallback: localizedPrice
  if (subscription.localizedPrice) {
    return subscription.localizedPrice;
  }
  // Manuel format
  if (subscription.currency === 'TRY') {
    return `₺${subscription.price}`;
  }
  return `${subscription.price} ${subscription.currency}`;
}

/**
 * Plan için fiyat döndürür — öncelik sırası:
 *  1. react-native-iap (store gerçek zamanlı)
 *  2. API'den çekilen fiyat (fetchPricesFromAPI ile doldurulur)
 *  3. constants/subscriptionProducts.ts => FALLBACK_PRICES (hardcoded)
 */
export function getPriceForPlan(plan: 'monthly' | 'yearly', subs: Subscription[] = cachedSubscriptions): string {
  // 1. Store fiyatı
  const sub = subs.find(s => s.productId.includes(plan));
  if (sub) {
    return formatPrice(sub);
  }
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
  // 2. API fiyatı
  if (cachedApiPrices?.[platform]?.[plan]) {
    return cachedApiPrices[platform][plan];
  }
  // 3. Hardcoded fallback
  return FALLBACK_PRICES[platform][plan];
}

/**
 * Backend'den subscription durumunu kontrol et
 * Backend dokümanına göre: GET /node/subscriptions/status
 */
export async function checkSubscriptionStatus(): Promise<{
  platform?: string;
  productId?: string;
  expiresAt?: string;
  isActive: boolean;
  offlineEnabled: boolean;
  offlineRadiusKm: number;
} | null> {
  try {
    const token = await getToken();
    const response = await fetch(`${API_URL}${SUBSCRIPTION_ENDPOINTS.status}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error('[IAP] Status check failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[IAP] Subscription status:', data.subscription);
    return data.subscription;
  } catch (error) {
    console.error('[IAP] Check subscription status error:', error);
    return null;
  }
}
