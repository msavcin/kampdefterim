# Backend Entegrasyon Rehberi - AI Review Evaluation

## 📋 Genel Bakış

AI Review Evaluation sistemi için backend'inize aşağıdaki endpoint'leri eklemeniz gerekiyor.

## 🚀 Hızlı Başlangıç

### 1. Gerekli Bağımlılıklar

```bash
npm install @google/maps
```

### 2. Environment Variables

`.env` dosyanıza ekleyin:

```env
GOOGLE_PLACES_API_KEY=your_google_api_key_here
```

### 3. Endpoint'leri Ekleyin

Backend projenizde yeni bir route dosyası oluşturun: `routes/aiReview.js`

## 📝 Gerekli Endpoint'ler

### Admin Settings Endpoint'leri

#### 1. GET /admin/settings
Tüm admin ayarlarını döndürür (superadmin only)

**Response:**
```json
{
  "settings": [
    {
      "key": "ai_review_daily_limit",
      "value": "100",
      "description": "Günlük maksimum AI değerlendirme sayısı"
    },
    {
      "key": "ai_review_enabled_global",
      "value": "true",
      "description": "Sistem genelinde AI değerlendirmesi aktif mi"
    },
    {
      "key": "ai_review_show_in_ui",
      "value": "true",
      "description": "UI'da AI değerlendirmesi gösterilsin mi"
    }
  ]
}
```

**SQL Query:**
```sql
SELECT key, value, description, updated_at, updated_by 
FROM admin_settings;
```

#### 2. PUT /admin/settings/:key
Tek bir ayarı günceller (superadmin only)

**Request Body:**
```json
{
  "value": "150"
}
```

**SQL Query:**
```sql
UPDATE admin_settings 
SET value = $1, updated_by = $2, updated_at = NOW() 
WHERE key = $3;
```

#### 3. GET /admin/ai-reviews/stats
AI review istatistiklerini döndürür

**Response:**
```json
{
  "totalEvaluated": 156,
  "evaluatedLast24h": 12,
  "evaluatedLast7d": 45,
  "pendingEvaluation": 234,
  "dailyLimit": 100,
  "todayCount": 12,
  "remainingToday": 88
}
```

**SQL Queries:**
```sql
-- Total evaluated (only campgrounds without owner and with AI review)
SELECT COUNT(*) FROM campgrounds 
WHERE owner_id IS NULL AND ai_review_generated_at IS NOT NULL;

-- Last 24 hours (only campgrounds without owner)
SELECT COUNT(*) FROM campgrounds 
WHERE owner_id IS NULL AND ai_review_generated_at >= NOW() - INTERVAL '24 hours';

-- Last 7 days (only campgrounds without owner)
SELECT COUNT(*) FROM campgrounds 
WHERE owner_id IS NULL AND ai_review_generated_at >= NOW() - INTERVAL '7 days';

-- Pending (owner_id null and not evaluated yet)
SELECT COUNT(*) FROM campgrounds 
WHERE owner_id IS NULL AND ai_review_generated_at IS NULL;

-- Today count
SELECT COUNT(*) FROM campgrounds 
WHERE ai_review_generated_at::date = CURRENT_DATE;

-- Daily limit
SELECT value FROM admin_settings 
WHERE key = 'ai_review_daily_limit';
```

#### 4. GET /admin/ai-reviews/today-count
Bugün yapılan değerlendirme sayısı

**Response:**
```json
{
  "count": 12
}
```

### Google Places Endpoint'leri

#### 5. POST /google-places/details
Google Place detaylarını getirir

**Request Body:**
```json
{
  "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4"
}
```

**Response:**
```json
{
  "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "name": "Example Camping Area",
  "rating": 4.5,
  "reviews": [
    {
      "author_name": "John Doe",
      "rating": 5,
      "text": "Great camping experience!",
      "time": 1234567890
    }
  ],
  "review_count": 123,
  "website": "https://example.com",
  "phone": "+90 123 456 7890",
  "price_level": 2
}
```

