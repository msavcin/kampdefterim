import React, { useEffect, useState } from 'react';
// Şifre validasyonu register.tsx ile aynı
function validatePassword(password: string): string | null {
  if (!password.trim()) return 'Şifre giriniz.';
  if (password.length < 6) return 'Şifre en az 6 karakter olmalı.';
  if (!/(?=.*[a-z])/.test(password)) return 'Şifre en az bir küçük harf içermeli.';
  if (!/(?=.*[A-Z])/.test(password)) return 'Şifre en az bir büyük harf içermeli.';
  if (!/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/.test(password)) return 'Şifre en az bir özel karakter içermeli.';
  return null;
}
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { getServerOffset } from '../../lib/time';
import { API_URL } from '../../lib/config';
import { useTheme } from '../../components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const themed = createThemedStyles(colors);
  const router = useRouter();
  const params = useLocalSearchParams();
  const [token, setToken] = useState(params.token || '');
  const [serverOffset, setServerOffset] = useState(0); // ms cinsinden sunucu-istemci saat farkı
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);

  // Deep link ile token yakalama
  // Sunucu saatini al
  useEffect(() => {
    getServerOffset().then(setServerOffset).catch(() => setServerOffset(0));
  }, []);

  useEffect(() => {
    const handleDeepLink = (event) => {
      const url = event.url;
      const parsed = Linking.parse(url);
      if (parsed.queryParams?.token) {
        setToken(parsed.queryParams.token);
      } else if (parsed.path) {
        // kampdefterim://reset-password/XYZ
        const parts = parsed.path.split('/');
        if (parts.length === 2 && parts[0] === 'reset-password') {
          setToken(parts[1]);
        }
      }
    };
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleReset = async () => {
    const passwordError = validatePassword(password);
    if (passwordError) {
      Alert.alert('Hata', passwordError);
      return;
    }
    if (password !== password2) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor.');
      return;
    }
    setLoading(true);
    try {
      // (Opsiyonel) Token süresi kontrolü yapılacaksa burada serverOffset ile kontrol edilebilir
      const res = await fetch(`${API_URL}/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Başarılı', 'Şifreniz başarıyla güncellendi. Giriş ekranına yönlendiriliyorsunuz.');
        router.replace('/login');
      } else {
        Alert.alert('Hata', data?.error || 'Şifre sıfırlama başarısız.');
      }
    } catch (err) {
      Alert.alert('Hata', 'Sunucuya ulaşılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.muted }]}>Yeni Şifre Belirle</Text>
      <TextInput
        style={[themed.input, { marginBottom: 16 }]}
        placeholder="Yeni Şifre"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={colors.muted}
      />
      <TextInput
        style={[themed.input, { marginBottom: 16 }]}
        placeholder="Yeni Şifre (Tekrar)"
        secureTextEntry
        value={password2}
        onChangeText={setPassword2}
        placeholderTextColor={colors.muted}
      />
      <Button
        title={loading ? 'Kaydediliyor...' : 'Şifreyi Sıfırla'}
        onPress={handleReset}
        disabled={loading || !password || !password2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
});
