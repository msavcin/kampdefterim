# Harita marker entegrasyonu — `app/(tabs)/index.tsx`

**Kural:** Mevcut `getSVGIcon` / `getMarkerIcon` ikonları **aynı kalır**.  
Sadece pin kabuğu (yuvarlatılmış kare + alt uç + rating) yenilenir.

Kaynak: `lib/mapMarkerHtml.ts` (bu pakette)

---

## 1) Import ekle

`generateMapHTML` üstündeki importlara:

```ts
import {
  buildCampingMarkerHtml,
  buildUserLocationHtml,
  CAMPING_MARKER_ICON_SIZE,
  CAMPING_MARKER_ICON_ANCHOR,
} from '@/lib/mapMarkerHtml';
```

---

## 2) Kamp alanı marker HTML’ini değiştir

**Bul** (`generateMapHTML` içinde, `L.divIcon`):

```js
icon: L.divIcon({
  className: 'camping-marker',
  html: '<div style="position: relative; width: 38px; height: 38px; display:flex; align-items:center; justify-content:center;">' +
        '<div style="background: ${marker.markerColor}; color: white; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${marker.markerIcon}</div>' +
        ${marker.rating && marker.rating > 0 ? `'<div style="position:absolute; top:-6px; right:-6px; background: rgba(0,0,0,0.75); color:white; font-size:10px; padding:2px 4px; border-radius:8px;">${Number(marker.rating).toFixed(1)}</div>'` : "''"} +
        '</div>',
  iconSize: [38, 38],
  iconAnchor: [19, 19]
})
```

**Değiştir:**

```js
icon: L.divIcon({
  className: 'camping-marker',
  html: \`${buildCampingMarkerHtml({
    color: marker.markerColor,
    iconSvg: marker.markerIcon,
    rating: marker.rating,
    isDark: isDark,
  }).replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`,
  iconSize: [${CAMPING_MARKER_ICON_SIZE[0]}, ${CAMPING_MARKER_ICON_SIZE[1]}],
  iconAnchor: [${CAMPING_MARKER_ICON_ANCHOR[0]}, ${CAMPING_MARKER_ICON_ANCHOR[1]}],
})
```

### Dikkat: template string kaçışı

`generateMapHTML` zaten büyük bir template literal. En güvenli yol:

**A)** Marker html’ini **map öncesi** üret:

```ts
const markers = filteredCampingAreas.map(area => {
  // ... mevcut tag / color / icon hesapları ...
  const markerColor = getMarkerColor(area, isUserSubmitted);
  const markerIcon = getMarkerIcon(tag, isUserSubmitted, area.visibility);
  const rating = Number(area.rating) || 0;
  const isDark = scheme === 'dark';

  return {
    // ...
    markerColor,
    markerIcon,
    rating,
    markerHtml: buildCampingMarkerHtml({
      color: markerColor,
      iconSvg: markerIcon,
      rating,
      isDark,
    }),
    // ...
  };
});
```

**B)** Leaflet tarafında:

```js
icon: L.divIcon({
  className: 'camping-marker',
  html: ${JSON.stringify(
    buildCampingMarkerHtml({
      color: marker.markerColor,
      iconSvg: marker.markerIcon,
      rating: marker.rating,
      isDark,
    })
  )},
  iconSize: [36, 46],
  iconAnchor: [18, 46],
})
```

`JSON.stringify` HTML’i güvenli string olarak enjekte eder (önerilen).

Tam örnek:

```js
${markers.map((marker, idx) => `
  var marker${idx} = L.marker([${marker.lat}, ${marker.lng}], {
    icon: L.divIcon({
      className: 'camping-marker',
      html: ${JSON.stringify(marker.markerHtml)},
      iconSize: [36, 46],
      iconAnchor: [18, 46]
    })
  }).addTo(map).bindPopup(\` ... mevcut popup aynı ... \`);
`).join('')}
```

---

## 3) Kullanıcı konumu (opsiyonel ama önerilir)

**Bul** user location `L.divIcon` html’i (mavi daire).

**Değiştir:**

```js
L.marker([lat, lng], {
  icon: L.divIcon({
    className: 'user-location',
    html: ${JSON.stringify(buildUserLocationHtml(colors.info || '#3B82F6'))},
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}).addTo(map);
```

`generateMapHTML` içinde `colors` erişimi için fonksiyon closure’da zaten `useTheme().colors` var — `const sky = colors.info;` ekleyip kullan.

---

## 4) Popup renkleri (opsiyonel — soft theme)

Hardcoded yeşilleri theme’e bağla:

```js
// Eski:
// popup-title color: ${isDark ? '#34d399' : '#059669'}
// popup-type background/color yeşil

// Yeni:
const popupAccent = isDark ? colors.primary : colors.primary;
const popupAccentBg = isDark ? colors.primaryLight : colors.primaryLight;
```

CSS bloğunda:

```css
.popup-title {
  font-weight: 600;
  color: ${popupAccent};
  margin-bottom: 8px;
  font-family: Roboto, -apple-system, system-ui, sans-serif;
}
.popup-type {
  background: ${popupAccentBg};
  color: ${popupAccent};
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  display: inline-block;
}
```

---

## 5) Dokunulmayacaklar

- `getSVGIcon` / `getMarkerIcon` / `TYPE_COLORS` — ikon geometrisi aynı  
- `getMarkerColor` / `getCampingAreaBgColor` — pin dolgu rengi mantığı aynı  
- Popup içeriği, favori kalp, detay/navigation butonları  
- Location picker kırmızı pin (ayrı use-case)

---

## 6) Test

- [ ] Haritada pin’ler kare + alt uç görünüyor  
- [ ] Eski tip ikonları (çadır, karavan, yürüyüş…) aynı  
- [ ] Rating badge sağ üstte  
- [ ] Tıklayınca popup açılıyor  
- [ ] Dark/light + L/D palet değişince pin rengi `markerColor` ile uyumlu  
- [ ] Anchor: pin ucu koordinata oturuyor (kayma yok)

---

## Özet patch listesi

| Dosya | İşlem |
|--------|--------|
| `lib/mapMarkerHtml.ts` | **Yeni** — kopyala |
| `app/(tabs)/index.tsx` | Import + `markerHtml` + `L.divIcon` html/size/anchor |
