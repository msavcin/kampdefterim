/**
 * Merkezi Badge (Künye) Konfigürasyonu
 * 
 * Tüm badge boyut, variant ve oluşturma kuralları burada tanımlanır.
 * Bileşenler bu ayarlara referans vererek tutarlı badge'ler üretir.
 */

import type { ThemeColors } from './colors';
import { fontSizes, fontWeights } from './typography';
import { spacing, borderRadius } from './spacing';

// ─── Boyutlar ───
export const badgeSizes = {
  xs: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    iconSize: 10,
  },
  sm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    iconSize: 12,
  },
  md: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: borderRadius.lg,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    iconSize: 14,
  },
  lg: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    iconSize: 16,
  },
} as const;

// ─── Variant Renk Üretici ───
export type BadgeVariant = 'default' | 'primary' | 'primaryLight' | 'danger' | 'warning' | 'success' | 'info' | 'muted' | 'outline';

export function getBadgeVariantColors(variant: BadgeVariant, colors: ThemeColors) {
  const map: Record<BadgeVariant, { backgroundColor: string; textColor: string; borderColor?: string }> = {
    default: {
      backgroundColor: colors.surfaceVariant,
      textColor: colors.textSecondary,
    },
    primary: {
      backgroundColor: colors.primary,
      textColor: '#FFFFFF',
    },
    primaryLight: {
      backgroundColor: colors.primaryLight,
      textColor: colors.primary,
    },
    danger: {
      backgroundColor: colors.danger,
      textColor: '#FFFFFF',
    },
    warning: {
      backgroundColor: colors.warning,
      textColor: '#FFFFFF',
    },
    success: {
      backgroundColor: colors.success,
      textColor: '#FFFFFF',
    },
    info: {
      backgroundColor: colors.info,
      textColor: '#FFFFFF',
    },
    muted: {
      backgroundColor: colors.surface,
      textColor: colors.muted,
    },
    outline: {
      backgroundColor: 'transparent',
      textColor: colors.primary,
      borderColor: colors.primary,
    },
  };
  return map[variant] || map.default;
}

export type BadgeSize = keyof typeof badgeSizes;
