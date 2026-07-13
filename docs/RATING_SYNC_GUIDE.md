# Yorum Değerlendirmesi Senkronizasyon Rehberi

## Genel Bakış

Yorum değerlendirmesi (rating) senkronizasyon sistemi, kullanıcıların offline olduğunda bile yorum ekleyip, güncelleyip veya silebilmesini sağlar. Tüm işlemler pending_changes kuyruğuna eklenir ve online olunduğunda otomatik olarak senkronize edilir.

## Özellikler

- ✅ Offline-first yaklaşım: Kullanıcı offline olsa bile yorum işlemleri yapılabilir
- ✅ Otomatik senkronizasyon: Online olunduğunda pending değişiklikler sunucuya gönderilir
- ✅ Local database güncellemesi: Başarılı işlemler sonrası rating ve review_count otomatik güncellenir
- ✅ **AI Review Entegrasyonu**: Yorum değişikliklerinde AI değerlendirmesi otomatik tetiklenir
- ✅ Hata yönetimi: API hataları durumunda işlemler pending kuyruğuna eklenir

## Yeni Eklenen Fonksiyonlar

### 1. syncRatings()
Rating değişikliklerini senkronize eder. syncAll() içinde otomatik olarak çağrılır.

```typescript
import { syncRatings } from '@/lib/syncManager';

// Manuel senkronizasyon
await syncRatings();
```

### 2. Offline-Aware Rating Fonksiyonları

#### postRatingOffline()
Yeni bir yorum ekler (offline veya online).

```typescript
import { postRatingOffline } from '@/lib/ratingApi';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const { isConnected } = useNetworkStatus();

try {
  const result = await postRatingOffline(
    campgroundId,
    {
      rating: 4.5,
      comment: 'Harika bir kamp alanı!',
      anon_name: undefined, // İsteğe bağlı
      hide_user: false
    },
    isConnected
  );
  
  if (result.pending) {
    console.log('Yorum offline olarak kaydedildi, online olunca senkronize edilecek');
  } else {
    console.log('Yorum başarıyla eklendi');
  }
} catch (error) {
  console.error('Yorum eklenirken hata:', error);
}
```

#### patchRatingOffline()
Mevcut yorumu günceller.

```typescript
import { patchRatingOffline } from '@/lib/ratingApi';

try {
  const result = await patchRatingOffline(
    campgroundId,
    ratingId,
    {
      rating: 5,
      comment: 'Güncellenmiş yorum'
    },
    isConnected
  );
} catch (error) {
  console.error('Yorum güncellenirken hata:', error);
}
```

#### deleteMyRatingOffline()
Kullanıcının yorumunu siler.

```typescript
import { deleteMyRatingOffline } from '@/lib/ratingApi';

try {
  const result = await deleteMyRatingOffline(campgroundId, isConnected);
  
  if (result.pending) {
    console.log('Silme işlemi offline olarak kaydedildi');
  }
} catch (error) {
  console.error('Yorum silinirken hata:', error);
}
```

## Senkronizasyon Akışı

1. **Kullanıcı İşlemi**: Kullanıcı yorum ekler/günceller/siler
2. **Online Kontrol**: 
   - Online ise → API'ya direkt gönderilir
   - Offline ise → pending_changes tablosuna eklenir
3. **Otomatik Senkronizasyon**: syncAll() çağrıldığında:
   - Pending rating değişiklikleri sunucuya gönderilir
   - Her işlem sonrası rating summary API'den çekilir
   - Local database (camping_areas tablosu) güncellenir
   - **🤖 AI Review Tetiklenir**: Yorumları değişen kamp alanları için AI evaluation başlatılır
   - **🤖 AI Sonuçları Kaydedilir**: AI review evaluation ve updated_fields local database'e yazılır
4. **Kullanıcı Bildirimi**: İşlem sonucu kullanıcıya bildirilir

### AI Review Evaluation Akışı

Rating senkronizasyonu tamamlandıktan sonra:

1. Yorumları değişen kamp alanları belirlenir (Set yapısı ile)
2. Her kamp alanı için `evaluateCampingAreaReviews()` çağrılır
3. AI review başarılı olursa:
  - `ai_review_evaluation`: AI'nın ürettiği değerlendirme metni. Bu metin kısa bir özet paragrafı ve ayrı başlıklar halinde "Artılar:" ile "Eksiler:" bölümünü içerir (her biri madde listesi şeklinde).
  - `ai_review_generated_at`: Değerlendirme zamanı
  - `updated_fields`: AI'nın tespit ettiği güncel bilgiler (rating, facilities, price_range, vb.)
4. Sonuçlar local database'e kaydedilir
5. AI review hataları senkronizasyonu engellemez (sadece uyarı loglanır)
6. Cooldown durumunda (6 ay) AI review atlanır

