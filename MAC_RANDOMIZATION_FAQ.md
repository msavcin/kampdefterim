# MAC Randomization ve Güvenlik - Sık Sorulan Sorular

## 🔐 MAC Randomization Nedir?

Android 10+ cihazlarda varsayılan olarak her WiFi ağı için **rastgele MAC adresi** kullanılır. Bu özellik kullanıcı gizliliğini korumak için tasarlanmıştır.

### Davranış:
- Her ağ için farklı, sabit bir rastgele MAC
- Aynı ağa tekrar bağlanınca aynı MAC kullanılır
- Kullanıcı ayarlardan değiştirebilir: "Rastgele MAC" / "Cihaz MAC"

## ❓ Sorun Olur mu?

**Hayır, sorun olmaz!** Sistem **userId bazlı** çalıştığı için MAC randomization'dan etkilenmez.

## ✅ Sistemin Çalışma Şekli

### PRIMARY KEY: userId
```
Peer Tracking: userId → { host, port, userName, macAddress? }
                ↑
           HER ZAMAN GÜVENİLİR
```

### SECONDARY KEY: MAC (opsiyonel)
```
MAC Cache: macAddress → { userId, lastHost, lastPort }
                ↑
         YARDIMCI ANAHTAR
  (IP değişikliklerinde kullanılır)
```

## 🔄 MAC Değişikliği Senaryoları

### Senaryo 1: Normal Kullanım (MAC Değişmez)
```
1. Cihaz WiFi'ye bağlanır → MAC: AA:BB:CC
2. Uygulama açılır → MAC: AA:BB:CC ✓
3. Uygulama kapatılır
4. Uygulama açılır → MAC: AA:BB:CC ✓
   → userId cache ile peer tanınır ✓
```

### Senaryo 2: MAC Randomization Aktif
```
1. Cihaz WiFi'den çıkar
2. Farklı WiFi'ye bağlanır → MAC: 11:22:33 (yeni)
3. Uygulama açılır → Uyarı: "MAC değişti"
   → Eski MAC cache temizlenir
   → userId cache KORUNUR ✓
   → Peer yine tanınır ✓
```

### Senaryo 3: IP Değişikliği + MAC Randomization
```
1. Peer A: userId=123, IP=192.168.1.10, MAC=AA:BB:CC
2. IP değişir → 192.168.1.20
3. ARP izleme tespit eder:
   - MAC cache yoksa → userId ile tara ✓
   - MAC cache varsa → Hem MAC hem userId ile tara ✓
4. Peer tekrar bulunur ✓
```

## 📊 Cache Öncelik Sistemi

```
1. PRIMARY: _knownPeers (userId bazlı)
   └─> Her zaman kontrol edilir
   └─> MAC randomization'dan bağımsız
   └─> Geriye uyumlu

2. SECONDARY: _knownPeersByMac (MAC bazlı)
   └─> Opsiyonel kontrol
   └─> IP değişikliklerinde yardımcı
   └─> MAC yoksa/değişirse atlanır

3. FALLBACK: Subnet scan + ARP
   └─> Cache'te yoksa ağ taraması
   └─> Tüm cihazları bulur
```

## 🛡️ Gizlilik ve Güvenlik

### Veri Paylaşımı:
- **MAC adresi**: Sadece P2P handshake'te paylaşılır
- **userId**: Her zaman paylaşılır (zorunlu)
- **Sunucuya**: Hiçbir MAC adresi gönderilmez ✓

### Randomization Desteği:
- ✅ Sistem MAC olmadan çalışır
- ✅ MAC değişse bile peer tanınır
- ✅ Kullanıcı gizliliği korunur

## 🔧 Uygulama Her Açıldığında Kontrol

### Otomatik MAC Kontrolü (`start()`)

```typescript
1. Yeni MAC al
2. Önceki MAC ile karşılaştır
3. Değiştiyse:
   - Uyarı ver: "⚠️ MAC değişti"
   - Eski MAC cache'ini temizle
   - userId cache'i KORU ✓
4. Yeni MAC'i kaydet
```

### Güncellemeler Gerekli mi?

**Hayır, otomatik güncellenir:**
- MAC değişikliği otomatik tespit edilir
- Eski cache temizlenir
- userId cache korunur
- Peer tracking devam eder

## 📱 Kullanıcı Tarafı

Kullanıcı hiçbir şey yapmak zorunda değil:

### "Rastgele MAC" Açıksa:
- ✅ Sistem çalışmaya devam eder
- ✅ Peer'lar bulunur
- ⚠️ Log: "MAC randomization tespit edildi"

### "Cihaz MAC" Açıksa:
- ✅ Sistem çalışmaya devam eder
- ✅ MAC cache ek performans sağlar
- ✅ IP değişiklikleri daha hızlı tespit edilir

## 🧪 Test Senaryoları

### Test 1: MAC Randomization Aktif
```bash
1. WiFi ayarlarından "Rastgele MAC kullan" seç
2. WiFi'ye bağlan
3. Uygulamayı aç
4. Log: "⚠️ MAC adresi alınamadı"
5. Başka cihazla mesajlaş → Başarılı ✓
6. Uygulamayı kapat/aç
7. Peer'lar hâlâ bulunuyor ✓
```

### Test 2: MAC Değişikliği
```bash
1. Ağ A'ya bağlan (MAC: AA:BB:CC)
2. Peer ile bağlan
3. Ağ B'ye geç (MAC: 11:22:33 - yeni)
4. Log: "⚠️ MAC değişti"
5. Ağ A'ya dön (MAC: AA:BB:CC - eski)
6. Peer userId ile bulunur ✓
```

### Test 3: Hybrid Senaryo
```bash
1. Cihaz A: Cihaz MAC kullan
2. Cihaz B: Rastgele MAC kullan
3. A ↔ B mesajlaşma → Başarılı ✓
4. B'nin IP'si değişir
5. A, B'yi userId ile bulur ✓
6. B'nin MAC'i değişir
7. A, B'yi yine userId ile bulur ✓
```

## 📝 Log Örnekleri

### Normal Başlatma:
```
[WifiLanTransport] kendi MAC adresi: aa:bb:cc:dd:ee:ff
[WifiLanTransport] peer cache güncellendi: user123 (MAC: 11:22:33:44:55:66) IP: 192.168.43.2
```

### MAC Randomization Aktif:
```
⚠️ MAC adresi alınamadı - randomization aktif olabilir
[WifiLanTransport] peer cache güncellendi: user123 (MAC yok) IP: 192.168.43.2
[WifiLanTransport] bilinen peer hızlı tarama (userId): user123 192.168.43.2 (MAC yok)
```

### MAC Değişikliği:
```
⚠️ MAC adresi değişti: aa:bb:cc:dd:ee:ff → 11:22:33:44:55:66
[WifiLanTransport] Eski MAC cache temizlendi: aa:bb:cc:dd:ee:ff
⚠️ Peer MAC değişti: user456 (old_mac → new_mac)
```

## 🎯 Sonuç

**Sistem tamamen MAC randomization uyumludur:**

✅ MAC randomization sorun oluşturmaz  
✅ Her başlatmada otomatik kontrol  
✅ Güncelleme gerekmez  
✅ Kullanıcı müdahalesi gerekmez  
✅ Geriye uyumlu  
✅ Gizlilik dostu  

---

**Son Güncelleme**: 2026-08-15  
**Durum**: Production Ready ✅
