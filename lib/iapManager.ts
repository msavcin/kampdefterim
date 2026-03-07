/**
 * In-App Purchase Manager
 * Handles iOS and Android subscription purchases
 */

import { Platform, Alert } from 'react-native';
import { getToken } from './auth';
import { API_URL } from './config';
import { emit as emitEvent } from '@/lib/eventBus';
import { SUBSCRIPTION_PRODUCTS, SUBSCRIPTION_ENDPOINTS, FALLBACK_PRICES, ANDROID_BASE_PLAN_IDS } from '@/constants/subscriptionProducts';

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

// Sunucudan alınan Google Play public key (base64, boşluksuz)
let cachedGooglePlayPublicKey: string | null = null;

/**
 * Sunucudan public key'i alır ve önbelleğe koyar.
 * Endpoint: GET /node/licenses/public-key (Authorization: Bearer <token>)
 */
export async function fetchGooglePlayPublicKey(): Promise<string | null> {
  try {
    const token = await getToken();
    const resp = await fetch(`${API_URL}/node/licenses/public-key`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      console.warn('[IAP] Public key endpoint hata:', resp.status);
      return null;
    }

    const data = await resp.json();
    const key = (data && data.key) ? String(data.key).replace(/\s+/g, '') : null;
    if (key) {
      cachedGooglePlayPublicKey = key;
      console.log('[IAP] Google Play public key alındı ve önbelleklendi');
      return key;
    }
    return null;
  } catch (e) {
    console.warn('[IAP] Public key alınamadı', e);
    return null;
  }
}

export function getCachedGooglePlayPublicKey(): string | null {
  return cachedGooglePlayPublicKey;
}

export function toPemFromBase64(base64Key: string): string {
  const chunks = base64Key.match(/.{1,64}/g)?.join('\n') ?? base64Key;
  return `-----BEGIN PUBLIC KEY-----\n${chunks}\n-----END PUBLIC KEY-----`;
}

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
      const raw = purchase as any;

      // Tüm alan adlarını logla — hangi versiyonda hangi key geliyor tespit et
      console.log('[IAP] Purchase update (raw keys):', Object.keys(raw));
      console.log('[IAP] Purchase update (fields):', JSON.stringify({
        productId: raw.productId,
        transactionId: raw.transactionId,
        purchaseToken: raw.purchaseToken ? raw.purchaseToken.slice(0, 16) + '...' : null,
        transactionReceipt: raw.transactionReceipt ? raw.transactionReceipt.slice(0, 32) + '...' : null,
        isAcknowledgedAndroid: raw.isAcknowledgedAndroid,
        obfuscatedAccountIdAndroid: raw.obfuscatedAccountIdAndroid,
        dataAndroid: raw.dataAndroid ? String(raw.dataAndroid).slice(0, 32) + '...' : null,
      }));

      // purchaseToken extraction — v12 Android her zaman purchaseToken döndürmeli
      const purchaseToken = extractPurchaseToken(raw);
      const receipt = purchaseToken || raw.transactionReceipt;

      if (receipt) {
        try {
          // Backend'e receipt gönder ve doğrulat
          await verifyPurchase(purchase);

          // Doğrulama başarılı — navigasyon ve sync için event gönder
          emitEvent('premium:subscribed');
        } catch (error: any) {
          console.error('[IAP] Verify error:', error);
          if (error?.code === 'SUBSCRIPTION_OWNED_BY_ANOTHER_USER') {
            Alert.alert(
              'Abonelik Aktarılamaz',
              'Bu abonelik başka bir hesaba bağlı. Yeni abonelik başlatmak için mağazayı kullanabilirsiniz.'
            );
          } else {
            Alert.alert('Hata', 'Satın alma doğrulanamasdı. Lütfen support ile iletişime geçin.');
          }
          return;
        }

        // Acknowledge / finish işlemi doğrulamadan bağımsız — hata olursa sessizce geç
        try {
          if (Platform.OS === 'ios') {
            await RNIap.finishTransaction(purchase, false);
          } else if (Platform.OS === 'android' && !raw.isAcknowledgedAndroid) {
            await RNIap.acknowledgePurchaseAndroid(purchaseToken!);
          }
        } catch (ackError) {
          // Acknowledge başarısız olsa da satın alma zaten doğrulandı; Play Store 3 gün içinde tekrar dener
          console.warn('[IAP] Acknowledge error (non-critical):', ackError);
        }
      } else {
        console.warn('[IAP] purchaseToken ve transactionReceipt ikisi de boş geldi — purchase nesnesi geçersiz olabilir.');
      }
    });

    // Purchase error listener
    // NOT: Alert burada gösterilmiyor — premium.tsx catch bloğu zaten yakalar,
    // çift Alert çıkmasını önlemek için sadece log atıyoruz.
    purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
      console.warn('[IAP] Purchase error listener:', JSON.stringify(error));
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
    // Android'de her iki plan ayni subscription ID'yi paylasir — tekillestirilmesi gerekir
    const productIds = [...new Set(Object.values(PRODUCT_IDS))];
    console.log('[IAP] getSubscriptions skus:', productIds);
    let subscriptions: any = null;
    try {
      subscriptions = await RNIap.getSubscriptions({ skus: productIds });
    } catch (e) {
      console.warn('[IAP] getSubscriptions({ skus }) failed, trying legacy signature', e);
      try {
        subscriptions = await RNIap.getSubscriptions(productIds);
      } catch (e2) {
        console.error('[IAP] getSubscriptions fallback failed', e2);
        throw e2;
      }
    }
    console.log('[IAP] Subscriptions raw:', JSON.stringify(
      (subscriptions || []).map((s: any) => ({
        productId: s.productId,
        basePlans: s.subscriptionOfferDetails?.map((d: any) => ({ basePlanId: d.basePlanId, offerToken: d.offerToken?.slice(0, 20) + '...' })),
      }))
    ));
    cachedSubscriptions = subscriptions || [];
    return subscriptions;
  } catch (error) {
    console.error('[IAP] Get subscriptions error:', error);
    return [];
  }
}

