# 🏕️ Çadır Konumlandırma Modülü

## 📋 Genel Bakış

Çadır Konumlandırma modülü, kullanıcının bulunduğu konumda güneş pozisyonuna göre optimal çadır/karavan yönünü hesaplar ve AR benzeri kamera overlay ile yönlendirme yapar.

## 🎯 Özellikler

### ✅ Mevcut Özellikler (v1.0)

- **Güneş Pozisyonu Hesaplama**: Konum ve zamana göre gün doğumu, batımı ve güneş yolu
- **Optimal Yön Önerisi**: İki mod
  - 🌤️ **Gün Boyu Gölge**: Çadır içi serin kalır (yaz ayları için ideal)
  - ☀️ **Sabah Güneşi**: Sabah ısınma, öğleden sonra gölge (sonbahar/ilkbahar için ideal)
- **AR Kamera Yönlendirme**: Pusula sensörü ile gerçek zamanlı yön gösterimi
- **Görsel Pusula**: Güneş yolu ve optimal yönün görsel gösterimi
- **Gölge Analizi**: Sabah/öğleden sonra gölge durumu
- **Mevsimsel Ayarlama**: Yaz/kış güneş açısı otomatik ayarlanır

### 🔮 Gelecek Özellikler (Roadmap)

1. **Rüzgar Verisi Entegrasyonu**
   - OpenWeatherMap API ile rüzgar yönü ve hızı
   - Rüzgar korumalı konum önerileri

2. **Arazi Özellikleri**
   - Yakındaki ağaçlar/tepeler için gölge simülasyonu
   - Yükseklik verileri ile topografik analiz

3. **Zaman Çizelgesi**
   - Gün boyunca saatlik güneş pozisyonu animasyonu
   - Seçilen yön için saat bazlı gölge tahmini

4. **Sosyal Özellikler**
   - Başarılı kurulumları paylaşma
   - Kamp alanı notlarına optimal yön ekleme

## 🛠️ Teknik Mimari

### Dosya Yapısı

```
lib/
├── sunPosition.ts          # Güneş hesaplamaları (suncalc)
└── compassUtils.ts         # Pusula ve sensör yönetimi (expo-sensors)

app/(tabs)/
└── tent-setup.tsx          # Ana ekran

components/
├── TentOrientationCamera.tsx      # AR kamera overlay
└── OptimalDirectionIndicator.tsx  # Görsel pusula ve öneriler
```

### Kullanılan Paketler

- **suncalc**: Güneş pozisyonu hesaplamaları
- **@types/suncalc**: TypeScript tip tanımları
- **expo-sensors**: Magnetometre/pusula desteği
- **expo-location**: GPS koordinatları
- **expo-camera**: AR overlay için kamera

## 📱 Kullanım

### 1. Konum İzni

İlk açılışta konum izni istenir. İzin verilmezse modül çalışmaz.

### 2. Ana Ekran

- **Öncelik Seçimi**: Switch ile "Sabah Güneşi" veya "Gün Boyu Gölge" seçin
- **Güneş Zamanları**: O gün için doğum, öğle, batım saatleri
- **Optimal Yön**: Hesaplanan yön ve açıklama
- **Görsel Pusula**: Güneş yolu ve önerilen yön
- **Gölge Analizi**: Sabah/öğleden sonra gölge durumu

### 3. Kamera Modu

"Kamera ile Yönlendir" butonuna basın:

- **Pusula Göstergesi**: Sol üstte mevcut yön
- **Hedef Reticle**: Ekran ortasında hedef göstergesi
- **Yön Oku**: Hedefe yönlendiren ok (hizalandığında kaybolur)
- **İlerleme Çubuğu**: Hizalama skoru (0-100)
- **Açı Farkı**: "← Sola dön" / "Sağa dön →" yönlendirmesi
- **Değerlendirme**: Seçilen yönün skoru ve geri bildirimi

### 4. Hizalama

- Cihazı çadır giriş yönüne çevirin
- Yeşil hedef ikonu göründüğünde ✅ tam hizalı
- Skor 90+ olduğunda optimal konumdasınız

## 🧮 Algoritma Detayları

### Gün Boyu Gölge Modu

```
Optimal Yön = Kuzey (0°) + Mevsimsel Ayarlama
```

- **Yaz** (+15°): Güneş daha yüksek, çadır kuzeydoğuya
- **Kış** (-15°): Güneş daha alçak, çadır kuzeybatıya
- **İlkbahar/Sonbahar** (±5°): Hafif ayarlama

### Sabah Güneşi Modu

```
Optimal Yön = Doğu (90°) + Mevsimsel Ayarlama
```

- Çadır girişi doğuya bakar
- Sabah güneşinden faydalanır
- Öğleden sonra güneybatı yönünden gölge

### Magnetik Sapma (Declination)

Türkiye için manyetik sapma ~3-5° doğuya. Kod otomatik olarak longitude'a göre hesaplar:

```typescript
// Batı Türkiye: +3°
// Doğu Türkiye: +5°
const trueHeading = magneticHeading + declination;
```

### Pusula Smoothing

Magnetometre verileri gürültülü olabilir. Exponential moving average ile yumuşatılır:

```typescript
smoothedHeading = previousHeading + α * (newHeading - previousHeading);
```

α = 0.15-0.2 (düşük değer daha yumuşak)

## 🐛 Bilinen Sınırlamalar

1. **Magnetometre Gereksinimi**: Tüm cihazlarda mevcut olmayabilir
2. **Metal Girişim**: Cihazı metal objelerden uzak tutun
3. **Arazi Özellikleri**: Ağaçlar/tepeler hesaba katılmaz (manuel değerlendirme gerekir)
4. **Güney Yarımküre**: Algoritma Kuzey yarımküre için optimize edildi

## 🔧 Geliştirici Notları

### Yeni Özellik Ekleme

1. **Rüzgar Verisi Örneği**:

```typescript
// lib/weatherApi.ts
export async function getWindData(lat: number, lon: number) {
  const API_KEY = 'your_openweather_key';
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}`
  );
  const data = await response.json();
  return {
    speed: data.wind.speed,
    direction: data.wind.deg, // 0-360
  };
}
```

2. **Modülü Genişletme**:

Yeni hesaplama fonksiyonlarını `lib/sunPosition.ts` veya `lib/compassUtils.ts` içine ekleyin.

### Test Senaryoları

1. **Farklı Mevsimler**: Tarih değiştirerek test edin
2. **Farklı Enlemler**: Güney/kuzey Türkiye
3. **Offline Mod**: Konum cache'leme
4. **Metal Girişim**: Pusula doğruluk uyarısı

## 📊 Performans

- **İlk Yükleme**: ~1-2 saniye (konum izni + GPS)
- **Pusula Güncelleme**: 100ms (10 FPS)
- **Batarya Kullanımı**: Orta (magnetometre + kamera)

## 🤝 Katkıda Bulunma

Öneriler için:
1. Issue açın
2. Feature branch oluşturun
3. Pull request gönderin

## 📝 Lisans

Bu modül Kamp Defterim uygulamasının bir parçasıdır.

---

**Son Güncelleme**: 2026-07-08  
**Versiyon**: 1.0.0  
**Geliştirici**: Kamp Defterim Ekibi
