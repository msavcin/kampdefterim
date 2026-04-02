/**
 * Merkezi Ortak Stil Kalıpları (Shared Style Patterns)
 * 
 * Tüm ekranlarda tekrarlanan yapısal stil kalıplarını tanımlar.
 * Modal header, section, card, empty state, list item, form vb.
 * 
 * Kullanım: 
 *   import { createThemedStyles } from '@/constants/theme/sharedStyles';
 *   const themed = createThemedStyles(colors);
 */

import { StyleSheet } from 'react-native';
import type { ThemeColors } from './colors';
import { spacing, borderRadius } from './spacing';
import { fontSizes, fontWeights } from './typography';

/**
 * Tema renklerine göre tüm ortak stilleri üreten factory
 */
export function createThemedStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ─── Sayfa Konteynerleri ───
    screenContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ─── Header ───
    screenHeader: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xl,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    screenHeaderTitle: {
      fontSize: fontSizes['3xl'],
      fontWeight: fontWeights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    screenHeaderSubtitle: {
      fontSize: fontSizes.md,
      color: colors.muted,
    },

    // ─── Modal Header ───
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalHeaderTitle: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.bold,
      color: colors.text,
    },
    modalCloseButton: {
      padding: spacing.xs,
    },

    // ─── Kart / Section ───
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginVertical: spacing.sm,
    },
    cardWithShadow: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginVertical: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    cardWithBorder: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginVertical: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginVertical: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.semibold,
      color: colors.text,
      marginBottom: spacing.lg,
    },
    sectionTitleCentered: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.semibold,
      color: colors.text,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
      textAlign: 'center',
    },

    // ─── Form Elemanları ───
    inputGroup: {
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: fontSizes.lg,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },

    // ─── Liste Elemanları ───
    listItem: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    listItemContent: {
      padding: spacing.lg,
    },
    listItemTitle: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.semibold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    listItemSeparator: {
      height: spacing.md,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      gap: 6,
    },
    infoText: {
      fontSize: fontSizes.sm + 1,
      color: colors.muted,
    },

    // ─── Chip / Tag ───
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    chipLabel: {
      fontSize: fontSizes.sm,
      color: colors.muted,
    },
    chipLabelSelected: {
      color: colors.primary,
      fontWeight: fontWeights.semibold,
    },

    // ─── Checkbox ───
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: borderRadius.sm + 2,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },

    // ─── Aksiyon Butonları ───
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.lg,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.semibold,
    },
    secondaryButton: {
      backgroundColor: colors.surfaceVariant,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.semibold,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryLight,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      gap: 6,
    },
    actionButtonText: {
      fontSize: fontSizes.sm + 1,
      fontWeight: fontWeights.semibold,
      color: colors.primary,
    },

    // ─── Boş Durum ───
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing['5xl'],
    },
    emptyStateTitle: {
      fontSize: fontSizes['2xl'],
      fontWeight: fontWeights.semibold,
      color: colors.text,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    emptyStateSubtitle: {
      fontSize: fontSizes.lg,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 24,
    },

    // ─── Banner / Bildirim ───
    warningBanner: {
      backgroundColor: colors.warning + '20',
      borderBottomWidth: 1,
      borderBottomColor: colors.warning,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    warningBannerText: {
      fontSize: fontSizes.sm + 1,
      color: colors.warning,
      fontWeight: fontWeights.semibold,
      textAlign: 'center',
      flex: 1,
    },

    // ─── Footer ───
    footer: {
      padding: spacing.xl,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },

    // ─── Satır ile border ───
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    menuIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.lg,
    },
    menuTitle: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.medium,
      color: colors.text,
      marginBottom: 2,
    },
    menuSubtitle: {
      fontSize: fontSizes.md,
      color: colors.muted,
    },

    // ─── Stat Kutuları ───
    statsContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      paddingVertical: spacing['2xl'],
      marginBottom: spacing.lg,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
    },
    statItemBorder: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    statNumber: {
      fontSize: fontSizes['3xl'],
      fontWeight: fontWeights.bold,
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    statLabel: {
      fontSize: fontSizes.sm,
      color: colors.muted,
      fontWeight: fontWeights.medium,
    },

    // ─── Favori Butonu ───
    favoriteButton: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.danger + '15',
      borderWidth: 1,
      borderColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    favoriteButtonActive: {
      backgroundColor: colors.danger,
    },

    // ─── Type Badge (Kamp türü etiketi) ───
    typeBadge: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: borderRadius.lg,
    },
    typeBadgeText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      color: colors.primary,
    },
  });
}
