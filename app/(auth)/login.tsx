/**
 * Login — palette-integrated UI (L1–L3 / D1–D3)
 * Logic copied from v1.3.3 app/(auth)/login.tsx
 * Visual language: kamp-defterim-palette-mockups.html → Giriş
 *
 * Copy over: app/(auth)/login.tsx
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
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
  Keyboard,
  Dimensions,
  findNodeHandle,
  UIManager,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';
import GuestInfoModal from '../../components/GuestInfoModal';
import { loginUser, getMe, listCommunityMembers } from '../../lib/userCommunityApi';
import { saveToken } from '../../lib/auth';
import { API_URL } from '../../lib/config';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventBus } from '../../lib/eventBus';
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
  const insets = useSafeAreaInsets();
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardScreenY, setKeyboardScreenY] = useState<number | null>(null);
  const [loginKeyboardOffset, setLoginKeyboardOffsetState] = useState(0);

  const passwordRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const ctaLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const ctaRef = useRef<any>(null);
  const ctaScreenLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const keyboardVisibleRef = useRef(false);
  const keyboardHeightRef = useRef(0);
  const keyboardScreenYRef = useRef<number | null>(null);
  const loginKeyboardOffsetRef = useRef(0);
  // Android 15/16'da bazı klavyeler eventScreenY değerine üst araç/suggestion barını
  // dahil etmiyor. Login CTA için de yeni Android'lerde daha büyük güvenlik payı bırakıyoruz.
  const LOGIN_KEYBOARD_MARGIN =
    Platform.OS === 'android' && (Number(Platform.Version) || 0) >= 35 ? 56 : 12;

  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const guestLoginPendingRedirect = useRef(false);
  const router = useRouter();

  const androidApiLevel = Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0;

  const setLoginKeyboardOffset = (nextOffset: number) => {
    const normalized = Math.max(0, Math.round(Number(nextOffset) || 0));
    loginKeyboardOffsetRef.current = normalized;
    setLoginKeyboardOffsetState(normalized);
  };

  const calculateAdaptiveLoginOffset = (
    layout = ctaLayoutRef.current,
    layoutScreen = ctaScreenLayoutRef.current,
    keyboardTop = keyboardScreenYRef.current,
  ) => {
    if (Platform.OS !== 'android' || !keyboardVisibleRef.current || !layout) {
      return 0;
    }
    // Öncelik: ekran koordinatları (measureInWindow) varsa onları kullan.
    const windowDims = Dimensions.get('window');
    const resolvedKeyboardTop = keyboardTop != null
      ? keyboardTop
      : Math.max(0, windowDims.height - (keyboardHeightRef.current || 0) - (insets.bottom || 0));

    const baselineCtaBottom = layoutScreen
      ? layoutScreen.y + layoutScreen.height + loginKeyboardOffsetRef.current
      : layout.y + layout.height + loginKeyboardOffsetRef.current;

    return Math.max(0, Math.ceil(baselineCtaBottom - resolvedKeyboardTop + LOGIN_KEYBOARD_MARGIN));
  };

  const applyAdaptiveLoginOffset = (phase: string, keyboardTopOverride?: number | null) => {
    const nextOffset = calculateAdaptiveLoginOffset(
      ctaLayoutRef.current,
      ctaScreenLayoutRef.current,
      keyboardTopOverride ?? keyboardScreenYRef.current,
    );
    const currentOffset = loginKeyboardOffsetRef.current;
    if (Math.abs(nextOffset - currentOffset) > 2) {
      setLoginKeyboardOffset(nextOffset);
      logLoginKeyboardDebug(`${phase}:offsetApplied`, undefined, { nextOffset, previousOffset: currentOffset });
    } else {
      logLoginKeyboardDebug(`${phase}:offsetStable`, undefined, { nextOffset, previousOffset: currentOffset });
    }
  };

  const measureRefInWindow = (ref: any) => {
    return new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      try {
        if (!ref || !ref.current) return resolve(null);
        const node = ref.current as any;
        if (typeof node.measureInWindow === 'function') {
          node.measureInWindow((x: number, y: number, width: number, height: number) => {
            resolve({ x, y, width, height });
          });
        } else {
          const handle = findNodeHandle(node);
          if (handle && UIManager && typeof UIManager.measureInWindow === 'function') {
            UIManager.measureInWindow(handle, (x: number, y: number, width: number, height: number) => {
              resolve({ x, y, width, height });
            });
          } else resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  };

  const scrollLoginActionsIntoView = () => {
    setTimeout(() => {
      try {
        scrollRef.current?.scrollToEnd({ animated: true });
      } catch {}
    }, Platform.OS === 'ios' ? 280 : 180);
  };

  const logLoginKeyboardDebug = (phase: string, event?: any, extra?: Record<string, any>) => {
    try {
      const windowDims = Dimensions.get('window');
      const screenDims = Dimensions.get('screen');
      const eventHeight = Number(event?.endCoordinates?.height ?? keyboardHeightRef.current ?? 0);
      const eventScreenY = event?.endCoordinates?.screenY ?? keyboardScreenYRef.current ?? null;
      const adaptiveOffset = calculateAdaptiveLoginOffset(ctaLayoutRef.current, eventScreenY);
      const ctaBottom = ctaLayoutRef.current
        ? ctaLayoutRef.current.y + ctaLayoutRef.current.height
        : null;
      const ctaGapToKeyboard = ctaBottom != null && eventScreenY != null
        ? eventScreenY - ctaBottom
        : null;
      console.log('[LOGIN_KEYBOARD_DEBUG]', JSON.stringify({
        phase,
        platform: Platform.OS,
        apiLevel: androidApiLevel,
        scheme,
        keyboardVisible: keyboardVisibleRef.current,
        stateKeyboardHeight: keyboardHeightRef.current,
        eventHeight,
        eventScreenY,
        windowHeight: windowDims.height,
        windowWidth: windowDims.width,
        screenHeight: screenDims.height,
        screenWidth: screenDims.width,
        insetsTop: insets.top,
        insetsBottom: insets.bottom,
        keyboardAvoidingBehavior: Platform.OS === 'ios' ? 'padding' : 'undefined',
        adaptiveOffset,
        loginKeyboardOffset: loginKeyboardOffsetRef.current,
        loginKeyboardMargin: LOGIN_KEYBOARD_MARGIN,
        identifierFocused,
        passwordFocused,
        ctaBottom,
        ctaGapToKeyboard,
        ctaLayout: ctaLayoutRef.current,
        ...(extra || {}),
      }));
    } catch (debugError) {
      console.warn('[LOGIN_KEYBOARD_DEBUG] log error', debugError);
    }
  };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event: any) => {
      const nextHeight = Number(event?.endCoordinates?.height || 0);
      const nextScreenY = event?.endCoordinates?.screenY ?? null;
      keyboardVisibleRef.current = true;
      keyboardHeightRef.current = nextHeight;
      keyboardScreenYRef.current = nextScreenY;
      setKeyboardVisible(true);
      setKeyboardHeight(nextHeight);
      setKeyboardScreenY(nextScreenY);
      // Önce Android'in doğal resize davranışını ölç; sadece CTA klavyenin altında kalırsa
      // gerekli kadar offset uygula.
      setLoginKeyboardOffset(0);
      logLoginKeyboardDebug('keyboardDidShow', event, { nextKeyboardHeight: nextHeight, nextScreenY });
      // measure CTA in window coordinates to get reliable comparison with keyboard screenY
      (async () => {
        const measured = await measureRefInWindow(ctaRef);
        if (measured) {
          ctaScreenLayoutRef.current = measured;
          logLoginKeyboardDebug('ctaMeasuredOnKeyboardShow', undefined, { measured });
        }
        setTimeout(() => applyAdaptiveLoginOffset('keyboardDidShow+250ms', nextScreenY), 250);
        setTimeout(() => applyAdaptiveLoginOffset('keyboardDidShow+600ms', nextScreenY), 600);
        scrollLoginActionsIntoView();
      })();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      logLoginKeyboardDebug('keyboardDidHide');
      keyboardVisibleRef.current = false;
      keyboardHeightRef.current = 0;
      keyboardScreenYRef.current = null;
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      setKeyboardScreenY(null);
      setLoginKeyboardOffset(0);
    });
    return () => {
      try { showSub.remove(); } catch {}
      try { hideSub.remove(); } catch {}
    };
  }, []);

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      const result = await loginUser({ identifier: 'misafir', password: 'Gg123.' });
      if (result && result.token) {
        await saveToken(result.token);
        const me = await getMe();
        const userToStore =
          me && me.user
            ? {
                ...me.user,
                role: me.user.role ?? me.role,
                offline_enabled: !!(me.offline_enabled || me.user.offline_enabled),
                isPremium: !!(me.isPremium || me.is_premium || me.offline_enabled || me.user.isPremium || me.user.is_premium || me.user.offline_enabled),
              }
            : me;
        try {
          await SecureStore.setItemAsync('localUser', JSON.stringify(userToStore));
          const premium = !!(userToStore?.is_premium || userToStore?.isPremium || userToStore?.offline_enabled);
          await AsyncStorage.setItem('@cached_is_premium', premium ? '1' : '0');
          eventBus.emit('subscription:statusUpdated', {
            isActive: premium,
            offlineEnabled: premium,
            is_premium: premium,
            source: 'login',
          });
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
          ? {
              ...me,
              ...accountUser,
              role: accountUser.role ?? me.role,
              offline_enabled: !!(me.offline_enabled || accountUser.offline_enabled),
              isPremium: !!(me.isPremium || me.is_premium || me.offline_enabled || accountUser.isPremium || accountUser.is_premium || accountUser.offline_enabled),
            }
          : { ...me, role: me.role };
        const loginPremium = !!(userToStore?.is_premium || userToStore?.isPremium || userToStore?.offline_enabled);
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
          await AsyncStorage.setItem('@cached_is_premium', loginPremium ? '1' : '0');
          eventBus.emit('subscription:statusUpdated', {
            isActive: loginPremium,
            offlineEnabled: loginPremium,
            is_premium: loginPremium,
            isPremium: loginPremium,
            source: 'login',
          });
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.container,
          keyboardVisible && styles.containerKeyboard,
          loginKeyboardOffset > 0 && { paddingBottom: loginKeyboardOffset + 24 },
        ]}
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
          onFocus={() => {
            setIdentifierFocused(true);
            scrollLoginActionsIntoView();
          }}
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
            onFocus={() => {
              setPasswordFocused(true);
              scrollLoginActionsIntoView();
            }}
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
          ref={ctaRef}
          onLayout={(event) => {
            ctaLayoutRef.current = event.nativeEvent.layout;
            logLoginKeyboardDebug('ctaLayout', undefined, { layout: event.nativeEvent.layout, loginKeyboardOffset });
            (async () => {
              try {
                const measured = await measureRefInWindow(ctaRef);
                if (measured) {
                  ctaScreenLayoutRef.current = measured;
                  logLoginKeyboardDebug('ctaLayoutMeasured', undefined, { measured });
                }
              } catch (e) {}
              applyAdaptiveLoginOffset('ctaLayout');
            })();
          }}
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
    containerKeyboard: {
      justifyContent: 'flex-start',
      paddingTop: Platform.OS === 'ios' ? 24 : 18,
      paddingBottom: 96,
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