**Implementation:**
```javascript
const { Client } = require('@google/maps');
const googleMapsClient = new Client({
  key: process.env.GOOGLE_PLACES_API_KEY
});

router.post('/google-places/details', async (req, res) => {
  try {
    const { place_id } = req.body;
    
    const response = await googleMapsClient.placeDetails({
      params: {
        place_id: place_id,
        fields: ['name', 'rating', 'reviews', 'user_ratings_total', 'website', 
                 'formatted_phone_number', 'price_level'],
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    res.json(response.data.result);
  } catch (error) {
    console.error('Google Places API error:', error);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});
```

#### 6. POST /google-places/search
Koordinat ve isimle place arar

**Request Body:**
```json
{
  "name": "Kamp Alanı",
  "lat": 39.925533,
  "lng": 32.866287
}
```

### AI Review Endpoint'leri

⚠️ **Google Places API Kısıtlaması**: Google Places API'nin `reviews` field'ı maksimum 5 yorum döndürür. `user_ratings_total` field'ı toplam yorum sayısını verir. AI değerlendirmesi bu 5 örnek yoruma dayanarak yapılır ancak toplam yorum sayısı da dikkate alınır.

#### 7. POST /camping-areas/evaluate-reviews
Tek bir kamp alanı için AI değerlendirmesi yapar

**Request Body:**
```json
{
  "campground_id": 123,
  "force": false
}
```

**Response (Success):**
```json
{
  "success": true,
  "evaluation": "Bu kamp alanı ziyaretçiler tarafından çok beğenilmiş...",
  "updated_fields": {
    "rating": 4.5,
    "review_count": 123
  }
}
```

**Response (Cooldown):**
```json
{
  "success": false,
  "error": "Cooldown period active",
  "cooldown_remaining": "4 ay 15 gün"
}
```

**Response (Daily Limit):**
```json
{
  "success": false,
  "error": "Daily limit exceeded"
}
```

**İş Akışı:**
```javascript
router.post('/camping-areas/evaluate-reviews', async (req, res) => {
  const { campground_id, force } = req.body;
  
  // 1. Campground kontrolü
  const campground = await db.query(
    'SELECT * FROM campgrounds WHERE id = $1 AND owner_id IS NULL',
    [campground_id]
  );
  
  if (!campground.rows.length) {
    return res.status(404).json({ error: 'Not found or has owner' });
  }
  
  // 2. Cooldown kontrolü (force değilse)
  if (!force) {
    const lastEval = campground.rows[0].ai_review_generated_at;
    if (lastEval) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      if (new Date(lastEval) > sixMonthsAgo) {
        return res.status(429).json({
          success: false,
          error: 'Cooldown period active',
          cooldown_remaining: '...'
        });
      }
    }
  }
  
  // 3. Günlük limit kontrolü
  const todayCount = await db.query(
    'SELECT COUNT(*) FROM campgrounds WHERE ai_review_generated_at::date = CURRENT_DATE'
  );
  
  const limitResult = await db.query(
    'SELECT value FROM admin_settings WHERE key = $1',
    ['ai_review_daily_limit']
  );
  
  const dailyLimit = parseInt(limitResult.rows[0].value);
  
  if (todayCount.rows[0].count >= dailyLimit && !force) {
    return res.status(429).json({
      success: false,
      error: 'Daily limit exceeded'
    });
  }
  
  // 4. Google Place ID çözümle
  const bookingUrl = campground.rows[0].booking_url;
  let placeId = parseGooglePlaceIdFromUrl(bookingUrl);
  
  if (!placeId) {
    // Fallback: isim ve koordinatla ara
    placeId = await searchGooglePlace(
      campground.rows[0].name,
      campground.rows[0].latitude,
      campground.rows[0].longitude
    );
  }
  
  if (!placeId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Google Place ID not found' 
    });
  }
  
  // 5. Google Places API'den veri çek
  const placeDetails = await fetchGooglePlaceDetails(placeId);
  
  // 6. AI ile değerlendirme
  const aiEvaluation = await evaluateWithAI(placeDetails.reviews);
  
  // 7. Veritabanını güncelle
  // ÖNEMLİ: updated_at alanını mutlaka güncelleyin ki delta sync çalışsın!
  await db.query(`
    UPDATE campgrounds 
    SET 
      ai_review_evaluation = $1,
      ai_review_generated_at = NOW(),
      google_place_id = $2,
      last_google_sync_at = NOW(),
      rating = $3,
      review_count = $4,
      website = COALESCE($5, website),
      phone = COALESCE($6, phone),
      updated_at = NOW()
    WHERE id = $7
  `, [
    aiEvaluation,
    placeId,
    placeDetails.rating,
    placeDetails.user_ratings_total,
    placeDetails.website,
    placeDetails.formatted_phone_number,
    campground_id
  ]);
  
  res.json({
    success: true,
    evaluation: aiEvaluation,
    updated_fields: {
      rating: placeDetails.rating,
      review_count: placeDetails.user_ratings_total
    }
  });
});
```

