import React, { useState, useRef } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, Image, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import GuestInfoModal from '../../components/GuestInfoModal';
import { loginUser, getMe, listCommunityMembers } from '../../lib/userCommunityApi';
import { saveToken } from '../../lib/auth';
import { API_URL } from '../../lib/config';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../../components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';

export default function LoginScreen() {
  const { colors, scheme } = useTheme();
  const themed = createThemedStyles(colors);
  const isDarkMode = scheme === 'dark';
  const [identifier, setIdentifier] = useState(''); // email veya username
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const guestLoginPendingRedirect = useRef(false);
  const router = useRouter();

    // Misafir giriş fonksiyonu
  // Misafir girişinde modalı sadece başarılı giriş sonrası açmak için callback ile handleLogin'i çağırıyoruz
  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      // Misafir login bilgileriyle doğrudan loginUser çağrılır
      const result = await loginUser({ identifier: 'misafir', password: 'Gg123.' });
      if (result && result.token) {
        await saveToken(result.token);
        const me = await getMe();
        const userToStore = me && me.user ? { ...me.user, role: me.user.role ?? me.role } : me;
        try {
          await SecureStore.setItemAsync('localUser', JSON.stringify(userToStore));
        } catch {}
        guestLoginPendingRedirect.current = true;
        setGuestModalVisible(true);
      } else {
        Alert.alert('Hata', result && result.error ? result.error : 'Giriş başarısız.');
      }
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Giriş başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_URL}/users/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Bilgi', 'E-posta adresinize şifre sıfırlama linki gönderildi.');
        setForgotModalVisible(false);
        setForgotEmail('');
      } else {
        Alert.alert('Hata', data?.error || 'Sıfırlama isteği başarısız.');
      }
    } catch (err) {
      Alert.alert('Hata', 'Sunucuya ulaşılamadı.');
    } finally {
      setForgotLoading(false);
    }
  };

  // handleLogin opsiyonel olarak bir callback alır, başarılı giriş sonrası çalışır
  const handleLogin = async (onGuestLoginSuccess?: () => void) => {
    setLoading(true);
    try {
      // Misafir girişi ise zorunlu alan kontrolü atlanır
      const isGuest = identifier === 'misafir' && password === 'Gg123.';
      if (!isGuest && (!identifier || !password)) {
        Alert.alert('Hata', 'Kullanıcı adı/eposta ve şifre zorunludur.');
        setLoading(false);
        return;
      }
      console.log('[LOGIN] identifier:', identifier, '| password:', password ? '[GİZLİ]' : '[BOŞ]');
      const result = await loginUser({ identifier, password });
      console.log('[LOGIN] loginUser sonucu:', result);
      if (result && result.token) {
        console.log('[LOGIN] Token kaydediliyor:', result.token);
        await saveToken(result.token);
        const justSavedToken = await SecureStore.getItemAsync('jwt_token');
        console.log('[LOGIN] SecureStore jwt_token:', justSavedToken);
        const tokenCheck = await saveToken ? await SecureStore.getItemAsync('jwt_token') : null;
        console.log('[LOGIN] saveToken sonrası kontrol:', tokenCheck);
        // Kullanıcı ve topluluk üyeliği durumunu kontrol et
        const me = await getMe();
        console.log('[LOGIN] getMe sonucu:', me);
        // Normalize and store only the user object to local storage, ensuring `role` comes from users table (look in member.user, user, then me.role)
        const accountUser = me?.member?.user ?? me?.user ?? null;
        const userToStore = accountUser ? { ...me, ...accountUser, role: accountUser.role ?? me.role } : { ...me, role: me.role };
        try {
          await SecureStore.setItemAsync('localUser', JSON.stringify(userToStore));
          console.log('[LOGIN] localUser kaydedildi:', userToStore);
        } catch (e) {
          console.log('[LOGIN] localUser kaydedilemedi:', e);
        }
        let canLogin = true;
        if (me && me.community_id && me.id) {
          // Kullanıcının topluluk üyeliğini sorgula
          const members = await listCommunityMembers(me.community_id);
          console.log('[LOGIN] listCommunityMembers sonucu:', members);
          const myMembership = Array.isArray(members) ? members.find((m: any) => m.user_id === me.id) : null;
          console.log('[LOGIN] myMembership:', myMembership);
          if (!myMembership) {
            canLogin = false;
            console.log('[LOGIN] Kullanıcı topluluk üyesi değil, giriş reddedildi.');
          } else {
            const status = myMembership.status || myMembership.member_status;
            console.log('[LOGIN] Üyelik status:', status);
            if (status !== 'active') {
              canLogin = false;
              console.log('[LOGIN] Üyelik aktif değil, giriş reddedildi.');
            }
          }
        }
        if (canLogin) {
          // Eğer misafir girişi ise modalı göster
          if (isGuest && typeof onGuestLoginSuccess === 'function') {
            onGuestLoginSuccess();
          }
          console.log('[LOGIN] Giriş başarılı, yönlendiriliyor.');
          router.replace('/(auth)/community');
        } else {
          console.log('[LOGIN] Giriş reddedildi, token siliniyor.');
          await saveToken('');
          setTimeout(() => {
            Alert.alert('Uyarı', 'Topluluğa onayınız bekleniyor. Lütfen topluluk liderinin onayını bekleyin.');
          }, 100);
          return;
        }
      } else {
        console.log('[LOGIN] loginUser başarısız veya token yok:', result);
        if (result && result.error && result.error.toLowerCase().includes('pending')) {
          Alert.alert('Uyarı', 'Topluluk üyeliğiniz henüz onaylanmadı. Lütfen topluluk liderinin onayını bekleyin.');
        } else {
          Alert.alert('Hata', result && result.error ? result.error : 'Giriş başarısız.');
        }
        return;
      }
    } catch (error: any) {
      console.log('[LOGIN] Hata:', error);
      Alert.alert('Hata', error?.message || 'Giriş başarısız.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: colors.surface }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.logoWrapper, { backgroundColor: colors.background }]}>
          <Image
            source={isDarkMode ? require('../../assets/images/login_screen_B.png') : require('../../assets/images/login_screen.png')}
            style={[styles.logo, { backgroundColor: colors.background }]}
            resizeMode="contain"
            accessibilityLabel="Logo"
          />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Giriş Yap</Text>
        <TextInput
          style={[themed.input, { marginBottom: 16 }]}
          placeholder="E-posta veya Kullanıcı Adı"
          autoCapitalize="none"
          value={identifier}
          onChangeText={setIdentifier}
          placeholderTextColor={colors.muted}
        />
        <View style={[styles.passwordRow, { borderColor: colors.border }]}>
          <TextInput
            style={[styles.passwordInput, { color: colors.text }]}
            placeholder="Şifre"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={() => setShowPassword((s) => !s)}
            accessible
            accessibilityLabel={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            style={styles.passwordToggle}
          >
            {showPassword ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
          </TouchableOpacity>
        </View>
        <Button title={loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'} onPress={() => handleLogin()} disabled={loading} />
        <TouchableOpacity onPress={() => setForgotModalVisible(true)} style={styles.forgotContainer}>
          <Text style={[styles.forgotText, { color: colors.muted }]}>Şifremi Unuttum</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(auth)/register')} style={styles.linkContainer}>
          <Text style={[styles.link, { color: colors.info }]}>Hesabınız yok mu? Kayıt olun</Text>
        </TouchableOpacity>

        {/* Misafir olarak giriş */}
        <TouchableOpacity onPress={handleGuestLogin} style={[styles.linkContainer, { marginTop: 8 }]}> 
          <Text style={[styles.link, { color: colors.warning }]}>Misafir olarak oturum aç</Text>
        </TouchableOpacity>

        {/* Misafir bilgilendirme modalı */}
        <GuestInfoModal
          visible={guestModalVisible}
          onClose={() => {
            setGuestModalVisible(false);
            if (guestLoginPendingRedirect.current) {
              guestLoginPendingRedirect.current = false;
              // Modal animasyonu tamamlansın diye küçük gecikme
              setTimeout(() => {
                router.replace('/(auth)/community');
              }, 200);
            }
          }}
        />

        {/* Şifremi Unuttum Modalı */}
        <Modal
          visible={forgotModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setForgotModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.muted }]}>Şifre Sıfırlama</Text>
              <TextInput
                style={[themed.input, { marginBottom: 16 }]}
                placeholder="Kayıtlı E-posta adresiniz"
                autoCapitalize="none"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
              />
              <Button
                title={forgotLoading ? 'Gönderiliyor...' : 'Sıfırlama Linki Gönder'}
                onPress={handleForgotPassword}
                disabled={forgotLoading || !forgotEmail}
              />
              <TouchableOpacity onPress={() => setForgotModalVisible(false)} style={{ marginTop: 12 }}>
                <Text style={{ color: colors.muted, textAlign: 'center' }}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  logoWrapper: {
    alignSelf: 'center',
    marginBottom: 16,
    padding: 20,
    borderRadius: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logo: {
    width: 220,
    height: 220,
    borderRadius: 24,
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, marginBottom: 16 },
  passwordInput: { flex: 1, paddingVertical: 12 },
  passwordToggle: { padding: 8 },
  linkContainer: { marginTop: 16, alignItems: 'center' },
  link: { fontWeight: '500' },
  forgotContainer: { marginTop: 8, alignItems: 'center' },
  forgotText: { fontWeight: '500', textDecorationLine: 'underline' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
});
