# Offline Mod Test Rehberi

## 🚀 Hızlı Test Kurulumu

### 1. Backend Hazırlığı (Supabase SQL Editor)

```sql
-- users tablosuna field'ları ekle
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS offline_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS offline_radius_km INTEGER DEFAULT 20;

-- Mevcut kullanıcınızı bulup test edin
SELECT id, email, role, offline_enabled, offline_radius_km FROM users WHERE email = 'YOUR_EMAIL';

-- Test senaryoları için veri oluştur
UPDATE users SET offline_enabled = false WHERE email = 'YOUR_EMAIL'; -- Test 1
UPDATE users SET offline_enabled = true, offline_radius_km = 10 WHERE email = 'YOUR_EMAIL'; -- Test 2
UPDATE users SET offline_enabled = true, offline_radius_km = 50 WHERE email = 'YOUR_EMAIL'; -- Test 3
```

---

## 🧪 Test Senaryoları

### Senaryo 1: Offline Özelliği Kapalı (offline_enabled = false)

**Beklenen Davranış:**
- ❌ Arka plan konum izleme başlamaz
- ❌ Tile'lar cache'lenmez
- ❌ Offline modda harita boş görünür

**Test Adımları:**
1. Database'de `offline_enabled = false` yapın
2. Uygulamayı yeniden başlatın
3. Metro bundler console'da şu log'ları arayın:
   ```
   [BackgroundLocation] Kullanıcı offline özelliğine sahip değil
   [MapTileCache] Kullanıcı offline özelliğine sahip değil, cache atlandı
   ```
4. Profil > Cache Temizle butonuna basın
5. Airplane mode açın (offline)
6. Haritada gezinin - boş/placeholder tile'lar göreceksiniz

---

### Senaryo 2: Offline Özelliği Açık, Küçük Radius (offline_radius_km = 10)

**Beklenen Davranış:**
- ✅ Arka plan konum izleme başlar
- ✅ 10 km çapında tile'lar cache'lenir
- ✅ Offline modda sadece 10 km'lik alan çalışır

**Test Adımları:**
1. Database'de: `offline_enabled = true, offline_radius_km = 10`
2. Uygulamayı yeniden başlatın
3. Console log:
   ```
   [BackgroundLocation] Offline özelliği aktif (10 km)
   [MapTileCache] 150 harita tile'ı 10 km çapında cache'lendi
   ```
4. Airplane mode açın
5. Mevcut konumunuz çevresinde gezin - çalışır ✅
6. 10 km dışına zoom/pan yapın - placeholder tile'lar ❌

---

### Senaryo 3: Offline Özelliği Açık, Büyük Radius (offline_radius_km = 50)

**Beklenen Davranış:**
- ✅ Arka plan konum izleme başlar
- ✅ 50 km çapında geniş alan cache'lenir
- ⚠️ Daha fazla tile, daha uzun süre (dikkat!)

**Test Adımları:**
1. Database'de: `offline_enabled = true, offline_radius_km = 50`
2. Uygulamayı yeniden başlatın
3. Console log:
   ```
   [BackgroundLocation] Offline özelliği aktif (50 km)
   [MapTileCache] 1200+ harita tile'ı 50 km çapında cache'lendi
   ```
4. Cache işlemi 2-5 dakika sürebilir
5. Profil > Cache İstatistikleri kontrol edin
6. Offline modda 50 km çapında gezinebilirsiniz

---

## ⚡ Hızlı Test İçin Geçici Kod Değişiklikleri

### 1. Arka Plan İzleme Süresini Kısaltın (10 dakika → 30 saniye)

`app/(tabs)/index.tsx` - Satır ~605:

```typescript
// ÖNCE:
timeInterval: 10 * 60 * 1000, // 10 dakika

// SONRA (sadece test için):
timeInterval: 30 * 1000, // 30 saniye - TEST MODE
```

### 2. Debug Log'ları Açın

`app/(tabs)/index.tsx` - En üste ekleyin:

```typescript
const __DEV__ = true; // Her zaman debug mode
```

### 3. Cache İstatistiklerini Görmek

Console'da şunu arayın:
```javascript
[MapTileCache]
```

---

## 📊 Test Sonuçlarını Doğrulama

### Console Log Kontrol Listesi

✅ **Offline Kapalı:**
```
[BackgroundLocation] Kullanıcı offline özelliğine sahip değil
[MapTileCache] Kullanıcı offline özelliğine sahip değil, cache atlandı
```

