# Merkezi Tema Yönetim Sistemi — Değişiklik Raporu

**Tarih:** 01 Nisan 2026  
**Versiyon:** v1.3.3 → v1.3.4 (Tema Altyapısı)

---

## 1. Genel Bakış

Projede merkezi bir tema yönetim modeline geçiş yapıldı. Yeni yapı aşağıdaki temel özellikleri kapsar:

| Özellik | Durum |
|---------|-------|
| Gece / Gündüz modu | ✅ Light / Dark / System |
| Merkezi ikon yönetimi | ✅ `ThemedIcon` + `iconRegistry` |
| Standart badge/künye sistemi | ✅ Boyut + variant + tema duyarlı |
| Renk tema paletleri (4 adet) | ✅ Doğa, Okyanus, Gün Batımı, Lavanta |
| Kullanıcı tema tercihi (persist) | ✅ AsyncStorage ile kalıcı |
| Geriye dönük uyumluluk | ✅ `theme.colors` + eski variant isimleri |

---

## 2. Oluşturulan Dosyalar

### 2.1 `constants/theme/colors.ts` — Renk Paleti Sistemi

4 farklı renk paleti, her biri light ve dark mod desteğiyle:

| Palet | ID | Emoji | Primary (Light) | Primary (Dark) |
|-------|----|-------|-----------------|----------------|
| Doğa | `nature` | 🌿 | `#059669` | `#34D399` |
| Okyanus | `ocean` | 🌊 | `#0284C7` | `#38BDF8` |
| Gün Batımı | `sunset` | 🌅 | `#EA580C` | `#FB923C` |
| Lavanta | `lavender` | 💜 | `#7C3AED` | `#A78BFA` |

Her palettte 19 renk tokenı tanımlandı:
```
primary, primaryLight, primaryDark, accent,
background, surface, surfaceVariant,
text, textSecondary, muted, border,
danger, warning, success, info,
tabBar, tabBarBorder, tabBarActive, tabBarInactive
```

### 2.2 `constants/theme/typography.ts` — Tipografi Sistemi

- **Font boyutları:** xs (10) → 5xl (32)
- **Ağırlıklar:** normal, medium, semibold, bold, extrabold
- **Text presets:** heading1, heading2, heading3, subtitle, body, bodySmall, caption, label, button, buttonSmall, tabLabel

### 2.3 `constants/theme/spacing.ts` — Aralık & Boyut Sistemi

- **Spacing:** xs (4) → 5xl (48)
- **Border radius:** none, sm, md, lg, xl, 2xl, full
- **İkon boyutları:** xs (12) → 3xl (40)

### 2.4 `constants/theme/icons.ts` — İkon Kayıt Sistemi

Merkezi ikon registry — tüm ikon referansları kategorize edildi:

| Kategori | İkon Sayısı | Örnek |
|----------|-------------|-------|
| `navigation` | 8 | ArrowLeft, Search, ChevronDown |
| `action` | 10 | Plus, Edit, Delete, Filter |
| `status` | 7 | CheckCircle, AlertTriangle, WifiOff |
| `tab` | 6 | Map, Bell, Heart, User |
| `camp` | 13 | campground, caravan_site, MapPin |
| `weather` | 6 | sun, cloud, rain, snow |
| `social` | 5 | Users, UserPlus, Globe |
| `content` | 12 | Calendar, Clock, Image, Star |

`getIconColor(context, colors)` fonksiyonu ile ikon renkleri tema bağlamına göre çözümlenir.

### 2.5 `constants/theme/badges.ts` — Badge Konfigürasyonu

**Boyutlar:**
| Boyut | padding | fontSize | borderRadius |
|-------|---------|----------|-------------|
| xs | 4 / 2 | 10 | 4 |
| sm | 8 / 4 | 12 | 8 |
| md | 12 / 6 | 12 | 12 |
| lg | 16 / 8 | 14 | 12 |

**Varyantlar:** default, primary, primaryLight, danger, warning, success, info, muted, outline

### 2.6 `constants/theme/index.ts` — Ana Giriş Noktası

Tüm tema modülleri tek noktadan export edilir:
```ts
import { palettes, spacing, textStyles, iconRegistry, badgeSizes } from '@/constants/theme';
```

---

## 3. Güncellenen Dosyalar

### 3.1 `components/ThemeProvider.tsx`

**Önceki yapı:**
- `useColorScheme()` ile otomatik dark mode
- Sabit light/dark renk seti
- Sadece `{ theme, scheme }` sağlıyordu

**Yeni yapı:**
- `ColorMode`: `'light' | 'dark' | 'system'` — kullanıcı seçimi
- `paletteId`: Aktif renk paleti seçimi
- `AsyncStorage` ile kalıcı tercih kaydetme
- Yeni context API:

```ts
const { 
  colors,       // Aktif renk seti (ThemeColors)
  theme,        // Geriye dönük: { colors }
  scheme,       // 'light' | 'dark'
  palette,      // Aktif palet objesi
  colorMode,    // 'light' | 'dark' | 'system'
  setPaletteId, // Palet değiştir
  setColorMode, // Mod değiştir
} = useTheme();
```

**Geriye dönük uyumluluk:** `theme.colors.X` kullanımı aynen çalışmaya devam eder.

### 3.2 `components/Badge.tsx`

**Önceki:** 4 variant, sabit boyut  
**Yeni:**
- 9 variant (default, primary, primaryLight, danger, warning, success, info, muted, outline)
- 4 boyut (xs, sm, md, lg)
- İkon desteği (`icon` prop)
- Eski `light` variant → `primaryLight` otomatik dönüşümü

