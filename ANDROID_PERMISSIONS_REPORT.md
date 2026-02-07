# Android Konum İzinleri Kullanım Raporu

## 📋 İzlenen İzinler
```
1. android.permission.ACCESS_FINE_LOCATION    → Hassas konum (GPS)
2. android.permission.ACCESS_COARSE_LOCATION  → Kaba konum (Network)
3. android.permission.ACCESS_BACKGROUND_LOCATION → Arka plan konumu
```

---

## 📍 İzin Tanımlaması

### 📄 **app.json** (İzin Konfigürasyonu)

```json
"android": {
  "permissions": [
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_LOCATION"
  ]
}
```

**Expo-Location Plugin Konfigürasyonu:**
```json
[
  "expo-location",
  {
    "locationAlwaysAndWhenInUsePermission": 
      "Offline harita senkronizasyonu için konum izni gereklidir.",
    "locationAlwaysPermission": 
      "Arka planda offline harita güncellemeleri için konum izni gereklidir.",
    "locationWhenInUsePermission": 
      "Harita ve kamp alanlarını görmek için konum izni gereklidir.",
    "isAndroidBackgroundLocationEnabled": true,
    "isAndroidForegroundServiceEnabled": true
  }
]
```

---

## 🔍 İzinlerin Kodda Kullanımı

### 1️⃣ **Merkezi İzin Kontrol Modülü**

#### 📁 `lib/checkLocationPermissionsForPremium.ts`
```typescript
export async function checkLocationPermissionsForPremium(user) {
  // Premium kullanıcıda hem foreground hem background izin granted olmalı
  if (!user?.offline_enabled) return true;
  
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.status === 'granted';
}
```

**Kullanım:** Offline Mode (Premium) özelliği aktif olan kullanıcılar için background izni zorunlu.

---

### 2️⃣ **İzin Modal (Kullanıcı Etkileşimi)**

#### 📁 `components/LocationPermissionModal.tsx`

**Ana Fonksiyonalite:**
- **Foreground İzin İsteme:**
  ```typescript
  const { status } = await Location.requestForegroundPermissionsAsync();
  ```
  
- **Background İzin İsteme (Premium Kullanıcılar):**
  ```typescript
  const { status: bgRequestStatus } = 
    await Location.requestBackgroundPermissionsAsync();
  ```

**İzin Akışı:**
1. Modal görünür → Kullanıcıya neden izin gerektiği gösterilir
2. "Konum İzni Ver" butonu → Foreground izni istenir
3. Eğer Premium ise → Background izni de istenir
4. İzin verilmez ise → Sistem ayarlarına yönlendirilir

**Modal İçeriği (Premium vs Normal):**
- **Normal Kullanıcı:**
  - 📍 Yakınımdaki kamp alanlarını göster
  - 🗺️ Haritada konumumu göster
  - 📏 Mesafe hesaplamalarını yapma

- **Premium Kullanıcı (Offline Mode):**
  - Yukarıdakiler +
  - 🔋 Offline Mode için arka planda harita yükle

**İzin Kontrol Mekanizması:**
- `AppState.addEventListener('change')` → App ön plana gelince izin kontrol
- İzin verildiğinde → `eventBus.emit('locationPermissionGranted')`
- `SecureStore.setItemAsync('doNotShowLocationPermissionModal')` → "Bir daha gösterme" seçeneği

---

### 3️⃣ **Profil Sayfası (Manuel İzin Yönetimi)**

#### 📁 `app/(tabs)/profile.tsx` (590-650. satırlar)

**Fonksiyonalite:**

```typescript
// Foreground izni iste
const { status: foregroundStatus } = 
  await Location.requestForegroundPermissionsAsync();

// Background izni iste (sadece offline özelliğine sahip olanlar)
if (requestBackground && Platform.OS !== 'web') {
  const currentBackgroundPermission = 
    await Location.getBackgroundPermissionsAsync();
  
  if (currentBackgroundPermission.status === 'granted') {
    // Zaten background izni var
  } else {
    // Background izni yok, kullanıcıdan iste
    const { status: backgroundStatus } = 
      await Location.requestBackgroundPermissionsAsync();
  }
}
```

**Profil Sayfasında İzin Ayarları:**
- Konum izin durumunu kontrol et
- Manuel olarak İzin ver seçeneği
- Sistem ayarlarına erişim

---

### 4️⃣ **Konum Hook'u (Otomatik Konum Takibi)**

