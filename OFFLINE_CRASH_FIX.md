# Offline Mode Crash Düzeltmesi

## Sorun
Uygulama internet olmadığında offline mode'a geçerken aşağıdaki hata ile çöküyordu:
```
com.facebook.react.common.JavascriptException: Error: Requiring unknown module "3056"
```

## Kök Neden
`lib/wifiLanTransport.ts` dosyasında native modüller (`react-native-zeroconf`, `react-native-tcp-socket`, `expo-network`) **conditional require** ile yükleniyordu:

```typescript
// ❌ Eski Kod (Hatalı)
const ZeroconfModule = require('react-native-zeroconf');
const TcpSocket = require('react-native-tcp-socket');
```

Metro bundler, runtime'da (fonksiyon içinde) yapılan `require()` çağrılarını düzgün paketleyemiyor. Bu durum özellikle offline mode'a geçerken modül yüklenmeye çalışıldığında "Requiring unknown module" hatasına neden oluyordu.

## Çözüm

### 1. Native Modül Import'larını Dosya Başına Taşıma
Tüm conditional require ifadeleri dosyanın en üstüne taşınarak global değişkenlere atandı:

```typescript
// ✅ Yeni Kod (Düzeltilmiş)
let TcpSocket: any = null;
let Zeroconf: any = null;
let NativeModules: any = null;
let Platform: any = null;
let Network: any = null;

try {
  TcpSocket = require('react-native-tcp-socket');
} catch (e) {
  console.warn('[WifiLanTransport] react-native-tcp-socket yüklenemedi:', e);
}

try {
  const ZeroconfModule = require('react-native-zeroconf');
  Zeroconf = ZeroconfModule.default ?? ZeroconfModule;
} catch (e) {
  console.warn('[WifiLanTransport] react-native-zeroconf yüklenemedi:', e);
}

// ... diğer modüller
```

### 2. Graceful Fail Kontrolleri
Her fonksiyonda modül yüklenip yüklenmediği kontrol edilerek graceful fail yapıldı:

```typescript
private async _startDiscovery(): Promise<void> {
  if (!Zeroconf) {
    console.warn('[WifiLanTransport] Zeroconf modülü yüklenmemiş, mDNS keşif başlatılamıyor');
    return;
  }
  // ... devam eden kod
}

private async _startTcpServer(): Promise<void> {
  if (!TcpSocket) {
    console.warn('[WifiLanTransport] TcpSocket modülü yüklenmemiş, TCP sunucu başlatılamıyor');
    return;
  }
  // ... devam eden kod
}
```

### 3. Eksik Bağımlılık Ekleme
`package.json`'a eksik olan `react-native-zeroconf` modülü eklendi:

```json
"react-native-zeroconf": "^0.13.0"
```

## Değiştirilen Dosyalar

1. **lib/wifiLanTransport.ts**
   - Native modül import'ları dosya başına taşındı
   - Tüm conditional require ifadeleri global değişkenlere dönüştürüldü
   - Her fonksiyonda modül varlık kontrolü eklendi

2. **package.json**
   - `react-native-zeroconf` bağımlılığı eklendi

## Test Adımları

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

2. **Native modülleri yeniden link edin (gerekirse):**
   ```bash
   npx expo prebuild --clean
   ```

3. **Android build:**
   ```bash
   cd android
   ./gradlew clean
   ./gradlew bundleRelease
   ```

4. **Test senaryosu:**
   - Uygulamayı açın
   - İnternet bağlantısını kapatın (Airplane mode)
   - Uygulamanın offline mode'a geçtiğini doğrulayın
   - Crash olmadan çalışmaya devam etmeli

## Ek Notlar

- Bu düzeltme **Metro bundler'ın modül çözümleme mekanizmasını** düzgün çalıştırmak için yapılmıştır
- Tüm native modüller artık build zamanında paketlenir, runtime'da lazy loading yapılmaz
- Modül yüklenemezse (örn. Expo Go'da) gracefully fail edilir ve uygulama çökmez
- Offline chat özelliği sadece EAS Build ile derlenen uygulamalarda çalışır (Expo Go desteklemez)

## Gelecek İyileştirmeler

- [ ] Native modül yükleme durumunu kullanıcıya bildir
- [ ] Offline özellikler için platform kontrolü ekle
- [ ] Expo Go için fallback davranışları tanımla
