import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, CheckSquare, Square, Map, Crown } from 'lucide-react-native';
import { campingTypes } from '../lib/categories';
import type { CampingArea } from '../lib/database';

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
  isOffline?: boolean;
  isPremium?: boolean;
}

// Modern Checkbox Component
function ModernCheckbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <View
      style={[
        styles.checkbox,
        checked && styles.checkboxChecked,
        disabled && styles.checkboxDisabled,
      ]}
    >
      {checked && <Check size={16} color="#fff" strokeWidth={3} />}
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
  isOffline = false,
  isPremium = false,
}: Props & { userId?: string | number }) {
  const router = useRouter();
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
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
      {/* Kullanıcı Filtresi Bölümü */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Kullanıcı Filtresi</Text>
          {onTurkeyWideToggle && (
            <View style={styles.turkeyHeaderHint}>
              <Map size={15} color={isOffline ? '#d1d5db' : '#f97316'} strokeWidth={2} />
              <Text style={[styles.turkeyHeaderHintText, isOffline && { color: '#d1d5db' }]}>Tüm TR</Text>
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
                      (filter.disabled || disabledByTurkey) && styles.userFilterLabelDisabled,
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
                          turkeyWideFilters.includes(filter.key) && !lockedByPremium && styles.turkeyCheckboxActive,
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

      {/* Kamp Türleri Bölümü */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Kamp Türleri</Text>
          {onToggleAllCampingTypes && (
            <TouchableOpacity
              onPress={onToggleAllCampingTypes}
              disabled={disabled}
              style={styles.toggleAllButton}
              activeOpacity={0.6}
            >
              {selectedCampingTypes.length === campingTypes.length ? (
                <CheckSquare size={22} color="#059669" strokeWidth={2} />
              ) : (
                <Square size={22} color="#9ca3af" strokeWidth={2} />
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
                  isSelected && styles.campingTypeChipActive,
                ]}
                onPress={() => !disabled && onCampingTypeToggle(type.id)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.campingTypeLabel,
                    isSelected && styles.campingTypeLabelActive,
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
        <View style={styles.applyContainer}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.applyButtonText}>Uygula</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
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
    color: '#1f2937',
    letterSpacing: 0.2,
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
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 48,
  },
  turkeyCheckboxActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#f97316',
  },
  turkeyCheckboxLocked: {
    opacity: 0.5,
  },
  premiumBadge: {
    position: 'absolute',
    top: -10,
    right: 0,
    backgroundColor: '#059669',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  turkeyHeaderHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  turkeyHeaderHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f97316',
  },
  userFilterLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  },
  userFilterLabelDisabled: {
    color: '#9ca3af',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#059669',
    borderColor: '#059669',
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
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  campingTypeChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  campingTypeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4b5563',
  },
  campingTypeLabelActive: {
    color: '#fff',
  },
  applyContainer: {
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  applyButton: {
    backgroundColor: '#059669',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#059669',
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