#### 📁 `hooks/useCampingAreas.ts`

**Konum İzni Kontrolü:**
```typescript
// Konum izni varsa arka planda konum takibi başlat
const { status } = await Location.getForegroundPermissionsAsync();
if (status === 'granted') {
  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 100,      // 100m hareketinde güncelle
      timeInterval: 30000,         // min 30 saniye arası
    },
    (newLocation) => {
      setLocation(newLocation);
    }
  );
}
```

**Kullanım Alanları:**
- Otomatik yakınlık tabanlı kamp alanı getirme
- Realtime mesafe hesaplaması
- Harita üzerinde konumu gösterme

---

### 5️⃣ **Arka Plan Konum Takibi (TaskManager)**

#### 📁 `app/(tabs)/index.tsx`

**Arka Plan Görevi Tanımı:**
```typescript
const BACKGROUND_LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (data) {
    const { locations } = data;
    const { latitude, longitude } = locations[0].coords;
    
    // Offline Mode aktif ise bölgeyi cache'le
    const userData = await getMe();
    if (userData?.offline_enabled) {
      const radiusKm = userData.offline_radius_km || 20;
      await precacheRegionWithRadius(latitude, longitude, radiusKm);
    }
  }
});
```

**Amaç:**
- Uygulama kapalıyken bile konum alıp harita tile'ları cache'leme
- Offline Mode için veri senkronizasyonu
- Premium kullanıcılar için otomatik harita güncelleme

---

## 🔄 İzin Akışı (Detaylı)

### **İlk Açılış (Soğuk Başlangıç)**
```
Uygulama Başla
    ↓
LocationPermissionModal göster
    ↓
Konum İzni Gerekçesi Göster
    ↓
"Konum İzni Ver" Butonu
    ↓
requestForegroundPermissionsAsync() → ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION
    ↓
Eğer Premium İse:
    ├─ requestBackgroundPermissionsAsync() → ACCESS_BACKGROUND_LOCATION
    └─ "Her zaman İzin Ver" gerekli
    ↓
EventBus → 'locationPermissionGranted'
    ↓
Modal Kapat → App Başla
```

### **App Ön Plana Geldiğinde (AppState Change)**
```
AppState = 'active'
    ↓
LocationPermissionModal kontrol et
    ↓
Foreground izni kontrol → getForegroundPermissionsAsync()
    ↓
Eğer Premium → Background izni kontrol → getBackgroundPermissionsAsync()
    ↓
Tüm izinler verildi ise:
    ├─ eventBus.emit('locationPermissionGranted')
    └─ Modal kapat
    ↓
Konum takisini başlat → watchPositionAsync()
```

### **El ile İzin Yönetimi (Profil Sayfası)**
```
Profil → İzin Ayarları Section
    ↓
"Konum İzni Sor" Butonu
    ↓
requestForegroundPermissionsAsync()
    ↓
Eğer Offline-enabled:
    └─ requestBackgroundPermissionsAsync()
    ↓
Sistem ayarlarına yönlendir (gerekirse)
```

---

## 📊 İzin Durumları

| İzin | Normal Kullanıcı | Premium/Offline | Gerekli Mü |
|------|---|---|---|
| **ACCESS_FINE_LOCATION** | Opsiyonel | Gerekli | Harita görüntüleme |
| **ACCESS_COARSE_LOCATION** | Opsiyonel | Gerekli | Konum tahmini |
| **ACCESS_BACKGROUND_LOCATION** | ❌ Kullanılmaz | Gerekli | Offline cache |

---

## 🎯 İzin Zorunluluk Kuralları

### **Normal Kullanıcı**
- ✅ Foreground İzni: İsteğe bağlı
- ❌ Background İzni: İhtiyaç yok

### **Premium Kullanıcı (offline_enabled = true)**
- ✅ Foreground İzni: Zorunlu
- ✅ Background İzni: Zorunlu (Offline harita güncellemeleri için)

### **Offline Özelliği**
- Aktivasyon: `user.offline_enabled = true`
- Cache Yarıçapı: `user.offline_radius_km` (default: 20 km)
- Arka Plan Görev: 30 saniye arası konum güncelleme

---

## 🔐 İzin Kontrol Noktaları

### **1. Modal Görünüş**
```typescript
if (visible) {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (isPremium) {
    const background = await Location.getBackgroundPermissionsAsync();
  }
}
```

