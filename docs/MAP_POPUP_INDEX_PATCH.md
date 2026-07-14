# Harita popup renkleri — `app/(tabs)/index.tsx`

**Amaç:** Hardcoded yeşil/slate popup renklerini `useTheme().colors` (L1–L3 / D1–D3) ile değiştirmek.  
**Layout / popup HTML yapısı aynı kalır.**

Dosya: `lib/mapPopupTheme.ts`

---

## 1) Import

```ts
import {
  buildMapPopupTheme,
  popupInlineStyles,
} from '@/lib/mapPopupTheme';
```

---

## 2) `generateMapHTML` başında tema üret

`const isDark = scheme === 'dark';` satırının hemen altına:

```ts
const popupTheme = buildMapPopupTheme(colors, isDark);
const pin = popupInlineStyles(popupTheme);
```

`colors` zaten `useTheme()` ile MapScreen’de var; `generateMapHTML` aynı closure içinde.

---

## 3) `<style>` bloğunu değiştir

**Bul** (özet):

```js
body { margin: 0; padding: 0; background: ${isDark ? '#1a1a2e' : '#fff'}; }
...
.popup-title { color: ${isDark ? '#34d399' : '#059669'}; }
.popup-type { background: ${isDark ? '#064e3b' : '#dcfce7'}; color: ${isDark ? '#6ee7b7' : '#059669'}; }
.leaflet-popup-content-wrapper { background: ${isDark ? '#1e293b' : '#fff'}; color: ${isDark ? '#e2e8f0' : '#222'}; }
.leaflet-popup-tip { background: ${isDark ? '#1e293b' : '#fff'}; }
.leaflet-control-zoom a { background: ${isDark ? '#334155' : '#fff'} !important; ... }
.leaflet-control-attribution { ... }
```

**Değiştir** — body + custom-popup + leaflet chrome için hazır CSS:

```js
<style>
  ${popupTheme.css}
  /* dark tile filters — mevcut soft/bright bloklarınızı AYNEN bırakın */
  ${isDark && darkMapStyle === 'soft' ? `
  .leaflet-tile-pane {
    filter: invert(1) hue-rotate(220deg) brightness(2.5) contrast(0.95) sepia(0.8);
  }
  ` : ''}
  ${isDark && darkMapStyle === 'bright' ? `
  .leaflet-tile-pane {
    filter: brightness(1.4) contrast(1.1);
  }
  ` : ''}
</style>
```

> `popupTheme.css` zaten `body`, `#map`, `.custom-popup`, `.popup-title`, `.popup-type`, zoom, attribution içerir.  
> Eski `.popup-title` / `.popup-type` / `.leaflet-popup-*` satırlarını **silin** (çift tanım olmasın).

---

## 4) Popup HTML inline renkleri

### 4.1 Fotoğraf kutusu arka planı

**Bul:**  
`background: ${isDark ? '#1e293b' : '#f3f4f6'}`

**Yeni:**  
`background: ${popupTheme.imagePlaceholderBg}`

### 4.2 Kullanıcı ekledi

**Bul:**  
`isDark ? '#a78bfa' : '#8b5cf6'`

**Yeni:**  
`popupTheme.userSubmitted`  
veya class: `class="popup-user-submitted"`

### 4.3 Mesafe

**Bul:**  
`isDark ? '#94a3b8' : '#6b7280'`

**Yeni:**  
`popupTheme.muted`  
veya `class="popup-distance"`

### 4.4 Amenity chip

**Bul:**  
`background: ${isDark ? '#334155' : '#f3f4f6'}`

**Yeni:**  
`background: ${popupTheme.amenityBg}`  
veya `class="popup-amenity"`

### 4.5 Detaylı Bilgi satırı

**Bul:**  
`color: #059669` ve stroke/metin `#94a3b8` / `#222`

**Yeni (örnek):**

```html
<div style="${pin.detailRow}" onclick="openCampingAreaDetail(...)">
  <svg ... stroke="${popupTheme.muted}" ...></svg>
  <span style="${pin.detailLabel}">Detaylı Bilgi</span>
</div>
```

### 4.6 Harita menüsü (Google / Yandex)

**Bul:**  
`background: ${isDark ? '#1e293b' : '#fff'}; border: ... #334155 / #e5e7eb`

**Yeni:**  
`style="${pin.mapMenu}"`  
menü yazıları: `style="${pin.menuItemText}"`

### 4.7 “Bu kampı seç” butonu

**Bul:**  
`background:#059669; color:#fff`

**Yeni:**  
`style="${pin.selectForPlanBtn}"`  
veya `class="popup-primary-btn"`

### 4.8 “Buraya Kamp Alanı Ekle” (user location popup)

**Bul:**  
`background: #059669; color: white`

**Yeni:**  
`style="${pin.addHereBtn}"`

### 4.9 Favori kalp arka planı (opsiyonel)

**Bul:**  
`background: ${marker.isFavorite ? '#ef4444' : 'rgba(254,242,242,0.95)'}; border: 1px solid #ef4444`

**Yeni:**  
`style="${pin.favoriteBtn(marker.isFavorite)}"`

---

## 5) Offline canvas placeholder (generateMapHTML içinde ctx.fillStyle)

Aynı `isDark ? '#1e293b' : ...` yerlerini:

| Eski (dark) | Yeni |
|-------------|------|
| `#1e293b` | `popupTheme.surface` |
| `#334155` | `popupTheme.border` |
| `#0f172a` | `popupTheme.pageBg` / `colors.background` |
| `#64748b` | `popupTheme.muted` |
| light grays | `popupTheme.surfaceVariant` / `border` |

---

## 6) Test checklist

- [ ] Light L1/L2/L3: popup başlık + tip chip primary/primaryLight  
- [ ] Dark D1: surface charcoal, CTA açık primary + koyu yazı  
- [ ] Dark D2/D3: slate/forest yüzeyler  
- [ ] Zoom kontrolleri okunuyor  
- [ ] Detay / menü / “Bu kampı seç” renkleri primary  
- [ ] Favori kalp kırmızı (danger) kalıyor  
- [ ] Popup layout bozulmadı  

---

## Renk map özeti

| UI parçası | Eski | Token |
|------------|------|--------|
| Başlık | `#059669` / `#34d399` | `colors.primary` |
| Tip chip bg | `#dcfce7` / `#064e3b` | `colors.primaryLight` |
| Tip chip text | yeşil | `colors.primary` |
| Popup yüzey | `#fff` / `#1e293b` | `colors.surface` |
| Popup metin | `#222` / `#e2e8f0` | `colors.text` |
| Mesafe | gri | `colors.muted` |
| Amenity | gri kutu | `colors.surfaceVariant` |
| Primary buton | `#059669` | `colors.primary` + `primaryOn` |
| Zoom | slate/white | `surface` / `text` / `border` |
| Link (attribution) | mavi | `colors.info` |

---

## Dosya listesi

| Dosya | İşlem |
|--------|--------|
| `lib/mapPopupTheme.ts` | **Yeni** → `kampdefterim/lib/` |
| `app/(tabs)/index.tsx` | `generateMapHTML` style + inline renkler |
| Marker pin | önceki `mapMarkerHtml.ts` ile birlikte kullan |
