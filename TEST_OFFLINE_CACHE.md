# Offline Harita Cache Test Senaryoları

## Test 1: İlk Konum Cache'leme

### Adımlar:
1. Uygulamayı açın (online modda)
2. Konumunuza erişim izni verin
3. Harita ekranını açın
4. Console loglarını kontrol edin

### Beklenen Sonuç:
```
[MapTileCache] 20 km çapında bölge cache'leniyor...
[MapTileCache] Zoom 9: X tile ön-cache'lendi
[MapTileCache] Zoom 10: X tile ön-cache'lendi
[MapTileCache] Zoom 11: X tile ön-cache'lendi
[MapTileCache] Zoom 12: X tile ön-cache'lendi
[MapTileCache] Zoom 13: X tile ön-cache'lendi
[MapTileCache] Toplam XXX tile cache'lendi (20 km çap)
```

---

## Test 2: Konum Değişikliği (>1 km)

### Adımlar:
1. Uygulamayı açın
2. Haritayı başka bir konuma sürükleyin (>1 km)
3. "Bu Bölgedeki Alanları Göster" butonuna tıklayın
4. Console loglarını kontrol edin

### Beklenen Sonuç:
```
[DEBUG] Konum değişti, yeni sorgu yapılacak: XXXX.XX metre
[MapTileCache] 20 km çapında bölge cache'leniyor...
[MapTileCache] Toplam XXX tile cache'lendi (20 km çap)
```

---

## Test 3: Duplicate Cache Önleme

### Adımlar:
1. Uygulamayı açın
2. Aynı bölgede (5 km içinde) birkaç kez konum değiştirin
3. Console loglarını kontrol edin

### Beklenen Sonuç:
```
[MapTileCache] Bu bölge daha önce cache'lendi, atlanıyor
```

---

## Test 4: Offline Mod Testi

### Adımlar:
1. Online modda farklı bölgeleri ziyaret edin (cache dolsun)
2. Uçak modunu açın
3. Haritayı kontrol edin
4. Sarı banner'ı doğrulayın

### Beklenen Sonuç:
- ✅ Cache'lenmiş bölgeler görünür
- ✅ "📵 Offline Mod - Cache'lenmiş harita gösteriliyor" banner'ı var
- ✅ Kamp alanı işaretleyicileri çalışıyor
- ✅ Popup'lar açılıyor
- ❌ Cache'de olmayan bölgeler boş (gri)

---

## Test 5: Cache Limiti (500 Tile)

### Adımlar:
1. 20'den fazla farklı bölgeyi ziyaret edin (500+ tile)
2. Cache istatistiklerini kontrol edin:
```typescript
import { getTileCacheStats } from '@/lib/mapTileCache';
const stats = await getTileCacheStats();
console.log('Cache stats:', stats);
```

### Beklenen Sonuç:
```
{
  tileCount: 500,  // Max limit
  totalSize: ~7-12 MB,
  maxTiles: 500
}
```

---

## Test 6: Cache Temizleme

### Adımlar:
1. Cache'i temizleyin:
```typescript
import { clearTileCache } from '@/lib/mapTileCache';
await clearTileCache();
```
2. Offline moda geçin
3. Haritayı kontrol edin

### Beklenen Sonuç:
- Harita tamamen boş (tüm tile'lar gri)
- Online moda döndüğünüzde tile'lar tekrar yüklenir

---

## Debug Komutları

### Cache İstatistiklerini Göster:
```typescript
import { getTileCacheStats } from '@/lib/mapTileCache';
const stats = await getTileCacheStats();
console.log('📊 Cache Stats:', stats);
```

### Manuel Cache:
```typescript
import { precacheRegionWithRadius } from '@/lib/mapTileCache';
const result = await precacheRegionWithRadius(41.0082, 28.9784, 20); // İstanbul
console.log('Cache Result:', result);
```

### Cache Temizle:
```typescript
import { clearTileCache } from '@/lib/mapTileCache';
await clearTileCache();
console.log('✅ Cache temizlendi');
```

---

## Bilinen Kısıtlamalar

1. **İlk Cache Süresi:** 20 km çaplı bölge için ~10-15 saniye sürebilir
2. **API Rate Limiting:** Çok hızlı konum değişimlerinde tile indirme yavaşlayabilir
3. **Depolama:** Cihazda yeterli alan olmalı (~7-12 MB)
4. **Network:** Online modda olmalısınız (ilk cache için)

---

## Performans Metrikleri

| Metrik | Değer |
|--------|-------|
| Tek zoom seviyesi cache | ~1-2 saniye |
| 20 km çap (5 zoom) cache | ~10-15 saniye |
| Offline tile yükleme | Anında (<100ms) |
| Cache lookup | <10ms |
| Duplicate check | <5ms |

---

**Test Tarihi:** 2026-01-14
**Test Eden:** -
**Versiyon:** 1.3+