function getAndroidOfferToken(productId: string, plan: SubscriptionPlan): string | null {
  const sub = cachedSubscriptions.find((item) => item.productId === productId);
  const details = (sub as any)?.subscriptionOfferDetails;
  if (details?.length) {
    // Play Console'daki base plan ID ile eslesen teklifi bul
    const basePlanId = ANDROID_BASE_PLAN_IDS[plan];
    const matched = details.find((d: any) => d.basePlanId === basePlanId) ?? details[0];
    console.log('[IAP] offerToken secildi:', matched?.basePlanId, plan);
    return matched?.offerToken ?? null;
  }
  // Eski format fallback
  return (sub as any)?.subscriptionOffers?.[0]?.offerToken ?? null;
}

/**
 * Satın alma işlemini başlat
 * react-native-iap v12+: requestSubscription her zaman obje alır, string kabul etmez.
 */
export async function purchaseSubscription(plan: SubscriptionPlan): Promise<void> {
  try {
    const productId = PRODUCT_IDS[plan];

    if (!productId) {
      throw new Error('Product ID bulunamadı');
    }

    console.log('[IAP] Purchasing plan:', plan, 'productId:', productId);

    if (Platform.OS === 'android') {
      if (cachedSubscriptions.length === 0) {
        await getSubscriptions();
      }
      const offerToken = getAndroidOfferToken(productId, plan);
      console.log('[IAP] offerToken:', offerToken ? offerToken.slice(0, 40) + '...' : 'null');

      if (!offerToken) {
        throw new Error(
          'Google Play abonelik teklif bilgisi bulunamadı.\n\n'
          + '• Uygulama Play Store\'da yayınlanmamış (en az Internal Test).\n'
          + '• Play Console > Abonelikler > Temel planlar aktif mi?\n'
          + '• Test hesabı lisans test listesinde mi?\n'
          + '(Ürün: ' + productId + ' / Plan: ' + plan + ')'
        );
      }

      // react-native-iap v12 Android: subscriptionOffers ile requestSubscription
      await RNIap.requestSubscription({
        sku: productId,
        subscriptionOffers: [{ sku: productId, offerToken }],
      });
    } else {
      // iOS
      await RNIap.requestSubscription({ sku: productId });
    }
  } catch (error: any) {
    console.error('[IAP] Purchase error code:', error?.code, 'message:', error?.message);
    // E_USER_CANCELLED: kullanıcı iptal etti — sessizce geç
    if (error?.code === 'E_USER_CANCELLED') return;

    // E_ALREADY_OWNED: önceki satın alma acknowledge edilmemiş veya hâlâ aktif.
    // Mevcut purchase'ı bulup otomatik olarak restore et.
    if (error?.code === 'E_ALREADY_OWNED') {
      console.log('[IAP] E_ALREADY_OWNED alındı — mevcut purchase restore ediliyor...');
      try {
        const existing = await RNIap.getAvailablePurchases();
        const productId = PRODUCT_IDS[plan];
        const match = existing.find((p) => p.productId === productId) || existing[0];
        if (match) {
          const raw = match as any;
          const purchaseToken = extractPurchaseToken(raw);
          await verifyPurchase(match);
          if (Platform.OS === 'android' && purchaseToken && !raw.isAcknowledgedAndroid) {
            try { await RNIap.acknowledgePurchaseAndroid(purchaseToken); } catch (_) {}
          }
          emitEvent('premium:subscribed');
          return;
        }
      } catch (restoreErr: any) {
        console.error('[IAP] E_ALREADY_OWNED restore hatası:', restoreErr?.message);
        if (restoreErr?.code === 'SUBSCRIPTION_OWNED_BY_ANOTHER_USER') {
          Alert.alert(
            'Abonelik Aktarılamaz',
            'Bu abonelik başka bir hesaba bağlı. Yeni abonelik başlatmak için mağazayı kullanabilirsiniz.'
          );
          return;
        }
        // restore da başarısız olduysa aşağıdaki throw'a düşsün
      }
    }

    throw error;
  }
}

