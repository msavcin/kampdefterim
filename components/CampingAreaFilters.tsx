import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, CheckSquare, Square, Map, Crown } from 'lucide-react-native';
import { campingTypes } from '../lib/categories';
import type { CampingArea } from '../lib/database';
import { valilikIdToProvinceName } from '../lib/provinceMap';
import { useTheme } from './ThemeProvider';
import { createThemedStyles } from '../constants/theme/sharedStyles';

interface FilterOption {
  key: string;
  label: string;
  visible: boolean;
  disabled: boolean;
}

interface Props {
  userFilters: FilterOption[];
  selectedUserFilters: string[];
  selectedCampingTypes: string[];
  onUserFilterToggle: (key: string) => void;
  onCampingTypeToggle: (id: string) => void;
  onToggleAllCampingTypes?: () => void;
  onClose?: () => void;
  disabled?: boolean;
  filteredAreas?: CampingArea[];
  turkeyWideFilters?: string[];
  onTurkeyWideToggle?: (key: string) => void;
  selectedProvinces?: number[];
  onProvinceToggle?: (id: number) => void;
  isOffline?: boolean;
  isPremium?: boolean;
}

// Modern Checkbox Component
function ModernCheckbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.checkbox,
        { backgroundColor: colors.surface, borderColor: colors.border },
        checked && { backgroundColor: colors.primary, borderColor: colors.primary },
        disabled && styles.checkboxDisabled,
      ]}
    >
      {checked && <Check size={16} color={colors.surface} strokeWidth={3} />}
    </View>
  );
}

