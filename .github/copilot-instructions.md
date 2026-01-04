# Copilot Instructions for kampdefterim

## Mimari ve Temel Yapı
- **Expo Router + React Native**: Yönlendirme ve ekran yönetimi için `expo-router` kullanılır. Ana kodlar `app/` altında, sekmeler `(tabs)/`, kimlik doğrulama `(auth)/` klasörlerinde
- **Bileşenler**: Ortak ve modül bazlı bileşenler `components/` altında. Modal, liste görünümleri ve ikonlar ayrı dosyalarda
- **Veri Katmanı**: Tüm API çağrıları ve veri işlemleri `lib/` altındaki modüllerle yapılır (örn. `announcementApi.ts`, `campingAreaApi.ts`). SQLite yerel veritabanı kullanımı `database.ts` üzerinden
- **Supabase**: Kimlik doğrulama, veri ve edge fonksiyonlar için ana backend. Bağlantı `lib/supabase.ts` üzerinden
- **Özel Hooklar**: React hook'ları `hooks/` klasöründe (örn. `useCampingAreas.ts`, `useNetworkStatus.ts`)
- **Tipler**: Ortak tipler `types/` klasöründe, database tipleri `lib/database.ts` içinde

## Kritik Geliştirici İş Akışları
- **Başlatma**: `npm run dev` veya `npm start`
- **Platforma Özel**: Android için `npm run android`, iOS için `npm run ios`
- **Lint**: `npm run lint`
- **Web Build**: `npm run build:web`
- **SQLite Veritabanı**: Offline-first yaklaşım, tüm veriler lokalde cache'lenir, online olduğunda senkronize edilir

## Proje Konvansiyonları ve Pattern'ler
- **Yönlendirme**: Dosya tabanlı, örn. `app/(tabs)/profile.tsx` sekme içi profil ekranı
- **API Kullanımı**: API çağrıları doğrudan bileşende yapılmaz, `lib/` modülleri ve hook/context kullanılır
- **State Yönetimi**: Yerel state için React hook, global için context veya custom hook
- **Offline-First**: `useNetworkStatus` hook'u ile bağlantı durumu kontrol edilir, veriler lokalde saklanır ve senkronize edilir
- **Görünüm Modları**: Harita/liste geçişi gibi birden fazla görünüm sunan ekranlar için `viewMode` state pattern'i kullanılır
- **SVG/İkonlar**: `app/icons/` ve `components/icons/` altında, `getSVGIcon()` fonksiyonu ile merkezi yönetim
- **Modals**: `components/` altında, props ile kontrol edilir (örn. `AddCampingAreaModal`, `CampingAreaDetailModal`)
- **Liste Görünümleri**: Ayrı component dosyaları oluşturulur (örn. `CampingAreaListView.tsx`), FlatList ile optimize edilir

## Veri Akışı ve Senkronizasyon
- **Merkezi Sync**: `lib/syncManager.ts` içinde `syncAll()` fonksiyonu ile tüm veriler senkronize edilir
- **Pending Changes**: Offline yapılan değişiklikler `lib/pendingChanges.ts` ile yönetilir, online olunca gönderilir
- **Cache**: OSM tile'ları ve reverse geocoding `lib/osmCache.ts` ve `lib/imageCache.ts` ile cache'lenir
- **Database Katmanı**: `lib/database.ts` içinde SQLite operations, her modül için CRUD fonksiyonları

## Entegrasyonlar ve Dış Bağımlılıklar
- **Supabase**: Realtime, auth, edge fonksiyonlar (`supabase/functions/` altında)
- **Expo SDK**: Kamera, dosya sistemi, konum (`expo-location`)
- **React Navigation**: Sekmeler ve yığın navigasyonu
- **SQLite**: Offline veri saklama (`expo-sqlite`)
- **Leaflet**: Harita görünümü WebView içinde
- **AsyncStorage**: Küçük key-value veriler için

## Örnekler ve İpuçları
- Yeni API fonksiyonu: `lib/` altında dosya oluştur, bileşende hook/context ile kullan
- Yeni ekran: `app/(tabs)/` veya uygun klasöre `.tsx` dosyası ekle
- Supabase edge fonksiyonu: `supabase/functions/` altında yeni klasör ve `index.ts`
- Liste görünümü: Ayrı component oluştur (`components/XListView.tsx`), props ile data ve callback'ler geç
- Görünüm geçişi: State ile `viewMode` yönet, conditional rendering kullan

## Debugging ve Geliştirme Notları
- `__DEV__` flag'i ile development-only kod bloklarını işaretle
- Console log'ları `[DEBUG]` prefix'i ile etiketle
- Network durumu kritik: tüm API çağrılarından önce `isConnected` kontrol et
- Harita HTML generation: `generateMapHTML()` fonksiyonu WebView için dinamik HTML üretir

---
Eksik veya belirsiz bulduğunuz bölümler varsa lütfen belirtin!