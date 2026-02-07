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
import * as Location from 'expo-location';

export async function checkLocationPermissionsForPremium(user) {
  // Premium kullanıcıda hem foreground hem background izin granted olmalı
  if (!user?.offline_enabled) return true;
  
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.status === 'granted';
}
```

**Kullanım:** 
- Offline Mode (Premium) özelliği aktif olan kullanıcılar için background izni kontrolü
- `user.offline_enabled = true` → Background izni **zorunlu**
- `user.offline_enabled = false` → Sadece foreground izni yeterli

**Çağrıldığı Yerler:**
- Modal gösterilmeden önce izin durumu kontrolü
- Profil sayfasında offline özellik durumu gösterimi

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

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[BackgroundLocation] Hata:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      const { latitude, longitude } = location.coords;
      
      console.log(`[BackgroundLocation] Konum alındı: ${latitude}, ${longitude}`);
      
      try {
        // Kullanıcı offline özelliğine sahip mi kontrol et
        const token = await getToken();
        if (!token) {
          console.log('[BackgroundLocation] Token yok, cache atlandı');
          return;
        }
        
        const userData = await getMe();
        
        if (!userData || !userData.offline_enabled) {
          console.log('[BackgroundLocation] Offline özelliği aktif değil, cache atlandı');
          return;
        }
        
        // Kullanıcının offline_radius_km değerini kullan (varsayılan 20 km)
        const radiusKm = userData.offline_radius_km || 20;
        
        // Bölgeyi offline kullanım için cache'le
        await precacheRegionWithRadius(latitude, longitude, radiusKm);
        console.log(`[BackgroundLocation] Bölge cache'lendi: ${latitude}, ${longitude} (${radiusKm} km)`);
      } catch (error) {
        console.error('[BackgroundLocation] Cache hatası:', error);
      }
    }
  }
});
```

**Background Location Başlatma:**
```typescript
// MapScreen useEffect içinde
await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 30 * 60 * 1000,         // 30 dakika (pil dostu)
  distanceInterval: 5000,                // 5 km (anlamlı hareket)
  deferredUpdatesInterval: 30 * 60 * 1000, // Güncellemeleri 30 dakika biriktir
  foregroundService: {
    notificationTitle: 'Kamp Defterim',
    notificationBody: 'Offline harita senkronizasyonu için konum izleniyor',
    notificationColor: '#059669',
  },
  pausesUpdatesAutomatically: true,     // Hareket etmediğinde otomatik duraklat
  showsBackgroundLocationIndicator: false,
});
```

**Amaç:**
- Uygulama kapalıyken bile konum alıp harita tile'ları cache'leme
- Offline Mode için veri senkronizasyonu
- Premium kullanıcılar için otomatik harita güncelleme
- **Pil Dostu:** 30 dakika veya 5 km hareket olduğunda tetiklenir
- **Foreground Service:** Android bildiriminde kullanıcıya gösterilir

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

| İzin | Normal Kullanıcı | Premium/Offline | Gerekli Mü | Kullanım Amacı |
|------|---|---|---|---|
| **ACCESS_FINE_LOCATION** | Opsiyonel | Gerekli | Harita görüntüleme | GPS ile hassas konum alma |
| **ACCESS_COARSE_LOCATION** | Opsiyonel | Gerekli | Konum tahmini | Network tabanlı kaba konum |
| **ACCESS_BACKGROUND_LOCATION** | ❌ Kullanılmaz | Gerekli | Offline cache | Uygulama kapalıyken konum takibi |
| **FOREGROUND_SERVICE** | ❌ Kullanılmaz | Gerekli | Bildirim | Android bildirim gösterimi |
| **FOREGROUND_SERVICE_LOCATION** | ❌ Kullanılmaz | Gerekli | Arka plan servisi | Background location service |

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

| Fonksiyon | Amaç | Çağrıldığı Yerler | İzin Gereksinimi |
|-----------|------|------|------|
| `getForegroundPermissionsAsync()` | Foreground izni durumunu kontrol | Modal, Profile, useCampingAreas, index.tsx | - |
| `requestForegroundPermissionsAsync()` | Foreground izni iste | Modal, Profile | ACCESS_FINE_LOCATION<br>ACCESS_COARSE_LOCATION |
| `getBackgroundPermissionsAsync()` | Background izni durumunu kontrol | Modal, Profile, checkLocationPermissionsForPremium | - |
| `requestBackgroundPermissionsAsync()` | Background izni iste (Premium) | Modal, Profile | ACCESS_BACKGROUND_LOCATION |
| `watchPositionAsync()` | Realtime konum takibi başlat | useCampingAreas | Foreground izni |
| `getCurrentPositionAsync()` | Tek seferlik konum al | useCampingAreas, index.tsx (çoklu kullanım) | Foreground izni |
| `startLocationUpdatesAsync()` | Arka plan konum güncellemesi başlat | index.tsx (MapScreen) | Background izni<br>FOREGROUND_SERVICE |
| `stopLocationUpdatesAsync()` | Arka plan konum güncellemesini durdur | index.tsx unmount | - |

---

## 📍 Konum Kullanımı - Detaylı Dosya Analizi

### **app/(tabs)/index.tsx** (Ana Harita Ekranı)
**Konum Kullanım Sayısı:** 7+ farklı nokta

1. **Background Task Tanımı** (Line 88)
   - `TaskManager.defineTask()` ile arka plan görevi
   - `precacheRegionWithRadius()` ile harita cache
   
2. **İzin Kontrolü ve Background Task Başlatma** (Line 995-1027)
   - `TaskManager.isTaskRegisteredAsync()` kontrol
   - `Location.startLocationUpdatesAsync()` başlatma
   - Foreground service bildirimi
   
3. **LocationPermission Event Handler** (Line 373)
   - `Location.getCurrentPositionAsync()` ile güncel konum
   - Harita merkezini güncelleme
   
4. **"Beni Bul" Butonu** (Line 492, 601)
   - `Location.getCurrentPositionAsync()` ile konum al
   - Haritayı kullanıcı konumuna odakla
   
5. **Yakınımdaki Yerler** (Line 824)
   - `Location.getCurrentPositionAsync()` ile mesafe hesaplama
   
6. **Yeni Kamp Alanı Eklerken** (Line 923, 1353)
   - `Location.getCurrentPositionAsync()` ile mevcut konumu al
   - Marker ekleme için koordinat
   
7. **Offline Harita Cache** (Line 1672)
   - `precacheRegionWithRadius()` manuel cache tetikleme

### **hooks/useCampingAreas.ts** (Konum Hook'u)
**Konum Kullanım Sayısı:** 3 farklı nokta

1. **Otomatik Konum Takibi** (Line 55)
   ```typescript
   locationSubscription = await Location.watchPositionAsync(
     {
       accuracy: Location.Accuracy.Balanced,
       distanceInterval: 100,      // 100m hareket → güncelle
       timeInterval: 30000,         // 30 saniye arası kontrol
     },
     (newLocation) => {
       setLocation(newLocation);   // State güncelle
     }
   );
   ```

2. **İzin Durumu Kontrolü** (Line 53)
   - `Location.getForegroundPermissionsAsync()` ile izin check
   - İzin varsa `watchPositionAsync` başlat

3. **Manuel Konum Alma** (Line 124)
   - `Location.getCurrentPositionAsync()` ile tek seferlik konum
   - İzin yoksa varsayılan konum (Ankara: 39.9251, 32.8375)

### **components/LocationPermissionModal.tsx** (İzin Modalı)
**Konum Kullanım Sayısı:** 4 farklı nokta

1. **AppState Kontrolü** (Line 63, 68)
   - Uygulama ön plana gelince izin kontrol
   - `getForegroundPermissionsAsync()` ve `getBackgroundPermissionsAsync()`

2. **Foreground İzin İsteme** (Line 117)
   - `requestForegroundPermissionsAsync()` ile izin iste
   - EventBus ile bildirim gönder

3. **Background İzin İsteme - Premium** (Line 132)
   - `requestBackgroundPermissionsAsync()` ile arka plan izni
   - Sadece `isPremium = true` ise

4. **İzin Reddedilirse** (Line 111)
   - `canAskAgain = false` → Sistem ayarlarına yönlendir
   - `Linking.openSettings()` çağrısı

### **app/(tabs)/profile.tsx** (Profil - Manuel Ayarlar)
**Konum Kullanım Sayısı:** 2 farklı nokta

1. **İzin Durumu Yenile** (Line 595)
   - `Location.getForegroundPermissionsAsync()`
   - `Location.getBackgroundPermissionsAsync()`
   - State güncellemeleri

2. **Manuel İzin İsteme** (Line 629)
   - `requestForegroundPermissionsAsync()` ile ön plan
   - `requestBackgroundPermissionsAsync()` ile arka plan
   - Kullanıcı tarafından tetiklenen akış

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

**Proje Android ve iOS'ta konum izinlerini şu şekilde yönetir:**

### 🎯 **İzin Kullanım Stratejisi**

#### **Normal Kullanıcı (offline_enabled = false)**
1. ✅ **Foreground İzni:** İsteğe bağlı
   - Harita kullanımı için önerilir
   - İzin verilmezse varsayılan konum: Ankara (39.9251, 32.8375)
   - Kamp alanlarını görebilir ama mesafe hesaplanamaz

2. ❌ **Background İzni:** Talep edilmez
   - Arka plan konum takibi yok
   - TaskManager background task çalışmaz
   - Offline cache yapılmaz

#### **Premium Kullanıcı (offline_enabled = true)**
1. ✅ **Foreground İzni:** **ZORUNLU**
   - Harita ve yakınlık özellikleri için gerekli
   - İzin verilmezse offline özellikler çalışmaz

2. ✅ **Background İzni:** **ZORUNLU**
   - Offline Mode için kritik
   - Uygulama kapalıyken harita cache
   - TaskManager ile 30 dakika/5km aralıklarla konum alır
   - Foreground Service bildirimi gösterilir

### 📊 **İzin Kullanım İstatistikleri**

| Dosya | Konum API Kullanımı | Kritik mi? |
|-------|---------------------|-----------|
| `app/(tabs)/index.tsx` | 7+ farklı nokta | ⭐ En yoğun |
| `hooks/useCampingAreas.ts` | 3 farklı nokta | ⭐ Otomatik takip |
| `components/LocationPermissionModal.tsx` | 4 farklı nokta | ⭐ İzin yönetimi |
| `app/(tabs)/profile.tsx` | 2 farklı nokta | Manuel kontrol |
| `lib/checkLocationPermissionsForPremium.ts` | 2 farklı nokta | Premium kontrol |

### 🔄 **İzin Akış Döngüsü**

```
📱 Uygulama İlk Açılış
    ↓