export default function CampingAreaFilters({
  userFilters,
  selectedUserFilters,
  selectedCampingTypes,
  onUserFilterToggle,
  onCampingTypeToggle,
  onToggleAllCampingTypes,
  onClose,
  disabled = false,
  filteredAreas = [],
  userId,
  turkeyWideFilters = [],
  onTurkeyWideToggle,
  selectedProvinces = [],
  onProvinceToggle,
  isOffline = false,
  isPremium = false,
}: Props & { userId?: string | number }) {
  const { colors } = useTheme();
  const [provinceQuery, setProvinceQuery] = React.useState('');
  const themed = createThemedStyles(colors);
  const router = useRouter();
  const filterScrollRef = React.useRef<ScrollView>(null);
  const provinceSectionYRef = React.useRef(0);
  const provinceSearchActive = provinceQuery.trim().length > 0;

  const scrollProvinceSearchIntoView = React.useCallback(() => {
    const delay = Platform.OS === 'ios' ? 260 : 120;
    setTimeout(() => {
      filterScrollRef.current?.scrollTo({
        y: Math.max(0, provinceSectionYRef.current - 14),
        animated: true,
      });
    }, delay);
  }, []);
  // Türkiye geneli checkbox gösterilecek filtre anahtarları
  const TURKEY_WIDE_KEYS = ['own', 'community', 'friend'];
  // Her kamp türü için alan sayısını hesapla
  const getCountForType = (typeId: string): number => {
    return filteredAreas.filter(area => {
      const areaType = area.tags?.type || area.type;
      return areaType === typeId;
    }).length;
  };

  // Her kullanıcı filtresi için alan sayısını hesapla
  const getCountForUserFilter = (filterKey: string): number => {
    return filteredAreas.filter(area => {
      switch (filterKey) {
        case 'own':
          // Kendi kamp alanlarım - sadece owner_id eşleşenler
          return userId && String(area.owner_id) === String(userId);
        case 'community':
          // Topluluk paylaşımları
          return area.community_id && area.community_id !== null && area.community_id !== '';
        case 'friend':
          // Arkadaş paylaşımları
          return area.friend_user_ids && Array.isArray(area.friend_user_ids) && area.friend_user_ids.length > 0;
        case 'user':
          // Kullanıcı paylaşımları (public, owner_id dolu)
          return area.visibility === 'public' && area.owner_id && area.owner_id !== '';
        case 'system':
          // KampDefterim Paylaşımları (owner_id boş)
          return !area.owner_id || area.owner_id === '';
        default:
          return false;
      }
    }).length;
  };
  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
    >
      <ScrollView
        ref={filterScrollRef}
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[
          styles.scrollContent,
          provinceSearchActive && styles.scrollContentProvinceSearchActive,
        ]}
      >
      {/* Kullanıcı Filtresi Bölümü */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Kullanıcı Filtresi</Text>
          {onTurkeyWideToggle && (
            <View style={styles.turkeyHeaderHint}>
              <Map size={15} color={isOffline ? colors.border : colors.primary} strokeWidth={2} />
              <Text style={[styles.turkeyHeaderHintText, isOffline ? { color: colors.border } : { color: colors.primary }]}>Tüm TR</Text>
            </View>
          )}
        </View>
        <View style={styles.userFiltersGrid}>
          {userFilters.filter(f => f.visible).map(filter => {
            const count = getCountForUserFilter(filter.key);
            // Tüm TR aktifken user ve system pasife alınır
            const disabledByTurkey = turkeyWideFilters.length > 0 && (filter.key === 'user' || filter.key === 'system');
            return (
              <View key={filter.key} style={styles.userFilterRow}>
                <TouchableOpacity
                  style={[
                    styles.userFilterItem,
                    styles.userFilterItemFlex,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    (filter.disabled || disabledByTurkey) && styles.userFilterItemDisabled,
                  ]}
                  onPress={() => !filter.disabled && !disabled && !disabledByTurkey && onUserFilterToggle(filter.key)}
                  disabled={filter.disabled || disabled || disabledByTurkey}
                  activeOpacity={0.7}
                >
                  <ModernCheckbox
                    checked={selectedUserFilters.includes(filter.key)}
                    disabled={filter.disabled || disabled || disabledByTurkey}
                  />
                  <Text
                    style={[
                      styles.userFilterLabel,
                      { color: colors.text },
                      (filter.disabled || disabledByTurkey) && {
                        color: colors.textSecondary,
                      },
                    ]}
                  >
                    {filter.label} ({count})
                  </Text>
                </TouchableOpacity>
                {TURKEY_WIDE_KEYS.includes(filter.key) && onTurkeyWideToggle && (() => {
                  const premiumOnly = filter.key === 'own' || filter.key === 'friend' || filter.key === 'community';
                  const lockedByPremium = premiumOnly && !isPremium;
                  return (
                    <View style={{ position: 'relative' }}>
                      <TouchableOpacity
                        style={[
                          styles.turkeyCheckbox,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                          turkeyWideFilters.includes(filter.key) && !lockedByPremium && {
                            backgroundColor: colors.surfaceVariant,
                            borderColor: colors.primary,
                          },
                          (disabled || isOffline) && !lockedByPremium && { opacity: 0.35 },
                          lockedByPremium && styles.turkeyCheckboxLocked,
                        ]}
                        onPress={() => {
                          if (lockedByPremium) {
                            router.push('/premium' as any);
                          } else if (!disabled && !isOffline) {
                            onTurkeyWideToggle(filter.key);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <ModernCheckbox
                          checked={turkeyWideFilters.includes(filter.key) && !lockedByPremium}
                          disabled={disabled || lockedByPremium}
                        />
                      </TouchableOpacity>
                      {lockedByPremium && (
                        <TouchableOpacity
                          onPress={() => router.push('/premium' as any)}
                          style={styles.premiumBadge}
                          activeOpacity={0.8}
                        >
                          <Crown size={10} color="#fff" fill="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={styles.section}
        onLayout={(event) => {
          provinceSectionYRef.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>İl Filtresi</Text>
        </View>
        <TextInput
          value={provinceQuery}
          onChangeText={(text) => {
            setProvinceQuery(text);
            if (text.trim().length > 0) {
              scrollProvinceSearchIntoView();
            }
          }}
          onFocus={scrollProvinceSearchIntoView}
          placeholder="İl ara..."
          placeholderTextColor={colors.muted}
          style={[styles.provinceSearchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          editable={!disabled}
        />
        {selectedProvinces.length > 0 && (
          <View style={{ gap: 10, marginBottom: 10 }}>
            <Text style={[styles.sectionSubtitle, { color: colors.text }]}>Seçilen iller</Text>
            <View style={styles.provinceFiltersGrid}>
              {selectedProvinces
                .slice()
                .sort((a, b) => a - b)
                .map(provinceId => {
                  const name = valilikIdToProvinceName[provinceId] || String(provinceId);
                  return (
                    <TouchableOpacity
                      key={provinceId}
                      style={[
                        styles.provinceChip,
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                        disabled && styles.provinceChipDisabled,
                      ]}
                      onPress={() => !disabled && onProvinceToggle?.(provinceId)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.provinceChipLabel, { color: colors.surface }]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        )}
        {provinceQuery.trim().length > 0 ? (
          <View style={styles.provinceFiltersGrid}>
            {Object.entries(valilikIdToProvinceName)
              .sort(([a], [b]) => Number(a) - Number(b))
              .filter(([id, name]) => {
                const query = provinceQuery.trim().toLowerCase();
                const provinceId = Number(id);
                if (selectedProvinces?.includes(provinceId)) {
                  return false;
                }
                return name.toLowerCase().includes(query) || id.includes(query);
              })
              .map(([id, name]) => {
                const provinceId = Number(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.provinceChip,
                      { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                      disabled && styles.provinceChipDisabled,
                    ]}
                    onPress={() => !disabled && onProvinceToggle?.(provinceId)}
                    disabled={disabled}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.provinceChipLabel, { color: colors.textSecondary }]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        ) : selectedProvinces.length === 0 ? (
          <Text style={[styles.provinceHintText, { color: colors.textSecondary }]}>İl listesi arama yapıldığında gösterilir.</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Kamp Türleri</Text>
          {onToggleAllCampingTypes && (
            <TouchableOpacity
              onPress={onToggleAllCampingTypes}
              disabled={disabled}
              style={styles.toggleAllButton}
              activeOpacity={0.6}
            >
              {selectedCampingTypes.length === campingTypes.length ? (
                <CheckSquare size={22} color={colors.primary} strokeWidth={2} />
              ) : (
                <Square size={22} color={colors.muted} strokeWidth={2} />
              )}
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.campingTypesGrid}>
          {campingTypes.map(type => {
            const isSelected = selectedCampingTypes.includes(type.id);
            const count = getCountForType(type.id);
            return (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.campingTypeChip,
                  { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                  isSelected && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => !disabled && onCampingTypeToggle(type.id)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.campingTypeLabel,
                    { color: colors.textSecondary },
                    isSelected && { color: colors.surface },
                  ]}
                >
                  {type.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      
      </ScrollView>

      {/* Uygula Butonu - her zaman altta sabit */}
      {onClose && (
        <View style={[styles.applyContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.applyButtonText}>Uygula</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  scrollContentProvinceSearchActive: {
    paddingBottom: 320,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  toggleAllButton: {
    padding: 4,
  },
  userFiltersGrid: {
    gap: 12,
  },
  userFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userFilterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  userFilterItemFlex: {
    flex: 1,
  },
  userFilterItemDisabled: {
    opacity: 0.5,
  },
  turkeyCheckbox: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 48,
  },
  turkeyCheckboxActive: {
    borderWidth: 1,
  },
  turkeyCheckboxLocked: {
    opacity: 0.5,
  },
  premiumBadge: {
    position: 'absolute',
    top: -10,
    right: 0,
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  turkeyHeaderHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  turkeyHeaderHintText: {
    fontSize: 12,
    fontWeight: '600',
  },
  userFilterLabel: {
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  userFilterLabelDisabled: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  campingTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  campingTypeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  campingTypeChipActive: {
  },
  campingTypeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4b5563',
  },
  campingTypeLabelActive: {
    color: '#fff',
  },
  provinceSearchInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  provinceFiltersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  provinceHintText: {
    fontSize: 13,
    marginTop: 6,
  },
  provinceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 72,
    alignItems: 'center',
  },
  provinceChipActive: {
  },
  provinceChipDisabled: {
    opacity: 0.5,
  },
  provinceChipLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  provinceChipLabelActive: {
  },
  applyContainer: {
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
  },
  applyButton: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
