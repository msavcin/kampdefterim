# Hesap Silme (DELETE /node/users/me) - Uygulama & Backend Yönergesi

Bu doküman, `DELETE /node/users/me` endpointi için gereken veri temizleme, transaction akışı, frontend-backend entegrasyonu ve test adımlarını özetler. Amaç: kullanıcı hesabı silindiğinde tüm kişisel verilerin güvenli, tutarlı ve atomik şekilde kaldırılmasını sağlamaktır.

## Özet
- Endpoint: `DELETE /node/users/me`
- Auth: `Authorization: Bearer <access_token>` (token istekte geçerli olmalı)
- Body: yok
- Başarılı yanıt: HTTP 200
  ```json
  { "message": "Hesabınız başarıyla silindi." }
  ```
- Hata durumları: 401 Unauthorized, 500 Internal Server Error
- İşlem **tek bir DB transaction** içinde yapılmalı; hata durumunda rollback uygulanır.

---

## Transaction içinde silinmesi/güncellenmesi gereken tablolar (sıralı)
Aşağıdaki sırayla silme/güncelleme yapılmalıdır; bu sıra FK hatalarını ve tutarsızlıkları önlemek için önerilmiştir:

1. `friendship_requests` — (requester_id, receiver_id) tüm kayıtlar silinir
2. `friendships` — (user_id OR friend_id) tüm iki yönlü arkadaşlıklar silinir
3. `community_members` — (`user_id`) topluluk üyelikleri silinir
4. `campground_images` — (`uploaded_by` veya `created_by`) kullanıcının yüklediği fotoğraflar silinir (ve/veya storage'dan da kaldırılmalı)
5. `campground_friend_access` (veya benzer isimli tablo) — diğer kamp alanlarındaki `friend` erişim izinleri temizlenir
6. `announcements` — `created_by = user.id` olan kullanıcı duyuruları silinir (resmi valilik/kurum duyuruları korunur — ayırt edin)
7. `checklist_shares` — kullanıcı tarafından paylaşılan veya kendisine paylaşılan checklist kayıtları silinir
8. `custom_checklist_items` — kullanıcının özel checklist öğeleri silinir
9. `custom_checklists` — kullanıcının oluşturduğu özel checklist'ler silinir
10. `campgrounds` — `owner_id = user.id` ve `source_id = 0` (kullanıcı kaynaklı) olan kamp alanları silinir
11. `campgrounds.friend_user_ids` — JSON/array içinde geçen `user.id` öğesi tüm diğer kayıtların dizilerinden çıkarılır (UPDATE)
12. `subscriptions` — uygulama backend'inde abonelik kayıtları (kendi DB kaydınız) silinir veya `deleted/inactive` olarak işaretlenir
13. `licenses` / `node/licenses` — lisans/sertifika/receipt kayıtları temizlenir
14. `refresh_tokens` / `auth.tokens` — tüm refresh token kayıtları silinir
15. `users` — en son kullanıcı kaydı silinir

> Not: Lokal (device) cache tabloları (ör. SQLite `pending_changes`, `camping_areas` cache vb.) frontend tarafından temizlenmelidir.

---

## Önerilen Backend Uygulama Detayları
- İşlem bir DB transaction içinde yapılmalı (Postgres: `BEGIN; ... COMMIT;` — hata olursa `ROLLBACK;`).
- Silme yerine bazı kayıtlar için `soft-delete` (ör. `deleted = true`) tercih ediliyorsa bunu açıkça belirtin ve `deleted_at` ekleyin.
- Abonelikler: App Store/Play Store aboneliğini sunucu iptal edemez. Backend sadece kendi veritabanındaki abonelik/kayıtları siler ya da `inactive` olarak işaretler. Kullanıcıya mağaza üzerinden aboneliği iptal etmesi gerektiği bildirilmelidir.
- Dosya/medya silme: `campground_images`'deki dosyalar object storage (S3 vb.)'deyse dosya silme istekleri de transaction dışında asenkron bir cleanup job ile tetiklenebilir. Ancak DB kayıtları transaction içinde kaldırılmalı.

---

## Örnek SQL (Postgres) — transaction örneği
Aşağıdaki örnek şablondur; gerçek tablonuzdaki isimlere göre uyarlayın.

```sql
BEGIN;

-- 1. friendship_requests
DELETE FROM friendship_requests WHERE requester_id = $1 OR receiver_id = $1;

-- 2. friendships
DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1;

-- 3. community_members
DELETE FROM community_members WHERE user_id = $1;

-- 4. campground_images
DELETE FROM campground_images WHERE uploaded_by = $1 OR created_by = $1;

-- 5. campground_friend_access
DELETE FROM campground_friend_access WHERE user_id = $1 OR granted_to_user_id = $1;

-- 6. announcements (user-submitted)
DELETE FROM announcements WHERE created_by = $1 AND source != 'official';

-- 7-9. checklist ve custom checklist
DELETE FROM checklist_shares WHERE owner_id = $1 OR shared_with_user_id = $1;
DELETE FROM custom_checklist_items WHERE created_by = $1;
DELETE FROM custom_checklists WHERE owner_id = $1;

-- 10. campgrounds (user-submitted kaynak)
DELETE FROM campgrounds WHERE owner_id = $1 AND source_id = 0;

-- 11. campgrounds.friend_user_ids → JSON array güncellemesi
-- Örnek: jsonb array'dan değeri çıkarma
UPDATE campgrounds
SET friend_user_ids = (SELECT COALESCE(jsonb_agg(x) FILTER (WHERE x IS NOT NULL), '[]'::jsonb)
                       FROM jsonb_array_elements_text(friend_user_ids) AS t(x)
                       WHERE x <> $1::text)
WHERE friend_user_ids IS NOT NULL;

-- 12. subscriptions
DELETE FROM subscriptions WHERE user_id = $1;

-- 13. licenses
DELETE FROM licenses WHERE user_id = $1;

-- 14. refresh tokens
DELETE FROM refresh_tokens WHERE user_id = $1;

-- 15. users (en son)
DELETE FROM users WHERE id = $1;

COMMIT;
```

> Parametre: `$1` = hedef kullanıcı id (string veya integer tabanlı veritabanınıza göre).

---

## Frontend (Mobil) — başarılı yanıt sonrası yapılması gerekenler
1. Kullanıcıdan iki aşamalı onay alın (kademeli alerts veya bir onay ekranı).
2. `DELETE /node/users/me` çağrısını yap.
3. Eğer HTTP 200 dönerse:
   - `SecureStore` ve `AsyncStorage` içindeki token ve kullanıcı bilgilerini temizle (`removeItemAsync`, `clear` vs.)
   - Lokal SQLite cache'i temizle veya `dropAllTables()` çağrısı yap
   - Harita tile cache temizle (varsa)
   - Uygulamayı login ekranına yönlendir
4. Eğer 5xx dönerse kullanıcıya hata göster ve tekrar denemeyi öner

Örnek frontend adımları (React Native):
```ts
await fetch('/node/users/me', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }});
// 200 ise:
await SecureStore.deleteItemAsync('TOKEN_KEY');
await db.dropAllTables();
await clearTileCache();
router.replace('/(auth)/login');
```

---

## Test Planı
- Unit test: endpoint çağrıldığında transaction içinde doğru DELETE/UPDATE sorgularının çalıştığını doğrulayın (mock DB veya test DB ile).
- Entegrasyon: test kullanıcısı oluştur, belirli tablolar altında test verisi ekle (friends, campgrounds, images vb.), endpoint çağrısı yap, tüm ilgili kayıtların silindiğini doğrula.
- Edge-case testleri:
  - Kullanıcı aktif abonelikliyse backend hangi kaydı sileceğini/işaretleyeceğini doğrula
  - Dosya silme başarısız olursa DB rollback çalışmalı mı yoksa dosya silme asenkron tutulmalı?
  - Birden fazla eşzamanlı silme isteği gelirse kilitlenme/yarış durumlarını test et

---

## Logging & Monitoring
- İşlem başlamadan önce audit tablosuna `deletion_requested` kaydı atın (kullanıcı id, timestamp).
- İşlem tamamlanınca `deletion_completed` audit kaydı kaydedin.
- Hata durumunda hata logları ve `deletion_failed` audit kaydı eklenmeli.

---

## Güvenlik & Uyumluluk Notları
- Kullanıcı verilerinin GDPR/KVKK vs. gereksinimlerine göre yedeklerin ne kadar süreyle tutulacağına karar verin.
- Eğer yasal olarak bazı verilerin tutulması gerekiyorsa (`fatura`, `vergi` vs.), bu kayıtları silmeyin; bunun yerine kullanıcıya silinmeyen verilerin listesini gösterin.

---

## Kontrol Listesi (Deployment öncesi)
- [ ] Endpoint test edildi (200, 4xx, 5xx scenariolar)
- [ ] Transaction rollback doğrulandı
- [ ] Frontend onay ve temizleme akışı e2e test edildi
- [ ] Audit loglar eklendi
- [ ] Abonelikler için kullanıcıya mağaza yönlendirmesi ve uyarı metni eklendi

---

Hazır. Backend tarafında örnek SQL ve akış yukarıdadır. İsterseniz ben bu dosyadan yola çıkarak backend için bir Node/Express örnek implementation da ekleyebilirim.
