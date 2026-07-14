/**
 * Register — palette-integrated UI (L1–L3 / D1–D3)
 * Logic from v1.3.3 app/(auth)/register.tsx
 * Visual language aligned with login.tsx + palette mockups
 *
 * Copy over: app/(auth)/register.tsx
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type TextStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
  registerUser,
  listCommunities,
  joinCommunity,
  loginUser,
} from '../../lib/userCommunityApi';
import { API_URL } from '../../lib/config';
import { saveToken } from '../../lib/auth';
import { useRouter } from 'expo-router';
import { useTheme } from '../../components/ThemeProvider';
import type { ThemeColors } from '../../constants/theme/colors';

function primaryOnColor(colors: ThemeColors): string {
  const hex = (colors.primary || '').replace('#', '');
  if (hex.length < 6) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#FFFFFF';
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? colors.background : '#FFFFFF';
}

export default function RegisterScreen() {
  const { colors } = useTheme();
  const onPrimary = primaryOnColor(colors);
  const pillCta =
    colors.primary === '#6B8F71' || colors.primary === '#3D5A45';
  const styles = useMemo(
    () => createRegisterStyles(colors, onPrimary, pillCta),
    [colors, onPrimary, pillCta],
  );

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
  const [errors, setErrors] = useState<{
    name?: string;
    username?: string;
    email?: string;
    password?: string;
    agreementChecked?: string;
  }>({});
  const [communityId, setCommunityId] = useState<number | undefined>(undefined);
  const [communityNameInput, setCommunityNameInput] = useState('');
  const [communities, setCommunities] = useState<any[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<any[]>([]);
  const [showCommunitySuggestions, setShowCommunitySuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const data = await listCommunities();
        const visibleCommunities = Array.isArray(data)
          ? data.filter((c: any) => c.visibility === 'public')
          : [];
        setCommunities(visibleCommunities);
      } catch {
        setCommunities([]);
      } finally {
        setLoadingCommunities(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (communityNameInput.length >= 3) {
      const filtered = communities.filter((c: any) =>
        c.name.toLowerCase().includes(communityNameInput.toLowerCase()),
      );
      setFilteredCommunities(filtered);
      setShowCommunitySuggestions(true);
    } else {
      setFilteredCommunities([]);
      setShowCommunitySuggestions(false);
      setCommunityId(undefined);
    }
  }, [communityNameInput, communities]);

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'Adınızı giriniz.';
    if (!username.trim()) newErrors.username = 'Kullanıcı adı giriniz.';
    if (!email.trim()) newErrors.email = 'E-posta giriniz.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) newErrors.email = 'Geçerli bir e-posta giriniz.';
    if (!password.trim()) newErrors.password = 'Şifre giriniz.';
    else if (password.length < 6) newErrors.password = 'Şifre en az 6 karakter olmalı.';
    else if (!/(?=.*[a-z])/.test(password))
      newErrors.password = 'Şifre en az bir küçük harf içermeli.';
    else if (!/(?=.*[A-Z])/.test(password))
      newErrors.password = 'Şifre en az bir büyük harf içermeli.';
    else if (!/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/.test(password))
      newErrors.password = 'Şifre en az bir özel karakter içermeli.';
    if (!agreementChecked)
      newErrors.agreementChecked =
        'Gizlilik Politikası ve KVKK onay kutucuğunu işaretleyin.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendVerificationCode = async () => {
    if (!validate()) return;
    if (!agreementChecked) {
      Alert.alert(
        'Uyarı',
        'Lütfen Gizlilik Politikası ve KVKK onay kutucuğunu işaretleyin.',
      );
      return;
    }
    setVerificationLoading(true);
    setCodeError('');
    try {
      const res = await fetch(`${API_URL}/users/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCodeSent(true);
        setVerificationModal(true);
        setCodeError('');
      } else {
        setCodeError(data.error || 'Kod gönderilemedi.');
        Alert.alert('Kod Gönderilemedi', data.error || 'Kod gönderilemedi.');
      }
    } catch {
      setCodeError('Kod gönderilemedi.');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setVerificationLoading(true);
    setCodeError('');
    try {
      const res = await fetch(`${API_URL}/users/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailVerified(true);
        setVerificationModal(false);
        Alert.alert('Başarılı', 'E-posta doğrulandı. Şimdi kayıt olabilirsiniz.');
      } else {
        setCodeError(data.error || 'Kod hatalı veya süresi doldu.');
      }
    } catch {
      setCodeError('Kod doğrulanamadı.');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!validate()) return;
    if (!emailVerified) {
      Alert.alert('Uyarı', 'Lütfen önce e-posta adresinizi doğrulayın.');
      return;
    }
    setLoading(true);
    try {
      const result = await registerUser({
        name,
        username,
        email,
        password,
        communityId,
        trial_user: true,
        offline_enabled: true,
        agreement_accepted: agreementChecked,
      });
      if (result && result.error) {
        Alert.alert('Hata', result.error);
      } else {
        let loginOk = false;
        try {
          const loginResult = await loginUser({ identifier: email, password });
          if (loginResult && loginResult.token) {
            await saveToken(loginResult.token);
            loginOk = true;
          }
        } catch {
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

  const field = (key: string) => [
    styles.input,
    focusedField === key && styles.inputFocused,
  ];

  const registerDisabled = loading || !emailVerified || !agreementChecked;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.brand}>Kamp Defterim</Text>
        <Text style={styles.title}>Kayıt Ol</Text>
        <Text style={styles.hint}>Hesabını oluştur, kamp topluluğuna katıl.</Text>

        <TextInput
          style={field('name')}
          placeholder="Adınız"
          value={name}
          placeholderTextColor={colors.muted}
          onChangeText={setName}
          onFocus={() => setFocusedField('name')}
          onBlur={() => setFocusedField(null)}
        />
        {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

        <TextInput
          style={field('username')}
          placeholder="Kullanıcı Adı"
          value={username}
          placeholderTextColor={colors.muted}
          onChangeText={setUsername}
          autoCapitalize="none"
          onFocus={() => setFocusedField('username')}
          onBlur={() => setFocusedField(null)}
        />
        {errors.username ? (
          <Text style={styles.error}>{errors.username}</Text>
        ) : null}

        <TextInput
          style={field('email')}
          placeholder="E-posta"
          autoCapitalize="none"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailVerified(false);
            setCodeSent(false);
          }}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
        />
        {errors.email ? <Text style={styles.error}>{errors.email}</Text> : null}
        {emailVerified ? (
          <Text style={styles.verifiedBadge}>✓ E-posta doğrulandı</Text>
        ) : null}

        <TextInput
          style={field('password')}
          placeholder="Şifre"
          secureTextEntry
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
        />
        {errors.password ? (
          <Text style={styles.error}>{errors.password}</Text>
        ) : null}

        <Text style={styles.sectionLabel}>Topluluk Seçimi (isteğe bağlı)</Text>
        {loadingCommunities ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 16 }} />
        ) : (
          <View style={{ marginBottom: 12 }}>
            {communityId ? (
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{communityNameInput}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setCommunityId(undefined);
                      setCommunityNameInput('');
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.chipRemove}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <TextInput
                  style={field('community')}
                  placeholder="Topluluk adı ile ara..."
                  value={communityNameInput}
                  placeholderTextColor={colors.muted}
                  onChangeText={(text) => {
                    setCommunityNameInput(text);
                    setCommunityId(undefined);
                  }}
                  autoCapitalize="none"
                  onFocus={() => {
                    setFocusedField('community');
                    if (communityNameInput.length >= 3) {
                      setShowCommunitySuggestions(true);
                    }
                  }}
                  onBlur={() => setFocusedField(null)}
                />
                {showCommunitySuggestions && filteredCommunities.length > 0 && (
                  <View style={styles.suggestions}>
                    {filteredCommunities.map((c: any) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setCommunityNameInput(c.name);
                          setCommunityId(c.id);
                          setShowCommunitySuggestions(false);
                        }}
                      >
                        <Text style={styles.suggestionText}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Agreement */}
        <View style={styles.agreementRow}>
          <TouchableOpacity
            onPress={() => setAgreementChecked(!agreementChecked)}
            style={[
              styles.checkbox,
              agreementChecked && styles.checkboxChecked,
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreementChecked }}
          >
            {agreementChecked ? (
              <Text style={styles.checkboxMark}>✓</Text>
            ) : null}
          </TouchableOpacity>
          <Text style={styles.agreementText}>
            <Text style={{ color: colors.textSecondary }}>Üyelik kaydı ile </Text>
            <Text
              style={styles.linkInline}
              onPress={() => {
                setModalType('gizlilik');
                setModalVisible(true);
              }}
            >
              Gizlilik Politikası
            </Text>
            <Text style={{ color: colors.textSecondary }}> ve </Text>
            <Text
              style={styles.linkInline}
              onPress={() => {
                setModalType('kvkk');
                setModalVisible(true);
              }}
            >
              KVKK Metni
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              &apos;ni okuduğunuzu ve kabul ettiğinizi onaylıyorsunuz.
            </Text>
          </Text>
        </View>
        {errors.agreementChecked ? (
          <Text style={styles.error}>{errors.agreementChecked}</Text>
        ) : null}

        {/* Privacy / KVKK modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.docModal}>
              <Text style={styles.modalTitle}>
                {modalType === 'gizlilik' ? 'Gizlilik Politikası' : 'KVKK Metni'}
              </Text>
              <WebView
                source={{
                  uri:
                    modalType === 'gizlilik'
                      ? 'https://www.kampdefterim.com/gizlilik-politikasi.html'
                      : 'https://www.kampdefterim.com/KVKK.html',
                }}
                style={styles.webview}
                originWhitelist={['*']}
                startInLoadingState
              />
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Send verification */}
        {!emailVerified ? (
          <TouchableOpacity
            style={[styles.secondaryCta, verificationLoading && styles.ctaDisabled]}
            onPress={handleSendVerificationCode}
            disabled={verificationLoading}
            activeOpacity={0.85}
          >
            {verificationLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryCtaText}>
                {codeSent ? 'Kodu Tekrar Gönder' : 'E-posta Doğrulama Kodu Gönder'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Register */}
        <TouchableOpacity
          onPress={handleRegister}
          disabled={registerDisabled}
          style={[styles.cta, registerDisabled && styles.ctaDisabled]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={onPrimary} />
          ) : (
            <Text
              style={[
                styles.ctaText,
                registerDisabled && styles.ctaTextDisabled,
              ]}
            >
              KAYIT OL
            </Text>
          )}
        </TouchableOpacity>

        {/* Verification code modal */}
        <Modal
          visible={verificationModal}
          transparent
          animationType="fade"
          onRequestClose={() => setVerificationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.verifyModal}>
              <Text style={styles.modalTitle}>E-posta Doğrulama</Text>
              <Text style={styles.verifyHint}>
                E-posta adresinize gönderilen 6 haneli kodu giriniz.
              </Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="- - - - - -"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={6}
                value={verificationCode}
                onChangeText={setVerificationCode}
                autoFocus
              />
              {codeError ? (
                <Text style={styles.error}>{codeError}</Text>
              ) : null}
              <View style={styles.verifyActions}>
                <TouchableOpacity
                  onPress={handleVerifyCode}
                  style={[styles.verifyBtn, verificationLoading && styles.ctaDisabled]}
                  disabled={verificationLoading}
                >
                  <Text style={styles.ctaText}>
                    {verificationLoading ? 'Doğrulanıyor...' : 'Doğrula'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setVerificationModal(false)}
                  style={styles.verifyCancel}
                >
                  <Text style={styles.modalCloseText}>Vazgeç</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={styles.linkContainer}
        >
          <Text style={styles.linkMuted}>
            Zaten hesabınız var mı?{' '}
            <Text style={styles.linkAccent}>Giriş yap</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Üyelik kaydı ile Gizlilik Sözleşmesi ve KVKK maddelerini kabul etmiş
          oluyorsunuz.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createRegisterStyles(
  colors: ThemeColors,
  onPrimary: string,
  pillCta: boolean,
) {
  return StyleSheet.create({
    root: { flex: 1 },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 28,
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
    sectionLabel: {
      marginBottom: 8,
      marginTop: 4,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      fontSize: 15,
      fontWeight: '300',
      marginBottom: 10,
    },
    inputFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 1,
    },
    codeInput: {
      textAlign: 'center',
      letterSpacing: 6,
      fontSize: 20,
      fontWeight: '500',
      width: 180,
      alignSelf: 'center',
    },
    error: {
      color: colors.danger,
      marginBottom: 8,
      marginLeft: 4,
      fontSize: 12,
    },
    verifiedBadge: {
      color: colors.success,
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 10,
      marginTop: -4,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: 8,
    },
    chip: {
      backgroundColor: colors.primaryLight,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      color: colors.primary,
      fontWeight: '600',
      marginRight: 8,
      fontSize: 13,
    },
    chipRemove: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 16,
    },
    suggestions: {
      maxHeight: 150,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      marginTop: -4,
      marginBottom: 8,
      overflow: 'hidden',
      zIndex: 10,
    },
    suggestionItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    suggestionText: {
      color: colors.text,
      fontSize: 14,
    },
    agreementRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
      marginTop: 4,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 2,
      borderColor: colors.muted,
      borderRadius: 6,
      marginRight: 10,
      marginTop: 2,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    checkboxMark: {
      color: onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    agreementText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
    linkInline: {
      color: colors.primary,
      textDecorationLine: 'underline',
      fontWeight: '500',
    },
    secondaryCta: {
      height: 48,
      borderRadius: pillCta ? 999 : 14,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 8,
    },
    secondaryCtaText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    cta: {
      height: 50,
      borderRadius: pillCta ? 999 : 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      marginBottom: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 3,
    },
    ctaDisabled: {
      opacity: 0.55,
    },
    ctaText: {
      color: onPrimary,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    ctaTextDisabled: {
      opacity: 0.9,
    },
    linkContainer: {
      marginTop: 12,
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
    footerNote: {
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      marginTop: 12,
      lineHeight: 17,
      fontWeight: '300',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    docModal: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 0,
      minWidth: 320,
      maxWidth: 380,
      maxHeight: '80%',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    verifyModal: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 24,
      minWidth: 280,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 4,
    },
    modalTitle: {
      fontWeight: '500',
      fontSize: 16,
      marginTop: 12,
      marginBottom: 8,
      color: colors.text,
      textAlign: 'center',
    },
    verifyHint: {
      marginBottom: 12,
      color: colors.muted,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '300',
    },
    webview: {
      width: 320,
      height: 400,
      marginTop: 8,
    },
    modalCloseBtn: {
      alignSelf: 'center',
      marginVertical: 12,
    },
    modalCloseText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 15,
    },
    verifyActions: {
      flexDirection: 'row',
      marginTop: 18,
      alignItems: 'center',
    },
    verifyBtn: {
      backgroundColor: colors.primary,
      borderRadius: pillCta ? 999 : 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
      marginRight: 10,
    },
    verifyCancel: {
      padding: 10,
    },
  });
}