⚠️ **Google Places API Kısıtlaması**: Backend, Google Places API'den maksimum 5 örnek yorum alır (API kısıtlaması). Ancak `user_ratings_total` ile toplam yorum sayısı alınır ve AI değerlendirmesine dahil edilir. AI, bu 5 örnek yorumu analiz eder ve toplam yorum sayısını da dikkate alarak değerlendirme üretir.

⚠️ **Delta Sync için Kritik**: Backend'de AI değerlendirmesi yapılırken mutlaka `updated_at = NOW()` alanı güncellenmelidir. Aksi takdirde client tarafındaki delta sync (`fetchAndStoreCampingAreasFromAPI` ile `updated_after` parametresi) yeni değerlendirmeyi alamaz ve detay sayfasında güncel bilgiler gösterilmez.

**Not**: AI review evaluation 6 aylık cooldown periyoduna sahiptir. Bu süre dolmadan aynı kamp alanı için tekrar AI review yapılmaz (superadmin force parametresi hariç).

Ek davranış: Yorum sayısı az olduğu için sunucu generic bir bilgilendirme döndürürse veya local review sayısı düşükse, uygulama önce `force=true` ile tekrar değerlendirme isteyecektir. Eğer bu da anlamlı bir değerlendirme döndürmezse, uygulama değerlendirme metnini kaydeder ve sonuna şu notu ekler:

`Not: Bu kamp alanı için yalnızca X kullanıcı yorumu bulunduğu için değerlendirme sınırlı olabilir.`

Bu sayede az yorum olsa bile kullanıcıya bir değerlendirme gösterilir ve aynı zamanda yorum sayısının az olduğu açıkça belirtilmiş olur.

## Pending Changes Tipleri

Rating işlemleri için üç pending change tipi vardır:

- `rating_create`: Yeni yorum ekleme
- `rating_update`: Mevcut yorum güncelleme
- `rating_delete`: Yorum silme

## Database Şeması

Rating bilgileri `camping_areas` tablosunda aggregate olarak saklanır:

```sql
CREATE TABLE camping_areas (
  ...
  rating REAL DEFAULT 0.0,                -- Ortalama puan
  review_count INTEGER DEFAULT 0,          -- Toplam yorum sayısı
  ai_review_evaluation TEXT,               -- AI değerlendirme metni
  ai_review_generated_at TEXT,             -- AI değerlendirme zamanı
  ai_review_enabled INTEGER DEFAULT 1,     -- AI review aktif mi
  ...
);
```

AI review evaluation alanları yorum değişikliklerinde otomatik olarak güncellenir.

## Örnek Kullanım Senaryoları

### Senaryo 1: Offline Yorum Ekleme

```typescript
// 1. Kullanıcı offline modda yorum ekler
const result = await postRatingOffline(123, { rating: 5, comment: 'Harika!' }, false);
// → pending_changes'a eklenir

// 2. Kullanıcı online olur
// 3. syncAll() otomatik çağrılır (app açılışında veya periyodik olarak)
await syncAll({ userId: currentUserId });

// 4. Pending rating sunucuya gönderilir
// 5. Rating summary API'den çekilir
// 6. Local database güncellenir
// 7. 🤖 AI review evaluation tetiklenir
// 8. 🤖 AI sonuçları local database'e kaydedilir
```

### Senaryo 2: API Hatası Durumu

```typescript
try {
  // Online ama API hatası veriyor
  await postRatingOffline(123, { rating: 5 }, true);
} catch (error) {
  // Hata yakalaması → pending_changes'a otomatik eklenir
  console.log('API hatası, offline kuyruğa eklendi');
}

// Sonraki sync'te tekrar denenecek
```

### Senaryo 3: AI Review Güncellenmesi

```typescript
// 1. Kullanıcı yorum ekler (online)
await postRatingOffline(123, { 
  rating: 4.5, 
  comment: 'Harika tesisler!' 
}, true);

// 2. Rating başarıyla kaydedilir
// 3. AI review otomatik tetiklenir
// 4. AI, yorumları analiz eder:
//    - Facilities: ["Wi-Fi", "Elektrik", "Duş"]
//    - Price range: "$$"
//    - AI değerlendirme metni oluşturulur

// 5. Sonuçlar local database'e yazılır:
const area = await db.getCampingAreaById(123);
console.log(area.ai_review_evaluation); 
// → "Bu kamp alanı harika tesislere sahip..."
console.log(area.ai_review_generated_at);
// → "2026-07-09T12:34:56Z"
console.log(area.facilities);
// → ["Wi-Fi", "Elektrik", "Duş"] (AI tarafından güncellenmiş)

// 6. Cooldown başlar (6 ay boyunca tekrar AI review yapılmaz)
```

## Integration Önerileri

### React Component'te Kullanım

```typescript
import { useState } from 'react';
import { postRatingOffline } from '@/lib/ratingApi';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

function RatingForm({ campgroundId }) {
  const { isConnected } = useNetworkStatus();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleSubmit = async () => {
    try {
      const result = await postRatingOffline(
        campgroundId,
        { rating, comment },
        isConnected
      );

      if (result.pending) {
        Alert.alert(
          'Offline Mod',
          'Yorumunuz kaydedildi ve online olduğunuzda sunucuya gönderilecek.'
        );
      } else {
        Alert.alert('Başarılı', 'Yorumunuz eklendi!');
      }
    } catch (error) {
      Alert.alert('Hata', 'Yorum eklenirken bir hata oluştu.');
    }
  };

  return (
    // ... form UI
  );
}
```

