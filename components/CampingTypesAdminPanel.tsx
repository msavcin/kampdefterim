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
import { SvgXml } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Download, Edit3, Plus, RefreshCw, Save, Trash2 } from 'lucide-react-native';
import { useTheme } from './ThemeProvider';
import type { CampingType } from '@/lib/categories';
import { getCampingTypeIcon } from '@/lib/categories';
import {
  createCampingTypeAdmin,
  deleteCampingTypeAdmin,
  listCampingTypesAdmin,
  syncCampingTypes,
  updateCampingTypeAdmin,
} from '@/lib/campingTypesApi';
import { updateUserPreferences, getMe } from '@/lib/userCommunityApi';
import { updateAdminSetting, createAdminSetting, getAdminSetting } from '@/lib/adminSettingsApi';

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 21h18L12 2Z"/><path d="M12 9v5"/><path d="M12 18h.01"/></svg>';

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type FormState = {
  code: string;
  name: string;
  svg: string;
  color: string;
  sortOrder: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  svg: EMPTY_SVG,
  color: '#73768fff',
  sortOrder: '',
  active: true,
});

export default function CampingTypesAdminPanel() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<CampingType[]>([]);
  const [selected, setSelected] = useState<CampingType | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>({});
  const [isSuperadmin, setIsSuperadmin] = useState<boolean>(false);

  function canonicalizeRawId(rawId: string) {
    const id = String(rawId || '').trim().toLowerCase();
    if (id === 'tent') return 'campground';
    if (id === 'caravan') return 'caravan_site';
    if (id === 'nature') return 'hiking_road';
    if (id === 'bungalov' || id === 'bungalow') return 'bungalow';
    return id;
  }

  const selectedKey = selected?.serverId || selected?.id || selected?.code || null;
  const sortedTypes = useMemo(() => [...types].sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)) || a.label.localeCompare(b.label, 'tr')), [types]);

  const setPatch = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const load = async () => {
    try {
      setLoading(true);
      const list = await listCampingTypesAdmin();
      setTypes(list);
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Kamp türleri alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setIsSuperadmin(me?.role === 'superadmin');
      } catch (e) {
        setIsSuperadmin(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      // Try global admin setting first (superadmin), then user prefs, then local fallback
      try {
        const adminVal = await getAdminSetting('checklist_visible_types');
        if (adminVal) {
          try {
            const parsed = typeof adminVal === 'string' ? JSON.parse(adminVal) : adminVal;
            setVisibleMap(parsed || {});
            return;
          } catch (e) {
            // invalid JSON, fall through
          }
        }
      } catch (e) {
        // ignore admin setting errors
      }
      try {
        const me = await getMe();
        if (me && me.preferences && typeof me.preferences === 'object' && me.preferences.checklist_visible_types) {
          setVisibleMap(me.preferences.checklist_visible_types);
          return;
        }
      } catch (e) {
        // ignore server errors and fallback to local
      }
      try {
        const json = await SecureStore.getItemAsync('checklist_visible_types');
        if (!json) return;
        const raw = JSON.parse(json);
        // If types already loaded, normalize keys to canonical ids
        if (types && types.length > 0) {
          const mapped: Record<string, boolean> = {};
          types.forEach((type) => {
            const rawCode = (type.code || String(type.id || '')).toString().toLowerCase();
            const canonical = canonicalizeRawId(rawCode);
            let val = raw[canonical];
            if (val === undefined) {
              if (raw[type.code] !== undefined) val = raw[type.code];
              else if (raw[type.id] !== undefined) val = raw[type.id];
            }
            mapped[canonical] = val === undefined ? true : !!val;
          });
          setVisibleMap(mapped);
        } else {
          // types not loaded yet: store raw map and remap after types arrive
          setVisibleMap(raw);
        }
      } catch (e) {
        console.warn('checklist_visible_types load error', e);
      }
    })();
  }, []);

  // Re-map visibleMap if types list updates and visibleMap contains non-canonical keys
  useEffect(() => {
    if (!types || types.length === 0) return;
    (async () => {
      try {
        const json = await SecureStore.getItemAsync('checklist_visible_types');
        if (!json) return;
        const raw = JSON.parse(json);
        const mapped: Record<string, boolean> = {};
        types.forEach((type) => {
          const rawCode = (type.code || String(type.id || '')).toString().toLowerCase();
          const canonical = canonicalizeRawId(rawCode);
          let val = raw[canonical];
          if (val === undefined) {
            if (raw[type.code] !== undefined) val = raw[type.code];
            else if (raw[type.id] !== undefined) val = raw[type.id];
          }
          mapped[canonical] = val === undefined ? true : !!val;
        });
        setVisibleMap(mapped);
      } catch (e) {
        // ignore
      }
    })();
  }, [types]);

  const startCreate = () => {
    setSelected(null);
    setForm(emptyForm());
  };

  const editType = (type: CampingType) => {
    setSelected(type);
    setForm({
      code: type.code || type.id,
      name: type.name || type.label,
      svg: type.svg || type.iconSvg || getCampingTypeIcon(type.id) || EMPTY_SVG,
      color: type.color || '#73768fff',
      sortOrder: type.sort_order != null ? String(type.sort_order) : '',
      active: type.active !== false && !type.deleted_at,
    });
  };

  const toggleVisibleForType = async (typeKey: string, value: boolean) => {
    try {
      const canonical = canonicalizeRawId(typeKey);
      const newMap = { ...visibleMap, [canonical]: value };
      await SecureStore.setItemAsync('checklist_visible_types', JSON.stringify(newMap));
      setVisibleMap(newMap);
      // Try to sync preferences to server (best-effort)
      try {
        await updateUserPreferences({ checklist_visible_types: newMap });
      } catch (e) {
        if (__DEV__) console.warn('[prefs] Server sync failed', e);
      }
      // Also attempt to persist as a global admin setting so other users see it
      if (isSuperadmin) {
        try {
          const ok = await updateAdminSetting('checklist_visible_types', JSON.stringify(newMap));
          if (!ok) {
            await createAdminSetting('checklist_visible_types', JSON.stringify(newMap), 'Checklist visible types map');
          }
        } catch (e) {
          if (__DEV__) console.warn('[prefs] Admin setting update failed', e);
        }
      }
    } catch (e) {
      Alert.alert('Hata', 'Ayar kaydedilemedi');
    }
  };

  const importSvg = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/svg+xml', 'text/xml', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const content = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      if (!content.trim().startsWith('<svg')) {
        Alert.alert('Geçersiz SVG', 'Seçilen dosya <svg> etiketi ile başlamıyor.');
        return;
      }
      setPatch({ svg: content.trim() });
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'SVG dosyası okunamadı.');
    }
  };

  const save = async () => {
    const name = form.name.trim();
    const code = slugify(form.code || name);
    const svg = form.svg.trim();
    if (!name) return Alert.alert('Eksik bilgi', 'Kamp türü adı zorunlu.');
    if (!code || code.length < 2) return Alert.alert('Eksik bilgi', 'Geçerli bir kod girin. Örn: glamping');
    if (!svg.startsWith('<svg')) return Alert.alert('Eksik bilgi', 'SVG içeriği <svg> etiketi ile başlamalı.');

    const payload = {
      name,
      svg,
      color: form.color.trim() || '#73768fff',
      sort_order: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
      active: form.active,
    };

    try {
      setSaving(true);
      if (selectedKey) {
        await updateCampingTypeAdmin(selectedKey, payload);
        Alert.alert('Başarılı', 'Kamp türü güncellendi. Kullanıcılara sonraki sync ile yansıyacak.');
      } else {
        await createCampingTypeAdmin({ code, ...payload });
        Alert.alert('Başarılı', 'Kamp türü eklendi. Kullanıcılara sonraki sync ile yansıyacak.');
      }
      await load();
      await syncCampingTypes({ forceFull: true });
      startCreate();
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Kamp türü kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (type: CampingType, force = false) => {
    const key = type.serverId || type.id || type.code;
    try {
      setSaving(true);
      await deleteCampingTypeAdmin(key, force);
      Alert.alert('Başarılı', 'Kamp türü pasifleştirildi. Mevcut kayıtların geçmiş etiketi korunur, yeni seçimlerde görünmez.');
      await load();
      await syncCampingTypes({ forceFull: true });
      if (selected?.id === type.id) startCreate();
    } catch (error: any) {
      if (error?.status === 409 && error?.body?.usage) {
        const usage = error.body.usage;
        Alert.alert(
          'Kamp türü kullanılıyor',
          `Bu tür ${usage.campgrounds || 0} kamp alanı ve ${usage.standard_checklists || 0} standart checklist tarafından kullanılıyor. Yine de pasifleştirilsin mi?`,
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Pasifleştir', style: 'destructive', onPress: () => remove(type, true) },
          ],
        );
      } else {
        Alert.alert('Hata', error?.message || 'Kamp türü kaldırılamadı.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const previewSvg = form.svg.trim().startsWith('<svg') ? form.svg : EMPTY_SVG;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
            <Edit3 size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Kamp Türleri</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
              Tür adı, renk ve SVG ikon sunucuda tutulur; uygulama online iken eşitler, offline iken lokal cache ile çalışır.
            </Text>
          </View>
          <TouchableOpacity onPress={load} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <RefreshCw size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {sortedTypes.map((type) => {
            const active = type.active !== false && !type.deleted_at;
            const isSelected = selected?.id === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                onPress={() => editType(type)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primaryLight : colors.background,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  maxWidth: 220,
                  opacity: active ? 1 : 0.55,
                }}
              >
                <Text numberOfLines={1} style={{ color: isSelected ? colors.primary : colors.text, fontWeight: '800', fontSize: 12 }}>
                  {active ? '● ' : '○ '}{type.label}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                  {type.code || type.id} · sıra {type.sort_order ?? '-'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: 10 }}>Checklist'te göster</Text>
                  <Switch
                    value={visibleMap[canonicalizeRawId(type.code || String(type.id))] === undefined ? true : !!visibleMap[canonicalizeRawId(type.code || String(type.id))]}
                    onValueChange={(v) => toggleVisibleForType(type.code || String(type.id), v)}
                    trackColor={{ false: colors.border, true: colors.primaryLight }}
                    thumbColor={visibleMap[canonicalizeRawId(type.code || String(type.id))] ? colors.primary : colors.muted}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity onPress={startCreate} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.primaryLight }}>
          <Plus size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Yeni kamp türü</Text>
        </TouchableOpacity>
      </View>

      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 12 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
          {selected ? 'Kamp türünü düzenle' : 'Yeni kamp türü ekle'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
            <SvgXml xml={previewSvg.replace(/currentColor/g, colors.text)} width={28} height={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{form.name || 'Önizleme'}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{form.code || slugify(form.name) || 'kod'}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Aktif</Text>
            <Switch
              value={form.active}
              onValueChange={(active) => setPatch({ active })}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={form.active ? colors.primary : colors.muted}
            />
          </View>
          {selected ? (
            <View style={{ alignItems: 'center', marginLeft: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Checklist'te göster</Text>
              <Switch
                value={visibleMap[canonicalizeRawId(selected.code || String(selected.id))] === undefined ? true : !!visibleMap[canonicalizeRawId(selected.code || String(selected.id))]}
                onValueChange={(v) => toggleVisibleForType(selected.code || String(selected.id), v)}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={visibleMap[canonicalizeRawId(selected.code || String(selected.id))] ? colors.primary : colors.muted}
              />
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>Ad</Text>
          <TextInput
            value={form.name}
            onChangeText={(name) => setPatch({ name, code: selected ? form.code : slugify(name) })}
            placeholder="Örn: Glamping"
            placeholderTextColor={colors.muted}
            style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>Kod</Text>
            <TextInput
              value={form.code}
              editable={!selected}
              onChangeText={(code) => setPatch({ code: slugify(code) })}
              placeholder="glamping"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: selected ? colors.surfaceVariant : colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
            />
          </View>
          <View style={{ width: 92, gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>Sıra</Text>
            <TextInput
              value={form.sortOrder}
              onChangeText={(sortOrder) => setPatch({ sortOrder: sortOrder.replace(/[^0-9-]/g, '') })}
              keyboardType="number-pad"
              placeholder="120"
              placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
            />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>Renk</Text>
          <TextInput
            value={form.color}
            onChangeText={(color) => setPatch({ color })}
            placeholder="#73768fff"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: colors.muted, fontSize: 11, fontWeight: '700' }}>SVG XML</Text>
            <TouchableOpacity onPress={importSvg} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
              <Download size={13} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 11 }}>Dosyadan al</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={form.svg}
            onChangeText={(svg) => setPatch({ svg })}
            multiline
            numberOfLines={7}
            textAlignVertical="top"
            autoCapitalize="none"
            placeholder="<svg ...>...</svg>"
            placeholderTextColor={colors.muted}
            style={{ minHeight: 150, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 11 }}
          />
          <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>
            Güvenli SVG kullanın: script, onload/onerror veya dış URL içeren SVG sunucu tarafından reddedilir. Renklenebilmesi için stroke/fill değerinde currentColor kullanmanız önerilir.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: saving ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <><Save size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>Kaydet</Text></>}
          </TouchableOpacity>

          {selected ? (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Kamp türünü kaldır', `${selected.label} yeni seçimlerde görünmeyecek. Mevcut kayıtlar için geçmiş bilgi korunur. Devam edilsin mi?`, [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Kaldır', style: 'destructive', onPress: () => remove(selected) },
                ]);
              }}
              disabled={saving}
              style={{ width: 52, height: 44, borderRadius: 12, backgroundColor: colors.danger + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger + '55' }}
            >
              <Trash2 size={17} color={colors.danger} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}
