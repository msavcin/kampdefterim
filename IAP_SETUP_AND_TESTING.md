# In-App Purchase Setup ve Test Kılavuzu

## 📦 Gerekli Paket

```bash
npm install react-native-iap@^15.6.0 react-native-nitro-modules@^0.36.1
```

## 🍎 iOS Konfigürasyonu

### 1. App Store Connect Ayarları

1. **App Store Connect**'e giriş yapın: https://appstoreconnect.apple.com
2. **My Apps** > **Kampdefterim** seçin
3. **Features** > **In-App Purchases** sekmesine gidin
4. **Auto-Renewable Subscription** oluşturun:

#### Ürün 1: Aylık Abonelik
- **Product ID**: `com.spondylus.kampdefterim.monthly`
- **Reference Name**: Premium Monthly Subscription
- **Subscription Group**: Premium
- **Price**: ₺49 (Tier 6)
- **Subscription Duration**: 1 Month
- **Bundle ID**: com.spondylus.kampdefterim

#### Ürün 2: Yıllık Abonelik
- **Product ID**: `com.spondylus.kampdefterim.yearly`
- **Reference Name**: Premium Yearly Subscription
- **Subscription Group**: Premium
- **Price**: ₺299 (Tier 43)
- **Subscription Duration**: 1 Year
- **Bundle ID**: com.spondylus.kampdefterim

### 2. Xcode Projesinde Capability Ekle

1. Xcode'da projeyi açın
2. **Targets** > **Kampdefterim** seçin
3. **Signing & Capabilities** sekmesine gidin
4. **+ Capability** butonuna tıklayın
5. **In-App Purchase** ekleyin

### 3. Info.plist Güncelle (Gerekirse)

```xml
<key>SKAdNetworkItems</key>
<array>
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>cstr6suwn9.skadnetwork</string>
    </dict>
</array>
```

### 4. iOS Test için Sandbox Hesabı

**Test hesabı oluşturma:**
1. App Store Connect > **Users and Access** > **Sandbox Testers**
2. **+** butonuna tıklayın
3. Test hesabı bilgileri:

```
Email: test.kampdefterim@icloud.com
Password: Test1234!
First Name: Test
Last Name: Kamper
Country: Turkey
```

**Test cihazında kullanım:**
1. **Ayarlar** > **App Store** > **Sandbox Account** bölümüne gidin
2. Test hesabı ile giriş yapın
3. Uygulamada satın alma işlemi yapın (gerçek para çekilmez)

---

## 🤖 Android Konfigürasyonu

### 1. Google Play Console Ayarları

1. **Google Play Console**'a giriş yapın: https://play.google.com/console
2. **Kampdefterim** uygulamasını seçin
3. **Monetization** > **Products** > **Subscriptions** sekmesine gidin
4. **Create subscription** butonuna tıklayın

#### Ürün 1: Aylık Abonelik
- **Product ID**: `com.spondylus.boltexponativewind.monthly`
- **Name**: Premium Aylık
- **Description**: Kampdefterim Premium - Aylık Abonelik
- **Base plan**: 1 Month Auto-renewing
- **Price**: ₺49.00 TRY
- **Grace period**: 3 days
- **Free trial**: 7 days (opsiyonel)
- **Package Name**: com.spondylus.boltexponativewind

#### Ürün 2: Yıllık Abonelik
- **Product ID**: `com.spondylus.boltexponativewind.yearly`
- **Name**: Premium Yıllık
- **Description**: Kampdefterim Premium - Yıllık Abonelik
- **Base plan**: 1 Year Auto-renewing
- **Price**: ₺299.00 TRY
- **Grace period**: 7 days
- **Free trial**: 14 days (opsiyonel)
- **Package Name**: com.spondylus.boltexponativewind

### 2. android/app/build.gradle Güncelle

```gradle
dependencies {
    // ... existing dependencies
    react-native-iap 15.x → OpenIAP / Google Play Billing 9.x (native dependency autolinking)
}
```

### 3. AndroidManifest.xml Güncelle

```xml
<manifest>
    <uses-permission android:name="com.android.vending.BILLING" />
    
    <application>
        <!-- ... existing config -->
    </application>
</manifest>
```

### 4. Android Test için License Testing

**Test hesabı ekleme:**
1. Google Play Console > **Setup** > **License testing**
2. **License testers** bölümüne e-posta ekleyin:

```
test.kampdefterim@gmail.com
developer@kampdefterim.com
```

3. **Test tracks** kullanarak Internal/Closed Testing ile test edin

**Internal Test Track Kullanımı:**
1. **Release** > **Testing** > **Internal testing** sekmesi
2. Yeni release oluşturun
3. Testers listesine Google hesabınızı ekleyin
4. Opt-in URL'yi açıp uygulamayı Play Store'dan indirin
5. Gerçek para çekilmez, ancak tam flow test edilir

---

## 🧪 Test Senaryoları

### Senaryo 1: Aylık Abonelik Satın Alma

**Adımlar:**
1. Uygulamayı açın
2. **Premium** ekranına gidin
3. **Aylık** planı seçin
4. **Aylık Abonelik Başlat** butonuna tıklayın
5. Store (App Store / Play Store) satın alma ekranı açılır
6. Sandbox/Test hesabı ile onaylayın

**Beklenen Sonuç:**
- Satın alma başarılı olur
- Backend'e receipt gönderilir ve doğrulanır
- Kullanıcının `offline_enabled` = `true` olur
- "Premium aboneliğiniz aktif edildi" mesajı görünür

### Senaryo 2: Yıllık Abonelik Satın Alma

