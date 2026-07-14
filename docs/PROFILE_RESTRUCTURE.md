# Profil yeniden yapılandırma — Alternatif A (Hub menü)

**Seçilen tasarım:** `design-alts/profile-restructure-mockups.html` → **A · Hub menü**  
**Branch hedefi:** `v1.3.3`  
**Amaç:** Scroll cehennemini bitir; izinler/ayarlar tek yerde; kimlik bilgisi bir kez.

---

## Bilgi mimarisi

```
Profil (ana hub)                    app/(tabs)/profile.tsx
├─ Kimlik kartı (avatar, isim, rol, çıkış)
├─ Trial / Premium banner
├─ Hub satırları
│  ├─ Görünüm                    → app/profile-appearance.tsx
│  ├─ Arkadaşlar                 → app/profile-friends.tsx
│  ├─ Topluluk                   → app/profile-community.tsx
│  ├─ Uygulama & izinler         → app/profile-app-settings.tsx
│  └─ Rehber & hakkında          → /guide + versiyon satırı
└─ Hesabımı sil (sönük)
```

**Geliştirici (superadmin)** araçları → `profile-app-settings` içinde alt bölüm.

---

## Kopyalanacak dosyalar

| Paket | Repo hedefi |
|--------|-------------|
| `app/(tabs)/profile.hub.tsx` | `app/(tabs)/profile.tsx` (**yedek al**, sonra değiştir) |
| `app/profile-appearance.tsx` | `app/profile-appearance.tsx` |
| `app/profile-friends.tsx` | `app/profile-friends.tsx` |
| `app/profile-community.tsx` | `app/profile-community.tsx` |
| `app/profile-app-settings.tsx` | `app/profile-app-settings.tsx` |
| `components/ProfileHubRow.tsx` | `components/ProfileHubRow.tsx` |
| `components/ProfileThemeSection.tsx` | (zaten vardı) appearance içinde kullanılır |

Eski monolitik `profile.tsx`’i silmeden önce:  
`cp app/(tabs)/profile.tsx app/(tabs)/profile.legacy.tsx`

---

## Eski kod → yeni dosya taşıma haritası

Eski `profile.tsx` içinden **iş mantığını** (state + handler + API) şu dosyalara taşıyın.
Hub dosyası sadece özet + navigasyon tutar.

### `profile-appearance.tsx`
- `ProfileThemeSection`
- (İsteğe bağlı) eski Sun/Moon `cycleColorMode` — **gerekmez**, panel zaten Gündüz/Gece/Sistem veriyor

### `profile-friends.tsx`
Taşı:
- `friends`, `friendSearch`, `searchResults`, `friendRequests`, …
- `fetchFriends`, `fetchFriendRequests`, `sendFriendRequest`, `respondFriendRequest`
- `handleOpenFriendConversation`, arkadaş silme
- UI: liste, istekler, arama autocomplete

### `profile-community.tsx`
Taşı:
- `membership`, `communityDetail`, `communityMembers`
- `communitySearch`, `joinCommunity` başvuru
- `handleStatusChange`, status modal
- Lider üye listesi

### `profile-app-settings.tsx`
Taşı:
- Konum: `locationEnabled`, `requestLocationPermissions`, `refreshLocationPermissions`
- Offline: `OfflineRegionSelector`, full sync, cache clear
- Superadmin: sunucu eşleştirme, DB sil
- “Konum bildirimini sıfırla” SecureStore

### Hub `profile.tsx` (yeni)
Tut:
- `user` yükleme (`getMe`)
- Avatar pick/remove (veya “Düzenle” → küçük modal)
- İsim/username edit modalları (kimlik kartında kalabilir)
- `pendingLogout` / çıkış
- `deleteAccount` akışı
- Premium kart + trial banner
- Hub satır sayıları (opsiyonel): `friends.length`, bekleyen istek

---

## Expo Router

Stack zaten `app/_layout.tsx` içinde `Slot` kullanıyor; yeni dosyalar otomatik route olur:

| Route | Ekran |
|--------|--------|
| `/(tabs)/profile` | Hub |
| `/profile-appearance` | Görünüm |
| `/profile-friends` | Arkadaşlar |
| `/profile-community` | Topluluk |
| `/profile-app-settings` | Uygulama & izinler |

Navigasyon:

```ts
router.push('/profile-appearance' as any);
router.push('/profile-friends' as any);
// ...
```

Geri: `router.back()` veya header back (snippet’lerde var).

---

## Kurulum adımları

1. Tema paketi uygulanmış olsun (`colors.ts` L1–D3 + ThemeProvider).
2. `ProfileThemeSection.tsx` yerinde olsun.
3. Yeni dosyaları kopyala.
4. Eski monolitikten handler’ları alt ekranlara taşı (harita yukarıda).
5. TypeScript hatalarını düzelt (import path `@/` vs relative).
6. Test checklist’i çalıştır.

---

## Test

- [ ] Hub kısa scroll, 5 hub satırı görünür
- [ ] Görünüm → L1–D3 seçimi çalışır
- [ ] Arkadaşlar listesi / istek / arama
- [ ] Topluluk üyelik + (lider) üye yönetimi
- [ ] Konum izni / sistem ayarları
- [ ] Offline bölge (premium)
- [ ] Tam sync / cache (premium)
- [ ] Superadmin satırları sadece superadmin’de
- [ ] Çıkış / hesap sil
- [ ] Light/dark + palet değişince hub renkleri doğru

---

## Neden A?

| | A Hub | B Akordeon | C 2 sekme |
|--|-------|------------|-----------|
| Ana scroll | En kısa | Hâlâ uzun | Orta |
| İzinler | Tek alt sayfa | Bölüm | Ayarlar sekmesi |
| Expo route | Doğal | Tek dosya | 2 tab state |
| Mevcut monolit | Parçalamaya uygun | Tek dosyada kalır | Orta |

Bu paket **A** uygular. B veya C isterseniz söyleyin, ona göre revize ederiz.
