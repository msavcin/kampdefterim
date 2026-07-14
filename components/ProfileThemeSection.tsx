/**
 * Profil → Görünüm paneli
 * Referans: design-alts/profile-theme-picker.html
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { spacing } from '../constants/theme/spacing';
import { useTheme } from './ThemeProvider';
import {
  lightPaletteList,
  darkPaletteList,
  getLightSwatches,
  getDarkSwatches,
  type LightPaletteId,
  type DarkPaletteId,
} from '../constants/theme/colors';
import {
  themeVariantList,
  type ThemeVariantId,
} from '../constants/theme/variants';

type ColorMode = 'light' | 'dark' | 'system';

const MODE_OPTIONS: { id: ColorMode; label: string }[] = [
  { id: 'light', label: 'Gündüz' },
  { id: 'dark', label: 'Gece' },
  { id: 'system', label: 'Sistem' },
];

function Swatches({ colors: sw }: { colors: string[] }) {
  return (
    <View style={styles.swatchRow}>
      {sw.map((c, index) => (
        <View
          key={`${c}-${index}`}
          style={[
            styles.swatch,
            {
              backgroundColor: c,
              borderColor:
                c.toLowerCase() === '#ffffff' ||
                c.toLowerCase() === '#faf8f5' ||
                c.toLowerCase() === '#f7f4ef'
                  ? 'rgba(0,0,0,0.08)'
                  : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
      ))}
    </View>
  );
}

function ProfileThemeSectionComponent() {
  const {
    colors,
    colorMode,
    setColorMode,
    scheme,
    lightPaletteId,
    setLightPaletteId,
    darkPaletteId,
    setDarkPaletteId,
    themeVariantId,
    setThemeVariantId,
  } = useTheme();

  const handleVariantChange = (id: ThemeVariantId) => {
    setThemeVariantId(id);
    if (id === 'kampfireGold' && darkPaletteId !== 'D4') {
      setDarkPaletteId('D4');
    }
  };

  const onPrimaryText = (() => {
    const hex = (colors.primary || '').replace('#', '');
    if (hex.length < 6) return '#FFFFFF';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return '#FFFFFF';
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
      ? colors.background
      : '#FFFFFF';
  })();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>GÖRÜNÜM</Text>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 2 }]}>TEMA DİLİ</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>Mevcut arayüzü koruyan klasik görünüm veya Kampfire Gold alternatifi</Text>
      {themeVariantList.map((variant) => {
        const selected = themeVariantId === variant.id;
        return (
          <Pressable
            key={variant.id}
            onPress={() => handleVariantChange(variant.id)}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: selected ? colors.primary : colors.border,
                borderWidth: selected ? 1.5 : 1,
              },
            ]}
          >
            <Swatches colors={variant.preview} />
            <Text style={[styles.pid, { color: colors.primary }]}>{variant.badge}</Text>
            <Text style={[styles.pname, { color: colors.text }]}>{variant.name}</Text>
            <Text style={[styles.variantDescription, { color: colors.muted }]}>
              {variant.description}
            </Text>
            {variant.darkOnly ? (
              <Text style={[styles.variantHint, { color: colors.warning }]}>
                Koyu modda en güçlü görünümü verir.
              </Text>
            ) : null}
            {selected && (
              <View style={[styles.check, { backgroundColor: colors.primary }]}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      {themeVariantId === 'kampfireGold' && scheme !== 'dark' ? (
        <Text style={[styles.hint, { color: colors.warning, marginTop: 4 }]}>Kampfire Gold seçildi. Altın harita görünümü için gece moduna geçebilirsiniz.</Text>
      ) : null}

      {/* Mode segment */}
      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 18 }]}>MOD</Text>
      <View
        style={[
          styles.segment,
          {
            backgroundColor: colors.surfaceVariant,
            borderColor: colors.border,
          },
        ]}
      >
        {MODE_OPTIONS.map((opt) => {
          const on = colorMode === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setColorMode(opt.id)}
              style={[
                styles.segBtn,
                on && { backgroundColor: colors.primary },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: on ? '600' : '400',
                  color: on ? onPrimaryText : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.muted }]}>Şu an: {scheme === 'light' ? 'Açık' : 'Koyu'} tema{colorMode === 'system' ? ' (sistem)' : ''}</Text>

      {/* Light palettes */}
      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 18 }]}>AÇIK TEMA RENGİ</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>Gündüz modunda kullanılacak palet</Text>
      {lightPaletteList.map((p) => {
        const selected = lightPaletteId === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => setLightPaletteId(p.id as LightPaletteId)}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: selected ? colors.primary : colors.border,
                borderWidth: selected ? 1.5 : 1,
              },
            ]}
          >
            <Swatches colors={getLightSwatches(p.id as LightPaletteId)} />
            <Text style={[styles.pid, { color: colors.primary }]}>
              {p.emoji} {p.id}
            </Text>
            <Text style={[styles.pname, { color: colors.text }]}>{p.name}</Text>
            {selected && (
              <View style={[styles.check, { backgroundColor: colors.primary }]}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
          </Pressable>
        );
      })}

      {/* Dark palettes */}
      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 18 }]}>KOYU TEMA RENGİ</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>Gece modunda kullanılacak palet</Text>
      {darkPaletteList.map((p) => {
        const selected = darkPaletteId === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => setDarkPaletteId(p.id as DarkPaletteId)}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: selected ? colors.primary : colors.border,
                borderWidth: selected ? 1.5 : 1,
              },
            ]}
          >
            <Swatches colors={getDarkSwatches(p.id as DarkPaletteId)} />
            <Text style={[styles.pid, { color: colors.primary }]}>
              {p.emoji} {p.id}
            </Text>
            <Text style={[styles.pname, { color: colors.text }]}>{p.name}</Text>
            {selected && (
              <View style={[styles.check, { backgroundColor: colors.primary }]}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export const ProfileThemeSection = memo(ProfileThemeSectionComponent);
export default ProfileThemeSection;

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    marginBottom: 8,
    marginHorizontal: -spacing.lg,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    position: 'relative',
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  pid: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  pname: {
    fontSize: 14,
    fontWeight: '600',
  },
  variantDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  variantHint: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