**Adımlar:**
1. Premium ekranında **Yıllık** planı seçin
2. **Yıllık Abonelik Başlat** butonuna tıklayın
3. Satın alma işlemini onaylayın

**Beklenen Sonuç:**
- Aylık senaryoyla aynı
- Backend'de `offline_radius_km` = `50` set edilir (bonus)

### Senaryo 3: Satın Alımı Geri Yükleme (Restore)

**Adımlar:**
1. Yeni bir cihazda uygulamayı yükleyin
2. Aynı Apple ID / Google hesabı ile giriş yapın
3. Premium ekranında **Satın Alımları Geri Yükle** butonuna tıklayın

**Beklenen Sonuç:**
- Daha önce yapılan satın alımlar tespit edilir
- Backend'e verify isteği gönderilir
- Premium özellikleri aktif olur

### Senaryo 4: İptal Edilen Abonelik

**Adımlar:**
1. Store ayarlarından aboneliği iptal edin
2. Abonelik süresi dolana kadar bekleyin
3. Uygulamayı açın

**Beklenen Sonuç:**
- Backend cron/scheduled task ile aboneliği kontrol eder
- Süresi dolan kullanıcının `offline_enabled` = `false` yapılır
- Kullanıcı premium özelliklerini kullanamaz

### Senaryo 5: Hata Durumları

**Test edilecek hatalar:**
- İnternet bağlantısı olmadan satın alma
- Yanlış receipt ile backend doğrulama
- Kullanıcı satın alma iptal eder
- Duplicate satın alma (zaten aktif abonelik var)

---

## 🔐 Backend Endpoint Gereksinimleri

IAP doğrulaması için backend'e endpoint eklenmiştir:

### POST /subscriptions/verify

**Request:**
```json
{
  "platform": "ios" | "android",
  "productId": "com.kampdefterim.monthly" | "com.kampdefterim.yearly",
  "transactionId": "1000000123456789",
  "transactionReceipt": "<base64 encoded receipt for iOS>",
  "purchaseToken": "<purchase token for Android>",
  "transactionDate": 1234567890000
}
```

**Response (Success):**
```json
{
  "success": true,
  "subscription": {
    "productId": "com.kampdefterim.yearly",
    "expiresDate": "2027-02-10T12:00:00Z",
    "isActive": true
  }
}
```

**Backend İşlemleri:**

Backend'de şu alan güncellemeleri yapılır:
- `subscription_platform`: Platform bilgisi (ios/android)
- `subscription_product_id`: Ürün ID'si
- `subscription_transaction_id`: Transaction ID
- `subscription_expires_at`: Süre sonu tarihi
- `subscription_is_active`: Aktif durum
- `offline_enabled`: true olarak set edilir
- `offline_radius_km`: monthly için 20, yearly için 50

---

## 📱 Platform Bazlı Mesajlar

Kod şu şekilde platform kontrolü yapıyor:

```typescript
const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play Store';
```

- **iOS**: "App Store'a yönlendirileceksiniz"
- **Android**: "Google Play Store'a yönlendirileceksiniz"

---

## 🐛 Debug İpuçları

### iOS
```bash
# Console logları görüntüle
npx react-native log-ios
```

### Android
```bash
# Logcat aç
adb logcat | grep IAP
```

### IAP Manager Logları

Kod içinde şu log'lar var:
```
[IAP] Bağlantı başarılı
[IAP] Subscriptions: [...]
[IAP] Purchase update: {...}
[IAP] Verify error: ...
[Premium] IAP init error: ...
```

---

## 📞 Production Checklist

### Backend
- [x] Backend IAP entegrasyonu tamamlandı
- [x] `/subscriptions/verify` endpoint eklendi
- [x] Database migration çalıştırıldı (subscription alanları)
- [x] Cron job eklendi (süresi dolan abonelikler)
- [ ] Apple Shared Secret environment variable'a eklendi
- [ ] Google Service Account JSON environment variable'a eklendi

### Store Konfigrasyonu

- [ ] App Store Connect'te ürünler oluşturuldu
- [ ] Google Play Console'da subscriptionlar oluşturuldu
- [ ] iOS Capability eklenmiş (In-App Purchase)
- [ ] Android billing dependency eklenmiş
- [ ] Test hesaplarıyla tüm senaryolar test edildi
- [ ] Gizlilik Politikası güncellendi (abonelik şartları)
- [ ] App Store / Play Store açıklamalarına abonelik bilgileri eklendi

### Backend Endpoint
- **URL**: `POST /subscriptions/verify`
- **Status Check**: `GET /subscriptions/status`

---

## 🔗 Faydalı Linkler

- **react-native-iap docs**: https://github.com/dooboolab-community/react-native-iap
- **Apple StoreKit**: https://developer.apple.com/documentation/storekit
- **Google Play Billing**: https://developer.android.com/google/play/billing
- **iOS Receipt Validation**: https://developer.apple.com/documentation/appstorereceipts/verifyreceipt
- **Google Play Developer API**: https://developers.google.com/android-publisher

---

## 💰 Fiyatlandırma Önerileri

Current pricing:
- **Aylık**: ₺49
- **Yıllık**: ₺299 (aylığa göre %50 tasarruf)

Tier mappings:
- iOS Tier 6 ≈ ₺49
- iOS Tier 43 ≈ ₺299
- Android: Custom pricing (₺49.00, ₺299.00)

---

Bu doküman IAP implementasyonunun tüm adımlarını içeriyor. Sorularınız için iletişime geçebilirsiniz! 🚀
