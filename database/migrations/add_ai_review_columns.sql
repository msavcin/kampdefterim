-- AI Review Evaluation için campgrounds tablosuna yeni kolonlar
-- Execution: Bu SQL'i PostgreSQL veritabanınızda çalıştırın (psql veya pgAdmin ile)

-- 1. campgrounds tablosuna AI review kolonlarını ekle
ALTER TABLE campgrounds ADD COLUMN IF NOT EXISTS ai_review_evaluation TEXT;
ALTER TABLE campgrounds ADD COLUMN IF NOT EXISTS ai_review_generated_at TIMESTAMPTZ;
ALTER TABLE campgrounds ADD COLUMN IF NOT EXISTS ai_review_enabled BOOLEAN DEFAULT true;
ALTER TABLE campgrounds ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE campgrounds ADD COLUMN IF NOT EXISTS last_google_sync_at TIMESTAMPTZ;

-- 2. Admin ayarları için yeni tablo oluştur
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

-- 3. Default ayarları ekle
INSERT INTO admin_settings (key, value, description) VALUES
  ('ai_review_daily_limit', '100', 'Günlük maksimum AI değerlendirme isteği sayısı')
ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value, description) VALUES
  ('ai_review_enabled_global', 'true', 'Sistem genelinde AI değerlendirmesinin aktif olup olmadığı')
ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value, description) VALUES
  ('ai_review_show_in_ui', 'true', 'AI değerlendirmelerinin kullanıcı arayüzünde gösterilip gösterilmeyeceği')
ON CONFLICT (key) DO NOTHING;

-- 4. İndeksler oluştur (performans için)
CREATE INDEX IF NOT EXISTS idx_campgrounds_owner_id_null 
  ON campgrounds(id) 
  WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_campgrounds_ai_review_date 
  ON campgrounds(ai_review_generated_at);

CREATE INDEX IF NOT EXISTS idx_campgrounds_google_place_id 
  ON campgrounds(google_place_id) 
  WHERE google_place_id IS NOT NULL;

-- 5. Admin settings için güncelleme trigger'ı
CREATE OR REPLACE FUNCTION update_admin_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_admin_settings_timestamp ON admin_settings;
CREATE TRIGGER trigger_update_admin_settings_timestamp
BEFORE UPDATE ON admin_settings
FOR EACH ROW
EXECUTE FUNCTION update_admin_settings_timestamp();

-- 6. Güvenlik Notu
-- RLS politikaları kullanılmıyor çünkü auth kontrolü backend'de JWT ile yapılıyor
-- Admin settings endpoint'leri backend'de req.user.role === 'superadmin' kontrolü ile korunuyor
-- Backend middleware auth kontrolünü sağladığı için veritabanı seviyesinde RLS'e ihtiyaç yok

COMMENT ON COLUMN campgrounds.ai_review_evaluation IS 'AI tarafından Google Places yorumlarından üretilen değerlendirme metni';
COMMENT ON COLUMN campgrounds.ai_review_generated_at IS 'AI değerlendirmesinin son oluşturulma zamanı (6 ay cooldown için)';
COMMENT ON COLUMN campgrounds.ai_review_enabled IS 'Bu kamp alanı için AI değerlendirmesinin etkin olup olmadığı';
COMMENT ON COLUMN campgrounds.google_place_id IS 'Google Places API place_id (booking_url parse ile alınır)';
COMMENT ON COLUMN campgrounds.last_google_sync_at IS 'Google Places verilerinin son senkronizasyon zamanı';
COMMENT ON TABLE admin_settings IS 'Sistem geneli admin ayarları (sadece superadmin erişebilir)';
