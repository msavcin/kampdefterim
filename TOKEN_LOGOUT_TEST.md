# Token Auto-Logout Test Rehberi

## Test Yöntemi 1: Hızlı Test (30 Saniye)

### Adımlar:
1. `hooks/useTokenAutoLogout.ts` dosyasını aç
2. `TEST_MODE` değişkenini `true` yap
3. Uygulamayı yeniden başlat: `npm start`
4. Uygulamaya giriş yap
5. **30 saniye bekle**
6. Otomatik olarak login sayfasına yönlendirilmelisiniz
7. Console logları kontrol et:
   ```
   [TOKEN - TEST MODU] Token 30 saniye sonra otomatik sona erecek
   [TOKEN] Token süresi doldu, otomatik çıkış yapılıyor
   [AUTH] removeToken çağrıldı
   ```

### Test Sonrası:
- `TEST_MODE` değişkenini tekrar `false` yap
- Production'a göndermeden önce bu değeri kontrol et!

---

## Test Yöntemi 2: Gerçek Token Süresi

### Adımlar:
1. Backend'de token süresini kısalt (örn: 5 dakika)
2. Uygulamaya giriş yap
3. Token süresinin dolmasını bekle
4. Otomatik logout olmalı

### Console'da Göreceğin Loglar:
- İlk giriş: `[TOKEN] Token süre kontrolü: X dakika kaldı`
- Her dakika: Token kontrol logu
- Uygulama ön plana geldiğinde: `[TOKEN] Uygulama ön plana geldi, token kontrol ediliyor`
- Süre dolduğunda: `[TOKEN] Token süresi doldu, otomatik çıkış yapılıyor`

---

## Test Yöntemi 3: Manuel Token Değiştirme

### AsyncStorage ile Test:
1. Login yap
2. React Native Debugger veya Flipper aç
3. AsyncStorage'daki `jwt_token` değerini kopyala
4. Token'ı [jwt.io](https://jwt.io) sitesinde decode et
5. `exp` değerini geçmiş bir zamana değiştir
6. Yeni token'ı AsyncStorage'a kaydet
7. Uygulamayı arka plana al ve ön plana getir
8. Veya 1 dakika bekle
9. Otomatik logout olmalı

---

## Test Yöntemi 4: AppState Testi

### Arka Plan / Ön Plan Testi:
1. Uygulamaya login yap
2. Uygulamayı arka plana al (home tuşu)
3. 5-10 saniye bekle
4. Uygulamayı tekrar ön plana getir
5. Console'da şu logu görmelisin:
   ```
   [TOKEN] Uygulama ön plana geldi, token kontrol ediliyor
   ```

---

## Beklenen Davranışlar

✅ **Başarılı Logout Senaryoları:**
- Token süresi dolduğunda → Login sayfasına yönlendir
- Token geçersizse → Login sayfasına yönlendir
- Token decode edilemezse → Login sayfasına yönlendir

✅ **Kontrol Zamanlamaları:**
- Uygulama ilk açıldığında
- Her 60 saniyede bir
- Uygulama arka plandan ön plana geldiğinde

✅ **Console Logları:**
- Her kontrolde token kalan süresi gösterilmeli
- Logout işlemi loglanmalı
- Hata durumları loglanmalı

---

## Sorun Giderme

### Problem: Logout olmuyor
- `app/_layout.tsx` dosyasında `useTokenAutoLogout()` çağrıldığından emin ol
- Console loglarını kontrol et, token kontrolü yapılıyor mu?
- Token'ın gerçekten süresinin dolduğundan emin ol

### Problem: Test modunda 30 saniye geçmesine rağmen logout olmuyor
- Console loglarını kontrol et
- `TEST_MODE` değişkeninin `true` olduğundan emin ol
- Uygulamayı tamamen yeniden başlat

### Problem: Sürekli logout oluyor
- Token süresini kontrol et
- Backend'den gelen token'ın geçerli olduğundan emin ol
- `exp` değerinin doğru olduğunu jwt.io'da kontrol et

---

## Önemli Notlar

⚠️ **Production'a göndermeden önce:**
- `TEST_MODE = false` olmalı
- Console logları gerekirse kaldırılabilir
- Token süresi backend'de uygun şekilde ayarlanmalı (örn: 7 gün)

📱 **Kullanıcı Deneyimi:**
- Token dolduğunda kullanıcı login ekranına gider
- Mevcut state kaybolur
- Kullanıcıya bilgilendirme mesajı gösterilebilir (opsiyonel)