### 3.3 `components/ThemedButton.tsx`

`theme.colors` → `colors` direkt kullanımına güncellendi (daha temiz API).

### 3.4 `app/(tabs)/_layout.tsx`

Hardcoded renkler tema renklerine dönüştürüldü:
```
'#ffffff'  → colors.tabBar
'#e5e7eb'  → colors.tabBarBorder
'#059669'  → colors.tabBarActive / colors.primary
'#6b7280'  → colors.tabBarInactive
'#000000ff' → colors.muted
```

---

## 4. Oluşturulan Yeni Bileşenler

### 4.1 `components/ThemedIcon.tsx`

Tema duyarlı merkezi ikon bileşeni. Lucide, özel SVG ve hava durumu ikonlarını tek API ile sunar.

```tsx
// Doğrudan ikon adıyla
<ThemedIcon name="MapPin" size="lg" context="primary" />

// Registry üzerinden
<ThemedIcon category="tab" icon="map" size="md" />

// Özel renk ile
<ThemedIcon name="Heart" color="#ff0000" size={24} />
```

**Boyut seçenekleri:** `xs` (12) | `sm` (16) | `md` (20) | `lg` (24) | `xl` (28) | `2xl` (32) | `3xl` (40) veya doğrudan sayı

**Renk bağlamları:** `primary` | `secondary` | `muted` | `danger` | `warning` | `success` | `info` | `inverse`

---

## 5. Dosya Yapısı (Yeni)

```
constants/
└── theme/
    ├── index.ts          # Ana giriş noktası
    ├── colors.ts         # Renk paletleri (4 tema × 2 mod)
    ├── typography.ts     # Font boyutları, ağırlıklar, presetler
    ├── spacing.ts        # Aralık, köşe yuvarlatma, ikon boyutları
    ├── icons.ts          # İkon kayıt sistemi ve renk çözümleyici
    └── badges.ts         # Badge boyut ve variant konfigürasyonu

components/
├── ThemeProvider.tsx     # ✏️ Güncellenmiş (palet + mod seçimi)
├── ThemedIcon.tsx        # 🆕 Merkezi ikon bileşeni
├── ThemedButton.tsx      # ✏️ Güncellenmiş (doğrudan colors kullanımı)
└── Badge.tsx             # ✏️ Güncellenmiş (yeni boyut/variant sistemi)
```

---

## 6. Kullanım Kılavuzu

### Tema değiştirme (profil sayfasından ileride kullanılacak)

```tsx
import { useTheme } from '@/components/ThemeProvider';
import { paletteList } from '@/constants/theme';

function ThemeSelector() {
  const { setPaletteId, setColorMode, palette, colorMode } = useTheme();

  return (
    <>
      {/* Palet seçimi */}
      {paletteList.map(p => (
        <TouchableOpacity key={p.id} onPress={() => setPaletteId(p.id)}>
          <Text>{p.emoji} {p.name}</Text>
        </TouchableOpacity>
      ))}
      
      {/* Mod seçimi */}
      <TouchableOpacity onPress={() => setColorMode('light')}>☀️ Gündüz</TouchableOpacity>
      <TouchableOpacity onPress={() => setColorMode('dark')}>🌙 Gece</TouchableOpacity>
      <TouchableOpacity onPress={() => setColorMode('system')}>⚙️ Sistem</TouchableOpacity>
    </>
  );
}
```

### Renk kullanımı

```tsx
const { colors } = useTheme();

<View style={{ backgroundColor: colors.background }}>
  <Text style={{ color: colors.text }}>Ana metin</Text>
  <Text style={{ color: colors.muted }}>Soluk metin</Text>
</View>
```

### Tipografi kullanımı

```tsx
import { textStyles, fontSizes } from '@/constants/theme';

<Text style={[textStyles.heading2, { color: colors.text }]}>Başlık</Text>
<Text style={[textStyles.body, { color: colors.textSecondary }]}>İçerik</Text>
```

### Badge kullanımı

```tsx
import Badge from '@/components/Badge';

<Badge variant="primary" size="sm">Yeni</Badge>
<Badge variant="warning" size="lg" icon={<ThemedIcon name="AlertTriangle" size="xs" />}>Uyarı</Badge>
<Badge variant="outline">PRO</Badge>
```

### İkon kullanımı

```tsx
import ThemedIcon from '@/components/ThemedIcon';

<ThemedIcon name="MapPin" context="primary" size="lg" />
<ThemedIcon category="status" icon="success" context="success" />
```

---

## 7. Sonraki Adımlar

- [ ] Profil sayfasına tema seçim UI'ı ekle
- [ ] Modal ve detay ekranlarındaki hardcoded renkleri `colors` ile değiştir (kademeli geçiş)
- [ ] Harita HTML generation'da (`generateMapHTML`) tema renklerini entegre et
- [ ] Duyuru ve diğer ekranlardaki inline renkleri kademeli olarak `colors` tokenlarına taşı

---

## 8. Kırılma Riski

**Düşük.** Geriye dönük uyumluluk korundu:
- `useTheme()` hala `theme.colors.X` döndürür
- Badge'deki eski `light` variant → `primaryLight` olarak otomatik dönüşür
- Nature paleti mevcut hardcoded renklerle (neredeyse) birebir eşleşir
- Yeni özellikler (palette seçimi, mod değiştirme) tamamen opsiyonel
