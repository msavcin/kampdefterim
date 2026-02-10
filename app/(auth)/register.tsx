import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { registerUser, listCommunities, joinCommunity, loginUser } from '../../lib/userCommunityApi';
import { API_URL } from '../../lib/config';
import { saveToken } from '../../lib/auth';
import { useRouter } from 'expo-router';
// Picker kaldırıldı, autocomplete için TextInput + FlatList kullanılacak

export default function RegisterScreen() {
    // E-posta doğrulama kodu için state
    const [verificationModal, setVerificationModal] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [codeSent, setCodeSent] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const [codeError, setCodeError] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'gizlilik' | 'kvkk' | null>(null);
  // modalContent kaldırıldı, artık url ile WebView kullanılacak
  // Validasyon için hata mesajları
  const [errors, setErrors] = useState<{ name?: string; username?: string; email?: string; password?: string; agreementChecked?: string }>({});
  const [communityId, setCommunityId] = useState<number | undefined>(undefined);
  const [communityNameInput, setCommunityNameInput] = useState('');
  const [communities, setCommunities] = useState<any[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<any[]>([]);
  const [showCommunitySuggestions, setShowCommunitySuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const data = await listCommunities();
        // Sadece visibility 'public' olanları al
        const visibleCommunities = Array.isArray(data) ? data.filter((c: any) => c.visibility === 'public') : [];
        setCommunities(visibleCommunities);
      } catch (e) {
        setCommunities([]);
      } finally {
        setLoadingCommunities(false);
      }
    })();
  }, []);

  // Topluluk arama inputu değiştikçe filtrele
  useEffect(() => {
    if (communityNameInput.length >= 3) {
      const filtered = communities.filter((c: any) =>
        c.name.toLowerCase().includes(communityNameInput.toLowerCase())
      );
      setFilteredCommunities(filtered);
      setShowCommunitySuggestions(true);
    } else {
      setFilteredCommunities([]);
      setShowCommunitySuggestions(false);
      setCommunityId(undefined);
    }
  }, [communityNameInput, communities]);

  // Validasyon fonksiyonu
  const validate = () => {
    const newErrors: { name?: string; username?: string; email?: string; password?: string; agreementChecked?: string } = {};
    if (!name.trim()) newErrors.name = 'Adınızı giriniz.';
    if (!username.trim()) newErrors.username = 'Kullanıcı adı giriniz.';
    if (!email.trim()) newErrors.email = 'E-posta giriniz.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) newErrors.email = 'Geçerli bir e-posta giriniz.';
    if (!password.trim()) newErrors.password = 'Şifre giriniz.';
    else if (password.length < 6) newErrors.password = 'Şifre en az 6 karakter olmalı.';
    else if (!/(?=.*[a-z])/.test(password)) newErrors.password = 'Şifre en az bir küçük harf içermeli.';
    else if (!/(?=.*[A-Z])/.test(password)) newErrors.password = 'Şifre en az bir büyük harf içermeli.';
    else if (!/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/.test(password)) newErrors.password = 'Şifre en az bir özel karakter içermeli.';
    if (!agreementChecked) newErrors.agreementChecked = 'Gizlilik Politikası ve KVKK onay kutucuğunu işaretleyin.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // E-posta doğrulama kodu gönder
  const handleSendVerificationCode = async () => {
    if (!validate()) return;
    if (!agreementChecked) {
      Alert.alert('Uyarı', 'Lütfen Gizlilik Politikası ve KVKK onay kutucuğunu işaretleyin.');
      return;
    }
    setVerificationLoading(true);
    setCodeError('');
    try {
      const res = await fetch(`${API_URL}/users/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCodeSent(true);
        setVerificationModal(true);
        setCodeError(''); // Başarılıysa hata mesajı temizle
      } else {
        setCodeError(data.error || 'Kod gönderilemedi.');
        Alert.alert('Kod Gönderilemedi', data.error || 'Kod gönderilemedi.');
      }
    } catch (e) {
      setCodeError('Kod gönderilemedi.');
    } finally {
      setVerificationLoading(false);
    }
  };

  // Kod doğrulama
  const handleVerifyCode = async () => {
    setVerificationLoading(true);
    setCodeError('');
    try {
      const res = await fetch(`${API_URL}/users/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailVerified(true);
        setVerificationModal(false);
        Alert.alert('Başarılı', 'E-posta doğrulandı. Şimdi kayıt olabilirsiniz.');
      } else {
        setCodeError(data.error || 'Kod hatalı veya süresi doldu.');
      }
    } catch (e) {
      setCodeError('Kod doğrulanamadı.');
    } finally {
      setVerificationLoading(false);
    }
  };

  // Kayıt işlemi (sadece e-posta doğrulandıysa)
  const handleRegister = async () => {
    if (!validate()) return;
    if (!emailVerified) {
      Alert.alert('Uyarı', 'Lütfen önce e-posta adresinizi doğrulayın.');
      return;
    }
    setLoading(true);
    try {
      const result = await registerUser({ name, username, email, password, communityId, trial_user: true, offline_enabled: true, agreement_accepted: agreementChecked });
      if (result && result.error) {
        Alert.alert('Hata', result.error);
      } else {
        // Kayıt başarılıysa otomatik login ol ve token'ı kaydet
        let loginOk = false;
        try {
          const loginResult = await loginUser({ identifier: email, password });
          if (loginResult && loginResult.token) {
            await saveToken(loginResult.token);
            loginOk = true;
          }
        } catch (e) {
          // login başarısızsa topluluğa ekleme de yapılamaz
        }
        if (communityId && loginOk) {
          try {
            const joinResult = await joinCommunity(communityId);
            if (joinResult && joinResult.error) {
              Alert.alert('Topluluğa ekleme hatası', joinResult.error);
            }
          } catch (e) {
            Alert.alert('Topluluğa ekleme hatası', String(e));
          }
        }
        Alert.alert('Başarılı', 'Kayıt başarılı! Giriş yapabilirsiniz.');
        router.replace('/(auth)/login');
      }
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Kayıt başarısız.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kayıt Ol</Text>
      <TextInput
        style={styles.input}
        placeholder="Adınız"
        value={name}
            placeholderTextColor="#64748b"
        onChangeText={setName}
      />
      {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="Kullanıcı Adı"
        value={username}
            placeholderTextColor="#64748b"
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      {errors.username ? <Text style={styles.error}>{errors.username}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="E-posta"
        autoCapitalize="none"
            placeholderTextColor="#64748b"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {errors.email ? <Text style={styles.error}>{errors.email}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="Şifre"
        secureTextEntry
            placeholderTextColor="#64748b"
        value={password}
        onChangeText={setPassword}
      />
      {errors.password ? <Text style={styles.error}>{errors.password}</Text> : null}
      <Text style={{ marginBottom: 8, marginTop: 8 }}>Topluluk Seçimi (isteğe bağlı)</Text>
      {/* Topluluk seçimi alanı */}
      {loadingCommunities ? (
        <ActivityIndicator />
      ) : (
        <View style={{ marginBottom: 16 }}>
          {communityId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <View style={{ backgroundColor: '#e0f2fe', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                <Text style={{ color: '#0369a1', fontWeight: 'bold', marginRight: 6 }}>{communityNameInput}</Text>
                <TouchableOpacity onPress={() => {
                  setCommunityId(undefined);
                  setCommunityNameInput('');
                }}>
                  <Text style={{ color: '#0369a1', fontWeight: 'bold', fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Topluluk adı ile ara..."
                value={communityNameInput}
                    placeholderTextColor="#64748b"
                onChangeText={text => {
                  setCommunityNameInput(text);
                  setCommunityId(undefined);
                }}
                autoCapitalize="none"
                onFocus={() => {
                  if (communityNameInput.length >= 3) setShowCommunitySuggestions(true);
                }}
              />
              {showCommunitySuggestions && filteredCommunities.length > 0 && (
                <View style={{ maxHeight: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginTop: -12, zIndex: 10 }}>
                  {filteredCommunities.map((c: any) => (
                    <TouchableOpacity
                      key={c.id}
                      style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                      onPress={() => {
                        setCommunityNameInput(c.name);
                        setCommunityId(c.id);
                        setShowCommunitySuggestions(false);
                      }}
                    >
                      <Text>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
      {/* Gizlilik ve KVKK onay kutusu ve modalı */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <TouchableOpacity
            onPress={() => setAgreementChecked(!agreementChecked)}
            style={{ width: 24, height: 24, borderWidth: 2, borderColor: agreementChecked ? '#0e7490' : '#94a3b8', borderRadius: 6, marginRight: 10, backgroundColor: agreementChecked ? '#0e7490' : '#fff', justifyContent: 'center', alignItems: 'center' }}
          >
            {agreementChecked ? <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text> : null}
          </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 13 }}>
          <Text>Üyelik kaydı ile </Text>
          <Text style={{ color: '#0e7490', textDecorationLine: 'underline' }} onPress={() => {
            setModalType('gizlilik');
            setModalVisible(true);
          }}>Gizlilik Politikası</Text>
          <Text> ve </Text>
          <Text style={{ color: '#0e7490', textDecorationLine: 'underline' }} onPress={() => {
            setModalType('kvkk');
            setModalVisible(true);
          }}>KVKK Metni</Text>
          <Text>'ni okuduğunuzu ve kabul ettiğinizi onaylıyorsunuz.</Text>
        </Text>
      </View>
      {errors.agreementChecked ? <Text style={{ color: 'red', marginBottom: 8, marginLeft: 4 }}>{errors.agreementChecked}</Text> : null}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 0, minWidth: 320, maxWidth: 380, maxHeight: '80%', overflow: 'hidden' }}>
            <Text style={{ fontWeight: 'bold', fontSize: 16, marginTop: 12, marginBottom: 0, color: '#0e7490', textAlign: 'center' }}>
              {modalType === 'gizlilik' ? 'Gizlilik Politikası' : 'KVKK Metni'}
            </Text>
            <WebView
              source={{ uri: modalType === 'gizlilik' ? 'https://www.kampdefterim.com/gizlilik-politikasi.html' : 'https://www.kampdefterim.com/KVKK.html' }}
              style={{ width: 320, height: 400, marginTop: 8 }}
              originWhitelist={["*"]}
              startInLoadingState={true}
            />
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ alignSelf: 'center', marginVertical: 8 }}>
              <Text style={{ color: '#0e7490', fontWeight: 'bold', fontSize: 15 }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {!emailVerified ? (
        <Button
          title={verificationLoading ? 'Kod Gönderiliyor...' : (codeSent ? 'Kodu Tekrar Gönder' : 'E-posta Doğrulama Kodu Gönder')}
          onPress={handleSendVerificationCode}
          disabled={verificationLoading}
        />
      ) : null}
        <TouchableOpacity
          onPress={handleRegister}
          disabled={loading || !emailVerified || !agreementChecked}
          style={[
            styles.customButton,
            (loading || !emailVerified || !agreementChecked) ? styles.customButtonDisabled : styles.customButtonActive
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={loading || !emailVerified || !agreementChecked ? styles.customButtonTextDisabled : styles.customButtonText}>KAYIT OL</Text>
          )}
        </TouchableOpacity>
            {/* Kod Girişi Modalı */}
            <Modal
              visible={verificationModal}
              transparent
              animationType="fade"
              onRequestClose={() => setVerificationModal(false)}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, alignItems: 'center', elevation: 4 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 18, color: '#0e7490' }}>E-posta Doğrulama</Text>
                  <Text style={{ marginBottom: 12, color: '#64748b', textAlign: 'center' }}>E-posta adresinize gönderilen 6 haneli kodu giriniz.</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', letterSpacing: 4, fontSize: 20, width: 160 }]}
                    placeholder="- - - - - -"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    autoFocus
                  />
                  {codeError ? <Text style={{ color: 'red', marginTop: 8 }}>{codeError}</Text> : null}
                  <View style={{ flexDirection: 'row', marginTop: 18 }}>
                    <TouchableOpacity onPress={handleVerifyCode} style={{ backgroundColor: '#0e7490', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginRight: 10 }} disabled={verificationLoading}>
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{verificationLoading ? 'Doğrulanıyor...' : 'Doğrula'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setVerificationModal(false)} style={{ padding: 10 }}>
                      <Text style={{ color: '#64748b', fontWeight: 'bold' }}>Vazgeç</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
      <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.linkContainer}>
        <Text style={styles.link}>Zaten hesabınız var mı? Giriş yap</Text>
      </TouchableOpacity>
      {/* Kayıt sonrası bilgilendirme */}
      <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 8 }}>
        Üyelik kaydı ile Gizlilik Sözleşmesi ve KVKK maddelerini kabul etmiş oluyorsunuz.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16 },
  linkContainer: { marginTop: 16, alignItems: 'center' },
  link: { color: '#007AFF', fontWeight: '500' },
  error: { color: 'red', marginBottom: 8, marginLeft: 4 },
  customButton: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  customButtonActive: {
    backgroundColor: '#0e7490',
  },
  customButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  customButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  customButtonTextDisabled: {
    color: '#cbd5e1', // silik gri
    fontWeight: 'bold',
    fontSize: 14,
  },
});
