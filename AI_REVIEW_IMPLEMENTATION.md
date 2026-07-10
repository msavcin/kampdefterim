# AI Review Evaluation - Implementasyon Özeti

## 🎯 Genel Bakış

Bu geliştirme, `owner_id` boş olan kamp alanları için Google Places yorumlarını yapay zeka ile değerlendirip otomatik yorum metni oluşturma sistemini içermektedir.

## 📋 Özellikler

### 1. Otomatik AI Değerlendirme
- **owner_id** boş olan kamp alanları otomatik değerlendirmeye uygun
- Google Places API'den yorumlar çekilir
- AI ile özet değerlendirme metni oluşturulur
- 6 aylık cooldown sistemi (bir alan 6 ayda bir değerlendirilebilir)
- Günlük istek limiti (varsayılan: 100)

### 2. Google Places Entegrasyonu
- `booking_url`'den Google Place ID parse edilir
- Bulunamazsa isim ve koordinat ile arama yapılır
- Yorumlar, rating, review_count gibi bilgiler güncellenir
- Olanaklar, fiyat aralığı, telefon ve website bilgileri senkronize edilir

### 3. Superadmin Yönetim Paneli
- Profil sayfasında "AI Değerlendirme Yönetimi" sekmesi
- İstatistikler (toplam değerlendirme, son 24 saat, bekleyen alanlar)
- Ayarlar:
  - Global açma/kapama
  - UI'da gösterme/gizleme
  - Günlük limit ayarlama (1-1000 arası)
- Toplu değerlendirme başlatma
- Gerçek zamanlı progress tracking

### 4. Kullanıcı Arayüzü
- Kamp alanı detay modalında AI değerlendirmesi gösterimi
- Sadece owner_id boş olan alanlarda görünür
- Sparkles ikonu ile vurgulu tasarım
- Oluşturulma tarihi bilgisi
- "Google Places yorumlarından oluşturuldu" uyarısı

## 🗄️ Veritabanı Değişiklikleri

### `campgrounds` Tablosu (PostgreSQL)
```sql
ALTER TABLE campgrounds ADD COLUMN ai_review_evaluation TEXT;
ALTER TABLE campgrounds ADD COLUMN ai_review_generated_at TIMESTAMPTZ;
ALTER TABLE campgrounds ADD COLUMN ai_review_enabled BOOLEAN DEFAULT true;
ALTER TABLE campgrounds ADD COLUMN google_place_id TEXT;
ALTER TABLE campgrounds ADD COLUMN last_google_sync_at TIMESTAMPTZ;
```

### `admin_settings` Tablosu (Yeni)
```sql
CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);
```

**Default Ayarlar:**
- `ai_review_daily_limit`: "100"
- `ai_review_enabled_global`: "true"
- `ai_review_show_in_ui`: "true"

## 🔧 Backend API Endpoint'leri

### Google Places API
- `POST /google-places/details` - Place detaylarını getirir
- `POST /google-places/search` - Koordinat ve isimle place arar

### Admin Settings
- `GET /admin/settings` - Tüm ayarları getirir (superadmin)
- `PUT /admin/settings/:key` - Ayar günceller (superadmin)
- `GET /admin/ai-reviews/stats` - İstatistikleri getirir
- `GET /admin/ai-reviews/today-count` - Bugünkü değerlendirme sayısı

### AI Review Evaluation
- `POST /camping-areas/evaluate-reviews` - Tek alan için değerlendirme
- `POST /camping-areas/batch-evaluate-reviews` - Toplu değerlendirme (superadmin)
- `GET /camping-areas/:id/ai-review` - Alan için değerlendirmeyi getirir
- `GET /camping-areas/eligible-for-review` - Değerlendirilebilir alanları listeler
- `DELETE /camping-areas/:id/ai-review` - Değerlendirmeyi siler (superadmin)
- `PUT /camping-areas/:id/ai-review-toggle` - AI review'u aktif/pasif yapar (superadmin)

## 📱 Frontend Modülleri

