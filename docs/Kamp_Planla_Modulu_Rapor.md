# Kamp Planla Modülü — Tasarım ve Uygulama Raporu

## 1. Amaç ve Kapsam
Bu rapor, "Kamp Planla" modülünün adım adım tasarımını, ücretsiz/ekonomik entegrasyon seçeneklerini, API uç noktalarını, veri modellerini ve AI ile hava/uyarı entegrasyonu yaklaşımlarını özetler. Modül bağımsız şekilde geliştirilecek ve mevcut uygulamaya geriye dönük uyumlu olarak entegre edilecektir.

## 2. Öncelik: Ücretsiz/Minimal Maliyetli Çözümler
- AI (LLM):
  - Yerel/ücretsiz modeller: `llama.cpp` / ggml tabanlı modeller, TinyLlama, lokal çalışan açık kaynak modeller.
  - Hugging Face Inference API (ücretsiz kota ile) veya açık kaynak inference sunucusu (`transformers` + `accelerate`)—ilk etapta küçük modellerle prototip.
  - Maliyet/performans sınırlandığında OpenAI/Azure gibi sağlayıcılara geçiş için soyut bir adapter yazılacak.
- Hava Verisi & Uyarılar:
  - Open-Meteo (ücretsiz), Meteostat (istatistiksel veriler), MeteoAlarm veya yerel resmi kaynakların (örn. AFAD/Meteoroloji) açık API'leri.
- Push Bildirimleri:
  - Expo Push Notifications (mevcut Expo projesi için uygun ve ücretsiz kotaya kadar kullanışlı).
  - Alternatif: Firebase Cloud Messaging (FCM) ücretsiz.
- Barındırma / Edge:
  - Supabase Edge Functions (ücretsiz katmana kadar) veya Vercel/Hobby gibi ücretsiz/ucuz seçenekler.
- Veri Katmanı:
  - Mevcut SQLite (lokal) kullanılmaya devam edilecek; sunucu tarafı için küçük Postgres (Supabase) uygun.

## Mevcut PostgreSQL ve Endpoint Entegrasyonu

- Proje zaten bir PostgreSQL veritabanı ve mevcut backend endpointlerine sahipse, bunlar öncelikli kaynak olarak kullanılacaktır.
- Strateji:
  - Mevcut endpoint'ler `planner` modülünden bir "adapter" katmanı aracılığıyla çağrılır; böylece tekrar veri kopyalanmaz ve iş mantığı çatışmaları önlenir.
  - Yeni `/api/v1/planner` endpointleri yalnızca mevcut backend'in sunmadığı ilkeler/işlevler için eklenir; var olan fonksiyonellik yeniden kullanılır.
  - Veritabanı: sunucu tarafı veri depolaması için mevcut Postgres kullanılacak; gerekli yeni tablolar Postgres üzerinde migration ile eklenecek (lokal SQLite yalnızca client cache için kalır).
  - Senkronizasyon: server-side authoritative model benimsenir; client lokal cache (SQLite) arabelleğe alır ve arka planda sync yapılır.
  - Auth & Güvenlik: mevcut JWT/Supabase auth kullanılmaya devam eder; adapter, mevcut auth token'larını yeniden kullanır.
  - Performans: sık kullanılan sorgular için server-side sorguları ve cache (örn. Redis veya Postgres materialized views) önerilir.
  - Hata & Fallback: Eğer mevcut endpoint'ler kullanılamazsa, modül geçici olarak read-only veya kısıtlı mock verilerle çalışır.


## 3. Geliştirme Prensipleri ve Entegrasyon Stratejisi
- Modül bağımsız olacak: `lib/kamp-planner` veya ayrı mikroservis/edge fonksiyonu.
- Mevcut tabloları değiştirmeden yeni tablolar ekle (soft, opsiyonel sütunlardan kaçın).
- Feature flag ile kademeli açılma (`config.planner.enabled`).
- API prefix `/api/v1/planner` ile ayrıştırma.
- AI çağrıları için bir "adapter" katmanı: öncelikli olarak ücretsiz/hafif modeller, gerektiğinde provider değişikliği kolay.

## 4. Veri Modelleri (Öneri)
- `camp_plans`
  - id, user_id, title, start_date NULLABLE, end_date NULLABLE, camp_type_id, location_id, state (draft/active/completed/cancelled), created_at, updated_at
- `camp_plan_locations`
  - id, camp_plan_id, lat, lng, place_name, region_code
- `camp_plan_checklist`
  - id, camp_plan_id, item_key, label, required_bool, checked_bool, order
- `plan_suggestions`
  - id, camp_plan_id NULLABLE, suggestion_type (area/alternative_date/warning), payload JSON, score, source (ai/weather), created_at
- `sponsored_areas`
  - id, camping_area_id, sponsor_id, priority, active_from, active_to
- `plan_notifications`
  - id, camp_plan_id, user_id, notify_at, type, sent_bool
- (opsiyonel) `ai_logs` — prompt özetleri (anonimleştirilmiş)

> Not: Mevcut `camping_area` tablosuna opsiyonel `tags` veya `meta` JSON sütunu ilave etmek faydalı, ama zorunlu değil.

## 5. Temel API Uç Noktaları (Ücretsiz çözümler göz önünde bulundurularak)
Tüm endpointler `/api/v1/planner` prefix'i altında ve JWT/Supabase auth ile korunur.

1) Plan oluşturma / yönetim
- POST /api/v1/planner/plans
  - Body: { title?, start_date?, end_date? }
  - Response: { id, state }
