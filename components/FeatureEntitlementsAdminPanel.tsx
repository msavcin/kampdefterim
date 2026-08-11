import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Crown, RefreshCw, Save, Search, ShieldCheck, UserCog } from 'lucide-react-native';
import { useTheme } from './ThemeProvider';
import {
  clearUserFeatureEntitlement,
  EntitlementUser,
  FeatureEntitlementMap,
  FeatureKey,
  FEATURE_LABELS,
  getGlobalFeatureEntitlements,
  getUserFeatureEntitlements,
  listEntitlementUsers,
  revokeUserFreeTrial,
  startUserFreeTrial,
  updateGlobalFeatureEntitlements,
  updateUserFeatureEntitlements,
} from '@/lib/featureEntitlementsApi';

const FEATURE_ORDER: FeatureKey[] = [
  'announcements',
  'checklist',
  'chat',
  'offline_mode',
  'camping_area_limit',
  'free_trial',
];

const LIMIT_FEATURES = new Set<FeatureKey>(['camping_area_limit', 'free_trial']);

type EditableMap = Record<FeatureKey, { enabled: boolean; limitValue: string; expiresAt: string }>;

function mapToEditable(map: FeatureEntitlementMap): EditableMap {
  const next = {} as EditableMap;
  FEATURE_ORDER.forEach((key) => {
    const item = map[key];
    next[key] = {
      enabled: !!item?.enabled,
      limitValue: item?.limitValue != null ? String(item.limitValue) : '',
      expiresAt: item?.expiresAt ? String(item.expiresAt).slice(0, 10) : '',
    };
  });
  return next;
}

function editableToPayload(editable: EditableMap) {
  const payload: any = {};
  FEATURE_ORDER.forEach((key) => {
    const row = editable[key];
    payload[key] = {
      enabled: row.enabled,
      limitValue: LIMIT_FEATURES.has(key) && row.limitValue !== '' ? Number.parseInt(row.limitValue, 10) : null,
      expiresAt: row.expiresAt ? `${row.expiresAt}T23:59:59.000Z` : null,
    };
  });
  return payload;
}

