# Expo Workflow ile IAP Kurulumu

## ✅ Expo Uyumlu Çözüm

`react-native-iap` paketi **Expo config plugin** ile Expo workflow'unu bozmadan kullanılabilir.

## 🚀 Kurulum Adımları

### 1. Paketi Yükleyin
```bash
npm install react-native-iap
```

### 2. Config Plugin Eklendi
`app.json` dosyasında yapılan değişiklikler:
- ✅ `plugins` array'ine `"react-native-iap"` eklendi
- ✅ Android permissions'a `"com.android.vending.BILLING"` eklendi

### 3. Development Build Oluşturun

**Önemli**: IAP özelliği **Expo Go**'da çalışmaz. **Development build** kullanmanız gerekiyor (Expo workflow hala kullanılır).

#### Local Development Build (Önerilen)
```bash
# iOS için
npx expo run:ios

# Android için
npx expo run:android
```

#### EAS Build (Cloud)
```bash
# EAS kurulumu (ilk kez)
npm install -g eas-cli
eas login
eas build:configure

# Development build oluştur
eas build --profile development --platform android
eas build --profile development --platform ios

# Build'i cihaza yükle
eas build:run -p android
eas build:run -p ios
```

### 4. Prebuild ile Native Klasörleri Oluştur (Opsiyonel)
```bash
npx expo prebuild
```

Bu komut `ios/` ve `android/` klasörlerini oluşturur ve config plugin'leri uygular.

## 🔄 Expo Workflow Korundu

Expo workflow'u bozmadan IAP kullanıyorsunuz:
- ✅ `app.json` ile konfigürasyon
- ✅ `expo-updates` ile OTA updates
- ✅ EAS Build ile cloud builds
- ✅ Expo Router ile navigasyon
- ✅ Diğer Expo SDK'ları çalışmaya devam ediyor

**Tek fark**: Expo Go yerine development build kullanmanız gerekiyor.

## 📱 Development vs Production

### Development Build (Geliştirme)
```bash
npx expo run:android
# veya
npx expo run:ios
```
- Native kodu içerir (IAP dahil)
- Metro bundler ile hot reload çalışır
- Debugging mümkün

### Production Build (Yayın)
```bash
eas build --profile production --platform android
eas build --profile production --platform ios
```

## 🧪 Test Etme

Development build yüklendikten sonra:
1. Premium ekranını açın
2. IAP başarıyla initialize olmalı
3. Sandbox hesabı ile test edin

### Sandbox Test
- iOS: App Store Connect'te sandbox tester oluşturun
- Android: Google Play Console'da internal test track kullanın

## 📋 app.json Değişiklikleri

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-font",
      "react-native-iap",  // ← EKLENDI
      ["expo-location", {...}],
      // ... diğer pluginler
    ],
    "android": {
      "permissions": [
        // ... mevcut izinler
        "com.android.vending.BILLING"  // ← EKLENDI
      ]
    }
  }
}
```

## ⚠️ Dikkat Edilmesi Gerekenler

1. **Expo Go çalışmaz**: Development build gereklidir
2. **İlk build uzun sürer**: Native modüller derleniyor
3. **OTA updates hala çalışır**: JS değişiklikleri OTA ile güncellenebilir
4. **Native değişiklik = rebuild**: `app.json` plugin değişikliklerinde rebuild gerekir

## 🔗 Faydalı Komutlar

```bash
# Prebuild ile native klasörleri oluştur
npx expo prebuild --clean

# Development build başlat
npx expo run:android
npx expo run:ios

# EAS build durumunu kontrol et
eas build:list

# Logs görüntüle
npx expo start --dev-client
```

## 📚 Daha Fazla Bilgi

- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)
- [Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [react-native-iap Expo Plugin](https://github.com/dooboolab-community/react-native-iap#expo-managed-workflow)
- [EAS Build](https://docs.expo.dev/build/introduction/)

---

**Özet**: Expo workflow korundu, sadece Expo Go yerine development build kullanmanız gerekiyor. Tüm Expo özellikleri çalışmaya devam ediyor! 🚀
