# Kısıtlı Kullanım Raporu

**Rapor Tarihi:** 10 Şubat 2026

**Uygulama Versiyonu:** 1.3.4

**Kapsam:** "Kısıtlı Kullanım" statüsüne giren kullanıcılar — üyeliğini başlattıktan sonraki 1 ay içinde abonelik yenilenmemesi veya gerekli doğrulamaların tamamlanmaması halinde uygulanan kısıtlamalar.

---

## 📌 Genel Özet

"Kısıtlı Kullanım" statüsü, amaç olarak ücretsiz temel kullanımın korunması, sunucu maliyetlerinin yönetilmesi ve premium avantajlarının korunmasını hedefler. Bu rapor, hangi özelliklerin kısıtlandığını, bunun kullanıcı deneyimine etkilerini ve Premium üyelik ile sunulan avantajları açıklar.

## ❗ Kısıtlı Kullanımda Erişimi Kısıtlanan Özellikler

- **Offline Bölge İndirme** — Yeni offline bölge indirme (manüel veya otomatik precache) devre dışı bırakılır.
- **Smart WiFi Cache** — WiFi üzerindeyken favori bölgelerin otomatik cache'lenmesi durdurulur.
- **Arka Plan Senkronizasyonu** — Arka planda zamanlanmış otomatik senkronizasyon görevleri sınırlandırılır veya düşük önceliğe alınır.
- **İndirilebilir Tile/Kota Artışı** — Geniş çaplı harita indirme ve yüksek kota gerektiren işlemler kısıtlanır.
- **Öncelikli Destek** — Premium destek erişimi kaldırılır (standart destek devam eder).
- **Premium Filtreler / Araçlar** — Gelişmiş arama, ileri filtreleme ve özel görünüm ayarları erişilemez olur.

## 📊 Etki & Örnek Senaryolar

- **Offline kamp planlayan kullanıcı:** Offline bölge indirme kapatıldığı için önceden indirilmemiş haritalarda veri bağlantısı gerekecektir.
- **Sık seyahat eden kullanıcı:** Smart WiFi Cache devre dışı kalsa da manuel indirdiği bölgeler sınırlı kalabilir.
- **Topluluk duyuruları ve medya yükleme:** Topluluk ile ilişkili bazı medya yüklemelerinde kısıtlamalar görülebilir (sunucu ve izin kontrollerine bağlı olarak).

## ✅ Premium Üyelik ile Elde Edilen Avantajlar

| Kısıtlama | Premium ile Çözüm / Avantaj |
|---|---|
| Offline Bölge İndirme | Limitsiz veya daha yüksek kota; geniş yarıçap seçenekleri (10/20/50/100 km) ve öncelikli indirme kuyruğu. |
| Smart WiFi Cache | WiFi ile otomatik cache; favoriler için öncelikli önbellekleme (foreground ile güvenli çalışma). |
| Arka Plan Senkronizasyonu | Premium kullanıcılar için sık delta sync hakları — veri gecikmeleri azalır. |
| Destek | Öncelikli destek ve hızlı geri dönüş. |
| Premium Filtreler | Gelişmiş arama, özel harita katmanları ve premium filtrelere erişim sağlanır. |

> Not: Premium avantajları uygulama içi abonelik sistemiyle etkinleştirilir; ödeme onayı ve sunucu yanıtı sonrasında özellikler kullanıcı hesabına anında yansır.

## 🛠️ Teknik Noktalar ve Referans Dosyaları

- Kısıtlamalar hem **sunucu** tarafında (abonelik kontrolü) hem de **istemci** tarafında uygulanır.
- İlgili bileşenler / dosyalar:
  - `components/OfflineRegionSelector.tsx` — offline indirme UI ve mantığı
  - `lib/smartOfflineCache.ts` — WiFi bazlı otomatik cache
  - `lib/checkLocationPermissionsForPremium.ts` — premium konum izin kontrolleri (sadece foreground)
  - `lib/syncManager.ts` — senkronizasyon politikaları (premium/limitsiz ayrımı)
  - `lib/userMembership.ts` — üyelik durum kontrolleri

## 🚀 Geçiş Rehberi (Kullanıcı İçin Kısa)

1. Profil > Üyelikler bölümüne gidin.
2. Premium paketlerden birini seçin ve ödeme adımlarını tamamlayın.
3. Ödeme onayı alındıktan sonra özellikler hesabınıza anında tanımlanır; uygulamayı yeniden başlatmanız gerekmez.

## ❓ Sık Sorulan Sorular (Kısa)

- **Kısıtlı Kullanım ne zaman uygulanır?** — Üyelik başladıktan 1 ay sonra, abonelik yenilenmemişse veya doğrulama tamamlanmamışsa.
- **Mevcut indirdiğim bölgeler silinecek mi?** — Hayır; mevcut offline bölgeler korunur. Ancak yeni indirme veya genişletme kısıtlanabilir.
- **Hemen Premium olmadan önce geçici çözüm var mı?** — Manuel indirdiğiniz bölgelerin boyutunu küçülterek ve favorileri yöneterek deneyimi iyileştirebilirsiniz.

---

### Değişiklik Geçmişi
- 2026-02-10 — İlk oluşturma (web/kisitli-kullanim.html içeriğinden dönüştürüldü).

---

Bu dosyayı güncel tutmak için PR ya da doğrudan commit atabilirsiniz. İsterseniz, ben her önemli değişiklikte bu dosyayı otomatik güncelleyecek bir şablon veya script ekleyebilirim.