## Misafir (Guest) Rolü - Kısıtlamalar Raporu

**Amaç:** Projedeki `Guest` (Misafir) rolüne uygulanan kısıtlamaları, ilgili kod/doküman referanslarıyla toplamak.

### Özet
- Misafir kullanıcılar uygulamada sınırlı yetkilere sahiptir: sadece kendi oluşturdukları kamp alanlarını görebilir, oluşturma sayısına limit getirilmiştir, bazı sekmelere erişimleri kısıtlıdır ve bazı senkronizasyon/arayüz işlemleri atlanır.

### Uygulanan kısıtlamalar ve ilgili kodlar
- **Görüntüleme yetkisi:** Misafir yalnızca kendi oluşturduğu kamp alanlarını görebilir. Detay: [lib/accessControl.ts](lib/accessControl.ts#L1-L40)
- **Kamp alanı oluşturma limiti:** Misafirler en fazla 10 kamp alanı oluşturabilir; limit aşıldığında uyarı gösterilip premium sayfasına yönlendirilir. Detaylar: [app/(tabs)/index.tsx](app/(tabs)/index.tsx#L1953-L1964) ve [app/(tabs)/index.tsx](app/(tabs)/index.tsx#L3008-L3030)
- **Sekme erişimi (UI):** Bazı sekmeler misafir için devre dışı (örn. Duyurular, Checklist); devre dışı sekmelere tıklandığında premium sayfasına yönlendirme var. Detay: [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx#L60-L86) ve [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx#L160-L174)
- **Senkronizasyon / API çağrıları:** Misafirler checklist senkronizasyonu ve bazı online yenilemelerden muaf; backend'den dönen 403 yetki hataları misafirler için sessiz/loglanan şekilde işleniyor. Detay: [app/(tabs)/checklist.tsx](app/(tabs)/checklist.tsx#L250-L290) ve [app/(tabs)/checklist.tsx](app/(tabs)/checklist.tsx#L740-L804)
- **Profil görünürlüğü:** Profilde misafirler için sadece temel profil kartı gösteriliyor; arkadaşlar ve topluluk başvuru alanları gizleniyor ve kısıtlama mesajı gösteriliyor. Detay: [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx#L880-L904) ve [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx#L1160-L1210)
- **Bilgilendirme & veri davranışı:** `GuestInfoModal` ile misafirlere kısıtlamalar ve değişikliklerin aylık sıfırlanabileceği bildiriliyor. Detay: [components/GuestInfoModal.tsx](components/GuestInfoModal.tsx#L1-L40)
- **Liste/aksiyon kısıtları:** Listelerde premium banner gösterimi ve bazı aksiyonlar devre dışı olabilir; komponent `isGuest` prop'u kullanıyor. Detay: [components/CampingAreaListView.tsx](components/CampingAreaListView.tsx#L1-L20) ve [components/CampingAreaListView.tsx](components/CampingAreaListView.tsx#L120-L140)
- **Favoriler ve diğer ekranlar:** Favoriler ve diğer ekranlarda `isGuest` kontrolü mevcut. Örnek: [app/(tabs)/favorites.tsx](app/(tabs)/favorites.tsx#L1-L40)

### Riskler / Öneriler
- Birçok kısıtlama istemci tarafında uygulanıyor; sunucu tarafı validasyonunun (backend) olup olmadığı doğrulanmalı. Eğer backend kontrolleri eksikse, misafir kısıtları atlatılabilir.
- 403 yanıtlarının sessiz işlenmesi kullanıcı deneyimi açısından uygun olabilir ama hata izlemede (logging/monitoring) gözden geçirilmeli.

### Sonraki adımlar (öneri)
- Backend tarafında misafir yetki kontrollerinin doğrulanması.
- İstemci limitlerinin (ör. 10) konfigüre edilebilir yapılması.
- İstenirse bu dosyada her kısıtlama için koddan doğrudan alıntılar ekleyebilirim.

---
Rapor otomatik oluşturuldu: kısa özet ve ilgili dosya bağlantıları eklenmiştir.