### **2. App Başlangıcı**
```typescript
useCampingAreas({
  autoFetch: true,  // İzin varsa otomatik kon. takibi
})
```

### **3. Arka Plan Görevi**
```typescript
if (userData?.offline_enabled) {
  // Background izni check → precacheRegionWithRadius
}
```

### **4. Profil Sayfası**
```typescript
refreshLocationPermissions();  // El ile kontrol
requestForegroundPermissionsAsync();
requestBackgroundPermissionsAsync();  // Premium için
```

---

## 📱 Platform Farklılıkları

### **Android**
- ✅ ACCESS_FINE_LOCATION
- ✅ ACCESS_COARSE_LOCATION  
- ✅ ACCESS_BACKGROUND_LOCATION
- ✅ FOREGROUND_SERVICE_LOCATION

### **iOS**
- ✅ locationWhenInUsePermission
- ✅ locationAlwaysAndWhenInUsePermission
- ❌ ACCESS_BACKGROUND_LOCATION (platform different)

### **Web**
- ❌ Background İzni (Web API sınırlaması)
- ⚠️ Geolocation API (tarayıcı iznine bağlı)

---

## 🛠️ İzin Sorunlarını Giderme

### **Modal Tekrar Gösterilmez**
```typescript
// SecureStore'da 'doNotShowLocationPermissionModal' = 'true'
// Çözüm: Profil sayfasından manuel iste veya veri temizle
```

### **Background İzni Alınamadı**
```typescript
// Android Ayarlar → Uygulama İzinleri 
//   → Konum → "Her zaman izin ver"
// Android 13+ izin dialog'unda "Tam Zaman İzni" seçimesi gerekli
```

### **Konum Takibi Gelmiyorsa**
```typescript
// 1. Foreground izni kontrol
const fg = await Location.getForegroundPermissionsAsync();
// 2. Konum servisi açık mı (Ayarlar → Konum)
// 3. GPS doğruluğu (Balanced mode)
```

---

## 📈 Çağrılan API'lar Özeti

| Fonksiyon | Amaç | Çağrıldığı Yerler |
|-----------|------|------|
| `getForegroundPermissionsAsync()` | Foreground izni durumunu kontrol | Modal, Profile, useCampingAreas |
| `requestForegroundPermissionsAsync()` | Foreground izni iste | Modal, Profile |
| `getBackgroundPermissionsAsync()` | Background izni durumunu kontrol | Modal, Profile, checkLocationPermissionsForPremium |
| `requestBackgroundPermissionsAsync()` | Background izni iste (Premium) | Modal, Profile |
| `watchPositionAsync()` | Realtime konum takibi başlat | useCampingAreas |
| `getCurrentPositionAsync()` | Tek seferlik konum al | useCampingAreas |

---

## 🔗 İlişkili Dosyalar

```
lib/
├── checkLocationPermissionsForPremium.ts   → İzin kontrol mantığı
├── userCommunityApi.ts                    → Premium durumu kontrolü
├── mapTileCache.ts                        → Offline cache yönetimi
└── osmReverseGeocode.ts                   → Konum adresleme

components/
├── LocationPermissionModal.tsx             → İzin isteği modalı
└── CampingAreaDetailModal.tsx             → Harita gösterimi

hooks/
├── useCampingAreas.ts                     → Konum takibi ve veri getirme
└── useNetworkStatus.ts                    → Ağ durumu kontrolü

app/(tabs)/
├── index.tsx                              → Arka plan görev tanımı
└── profile.tsx                            → El ile izin yönetimi
```

---

## ✅ Özet

**Proje iOS ve Android'de konum izinlerini şu şekilde yönetir:**

1. **İlk Başlangıçta:** Modal ile kullanıcıya konum izni neden gerekli olduğunu açıkla ve iste
2. **Foreground İzni:** Harita ve kamp alanları görüntüleme için gerekli
3. **Background İzni:** Sadece Premium/Offline Mode kullanıcıları için gerekli
4. **Arka Plan Görevi:** Offline Mode aktif ise 30 saniye arası konum alıp harita cache'le
5. **Profil Sayfası:** Kullanıcı el ile izin kontrolü ve tekrar isteme seçeneği
6. **AppState Dinleme:** App ön plana gelince izin durumu kontrol ve konum takibi güncelle

**Kritik Nokta:** Premium özellik (`offline_enabled`) aktif olan kullanıcılar için **hem Foreground hem Background** izni **zorunludur**.