### Yeni Dosyalar
1. **`lib/googlePlacesApi.ts`** - Google Places API entegrasyonu
2. **`lib/adminSettingsApi.ts`** - Admin ayarları API client
3. **`lib/aiReviewApi.ts`** - AI review değerlendirme API client
4. **`components/AIReviewSettingsPanel.tsx`** - Superadmin yönetim paneli
5. **`database/migrations/add_ai_review_columns.sql`** - Database migration
6. **`docs/backend-api-endpoints.js`** - Backend endpoint implementasyonları

### Güncellenmiş Dosyalar
1. **`lib/database.ts`** - CampingArea tipine yeni alanlar eklendi
2. **`app/(tabs)/profile.tsx`** - Superadmin için AI ayarları sekmesi eklendi
3. **`components/CampingAreaDetailModal.tsx`** - AI değerlendirme gösterimi eklendi

## 🔐 Güvenlik ve Yetkilendirme

### Backend Güvenlik
- `admin_settings` endpoint'leri backend'de JWT middleware ile korunuyor
- Tüm admin işlemleri `req.user.role === 'superadmin'` kontrolü ile
- Veritabanı seviyesinde RLS kullanılmıyor (auth kontrolü backend'de)

### Frontend Kontrolü
```typescript
// Profil sayfasında
{user && user.role === 'superadmin' && (
  <AIReviewSettingsPanel />
)}

// Kamp alanı detayında
{!(campingArea as any).owner_id && (campingArea as any).ai_review_evaluation && (
  // AI değerlendirmesini göster
)}
```

## 🚀 Kurulum ve Konfigürasyon

### 1. Veritabanı Migration
```bash
# PostgreSQL veritabanınızda çalıştırın
psql -U your_username -d your_database -f database/migrations/add_ai_review_columns.sql

# Veya pgAdmin'de SQL Query Tool kullanarak dosya içeriğini çalıştırın
```

### 2. Backend Environment Variables
```env
GOOGLE_PLACES_API_KEY=your_google_places_api_key
```

### 3. Backend Dependencies
```bash
npm install @google/maps
```

### 4. Backend Routes
```javascript
const aiReviewRoutes = require('./routes/aiReview');
app.use('/api', aiReviewRoutes);
```

## 📊 İş Akışı

### Otomatik Değerlendirme Süreci

1. **Uygunluk Kontrolü**
   - `owner_id IS NULL`
   - `ai_review_generated_at IS NULL OR > 6 months`
   - `ai_review_enabled = true`
   - Günlük limit kontrolü

2. **Google Place ID Çözümleme**
   - `booking_url`'den parse et
   - Bulamazsa isim + koordinat ile ara

3. **Veri Çekme**
   - Google Places API'den detayları al
   - Yorumları, rating'i, olanakları çek

4. **AI Değerlendirme**
   - Yorumları AI'a gönder
   - Özet değerlendirme metni oluştur

5. **Veritabanı Güncelleme**
   - `ai_review_evaluation` kaydet
   - `ai_review_generated_at` = NOW()
   - `google_place_id` kaydet
   - `rating`, `review_count`, `facilities` vb. güncelle

### Toplu Değerlendirme

Superadmin "Değerlendirmeyi Başlat" butonuna tıkladığında:
1. Uygun alanlar listelenir
2. Günlük limit kadar alan işlenir
3. Her alan için yukarıdaki süreç tekrarlanır
4. Sonuç özeti gösterilir (başarılı, başarısız, atlanan)

## 🎨 UI/UX Detayları

### AI Değerlendirme Kartı
- **İkon**: Sparkles (✨)
- **Renk**: Primary renk tonu
- **Tasarım**: Sol kenarda primary renkli border
- **Arka Plan**: Light mode'da açık primary, dark mode'da surfaceVariant
- **Alt Bilgi**: Oluşturulma tarihi ve kaynak bilgisi

### Yönetim Paneli
- **İstatistik Kartları**: 4 adet (Toplam, Son 24 Saat, Bekleyen, Kalan Hak)
- **Progress Bar**: Günlük kullanım göstergesi
- **Switch'ler**: Global aktif/pasif, UI gösterim
- **Sayı Girişi**: Günlük limit (1-1000)
- **Toplu İşlem**: Büyük primary button, disabled state için opacity

## 🧪 Test Senaryoları

### 1. Veritabanı Testi
- [ ] Migration başarıyla çalışıyor
- [ ] Backend auth middleware superadmin kontrolü yapıyor
- [ ] Default ayarlar ekleniyor
- [ ] İndeksler oluşturuluyor

### 2. API Testi
- [ ] Google Place ID parse ediliyor
- [ ] Place details başarıyla çekiliyor
- [ ] Admin ayarları CRUD işlemleri
- [ ] AI review değerlendirme endpoint'i
- [ ] Toplu değerlendirme çalışıyor
- [ ] Cooldown kontrolü doğru
- [ ] Günlük limit kontrolü doğru

### 3. Frontend Testi
- [ ] Superadmin paneli görünüyor
- [ ] İstatistikler doğru gösteriliyor
- [ ] Ayarlar kaydediliyor
- [ ] Toplu değerlendirme başlatılabiliyor
- [ ] AI değerlendirmesi kamp detayında görünüyor
- [ ] owner_id olan alanlarda AI değerlendirmesi gizli
- [ ] Tarih formatı doğru

### 4. Güvenlik Testi
- [ ] Non-superadmin kullanıcılar admin panelini göremiyor
- [ ] API endpoint'leri doğru yetkilendirme yapıyor
- [ ] Backend JWT middleware doğru çalışıyor

### 5. Performans Testi
- [ ] Toplu değerlendirme performansı
- [ ] Google Places API rate limit kontrolü
- [ ] AI API rate limit kontrolü
- [ ] Database query performansı

## 🐛 Bilinen Kısıtlamalar

1. **Google Places API Limitleri**
   - Günlük request limiti (API key'e bağlı)
   - Rate limiting gerekebilir

2. **AI API Limitleri**
   - Mevcut AI provider limitlerini kontrol edin
   - Token/request limitleri

3. **6 Aylık Cooldown**
   - Force parametresi ile bypass edilebilir (sadece superadmin)
   - Acil durumlarda manuel override gerekebilir

4. **booking_url Formatları**
   - Tüm Google Maps URL formatları desteklenmeyebilir
   - Yeni formatlar için parser güncellemesi gerekebilir

## 📝 Gelecek Geliştirmeler

1. **Otomatik Planlanmış Değerlendirme**
   - Cron job ile günlük otomatik değerlendirme
   - Belirli saatlerde çalışma (örn: gece 02:00)

2. **Email Bildirimleri**
   - Değerlendirme tamamlandığında superadmin'e email
   - Hatalarda alert

3. **Değerlendirme Kalitesi**
   - AI değerlendirmelerinin kalite puanı
   - Düşük kaliteli değerlendirmeleri otomatik filtrele

4. **Multi-Language Support**
   - İngilizce yorumlar için ayrı prompt
   - Otomatik dil algılama

5. **Dashboard Grafikleri**
   - Zaman bazlı değerlendirme grafiği
   - Başarı/hata oranları

## 🤝 Katkıda Bulunma

Backend implementasyonu için:
1. `docs/backend-api-endpoints.js` dosyasını backend projenize entegre edin
2. Google Places API key'i ekleyin
3. Mevcut AI evaluation servisinizi entegre edin
4. Test edin ve gerekli ayarlamaları yapın

## 📞 Destek

Sorularınız için:
- Backend: Backend API endpoint implementasyonları için `docs/backend-api-endpoints.js` dosyasına bakın
- Frontend: Tüm frontend modülleri hazır ve kullanıma açık
- Database: Migration dosyası `database/migrations/add_ai_review_columns.sql`

---

**Not**: Bu implementasyon production'a alınmadan önce kapsamlı test edilmelidir. Özellikle Google Places API ve AI API rate limitleri kontrol edilmelidir.