/**
 * react-native-iap v12 Android'de purchaseToken farklı alanlarda gelebilir.
 * Bu fonksiyon hepsini dener ve ilk bulduğunu döndürür.
 */
function extractPurchaseToken(raw: any): string | null {
  // 1. Doğrudan alan
  if (raw?.purchaseToken) return raw.purchaseToken;
  // 2. transactionReceipt JSON içinden
  try {
    const json = JSON.parse(raw?.transactionReceipt || raw?.originalJson || raw?.dataAndroid || '{}');
    if (json?.purchaseToken) return json.purchaseToken;
    if (json?.purchase_token) return json.purchase_token;
  } catch (_) {}
  // 3. data alanı varsa (bazı eski sürümler)
  try {
    const json = JSON.parse(raw?.data || '{}');
    if (json?.purchaseToken) return json.purchaseToken;
  } catch (_) {}
  return null;
}

/**
 * Backend'e receipt gönder ve doğrulat
 */
async function verifyPurchase(purchase: Purchase): Promise<void> {
  const raw = purchase as any;
  const purchaseToken = extractPurchaseToken(raw);

  if (!purchaseToken && Platform.OS === 'android') {
    // Token yoksa backend'e bölgesiz istek gönderme
    const err = new Error(
      'purchaseToken boş — lütfen uygulamanın Play Store (Internal Testing) üzerinden yüklendiğinden emin olun.'
    );
    console.error('[IAP] verifyPurchase: purchaseToken yok. Raw keys:', Object.keys(raw));
    throw err;
  }

  // Plan tespiti: productId içinden veya cachedSubscriptions'dan basePlanId bul
  const matchedSub = (cachedSubscriptions as any[]).find(s => s.productId === raw.productId);
  const offerDetails = matchedSub?.subscriptionOfferDetails || [];
  // Satın alınan teklifi offerToken üzerinden eşleştir
  const matchedOffer = offerDetails.find((d: any) =>
    raw.purchaseToken && d.offerToken && raw.purchaseToken.startsWith(d.offerToken?.slice(0, 10))
  ) || offerDetails[0];
  const basePlanId: string | undefined = matchedOffer?.basePlanId;

  // Android'de purchase.productId = package name ile aynı olduğu için backend karışabilir.
  // Sabitimizden gelen Play Console subscription ID'sini kullan (güvenilir).
  const subscriptionPlan = (basePlanId as 'monthly' | 'yearly') || 'monthly';
  const productId =
    Platform.OS === 'android'
      ? SUBSCRIPTION_PRODUCTS.android[subscriptionPlan] ?? SUBSCRIPTION_PRODUCTS.android.monthly
      : raw.productId;

  const body = {
    platform: Platform.OS,
    productId,
    purchaseToken,
    transactionId: raw.transactionId,
    transactionReceipt: raw.transactionReceipt,
    transactionDate: raw.transactionDate,
    basePlanId, // aylık / yıllık ayrımı backend'e bildirmek için
  };

  console.log('[IAP] verifyPurchase body:', JSON.stringify({
    ...body,
    purchaseToken: purchaseToken ? purchaseToken.slice(0, 16) + '...' : null,
  }));

  try {
    const token = await getToken();
    const response = await fetch(`${API_URL}${SUBSCRIPTION_ENDPOINTS.verify}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[IAP] verifyPurchase HTTP error:', response.status, JSON.stringify(errorData));
      if (response.status === 409) {
        const err = new Error('Bu abonelik başka bir hesaba bağlı. Yeni abonelik başlatmak için mağazayı kullanabilirsiniz.');
        (err as any).code = 'SUBSCRIPTION_OWNED_BY_ANOTHER_USER';
        throw err;
      }
      throw new Error(errorData?.message || `Verification failed (HTTP ${response.status})`);
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

    emitEvent('premium:subscribed');
    return true;
  } catch (error: any) {
    console.error('[IAP] Restore error:', error);
    if (error?.code === 'SUBSCRIPTION_OWNED_BY_ANOTHER_USER') {
      Alert.alert(
        'Abonelik Aktarılamaz',
        'Bu abonelik başka bir hesaba bağlı. Yeni abonelik başlatmak için mağazayı kullanabilirsiniz.'
      );
    } else {
      Alert.alert('Hata', 'Abonelik geri yüklenemedi: ' + error.message);
    }
    return false;
  }
}

/**
 * Fiyat formatla
 * react-native-iap v12+: Android'de fiyat subscriptionOfferDetails içinde gelir
 * Eski sürümlerde subscriptionOffers kullanılıyordu
 */
export function formatPrice(subscription: Subscription): string {
  if (Platform.OS === 'android') {
    // v12+: subscriptionOfferDetails[0].pricingPhases.pricingPhaseList[0]
    const offerDetail = (subscription as any).subscriptionOfferDetails?.[0];
    const phaseNew = offerDetail?.pricingPhases?.pricingPhaseList?.[0];
    if (phaseNew?.formattedPrice) {
      return phaseNew.formattedPrice;
    }
    // Eski sürüm fallback: subscriptionOffers[0]
    const offerOld = (subscription as any).subscriptionOffers?.[0];
    const phaseOld = offerOld?.pricingPhases?.pricingPhaseList?.[0] ?? offerOld?.pricingPhases?.[0];
    if (phaseOld?.formattedPrice) {
      return phaseOld.formattedPrice;
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
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

  if (platform === 'android') {
    // Android: tek subscription product, basePlanId ile plan filtrele
    const androidProductId = SUBSCRIPTION_PRODUCTS.android[plan];
    const sub = subs.find(s => s.productId === androidProductId);
    if (sub) {
      const details = (sub as any)?.subscriptionOfferDetails;
      if (details?.length) {
        const basePlanId = ANDROID_BASE_PLAN_IDS[plan];
        const matched = details.find((d: any) => d.basePlanId === basePlanId) ?? details[0];
        const phase = matched?.pricingPhases?.pricingPhaseList?.[0];
        if (phase?.formattedPrice) return phase.formattedPrice;
      }
      // Eski format fallback
      const p = formatPrice(sub);
      if (p) return p;
    }
  } else {
    // iOS: ayri product ID'ler
    const sub = subs.find(s => s.productId === SUBSCRIPTION_PRODUCTS.ios[plan]);
    if (sub) return formatPrice(sub);
  }

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
  autoRenewing?: boolean;
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
    console.log('[IAP] /subscriptions/status ham yanıt:', JSON.stringify(data));
    return data.subscription ?? null;
  } catch (error) {
    console.error('[IAP] Check subscription status error:', error);
    return null;
  }
}

/**
 * Backend'e Google Play API canlı sorgusunu tetikle, DB'yi güncelle.
 * POST /subscriptions/refresh — Backend purchaseToken ile Play API'yi çağırır,
 * sonuçta users.offline_enabled ve abonelik kaydı güncellenir.
 * Sonrasında checkSubscriptionStatus() ile güncel durum alınmalıdır.
 */
export async function refreshSubscriptionStatus(): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) return false;
    const response = await fetch(`${API_URL}${SUBSCRIPTION_ENDPOINTS.refresh}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      console.warn('[IAP] /subscriptions/refresh HTTP', response.status);
      return false;
    }
    const data = await response.json();
    console.log('[IAP] /subscriptions/refresh yanıtı:', JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn('[IAP] refreshSubscriptionStatus hatası:', error);
    return false;
  }
}
