/**
 * Merkezi Tema Sistemi — Ana Giriş Noktası
 * 
 * Tüm tema bileşenleri buradan export edilir.
 * Kullanım: import { palettes, spacing, textStyles, ... } from '@/constants/theme';
 */

// Renkler & Paletler
export { 
  type ThemeColors,
  type ThemePalette,
  palettes,
  paletteList,
  defaultPaletteId,
  naturePalette,
  oceanPalette,
  sunsetPalette,
  lavenderPalette,
} from './colors';

// Tipografi
export {
  fontSizes,
  fontWeights,
  lineHeights,
  textStyles,
  type TextStyleName,
} from './typography';

// Aralık & Boyutlar
export {
  spacing,
  borderRadius,
  iconSizes,
  type SpacingKey,
  type BorderRadiusKey,
  type IconSizeKey,
} from './spacing';

// İkon Kayıt Sistemi
export {
  iconRegistry,
  getIconColor,
  type IconCategory,
} from './icons';

// Badge Konfigürasyonu
export {
  badgeSizes,
  getBadgeVariantColors,
  type BadgeVariant,
  type BadgeSize,
} from './badges';

// Ortak Stil Kalıpları
export {
  createThemedStyles,
} from './sharedStyles';