- GET /api/v1/planner/plans/:id
  - Plan detayları (locations, checklist, suggestions)
- GET /api/v1/planner/user/plans
  - Kullanıcının plan listesi
- DELETE /api/v1/planner/plans/:id (soft delete)

2) Kamp türleri ve meta
- GET /api/v1/planner/camp-types
  - Cihazda veya admin panelde yönetilecek; dinamik olarak güncellenir.
- POST /api/v1/planner/plans/:id/type { camp_type_id }

3) Konum, öneri ve sponsorlu alanlar
- POST /api/v1/planner/plans/:id/location { lat, lng, place_name }
- GET /api/v1/planner/suggestions?lat=&lng=&date=&camp_type_id=&weather_pref=
  - Dönüş: [{ area_id, score, reason, sponsored }]
- GET /api/v1/planner/suggestions/:area_id/details
- Admin: CRUD sponsorlu alanlar `/api/v1/planner/sponsored-areas`

4) Hava ve uyarılar (öncelikle ücretsiz sağlayıcılar)
- GET /api/v1/planner/weather/check?lat=&lng=&date=
  - Open-Meteo veya resmi kaynaklarla entegrasyon; cache ile maliyet/limit kontrolü
  - Dönüş: { summary, warnings: [{code, severity, message}], recommended_alternatives: [date,...] }
- POST /api/v1/planner/ai/warnings
  - Body: { plan_id, context }
  - LLM adapter çağrısı yapar; öncelikle yerel/HF model seçeneği

5) Checklist & bildirimler
- GET /api/v1/planner/plans/:id/checklist
- PATCH /api/v1/planner/plans/:id/checklist/:item_id { checked }
- POST /api/v1/planner/plans/:id/notifications/schedule { notify_at, type }

6) Webhooks / Background jobs
- POST /api/v1/planner/webhooks/notification-delivery
- Background job endpoints: scheduler yönetimi için admin API

Her endpoint için: input validation, rate limit, versiyonlama ve caching önlemleri ekle.

## 6. AI Entegrasyonu (Ücretsiz İlk Seçenekler & Mimari)
- Öncelik: Her şeyden önce açık kaynak veya ücretsiz inference ile prototipleme.
  - Yerel inference: `llama.cpp` + küçük ggml modeli veya `gpt4all` benzeri (kısıtlı kapasiteyle).
  - Hugging Face Inference API: ücretsiz kota ile başlanabilir.
- Mimari
  - `ai-adapter` service (edge fonksiyon veya küçük service): prompt sanitation, rate limiting, cache.
  - Cache: `plan_suggestions` tablosu veya Redis-like cache (kısa süreli).
  - Fallback: AI cevap alamazsa kural-temelli engine çalışsın (hava uyarıları + resmi veriler).
- Gizlilik/Maliyet
  - Raw prompt/response saklama opsiyonel; özet sakla, kişisel veri anonimleştir.

## 7. Hava & Resmi Uyarılar Stratejisi
- Kaynaklar: Open-Meteo (ücretsiz), yerel resmi API'ler (AFAD, Meteoroloji) — varsa entegre et.
- Risk seviyeleri: informational / advisory / restricted / forbidden.
- Eğer `forbidden` veya yüksek risk: plan oluşturma engellenebilir veya kullanıcıya güçlü uyarı gösterilir.
- Alternatif tarihler AI veya rule-engine ile önerilir.

## 8. Bildirim ve Checklist İşleyişi
- Hatırlatmalar: örnek zamanlamalar — 7 gün önce (checklist), 24 saat önce (son doğrulama), 1 saat önce (acil uyarı).
- Bildirim sağlayıcı: Expo Push / FCM.
- Checklist: plan bazlı, kullanıcı eklenebilir maddeler; şablon olarak kaydedilebilir.

## 9. Yönetim & Admin Özellikleri
- Sponsorlu alan yönetimi, kamp türleri ve risk eşiklerini admin panelinden yönet.
- Rules CRUD: risk_thresholds, weather rules, AI risk override toggle.

## 10. Test, Staging ve Rollout
- Unit + integration testler: servis katmanı ve endpointler.
- Staging: gerçek hava/AI çağrıları yerine mock.
- Canary rollout: küçük kullanıcı grubu ile canlı test.

## 11. Güvenlik & Gizlilik
- Auth: mevcut `lib/auth.ts` / Supabase JWT kullanılacak.
- AI logları anonimleştirilecek.
- Kişisel konum verileri saklanacaksa kullanıcı izni ve retention politikası tanımlanacak.

## 12. İlk Yol Haritası (Kısa Vadeli Adımlar)
1. Bu raporun onayı (done)
2. Detaylı API şeması (OpenAPI) ve validation kuralları — *başlatıldı*
3. `camp_plans` migration + minimal CRUD endpoints (staging)
4. Basit frontend akışı (read-only öneriler)
5. Hava API entegrasyonu (Open-Meteo) + rule-engine
6. AI adapter ile uyarı özetleri (Hugging Face / local model yanıtları)
7. Checklist & notification scheduler

## 13. Sonraki Adım Önerisi
İsterseniz şimdi `2.` adım olarak detaylı OpenAPI şemasını oluşturayım veya doğrudan `camp_plans` için migration ve minimal CRUD endpoint implementasyonu yazayım. Hangi adımı başlatmamı istersiniz?

---
Rapor hazırlandı. İlerlemeyi `docs/Kamp_Planla_Modulu_Rapor.md` dosyasında oluşturdum.