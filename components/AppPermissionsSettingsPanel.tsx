import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { Bell, Crown, Save, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useTheme } from './ThemeProvider';
import {
  getAppPermissionsSettings,
  updateAppPermissionsSettings,
} from '@/lib/adminSettingsApi';

export default function AppPermissionsSettingsPanel() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limitText, setLimitText] = useState('10');
  const [latestVersion, setLatestVersion] = useState('');
  const [minSupportedVersion, setMinSupportedVersion] = useState('');
  const [updateRequired, setUpdateRequired] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [androidUrl, setAndroidUrl] = useState('');
  const [iosUrl, setIosUrl] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const settings = await getAppPermissionsSettings();
      setLimitText(String(settings.nonPremiumCampingAreaLimit));
      setLatestVersion(settings.appLatestVersion || '');
      setMinSupportedVersion(settings.appMinSupportedVersion || '');
      setUpdateRequired(!!settings.appUpdateRequired);
      setUpdateMessage(settings.appUpdateMessage || '');
      setAndroidUrl(settings.appUpdateAndroidUrl || '');
      setIosUrl(settings.appUpdateIosUrl || '');
    } catch (error) {
      console.warn('[AppPermissionsSettingsPanel] yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const parsed = Number.parseInt(limitText, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
      Alert.alert('Geçersiz değer', 'Limit 0 ile 1000 arasında bir tam sayı olmalıdır.');
      return;
    }

    try {
      setSaving(true);
      const ok = await updateAppPermissionsSettings({
        nonPremiumCampingAreaLimit: parsed,
        appLatestVersion: latestVersion.trim(),
        appMinSupportedVersion: minSupportedVersion.trim(),
        appUpdateRequired: updateRequired,
        appUpdateMessage: updateMessage.trim(),
        appUpdateAndroidUrl: androidUrl.trim(),
        appUpdateIosUrl: iosUrl.trim(),
      });
      if (!ok) throw new Error('Ayar kaydedilemedi');
      Alert.alert('Başarılı', 'Uygulama ve izin ayarları güncellendi.');
      await load();
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Ayar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryLight,
          }}
        >
          <ShieldCheck size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
            Kamp alanı ekleme limiti
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
            Premium olmayan kullanıcıların oluşturabileceği maksimum kamp alanı sayısı.
          </Text>
        </View>
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
              Premium olmayan kullanıcı limiti
            </Text>
            <TextInput
              value={limitText}
              onChangeText={(text) => setLimitText(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.text,
                backgroundColor: colors.background,
                fontSize: 16,
                fontWeight: '700',
              }}
            />
          </View>
          <View
            style={{
              minWidth: 82,
              borderRadius: 14,
              padding: 10,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
            }}
          >
            <Crown size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12, marginTop: 4 }}>
              Premium
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>
              sınırsız
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 4,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primaryLight,
              }}
            >
              <Bell size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                Sürüm güncelleme bildirimi
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                Uygulama açılışında daha yeni sürüm varsa kullanıcıya bildirim gösterilir.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                Son sürüm
              </Text>
              <TextInput
                value={latestVersion}
                onChangeText={setLatestVersion}
                placeholder="örn. 1.3.28"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  backgroundColor: colors.background,
                  fontSize: 14,
                  fontWeight: '700',
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                Minimum sürüm
              </Text>
              <TextInput
                value={minSupportedVersion}
                onChangeText={setMinSupportedVersion}
                placeholder="opsiyonel"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  backgroundColor: colors.background,
                  fontSize: 14,
                  fontWeight: '700',
                }}
              />
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Smartphone size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                  Zorunlu güncelleme
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  Açıkken “Daha sonra” seçeneği gösterilmez.
                </Text>
              </View>
            </View>
            <Switch
              value={updateRequired}
              onValueChange={setUpdateRequired}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={updateRequired ? colors.primary : colors.muted}
            />
          </View>

          <TextInput
            value={updateMessage}
            onChangeText={setUpdateMessage}
            placeholder="Güncelleme mesajı"
            placeholderTextColor={colors.muted}
            multiline
            style={{
              minHeight: 78,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.text,
              backgroundColor: colors.background,
              fontSize: 13,
              textAlignVertical: 'top',
            }}
          />

          <TextInput
            value={androidUrl}
            onChangeText={setAndroidUrl}
            placeholder="Android güncelleme linki"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.text,
              backgroundColor: colors.background,
              fontSize: 12,
            }}
          />

          <TextInput
            value={iosUrl}
            onChangeText={setIosUrl}
            placeholder="iOS güncelleme linki"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.text,
              backgroundColor: colors.background,
              fontSize: 12,
            }}
          />
        </View>

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          activeOpacity={0.8}
          style={{
            height: 44,
            borderRadius: 12,
            backgroundColor: saving ? colors.muted : colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Save size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700' }}>Limiti kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
