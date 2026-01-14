# Offline Harita Cache Sistemi

## Genel Bakış

Uygulama artık offline modda harita tile'larını cache'leyerek kullanıcılara daha iyi bir deneyim sunuyor. Online olduğunuzda görüntülediğiniz harita bölgeleri otomatik olarak cache'lenir ve offline modda kullanılabilir hale gelir.

## Nasıl Çalışır?

### 1. **Otomatik Tile Cache'leme**
- Online modda haritayı görüntülerken, her yüklenen tile otomatik olarak cihazınıza kaydedilir
- Cache sistemi maksimum 500 tile saklar (yaklaşık 20-30 farklı bölge)
- Eski tile'lar otomatik olarak silinir (LRU - Least Recently Used)

### 2. **Ön-Cache Mekanizması**
- Konumunuz değiştiğinde (1 km'den fazla), etrafınızdaki **20 km çapında** bölge otomatik olarak cache'lenir
- Birden fazla zoom seviyesinde tile indirilir (zoom 9-13 arası)
  - Zoom 9: 3x3 grid (9 tile) - Genel görünüm
  - Zoom 10: 5x5 grid (25 tile) - Bölge görünümü
  - Zoom 11: 7x7 grid (49 tile) - İlçe seviyesi
  - Zoom 12: 9x9 grid (81 tile) - Mahalle seviyesi
  - Zoom 13: 17x17 grid (289 tile) - Detaylı görünüm
- **Toplam: ~453 tile** her konum değişikliğinde
- Daha önce cache'lenmiş bölgeler (5 km içinde) tekrar cache'lenmez
- Ön-cache işlemi arka planda, performansı etkilemeden gerçekleşir

### 3. **Offline Mod**
- İnternet bağlantısı kesildiğinde cache'lenmiş tile'lar otomatik olarak kullanılır
- Cache'de olmayan bölgeler boş görünür (gri renk)
- Sarı banner ile offline modda olduğunuz bildirilir

## Teknik Detaylar

### Dosya Yapısı
```
lib/
  └── mapTileCache.ts      # Tile cache yönetimi
app/(tabs)/
  └── index.tsx            # Harita ekranı (cache entegrasyonu)
```

### API Fonksiyonları

#### `getCachedTile(z, x, y): Promise<string | null>`
Belirtilen tile koordinatlarını cache'den okur ve base64 string olarak döner.

#### `cacheTile(z, x, y): Promise<boolean>`
Belirtilen tile'ı sunucudan indirir ve cache'e kaydeder.

#### `precacheRegionWithRadius(lat, lon, radiusKm): Promise<CacheResult>`
Belirtilen koordinat etrafındaki bölgeyi çoklu zoom seviyelerinde ön-cache'ler.

**Parametreler:**
- `lat`: Merkez enlem
- `lon`: Merkez boylam
- `radiusKm`: Çap (km cinsinden, varsayılan: 20)

**Dönüş:** 
```typescript
{
  totalTiles: number;      // Cache'lenen toplam tile sayısı
  alreadyCached: boolean;  // Bölge daha önce cache'lenmiş mi?
}
```

**Özellikler:**
- 5 farklı zoom seviyesinde (9-13) tile indirir
- Daha önce cache'lenmiş bölgeleri kontrol eder (5 km threshold)
- OtKonum Değişiklik Threshold:** 1 km (daha az değişimlerde cache yapılmaz)
- **Bölge Cache Threshold:** 5 km (bu mesafe içindeki bölgeler tekrar cache'lenmez)
- **Otomatik Cache Çapı:** 20 km (konum değiştiğinde)
- **omatik tile radius hesaplaması
- API rate limiting için delay ekler

#### `precacheTilesForRegion(lat, lon, zoom, radius): Promise<number>`
Belirtilen koordinat etrafındaki tile'ları tek zoom seviyesinde ön-cache'ler.

**Parametreler:**
- `lat`: Merkez enlem
- `lon`: Merkez boylam
- `zoom`: Zoom seviyesi (varsayılan: 13)
- `radius`: Kaç tile yarıçapı (varsayının konumuna gidin
2. Uygulama otomatik olarak **20 km çapında** bölgeyi cache'ler
3. Alternatif kamp alanlarını inceleyin (hepsi cache'lenir)
4. Offline modda (dağda/ormanda) tüm bölgeye erişebilirsiniz

### Senaryo 3: Uzun Yol Seyahati
1. Online modda rotanız boyunca konumlar değiştikçe
2. Her **1 km'den fazla** değişimde yeni bölge cache'lenir
3. 20 km çaplı bölgeler otomatik indirilir
4. Bağlantı kesildiğinde son 50 bölge görünür kalır

#### `clearTileCache(): Promise<void>`
Tüm cache'lenmiş tile'ları siler.

#### `getTileCacheStats(): Promise<CacheStats>`
Cache istatistiklerini döner (tile sayısı, toplam boyut, vb.)

### Cache Limitleri
- **Maksimum Tile Sayısı:** 500 tile
- **TTL (Time To Live):** Yok (manuel temizlenene kadar saklanır)
- **Depolama Konumu:** `FileSystem.documentDirectory + 'map_tiles/'`
- **Ortalama Tile Boyutu:** ~15-25 KB
- **Toplam Cache Boyutu:** ~7-12 MB (500 tile için)

## Kullanım Senaryoları

### Senaryo 1: Şehir İçi Gezinti
1. Online modda şehir merkezinde haritayı açın
2. Birkaç farklı bölgeye zoom yapın
3. Offline moda geçtiğinizde bu bölgeler görünür olacak

### Senaryo 2: Kamp Alanı Planlaması
1. Online modda gideceğiniz kamp alanlarını haritada görüntüleyin
2. Etraftaki alternatif alanları da inceleyin
3. Offline modda (dağda/ormanda) bu alanlara erişebilirsiniz

### Senaryo 3: Bağlantı Kaybı
1. Harita kullanırken bağlantı kesilirse
2. Son görüntülediğiniz bölge hala görünür olur
3. Kamp alanı işaretleyicileri ve popup'lar çalışmaya devam eder

## Sınırlamalar

❌ **Cache'de olmayan bölgeler görüntülenemez**
- Offline modda yeni bir bölgeye gidemezsiniz
- Sadece daha önce cache'lenen bölgeler görünür

❌ **Harita güncellemeleri**
- Harita tile'ları güncellenmez (OSM değişiklikleri)
- Manuel cache temizleme yapılabilir

❌ **Depolama Sınırı**
- Maksimum 500 tile (cihaz deposuna bağlı)
- Eski tile'lar otomatik silinir

## Sorun Giderme

### Harita Offline Modda Görünmüyor
1. Online modda haritayı en az bir kez açtığınızdan emin olun
2. Cache istatistiklerini kontrol edin (profil > ayarlar)
3. Gerekirse cache'i temizleyip yeniden online modda açın

### Bazı Bölgeler Boş Görünüyor
- Bu bölgeler daha önce cache'lenmemiş demektir
- Online moda geçip bu bölgeleri görüntüleyin

### Cache Boyutu Çok Büyüdü
- Cache otomatik olarak 500 tile ile sınırlıdır
- Manuel temizleme: `clearTileCache()` fonksiyonunu çağırın

## Geliştirici Notları

### Debug Logları
```typescript
if (__DEV__) {
  console.log('[MapTileCache] Tile cached:', z, x, y);
  console.log('[MapTileCache] Cache stats:', await getTileCacheStats());
}
```

### Performance İpuçları
- Ön-cache işlemi 1 saniye gecikme ile başlar (UI bloklanmasını önler)
- WebView message passing için base64 encoding kullanılır
- Tile yükleme paralel yapılmaz (API rate limiting)

### Future Improvements
- [ ] Progressive Web App (PWA) desteği
- [ ] Vektör tile desteği (daha küçük boyut)
- [ ] Kullanıcı tanımlı cache bölgeleri
- [ ] Otomatik cache temizleme ayarı
- [ ] Cache sıkıştırma (gzip)

## Lisans ve Katkı

Bu özellik KampDefterim v1.3+ için geliştirilmiştir.

**OpenStreetMap Tiles:** © OpenStreetMap contributors
**Lisans:** CC BY-SA 2.0

---

**Son Güncelleme:** 2026-01-14
**Versiyon:** 1.0.0
