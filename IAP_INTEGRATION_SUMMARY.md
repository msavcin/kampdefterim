# IAP (In-App Purchase) Entegrasyon Özeti

## ✅ Yapılan Güncellemeler

### 1. Product ID'ler Dokümanla Uyumlu Hale Getirildi

**iOS Bundle ID:** `com.spondylus.kampdefterim`
- Monthly: `com.spondylus.kampdefterim.monthly`
- Yearly: `com.spondylus.kampdefterim.yearly`

**Android Package Name:** `com.spondylus.boltexponativewind`
- Monthly: `com.spondylus.boltexponativewind.monthly`
- Yearly: `com.spondylus.boltexponativewind.yearly`

### 2. Constants Dosyası Oluşturuldu
📁 `constants/subscriptionProducts.ts`
- Product ID'ler merkezi bir yerden yönetiliyor
- Offline radius tanımlamaları eklendi
- Backend endpoint'leri tanımlandı

### 3. IAP Manager Güncellemeleri
📁 `lib/iapManager.ts`
- ✅ Product ID'ler constants dosyasından alınıyor
- ✅ API endpoint'leri SUBSCRIPTION_ENDPOINTS'ten kullanılıyor
- ✅ `checkSubscriptionStatus()` fonksiyonu eklendi
- ✅ Tüm backend iletişimi dokümanla uyumlu

### 4. Premium Ekranı Güncellemeleri
📁 `app/premium.tsx`
- ✅ Subscription status kontrolü eklendi
- ✅ Active subscription banner'ı gösteriliyor
- ✅ Offline radius bilgisi görüntüleniyor
- ✅ Abonelik bitiş tarihi gösteriliyor
- ✅ Satın alma ve restore sonrası status otomatik güncelleniyor

### 5. Backend Örnek Kod Güncellendi
📁 `BACKEND_IAP_EXAMPLE.js`
- ✅ Android package name: `com.spondylus.boltexponativewind`

## 🔗 Backend API Endpoint'leri

**Base URL:** `https://botanikakademi.com` (Production)  
**Base URL:** `http://192.168.1.220:3000` (Local Development)

### 1. Subscription Doğrulama
```
POST /node/subscriptions/verify
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body (iOS):**
```json
{
  "platform": "ios",
  "productId": "com.spondylus.kampdefterim.monthly",
  "transactionReceipt": "base64_encoded_receipt_data",
  "transactionId": "1000000123456789"
}
```

**Request Body (Android):**
```json
{
  "platform": "android",
  "productId": "com.spondylus.boltexponativewind.monthly",
  "purchaseToken": "google_purchase_token",
  "transactionId": "GPA.1234-5678-9012-34567"
}
```

### 2. Subscription Durumu Kontrolü
```
GET /node/subscriptions/status
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "subscription": {
    "platform": "ios",
    "productId": "com.spondylus.kampdefterim.monthly",
    "expiresAt": "2026-03-10T12:00:00.000Z",
    "isActive": true,
    "offlineEnabled": true,
    "offlineRadiusKm": 20
  }
}
```

## 📱 Mobil Uygulama Kullanımı

### Subscription Satın Alma
```typescript
import * as IAPManager from '@/lib/iapManager';

// Aylık abonelik
await IAPManager.purchaseSubscription('monthly');

// Yıllık abonelik
await IAPManager.purchaseSubscription('yearly');
```

### Subscription Durumu Kontrolü
```typescript
import { checkSubscriptionStatus } from '@/lib/iapManager';

const status = await checkSubscriptionStatus();
if (status?.isActive) {
  console.log('Premium kullanıcı');
  console.log('Offline radius:', status.offlineRadiusKm, 'km');
}
```

### Satın Alımları Geri Yükleme
```typescript
import { restorePurchases } from '@/lib/iapManager';

const restored = await restorePurchases();
```

## 🎯 Offline Radius Mapping

Backend otomatik olarak product ID'ye göre radius atar:
- **Monthly** (`monthly` içeren product ID): `20 km`
- **Yearly** (`yearly` içeren product ID): `50 km`

## 🔧 Geliştirme Notları

### config.ts Kullanımı
API_URL her zaman `lib/config.ts` dosyasından import edilir:

```typescript
import { API_URL } from './config';
```

Development/Production geçişi için config.ts'de tek satır değiştirilir:
```typescript
// Development
export const API_URL = 'http://192.168.1.220:3000/node';

// Production
export const API_URL = 'https://botanikakademi.com/node';
```

### Product ID Store Ayarları

**iOS - App Store Connect:**
1. App Information > Bundle ID: `com.spondylus.kampdefterim`
2. In-App Purchases > Product ID'leri tanımla
3. Shared Secret'i al ve backend'e ekle

**Android - Google Play Console:**
1. App Information > Package Name: `com.spondylus.boltexponativewind`
2. Monetization > Subscriptions > Product ID'leri oluştur
3. Service Account JSON key'i indir ve backend'e ekle

## 📋 Checklist

- [x] Product ID'ler dokümanla uyumlu
- [x] Constants dosyası oluşturuldu
- [x] API endpoint'leri merkezi tanımlandı
- [x] Backend örnek kod güncellendi
- [x] Subscription status kontrolü eklendi
- [x] API_URL config.ts'den kullanılıyor
- [ ] Backend'de migration çalıştırıldı mı? (Backend ekibi)
- [ ] Environment variables set edildi mi? (Backend ekibi)
- [ ] Store'larda product ID'ler oluşturuldu mu? (Store yöneticisi)
- [ ] Sandbox/test mode kontrol edildi mi?

## 🐛 Debugging

IAP işlemleri console'da şu prefix'lerle loglanır:
```
[IAP] Purchase update: {...}
[IAP] Verification success: {...}
[IAP] Subscription status: {...}
```

Hata durumunda:
```
[IAP] Purchase error: {...}
[IAP] Verification error: {...}
```

## 📞 Destek

Sorun yaşanırsa:
1. Console loglarını kontrol edin
2. Network request'leri inceleyin (API URL doğru mu?)
3. Product ID'lerin store'larda tanımlı olduğundan emin olun
4. JWT token'ın geçerli olduğunu doğrulayın

---

**Son Güncelleme:** 2026-02-13  
**Doküman Versiyon:** 1.0
