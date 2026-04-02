/**
 * Merkezi Tipografi Sistemi
 * 
 * Tüm font boyutları, ağırlıkları ve satır yükseklikleri burada tanımlanır.
 * Bileşenlerde doğrudan rakam kullanmak yerine bu sabitlere referans verilir.
 */

export const fontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
} as const;

export const fontWeights = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

/**
 * Text style presets — doğrudan StyleSheet'lerde kullanılabilir
 */
export const textStyles = {
  heading1: { fontSize: fontSizes['4xl'], fontWeight: fontWeights.bold, lineHeight: fontSizes['4xl'] * lineHeights.tight },
  heading2: { fontSize: fontSizes['3xl'], fontWeight: fontWeights.bold, lineHeight: fontSizes['3xl'] * lineHeights.tight },
  heading3: { fontSize: fontSizes['2xl'], fontWeight: fontWeights.semibold, lineHeight: fontSizes['2xl'] * lineHeights.tight },
  subtitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, lineHeight: fontSizes.xl * lineHeights.normal },
  body: { fontSize: fontSizes.md, fontWeight: fontWeights.normal, lineHeight: fontSizes.md * lineHeights.relaxed },
  bodySmall: { fontSize: fontSizes.sm, fontWeight: fontWeights.normal, lineHeight: fontSizes.sm * lineHeights.relaxed },
  caption: { fontSize: fontSizes.xs, fontWeight: fontWeights.normal, lineHeight: fontSizes.xs * lineHeights.relaxed },
  label: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, lineHeight: fontSizes.sm * lineHeights.normal },
  button: { fontSize: fontSizes.md, fontWeight: fontWeights.semibold, lineHeight: fontSizes.md * lineHeights.normal },
  buttonSmall: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, lineHeight: fontSizes.sm * lineHeights.normal },
  tabLabel: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, lineHeight: fontSizes.sm * lineHeights.normal },
} as const;

export type TextStyleName = keyof typeof textStyles;
