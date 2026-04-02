/**
 * Merkezi Renk Paleti Sistemi
 * 
 * Her tema paleti light ve dark modları için ayrı renk setleri içerir.
 * Paletler: nature (varsayılan), ocean, sunset, lavender
 * 
 * Renk hiyerarşisi:
 * - primary: Ana vurgu rengi (butonlar, aktif durumlar)
 * - primaryLight: Primary'nin açık tonu (arka plan vurguları)
 * - primaryDark: Primary'nin koyu tonu (basılı durum, kontrast)
 * - accent: İkinci vurgu rengi (secondary highlight)
 * - background: Sayfa arka planı
 * - surface: Kart/modal arka planı
 * - surfaceVariant: Alternatif yüzey (gruplu liste, nested card)
 * - text: Ana metin rengi
 * - textSecondary: İkincil metin
 * - muted: Soluk metin, placeholder
 * - border: Çerçeve ve ayırıcılar
 * - danger: Hata/silme
 * - warning: Uyarı
 * - success: Başarı
 * - info: Bilgi
 * - tabBar: Sekme çubuğu arka planı
 * - tabBarBorder: Sekme çubuğu üst bordür
 * - tabBarActive: Aktif sekme rengi
 * - tabBarInactive: Pasif sekme rengi
 */

export type ThemeColors = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  text: string;
  textSecondary: string;
  muted: string;
  border: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
};

export type ThemePalette = {
  id: string;
  name: string;
  emoji: string;
  light: ThemeColors;
  dark: ThemeColors;
};

// ─── Doğa (Nature) - Varsayılan Yeşil Tema ───
export const naturePalette: ThemePalette = {
  id: 'nature',
  name: 'Doğa',
  emoji: '🌿',
  light: {
    primary: '#059669',
    primaryLight: '#D1FAE5',
    primaryDark: '#047857',
    accent: '#10B981',
    background: '#FAFAFB',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    text: '#0F172A',
    textSecondary: '#374151',
    muted: '#64748B',
    border: '#E6E9EE',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#22C55E',
    info: '#3B82F6',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E5E7EB',
    tabBarActive: '#059669',
    tabBarInactive: '#6B7280',
  },
  dark: {
    primary: '#34D399',
    primaryLight: '#064E3B',
    primaryDark: '#6EE7B7',
    accent: '#10B981',
    background: '#071026',
    surface: '#0B1220',
    surfaceVariant: '#111B2E',
    text: '#E6EEF8',
    textSecondary: '#CBD5E1',
    muted: '#94A3B8',
    border: '#102033',
    danger: '#FB7185',
    warning: '#FBBF24',
    success: '#4ADE80',
    info: '#60A5FA',
    tabBar: '#0B1220',
    tabBarBorder: '#102033',
    tabBarActive: '#34D399',
    tabBarInactive: '#64748B',
  },
};

// ─── Okyanus (Ocean) - Mavi Tema ───
export const oceanPalette: ThemePalette = {
  id: 'ocean',
  name: 'Okyanus',
  emoji: '🌊',
  light: {
    primary: '#0284C7',
    primaryLight: '#DBEAFE',
    primaryDark: '#0369A1',
    accent: '#06B6D4',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F0F9FF',
    text: '#0C1222',
    textSecondary: '#334155',
    muted: '#64748B',
    border: '#E2E8F0',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#22C55E',
    info: '#3B82F6',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
    tabBarActive: '#0284C7',
    tabBarInactive: '#6B7280',
  },
  dark: {
    primary: '#38BDF8',
    primaryLight: '#0C2D48',
    primaryDark: '#7DD3FC',
    accent: '#22D3EE',
    background: '#0A0F1E',
    surface: '#0E1629',
    surfaceVariant: '#132038',
    text: '#E6EEF8',
    textSecondary: '#CBD5E1',
    muted: '#94A3B8',
    border: '#1A2744',
    danger: '#FB7185',
    warning: '#FBBF24',
    success: '#4ADE80',
    info: '#60A5FA',
    tabBar: '#0E1629',
    tabBarBorder: '#1A2744',
    tabBarActive: '#38BDF8',
    tabBarInactive: '#64748B',
  },
};

// ─── Gün Batımı (Sunset) - Turuncu/Sıcak Tema ───
export const sunsetPalette: ThemePalette = {
  id: 'sunset',
  name: 'Gün Batımı',
  emoji: '🌅',
  light: {
    primary: '#EA580C',
    primaryLight: '#FFF7ED',
    primaryDark: '#C2410C',
    accent: '#F97316',
    background: '#FFFBF5',
    surface: '#FFFFFF',
    surfaceVariant: '#FEF3E2',
    text: '#1C1108',
    textSecondary: '#44403C',
    muted: '#78716C',
    border: '#E7E5E4',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#22C55E',
    info: '#3B82F6',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E7E5E4',
    tabBarActive: '#EA580C',
    tabBarInactive: '#78716C',
  },
  dark: {
    primary: '#FB923C',
    primaryLight: '#431407',
    primaryDark: '#FDBA74',
    accent: '#F97316',
    background: '#120C06',
    surface: '#1A1008',
    surfaceVariant: '#231A0E',
    text: '#FEF3E2',
    textSecondary: '#D6D3D1',
    muted: '#A8A29E',
    border: '#2D2012',
    danger: '#FB7185',
    warning: '#FBBF24',
    success: '#4ADE80',
    info: '#60A5FA',
    tabBar: '#1A1008',
    tabBarBorder: '#2D2012',
    tabBarActive: '#FB923C',
    tabBarInactive: '#78716C',
  },
};

// ─── Lavanta (Lavender) - Mor Tema ───
export const lavenderPalette: ThemePalette = {
  id: 'lavender',
  name: 'Lavanta',
  emoji: '💜',
  light: {
    primary: '#7C3AED',
    primaryLight: '#EDE9FE',
    primaryDark: '#6D28D9',
    accent: '#A78BFA',
    background: '#FAFAFF',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F3FF',
    text: '#1E1033',
    textSecondary: '#3F3565',
    muted: '#6B6B8E',
    border: '#E5E3F0',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#22C55E',
    info: '#3B82F6',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E5E3F0',
    tabBarActive: '#7C3AED',
    tabBarInactive: '#6B6B8E',
  },
  dark: {
    primary: '#A78BFA',
    primaryLight: '#1E1044',
    primaryDark: '#C4B5FD',
    accent: '#8B5CF6',
    background: '#0B0718',
    surface: '#110E22',
    surfaceVariant: '#19133A',
    text: '#EDE9FE',
    textSecondary: '#C4B5FD',
    muted: '#8B8BA8',
    border: '#201848',
    danger: '#FB7185',
    warning: '#FBBF24',
    success: '#4ADE80',
    info: '#60A5FA',
    tabBar: '#110E22',
    tabBarBorder: '#201848',
    tabBarActive: '#A78BFA',
    tabBarInactive: '#6B6B8E',
  },
};

// ─── Tüm Paletler ───
export const palettes: Record<string, ThemePalette> = {
  nature: naturePalette,
  ocean: oceanPalette,
  sunset: sunsetPalette,
  lavender: lavenderPalette,
};

export const paletteList: ThemePalette[] = Object.values(palettes);

export const defaultPaletteId = 'nature';
