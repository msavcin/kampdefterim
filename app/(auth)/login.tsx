/**
 * Login — palette-integrated UI (L1–L3 / D1–D3)
 * Logic copied from v1.3.3 app/(auth)/login.tsx
 * Visual language: kamp-defterim-palette-mockups.html → Giriş
 *
 * Copy over: app/(auth)/login.tsx
 */

import React, { useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  type TextStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import GuestInfoModal from '../../components/GuestInfoModal';
import { loginUser, getMe, listCommunityMembers } from '../../lib/userCommunityApi';
import { saveToken } from '../../lib/auth';
import { API_URL } from '../../lib/config';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../../components/ThemeProvider';
import type { ThemeColors } from '../../constants/theme/colors';

function primaryOnColor(colors: ThemeColors): string {
  // Light primary on dark surfaces (D1 invert CTA uses near-white primary)
  const hex = (colors.primary || '').replace('#', '');
  if (hex.length < 6) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#FFFFFF';
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? colors.background : '#FFFFFF';
}

export default function LoginScreen() {
  const { colors, scheme } = useTheme();
  const isDarkMode = scheme === 'dark';
  const onPrimary = primaryOnColor(colors);
  // L3 / D3 soft pill CTAs (sage / forest)
  const pillCta =
    colors.primary === '#6B8F71' || colors.primary === '#3D5A45';

  const styles = useMemo(
    () => createLoginStyles(colors, onPrimary, pillCta),
    [colors, onPrimary, pillCta],
  );

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [identifierFocused, setIdentifierFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const passwordRef = useRef<TextInput | null>(null);

  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const guestLoginPendingRedirect = useRef(false);
  const router = useRouter();

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      const result = await loginUser({ identifier: 'misafir', password: 'Gg123.' });
      if (result && result.token) {
        await saveToken(result.token);
        const me = await getMe();
        const userToStore =
          me && me.user ? { ...me.user, role: me.user.role ?? me.role } : me;
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
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Bilgi', 'E-posta adresinize şifre sıfırlama linki gönderildi.');
        setForgotModalVisible(false);
        setForgotEmail('');
      } else {
        Alert.alert('Hata', data?.error || 'Sıfırlama isteği başarısız.');
      }
    } catch {
      Alert.alert('Hata', 'Sunucuya ulaşılamadı.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async (onGuestLoginSuccess?: () => void) => {
    setLoading(true);
    try {
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
        try {
          const justSavedRefresh = await SecureStore.getItemAsync('refresh_token');
          if (justSavedRefresh) {
            console.log(
              '[LOGIN] SecureStore refresh_token bulundu:',
              String(justSavedRefresh).slice(0, 20) + '...',
            );
          } else {
            console.log('[LOGIN] SecureStore refresh_token yok');
          }
        } catch (e) {
          console.log('[LOGIN] refresh_token kontrolü hata', e);
        }
        const me = await getMe();
        console.log('[LOGIN] getMe sonucu:', me);
        const accountUser = me?.member?.user ?? me?.user ?? null;
        const userToStore = accountUser
          ? { ...me, ...accountUser, role: accountUser.role ?? me.role }
          : { ...me, role: me.role };
        try {
          await SecureStore.setItemAsync('localUser', JSON.stringify(userToStore));
          console.log('[LOGIN] localUser kaydedildi:', userToStore);
        } catch (e) {
          console.log('[LOGIN] localUser kaydedilemedi:', e);
        }
        let canLogin = true;
        if (me && me.community_id && me.id) {
          const members = await listCommunityMembers(me.community_id);
          console.log('[LOGIN] listCommunityMembers sonucu:', members);
          const myMembership = Array.isArray(members)
            ? members.find((m: any) => m.user_id === me.id)
            : null;
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
          if (isGuest && typeof onGuestLoginSuccess === 'function') {
            onGuestLoginSuccess();
          }
          console.log('[LOGIN] Giriş başarılı, yönlendiriliyor.');
          router.replace('/(auth)/community');
        } else {
          console.log('[LOGIN] Giriş reddedildi, token siliniyor.');
          await saveToken('');
          setTimeout(() => {
            Alert.alert(
              'Uyarı',
              'Topluluğa onayınız bekleniyor. Lütfen topluluk liderinin onayını bekleyin.',
            );
          }, 100);
          return;
        }
      } else {
        console.log('[LOGIN] loginUser başarısız veya token yok:', result);
        if (result && result.error && result.error.toLowerCase().includes('pending')) {
          Alert.alert(
            'Uyarı',
            'Topluluk üyeliğiniz henüz onaylanmadı. Lütfen topluluk liderinin onayını bekleyin.',
          );
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
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo card */}
        <View style={styles.logoCard}>
          <Image
            source={
              isDarkMode
                ? require('../../assets/images/login_screen_B.png')
                : require('../../assets/images/login_screen.png')
            }
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Logo"
          />
        </View>

        <Text style={styles.brand}>Kamp Defterim</Text>
        <Text style={styles.title}>Giriş Yap</Text>
        <Text style={styles.hint}>Kampını Planla, anılarını sakla.</Text>

        <TextInput
          style={[styles.input, identifierFocused && styles.inputFocused]}
          placeholder="E-posta veya Kullanıcı Adı"
          autoCapitalize="none"
          value={identifier}
          onChangeText={setIdentifier}
          placeholderTextColor={colors.muted}
          onFocus={() => setIdentifierFocused(true)}
          onBlur={() => setIdentifierFocused(false)}
        />

        <View
          style={[
            styles.passwordRow,
            passwordFocused && styles.inputFocused,
          ]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {
            try { passwordRef.current && (passwordRef.current as any).focus(); } catch (e) {}
          }}
        >
          <TextInput
            style={styles.passwordInput}
            placeholder="Şifre"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            autoComplete="password"
            textContentType="password"
            testID="passwordInput"
            ref={passwordRef}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((s) => !s)}
            accessible
            accessibilityLabel={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            style={styles.passwordToggle}
          >
            {showPassword ? (
              <EyeOff size={20} color={colors.muted} />
            ) : (
              <Eye size={20} color={colors.muted} />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.cta, loading && styles.ctaDisabled]}
          onPress={() => handleLogin()}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={onPrimary} />
          ) : (
            <Text style={styles.ctaText}>GİRİŞ YAP</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setForgotModalVisible(true)}
          style={styles.forgotContainer}
        >
          <Text style={styles.forgotText}>Şifremi Unuttum</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/register')}
          style={styles.linkContainer}
        >
          <Text style={styles.linkMuted}>
            Hesabınız yok mu?{' '}
            <Text style={styles.linkAccent}>Kayıt olun</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleGuestLogin}
          style={styles.guestBtn}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.guestText}>Misafir olarak oturum aç</Text>
        </TouchableOpacity>

        <GuestInfoModal
          visible={guestModalVisible}
          onClose={() => {
            setGuestModalVisible(false);
            if (guestLoginPendingRedirect.current) {
              guestLoginPendingRedirect.current = false;
              setTimeout(() => {
                router.replace('/(auth)/community');
              }, 200);
            }
          }}
        />

        <Modal
          visible={forgotModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setForgotModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Şifre Sıfırlama</Text>
              <TextInput
                style={styles.input}
                placeholder="Kayıtlı E-posta adresiniz"
                autoCapitalize="none"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
              />
              <TouchableOpacity
                style={[
                  styles.cta,
                  (forgotLoading || !forgotEmail) && styles.ctaDisabled,
                ]}
                onPress={handleForgotPassword}
                disabled={forgotLoading || !forgotEmail}
              >
                {forgotLoading ? (
                  <ActivityIndicator color={onPrimary} />
                ) : (
                  <Text style={styles.ctaText}>Sıfırlama Linki Gönder</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setForgotModalVisible(false)}
                style={{ marginTop: 12 }}
              >
                <Text style={styles.modalClose}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createLoginStyles(
  colors: ThemeColors,
  onPrimary: string,
  pillCta: boolean,
) {
  const inputBase = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    color: colors.text,
  } as const;

  return StyleSheet.create({
    root: {
      flex: 1,
    },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 32,
      backgroundColor: colors.background,
    },
    logoCard: {
      alignSelf: 'center',
      marginBottom: 20,
      padding: 16,
      borderRadius: 28,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    logo: {
      width: 160,
      height: 160,
      borderRadius: 20,
      backgroundColor: colors.background,
    },
    brand: {
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.muted,
      marginBottom: 8,
    },
    title: {
      fontSize: 26,
      fontWeight: '400',
      letterSpacing: -0.4,
      marginBottom: 6,
      textAlign: 'center',
      color: colors.text,
    },
    hint: {
      fontSize: 13,
      fontWeight: '300',
      color: colors.muted,
      textAlign: 'center',
      marginBottom: 20,
      lineHeight: 18,
    },
    input: {
      ...inputBase,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      fontSize: 15,
      fontWeight: '300',
      marginBottom: 12,
    },
    inputFocused: {
      borderColor: colors.primary,
      // soft ring via border; RN has no box-shadow focus ring on Android equally
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 1,
    },
    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 6,
      marginBottom: 12,
      backgroundColor: colors.surface,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      paddingHorizontal: 10,
      fontSize: 15,
      fontWeight: '300',
      color: colors.text,
    },
    passwordToggle: {
      padding: 10,
    },
    cta: {
      height: 50,
      borderRadius: pillCta ? 999 : 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 3,
    },
    ctaDisabled: {
      opacity: 0.65,
    },
    ctaText: {
      color: onPrimary,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.6,
    },
    forgotContainer: {
      marginTop: 14,
      alignItems: 'center',
    },
    forgotText: {
      color: colors.muted,
      fontWeight: '400',
      fontSize: 13,
      textDecorationLine: 'underline',
    },
    linkContainer: {
      marginTop: 14,
      alignItems: 'center',
    },
    linkMuted: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '300',
    } as TextStyle,
    linkAccent: {
      color: colors.primary,
      fontWeight: '500',
      fontSize: 13,
    },
    guestBtn: {
      marginTop: 16,
      alignSelf: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    guestText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '400',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      width: '90%',
      borderRadius: 18,
      padding: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 6,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '500',
      marginBottom: 16,
      textAlign: 'center',
      color: colors.text,
    },
    modalClose: {
      color: colors.muted,
      textAlign: 'center',
      fontSize: 14,
    },
  });
}