### Uygulama Başlatımında Senkronizasyon

```typescript
// app/_layout.tsx veya ana component
import { useEffect } from 'react';
import { syncAll } from '@/lib/syncManager';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

function AppRoot() {
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    if (isConnected) {
      // Online olunca otomatik senkronize et
      syncAll({ userId: currentUserId });
    }
  }, [isConnected]);

  // ... rest of app
}
```

## Gelişmiş Özellikler

### Periyodik Senkronizasyon

```typescript
import { syncRatings } from '@/lib/syncManager';

// Her 5 dakikada bir rating'leri senkronize et
const ratingSyncInterval = setInterval(async () => {
  if (isConnected) {
    await syncRatings();
  }
}, 5 * 60 * 1000);

// Cleanup
clearInterval(ratingSyncInterval);
```

### Progress Tracking

```typescript
import { syncAll } from '@/lib/syncManager';

await syncAll({
  userId: currentUserId,
  onProgress: (current, total) => {
    console.log(`Senkronizasyon: ${current}/${total}`);
    // Progress bar güncellemesi
  }
});
```

## Troubleshooting

### Problem: Yorumlar senkronize edilmiyor
**Çözüm**: 
- syncAll() fonksiyonunun çağrıldığından emin olun
- pending_changes tablosunda rating kayıtlarını kontrol edin
- Network bağlantısını kontrol edin

### Problem: Duplicate rating ekleniyor
**Çözüm**:
- Offline modda aynı işlemi birden fazla kez yapmayın
- pending_changes'da aynı işlem için birden fazla kayıt olup olmadığını kontrol edin

### Problem: AI review güncellenmiyor
**Çözüm**:
- Cooldown periyodunu kontrol edin (6 ay)
- AI review için yeterli yorum olup olmadığını kontrol edin
- Backend log'larında AI review API hatalarını kontrol edin
- `ai_review_enabled` alanının `true` olduğundan emin olun

### Problem: AI review hata veriyor ama senkronizasyon devam ediyor
**Durum**: Bu beklenen davranıştır!
- AI review hataları senkronizasyonu engellemez
- Rating'ler yine de başarıyla kaydedilir
- AI review sadece uyarı olarak loglanır
- Sonraki sync'te tekrar denenecektir

### Debug Modu

Development modunda detaylı log'lar otomatik olarak yazılır:

```javascript
if (__DEV__) console.log('[syncRatings] ✅ Rating değişikliği senkronize edildi');
if (__DEV__) console.log('[syncRatings] 🤖 AI review tetikleniyor: 3 kamp alanı');
if (__DEV__) console.log('[syncRatings] 🤖 AI review güncellendi: 123');
if (__DEV__) console.log('[syncRatings] ⏳ AI review cooldown: 456 (15552000s kaldı)');
```

## API Endpoints

Rating işlemleri için kullanılan backend endpoints:

- `GET /campgrounds/:id/ratings` - Rating listesi
- `POST /campgrounds/:id/ratings` - Yeni rating
- `PATCH /campgrounds/:id/ratings/:ratingId` - Rating güncelle
- `DELETE /campgrounds/:id/ratings/mine` - Kendi rating'ini sil
- `GET /campgrounds/:id/ratings/summary` - Rating özeti
- `POST /camping-areas/evaluate-reviews` - AI review evaluation tetikle (yorum değişikliklerinde otomatik)

## Sonuç

### AI review: Artılar / Eksiler gösterimi

```typescript
import { getParsedCampingAreaAIReview } from '@/lib/aiReviewApi';

const parsed = await getParsedCampingAreaAIReview(123);
if (parsed) {
  console.log(parsed.summary);
  console.log('Artılar:', parsed.pros);
  console.log('Eksiler:', parsed.cons);
}
```

Bu senkronizasyon sistemi ile:

- ✅ Kullanıcılar offline olsalar bile yorum işlemlerini yapabilir
- ✅ Online olduklarında tüm değişiklikler otomatik olarak senkronize edilir
- ✅ **AI review evaluation otomatik tetiklenir ve güncellenir**
- ✅ AI'nın tespit ettiği ek bilgiler (facilities, price_range, vb.) local database'e kaydedilir
- ✅ Sistem hata durumlarında da güvenli çalışır ve veri kaybını önler
- ✅ AI review cooldown mekanizması ile gereksiz API çağrıları önlenir

**Önemli Not**: AI review evaluation, yorum değişikliklerinde otomatik olarak tetiklenir ancak 6 aylık cooldown periyoduna tabidir. Bu süre dolmadan aynı kamp alanı için tekrar AI review yapılmaz.