🔍 LocationPermissionModal Göster
    ↓
👤 Kullanıcı "Konum İzni Ver" Tıklar
    ↓
📍 requestForegroundPermissionsAsync()
    ├─ ACCESS_FINE_LOCATION
    └─ ACCESS_COARSE_LOCATION
    ↓
✅ Foreground İzni Verildi
    ↓
🔔 eventBus.emit('locationPermissionGranted')
    ↓
🗺️ watchPositionAsync() Başlar (Realtime takip)
    ↓
⭐ Premium Kullanıcı mı?
    ├─ YES → requestBackgroundPermissionsAsync()
    │         ├─ ACCESS_BACKGROUND_LOCATION
    │         ├─ FOREGROUND_SERVICE
    │         └─ FOREGROUND_SERVICE_LOCATION
    │         ↓
    │    ✅ Background İzni Verildi
    │         ↓
    │    🔄 TaskManager Background Task Başlar
    │         ├─ 30 dakikada bir konum al
    │         ├─ 5 km hareket olduğunda konum al
    │         └─ precacheRegionWithRadius() ile harita cache
    │
    └─ NO → Modal Kapat, Sadece Foreground Kullan
```

### 🎯 **Kullanım Senaryoları**

#### **Senaryo 1: Normal Kullanıcı - Harita Gezinme**
```typescript
// İzin durumu: Foreground = granted, Background = yok
// Kullanıcı haritada "Beni Bul" butonuna tıklar
const location = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.Balanced
});
// Harita kullanıcı konumuna odaklanır
map.setView([location.coords.latitude, location.coords.longitude], 13);
```

#### **Senaryo 2: Premium Kullanıcı - Offline Mode Aktif**
```typescript
// İzin durumu: Foreground = granted, Background = granted
// Kullanıcı araba ile seyahat ediyor, uygulama kapalı
// TaskManager her 30 dakikada bir konum alıyor:
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data }) => {
  const { locations } = data;
  const { latitude, longitude } = locations[0].coords;
  
  // Kullanıcının offline_radius_km değeri: 20 km
  await precacheRegionWithRadius(latitude, longitude, 20);
  // → 20 km'lik bölgenin harita tile'ları cache'lendi
});
```

#### **Senaryo 3: İzin Reddedildi - Varsayılan Konum**
```typescript
// İzin durumu: Foreground = denied
// useCampingAreas hook'u çalışıyor:
const { status } = await Location.getForegroundPermissionsAsync();
if (status !== 'granted') {
  // Varsayılan konum: Ankara - Anıtkabir
  const defaultLocation = {
    coords: {
      latitude: 39.9251,
      longitude: 32.8375
    }
  };
  setLocation(defaultLocation);
  // Kullanıcı Türkiye genelinde kamp alanlarını görebilir
  // ancak "yakınımdaki" veya mesafe hesaplamaları çalışmaz
}
```

#### **Senaryo 4: Premium Kullanıcı - Manuel Cache Tetikleme**
```typescript
// Kullanıcı profil sayfasından "Offline Harita İndir" tıklar
// İzin durumu: Foreground = granted, Background = granted
const result = await precacheRegionWithRadius(
  userLocation.latitude,
  userLocation.longitude,
  userData.offline_radius_km  // Örnek: 50 km
);
// → 50 km çaplı bölgenin tüm zoom seviyelerinde harita tile'ları indirilir
// → Kullanıcı internet olmadan haritayı görebilir
```

### 🔐 **Güvenlik ve Gizlilik**

1. **Konum Verisi Saklama:** 
   - Konum verileri **sadece harita cache için** kullanılır
   - Kullanıcı konumu backend'e gönderilmez
   - SQLite'da sadece harita tile'ları saklanır

2. **Background Tracking Şeffaflığı:**
   - Android bildiriminde açıkça belirtilir: "Offline harita senkronizasyonu için konum izleniyor"
   - Kullanıcı bildirimden hizmeti durdurabilir

3. **İzin İptali:**
   - Kullanıcı sistem ayarlarından izni iptal ederse:
     - Foreground tracking otomatik durur
     - Background task otomatik durdurulur
     - Varsayılan konuma geçilir

### 📱 **Platform Uyumluluğu**

| Özellik | Android | iOS | Web |
|---------|---------|-----|-----|
| Foreground Location | ✅ | ✅ | ✅ (Tarayıcı API) |
| Background Location | ✅ | ✅ | ❌ |
| Foreground Service | ✅ | ❌ | ❌ |
| TaskManager | ✅ | ✅ | ❌ |
| watchPositionAsync | ✅ | ✅ | ✅ (Geolocation API) |

### 🔧 **Teknik Detaylar**

#### **Konum Doğruluğu Seviyeleri**
```typescript
// Farklı kullanım alanlarında farklı doğruluk seviyeleri:

// 1. Arka plan takibi (pil dostu)
Location.Accuracy.Balanced

// 2. "Beni Bul" butonu (hassas)
Location.Accuracy.Balanced

// 3. Yeni alan eklerken (en hassas)
Location.Accuracy.High  // Bazı yerlerde varsayılan
```

#### **Konum Güncelleme Aralıkları**
```typescript
// watchPositionAsync (Foreground - Realtime)
{
  distanceInterval: 100,      // 100 metre hareket → güncelle
  timeInterval: 30000          // 30 saniye arası kontrol
}

// startLocationUpdatesAsync (Background - Pil Dostu)
{
  distanceInterval: 5000,              // 5 km hareket → güncelle
  timeInterval: 30 * 60 * 1000,        // 30 dakika arası
  deferredUpdatesInterval: 30 * 60 * 1000  // Güncellemeleri biriktir
}
```

---

## 🎉 Sonuç

**Kamp Defterim projesi konum izinlerini akıllıca kullanır:**

- ✅ **Kullanıcı dostu:** İzin talep edilmeden önce açıklama gösterilir
- ✅ **Katmanlı izin stratejisi:** Normal ve Premium kullanıcılar için farklı akışlar
- ✅ **Pil dostu:** Background tracking 30 dk/5 km aralıklarla çalışır
- ✅ **Offline-first:** Premium kullanıcılar için arka planda otomatik harita cache
- ✅ **Gizlilik odaklı:** Konum verisi sadece cache için kullanılır, sunucuya gönderilmez
- ✅ **Hata toleranslı:** İzin verilmezse varsayılan konum ile çalışmaya devam eder

**Toplam Konum API Kullanımı:** 18+ farklı nokta
**Kritik Dosyalar:** 5 dosya
**İzin Türleri:** 5 farklı Android izni