function FeatureRows({
  editable,
  onChange,
  colors,
  showSource,
  sourceMap,
}: {
  editable: EditableMap;
  onChange: (next: EditableMap) => void;
  colors: any;
  showSource?: boolean;
  sourceMap?: FeatureEntitlementMap | null;
}) {
  const update = (key: FeatureKey, patch: Partial<EditableMap[FeatureKey]>) => {
    onChange({
      ...editable,
      [key]: { ...editable[key], ...patch },
    });
  };

  return (
    <View style={{ gap: 10 }}>
      {FEATURE_ORDER.map((key) => {
        const row = editable[key];
        const hasLimit = LIMIT_FEATURES.has(key);
        return (
          <View
            key={key}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
              borderRadius: 14,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
                  {FEATURE_LABELS[key]}
                </Text>
                {showSource && sourceMap?.[key]?.source ? (
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                    Kaynak: {sourceMap[key].source === 'user' ? 'Kişi bazlı' : sourceMap[key].source === 'global' ? 'Tüm kullanıcılar' : 'Varsayılan'}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={row.enabled}
                onValueChange={(enabled) => update(key, { enabled })}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={row.enabled ? colors.primary : colors.muted}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {hasLimit ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 }}>
                    {key === 'free_trial' ? 'Gün' : 'Limit'}
                  </Text>
                  <TextInput
                    value={row.limitValue}
                    onChangeText={(text) => update(key, { limitValue: text.replace(/[^0-9]/g, '') })}
                    keyboardType="number-pad"
                    placeholder={key === 'free_trial' ? '30' : '10'}
                    placeholderTextColor={colors.muted}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: colors.text,
                      backgroundColor: colors.surface,
                      fontWeight: '700',
                    }}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 }}>
                  Bitiş tarihi
                </Text>
                <TextInput
                  value={row.expiresAt}
                  onChangeText={(text) => update(key, { expiresAt: text })}
                  placeholder="Süresiz / YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: colors.text,
                    backgroundColor: colors.surface,
                    fontSize: 12,
                  }}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function FeatureEntitlementsAdminPanel() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<EntitlementUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<EntitlementUser | null>(null);
  const [globalMap, setGlobalMap] = useState<FeatureEntitlementMap | null>(null);
  const [globalEdit, setGlobalEdit] = useState<EditableMap | null>(null);
  const [userMap, setUserMap] = useState<FeatureEntitlementMap | null>(null);
  const [userEdit, setUserEdit] = useState<EditableMap | null>(null);

  const selectedUserTitle = useMemo(() => {
    if (!selectedUser) return 'Kullanıcı seçilmedi';
    return selectedUser.name || selectedUser.username || selectedUser.email || `#${selectedUser.id}`;
  }, [selectedUser]);

  const loadGlobal = async () => {
    const map = await getGlobalFeatureEntitlements();
    setGlobalMap(map);
    setGlobalEdit(mapToEditable(map));
  };

  const loadUsers = async (q = query) => {
    const list = await listEntitlementUsers(q);
    setUsers(list);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      await Promise.all([loadGlobal(), loadUsers('')]);
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Hak yönetimi verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectUser = async (user: EntitlementUser) => {
    try {
      setSelectedUser(user);
      const detail = await getUserFeatureEntitlements(user.id);
      setUserMap(detail.entitlements);
      setUserEdit(mapToEditable(detail.entitlements));
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Kullanıcı hakları alınamadı.');
    }
  };

  const saveGlobal = async () => {
    if (!globalEdit) return;
    try {
      setSavingGlobal(true);
      const map = await updateGlobalFeatureEntitlements(editableToPayload(globalEdit));
      setGlobalMap(map);
      setGlobalEdit(mapToEditable(map));
      Alert.alert('Başarılı', 'Tüm kullanıcılar için varsayılan haklar güncellendi.');
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Global haklar kaydedilemedi.');
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveUser = async () => {
    if (!selectedUser || !userEdit) return;
    try {
      setSavingUser(true);
      const map = await updateUserFeatureEntitlements(selectedUser.id, editableToPayload(userEdit));
      setUserMap(map);
      setUserEdit(mapToEditable(map));
      Alert.alert('Başarılı', 'Kullanıcı hakları güncellendi.');
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Kullanıcı hakları kaydedilemedi.');
    } finally {
      setSavingUser(false);
    }
  };

  const startTrial = async () => {
    if (!selectedUser || !userEdit) return;
    const days = Number.parseInt(userEdit.free_trial.limitValue || '30', 10);
    try {
      setSavingUser(true);
      const result = await startUserFreeTrial(selectedUser.id, Number.isFinite(days) ? days : 30);
      Alert.alert('Deneme başlatıldı', `${selectedUserTitle} için ${result.days || days || 30} gün ücretsiz deneme başlatıldı.`);
      await selectUser(selectedUser);
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Deneme süresi başlatılamadı.');
    } finally {
      setSavingUser(false);
    }
  };

  const revokeTrial = async () => {
    if (!selectedUser) return;
    Alert.alert(
      'Deneme süresini kapat',
      `${selectedUserTitle} kullanıcısı guest rolüne alınacak ve deneme ile açılan Offline Mode, Duyurular, Checklist ve Sohbet kişi bazlı kapatılacak. Devam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kapat',
          style: 'destructive',
          onPress: async () => {
            try {
              setSavingUser(true);
              const result = await revokeUserFreeTrial(selectedUser.id);
              Alert.alert('Başarılı', 'Deneme süresi kapatıldı ve haklar geri alındı.');
              if (result?.user) setSelectedUser(result.user);
              await selectUser({ ...selectedUser, ...(result?.user || {}) });
            } catch (error: any) {
              Alert.alert('Hata', error?.message || 'Deneme süresi kapatılamadı.');
            } finally {
              setSavingUser(false);
            }
          },
        },
      ],
    );
  };

  const clearUserOverride = async (featureKey: FeatureKey) => {
    if (!selectedUser) return;
    try {
      const map = await clearUserFeatureEntitlement(selectedUser.id, featureKey);
      setUserMap(map);
      setUserEdit(mapToEditable(map));
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Kişi bazlı hak temizlenemedi.');
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight }}>
            <ShieldCheck size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Tüm kullanıcılar için varsayılan haklar</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
              Premium olmayan kullanıcılar için özellik erişimleri, süreleri ve varsayılan limitler.
            </Text>
          </View>
        </View>

        {globalEdit ? (
          <FeatureRows editable={globalEdit} onChange={setGlobalEdit} colors={colors} />
        ) : null}

        <TouchableOpacity
          onPress={saveGlobal}
          disabled={savingGlobal}
          style={{ height: 44, borderRadius: 12, backgroundColor: savingGlobal ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          {savingGlobal ? <ActivityIndicator color="#fff" /> : <><Save size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>Global hakları kaydet</Text></>}
        </TouchableOpacity>
      </View>

      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight }}>
            <UserCog size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Kişi bazlı hak yönetimi</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
              Bir kullanıcı seçerek global ayarları ezebilir veya ücretsiz deneme başlatabilirsiniz.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Ad, kullanıcı adı veya e-posta ara..."
            placeholderTextColor={colors.muted}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
          />
          <TouchableOpacity onPress={() => loadUsers(query)} style={{ width: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Search size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {users.map((user) => {
            const selected = selectedUser?.id === user.id;
            return (
              <TouchableOpacity
                key={user.id}
                onPress={() => selectUser(user)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primaryLight : colors.background,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  maxWidth: 210,
                }}
              >
                <Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.text, fontWeight: '800', fontSize: 12 }}>
                  {user.name || user.username || user.email || `#${user.id}`}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                  {user.role || 'user'} · #{user.id}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{selectedUserTitle}</Text>
          {selectedUser ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              {selectedUser.email || selectedUser.username || ''}
            </Text>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              Aşağıdan kullanıcı seçin.
            </Text>
          )}
        </View>

        {selectedUser && userEdit ? (
          <>
            <FeatureRows editable={userEdit} onChange={setUserEdit} colors={colors} showSource sourceMap={userMap} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={saveUser}
                disabled={savingUser}
                style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: savingUser ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
              >
                {savingUser ? <ActivityIndicator color="#fff" /> : <><Save size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>Kişi haklarını kaydet</Text></>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={startTrial}
                disabled={savingUser}
                style={{ minWidth: 94, height: 44, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: colors.border }}
              >
                <Crown size={15} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Deneme</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={revokeTrial}
                disabled={savingUser}
                style={{ minWidth: 92, height: 44, borderRadius: 12, backgroundColor: colors.danger + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger + '55' }}
              >
                <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 12 }}>Kapat</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FEATURE_ORDER.map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => clearUserOverride(key)}
                  style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 10, paddingVertical: 7 }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                    {FEATURE_LABELS[key]} sıfırla
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        <TouchableOpacity
          onPress={loadAll}
          style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
        >
          <RefreshCw size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Yenile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
