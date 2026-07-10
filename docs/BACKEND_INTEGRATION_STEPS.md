# Backend Entegrasyon Adımları

## 1. Route Dosyasını Ekleyin

Backend projenizde `routes/aiReview.js` oluşturun ve `docs/backend-api-endpoints.js` içeriğini kopyalayın.

## 2. Ana App Dosyasında Mount Edin

Backend projenizin ana dosyasında (genelde `server.js` veya `app.js`):

```javascript
// Middleware'ler (mevcut req.db ve req.user middleware'lerinden sonra)
const aiReviewRouter = require('./routes/aiReview');

// Route mount
app.use('/node', aiReviewRouter);
```

**Önemli:** `/node` prefix'i zaten router içinde tanımlı DEĞİL. Backend'deki mevcut route yapınıza göre:
- Eğer mevcut route'larınız `/node/camping-areas` şeklinde başlıyorsa → `app.use('/node', aiReviewRouter)`
- Eğer prefix yok ve direkt `/camping-areas` ise → route dosyasındaki tüm path'leri güncelleyin

## 3. Gerekli Paketleri Yükleyin

```bash
npm install @google/maps
```

## 4. Environment Variable Ekleyin

Backend `.env` dosyanıza:

```env
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

Google Places API key almak için: https://developers.google.com/maps/documentation/places/web-service/get-api-key

## 5. Migration'ı Çalıştırın

```bash
psql -h YOUR_DB_HOST -U YOUR_DB_USER -d YOUR_DB_NAME -f database/migrations/add_ai_review_columns.sql
```

Veya pgAdmin'de SQL editörüne yapıştırıp çalıştırın.

## 6. Veritabanı Bağlantısını Doğrulayın

Backend'inizin `DATABASE_URL` değişkeni pgAdmin'de gördüğünüz veritabanıyla aynı olmalı:

```bash
# Backend projesinde
node scripts/check_admin_settings.js
```

## 7. Sunucuyu Yeniden Başlatın

```bash
# Backend projesinde
pm2 restart your-app-name
# veya
node server.js
```

## Test Komutları

```bash
# 1. Admin settings (boş dönmemeli artık)
curl -i -H "Authorization: Bearer YOUR_TOKEN" "https://veronicapeyzaj.com/node/admin/settings"

# 2. AI review stats
curl -i -H "Authorization: Bearer YOUR_TOKEN" "https://veronicapeyzaj.com/node/admin/ai-reviews/stats"

# 3. Eligible camping areas
curl -i -H "Authorization: Bearer YOUR_TOKEN" "https://veronicapeyzaj.com/node/camping-areas/eligible-for-review"
```

## Sorun Giderme

### 404 Hatası
- Route mount edildi mi? (`app.use('/node', aiReviewRouter)`)
- Sunucu yeniden başlatıldı mı?
- Path prefix'i doğru mu? (`/node` olmalı)

### Empty Array Dönüyorsa
- Migration çalıştırıldı mı?
- `admin_settings` tablosu var mı?
- Backend DATABASE_URL doğru DB'yi gösteriyor mu?

### 500 Hatası
- GOOGLE_PLACES_API_KEY tanımlı mı?
- `req.db` middleware çalışıyor mu?
- Sunucu loglarını kontrol edin