#### 8. POST /camping-areas/batch-evaluate-reviews
Toplu değerlendirme (superadmin only)

**Request Body:**
```json
{
  "limit": 50,
  "force": false
}
```

**Response:**
```json
{
  "success": true,
  "processed": 50,
  "successful": 45,
  "failed": 5,
  "errors": [
    {
      "campground_id": 123,
      "error": "Place ID not found"
    }
  ]
}
```

#### 9. GET /camping-areas/eligible-for-review
Değerlendirilebilir kamp alanlarını listeler

**Response:**
```json
{
  "areas": [
    {
      "id": 123,
      "name": "Example Camping",
      "booking_url": "https://maps.google.com/...",
      "last_evaluated": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**SQL Query:**
```sql
SELECT id, name, booking_url, ai_review_generated_at as last_evaluated
FROM campgrounds
WHERE owner_id IS NULL
AND ai_review_enabled = true
AND (
  ai_review_generated_at IS NULL 
  OR ai_review_generated_at < NOW() - INTERVAL '6 months'
)
ORDER BY ai_review_generated_at ASC NULLS FIRST;
```

#### 10. GET /camping-areas/:id/ai-review
Belirli bir alanın AI değerlendirmesini getirir

**Response:**
```json
{
  "evaluation": "Bu kamp alanı...",
  "generated_at": "2026-01-15T10:30:00Z",
  "google_place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4"
}
```

## 🔐 Yetkilendirme Middleware

Tüm admin endpoint'leri için:

```javascript
function requireSuperadmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized - Superadmin required' });
  }
  next();
}

// Kullanım
router.get('/admin/settings', requireSuperadmin, async (req, res) => {
  // ...
});
```

## 📦 Tam Implementasyon

Tam backend implementasyonu için bakınız: [`docs/backend-api-endpoints.js`](./backend-api-endpoints.js)

Bu dosya:
- ✅ Tüm 10 endpoint'in tam implementasyonu
- ✅ Google Places API entegrasyonu
- ✅ AI evaluation integration point
- ✅ Error handling
- ✅ Validation
- ✅ Helper functions

## 🧪 Test

Endpoint'leri test etmek için:

```bash
# Admin settings
curl -X GET http://localhost:3000/node/admin/settings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# AI review stats
curl -X GET http://localhost:3000/node/admin/ai-reviews/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Evaluate single camping area
curl -X POST http://localhost:3000/node/camping-areas/evaluate-reviews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"campground_id": 123, "force": false}'
```

## ⚠️ Önemli Notlar

1. **Google Places API Key**: Mutlaka `.env` dosyasına ekleyin
2. **Rate Limiting**: Google Places API'nin rate limit'ini göz önünde bulundurun
3. **AI Provider**: Mevcut AI evaluation servisinizi entegre edin
4. **Database Migration**: Önce migration'ı çalıştırın
5. **Superadmin Kontrolü**: Tüm admin endpoint'lerinde `requireSuperadmin` middleware kullanın

## 🔄 Minimal Başlangıç (Test İçin)

Backend endpoint'leri eklemeden önce frontend'i test etmek için, frontend zaten fallback değerlerle çalışıyor:

- ✅ Admin settings panel açılır (varsayılan değerlerle)
- ✅ İstatistikler gösterilir (sıfır değerlerle)
- ✅ UI çalışır (backend olmadan)

Ancak gerçek AI değerlendirmeleri için backend implementasyonu **zorunludur**.
