import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Check, CheckSquare, Square } from 'lucide-react-native';
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
}: Props & { userId?: string | number }) {
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Kullanıcı Filtresi Bölümü */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kullanıcı Filtresi</Text>
        <View style={styles.userFiltersGrid}>
          {userFilters.filter(f => f.visible).map(filter => {
            const count = getCountForUserFilter(filter.key);
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.userFilterItem,
                  filter.disabled && styles.userFilterItemDisabled,
                ]}
                onPress={() => !filter.disabled && !disabled && onUserFilterToggle(filter.key)}
                disabled={filter.disabled || disabled}
                activeOpacity={0.7}
              >
                <ModernCheckbox
                  checked={selectedUserFilters.includes(filter.key)}
                  disabled={filter.disabled || disabled}
                />
                <Text
                  style={[
                    styles.userFilterLabel,
                    filter.disabled && styles.userFilterLabelDisabled,
                  ]}
                >
                  {filter.label} ({count})
                </Text>
              </TouchableOpacity>
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
      
      {/* Uygula Butonu */}
      {onClose && (
        <TouchableOpacity
          style={styles.applyButton}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={styles.applyButtonText}>Uygula</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  userFilterItemDisabled: {
    opacity: 0.5,
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
    gap: 8,
  },
  campingTypeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  campingTypeChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  campingTypeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4b5563',
  },
  campingTypeLabelActive: {
    color: '#fff',
  },
  applyButton: {
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