✅ **Offline Açık (20 km):**
```
[BackgroundLocation] Offline özelliği aktif (20 km)
[BackgroundLocation] Konum alındı: 41.0082, 28.9784
[BackgroundLocation] Bölge cache'lendi: 41.0082, 28.9784 (20 km)
[MapTileCache] 450 harita tile'ı 20 km çapında cache'lendi
```

✅ **Offline Açık (50 km):**
```
[BackgroundLocation] Offline özelliği aktif (50 km)
[MapTileCache] 1350 harita tile'ı 50 km çapında cache'lendi
```

### Cache Dosyalarını Kontrol

Android cihazda:
```bash
adb shell
cd /data/data/com.spondylus.boltexponativewind/files/map_tiles/
ls -la
# Tile dosyalarını göreceksiniz: 13_4702_3122.png, vb.
```

---

## 🐛 Sorun Giderme

### Problem: "offline_enabled" field bulunamıyor hatası

**Çözüm:**
```sql
-- Database'de field'ın olup olmadığını kontrol edin
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name LIKE 'offline%';

-- Yoksa ekleyin
ALTER TABLE users ADD COLUMN offline_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN offline_radius_km INTEGER DEFAULT 20;
```

### Problem: Cache hiç başlamıyor

**Kontrol Listesi:**
1. ✅ Token var mı? → `await getToken()` null dönüyorsa giriş yapın
2. ✅ `user.offline_enabled = true` mu? → Database kontrol
3. ✅ Konum izni var mı? → Settings > Apps > Kamp Defterim > Permissions
4. ✅ Network var mı? → Online olmadan cache yapılamaz

### Problem: Sadece bazı bölgeler cache'leniyor

**Beklenen Davranış:**
- Cache sadece **mevcut konumunuz** etrafında yapılır
- Haritada farklı bir yere zoom yaparsanız o bölge cache'lenmez
- Sadece fiziksel olarak gittiğiniz yerler cache'lenir

---

## 📱 Cihazda Manuel Test

### Android Test Modu:

1. Developer Options'ı açın
2. "Mock Location" aktif edin
3. Konum simülasyonu uygulaması kullanın
4. Farklı lokasyonlara "teleport" olun
5. Her değişiklikte cache'in çalıştığını kontrol edin

### Airplane Mode Testi:

1. Önce online modda gezinin (cache oluşsun)
2. Settings > Airplane Mode ON
3. Uygulamaya dönün
4. Offline indicator görmeli ve cached bölgelerde gezinebilmelisiniz

---

## 🎯 Başarı Kriterleri

| Test | Beklenen | Gerçek | Durum |
|------|----------|--------|-------|
| offline_enabled=false → cache yok | ❌ Cache | [ ] | [ ] |
| offline_enabled=true → cache var | ✅ Cache | [ ] | [ ] |
| 10 km radius → küçük alan | ~150 tile | [ ] | [ ] |
| 50 km radius → geniş alan | ~1350 tile | [ ] | [ ] |
| Offline modda cached tile'lar görünüyor | ✅ Çalışır | [ ] | [ ] |
| Offline modda cache dışı bölge | ❌ Placeholder | [ ] | [ ] |

---

## 📝 Test Raporu Şablonu

```
Test Tarihi: 2026-01-14
Kullanıcı: test@example.com
Cihaz: [Android/iOS]

Senaryo 1 (Offline Kapalı):
- Database ayarı: offline_enabled = false ✅
- Console log: "sahip değil" mesajı görüldü ✅
- Offline modda harita: Boş/Placeholder ✅
- SONUÇ: BAŞARILI

Senaryo 2 (10 km):
- Database ayarı: offline_enabled = true, radius = 10 ✅
- Cache tile sayısı: 148 tile ✅
- Offline gezinme: 10 km içinde çalışır ✅
- SONUÇ: BAŞARILI

Senaryo 3 (50 km):
- Database ayarı: radius = 50 ✅
- Cache tile sayısı: 1322 tile ✅
- Cache süresi: 4 dakika 12 saniye ✅
- SONUÇ: BAŞARILI
```

---

## 🔄 Test Sonrası Temizlik

```sql
-- Gerçek değerlere geri dönün
UPDATE users SET 
  offline_enabled = CASE 
    WHEN role IN ('admin', 'superadmin') THEN true 
    ELSE false 
  END,
  offline_radius_km = CASE
    WHEN role = 'superadmin' THEN 50
    WHEN role = 'admin' THEN 30
    ELSE 20
  END;
```

Cache'i temizleyin:
- Profil > Harita Cache Temizle

Kodu eski haline çevirin:
```typescript
timeInterval: 10 * 60 * 1000, // 10 dakikaya geri al
```
