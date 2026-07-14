/**
 * Merkezi Renk Paleti Sistemi — v2 (Premium Minimal)
 *
 * Mevcut ThemeColors API korunur; ekranlar colors.primary / background vb. kullanmaya devam eder.
 *
 * Açık tema paletleri (yalnız light): L1 · L2 · L3
 * Koyu tema paletleri (yalnız dark):  D1 · D2 · D3
 *
 * Kaynak mockup: kamp-defterim-palette-mockups.html
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

/** Tek şema (light veya dark) için palet tanımı */
export type SchemePalette = {
  id: string;
  name: string;
  emoji: string;
  /** Sadece bu şemada kullanılır */
  scheme: 'light' | 'dark';
  colors: ThemeColors;
};

/** Geriye dönük: light+dark birleşik palet (eski API) */
export type ThemePalette = {
  id: string;
  name: string;
  emoji: string;
  light: ThemeColors;
  dark: ThemeColors;
};

// ─── L1 Warm Sand (Açık) ───
export const lightL1: ThemeColors = {
  primary: '#2C2A26',
  primaryLight: '#EFEAE3',
  primaryDark: '#1A1917',
  accent: '#8B7355',
  background: '#F7F4EF',
  surface: '#FFFFFF',
  surfaceVariant: '#EFEAE3',
  text: '#2C2A26',
  textSecondary: '#8A847A',
  muted: '#A39888',
  border: '#E8E2D9',
  danger: '#C45C5C',
  warning: '#B8956A',
  success: '#6B8F71',
  info: '#5B7C99',
  tabBar: '#FFFFFF',
  tabBarBorder: '#EDE8E0',
  tabBarActive: '#2C2A26',
  tabBarInactive: '#A39888',
};

// ─── L2 Cool Mist (Açık) ───
export const lightL2: ThemeColors = {
  primary: '#1E293B',
  primaryLight: '#E8EEF4',
  primaryDark: '#0F172A',
  accent: '#64748B',
  background: '#F3F5F7',
  surface: '#FFFFFF',
  surfaceVariant: '#E8EEF4',
  text: '#1E293B',
  textSecondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  danger: '#E11D48',
  warning: '#D97706',
  success: '#0F9F6E',
  info: '#3B82F6',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E8EEF4',
  tabBarActive: '#1E293B',
  tabBarInactive: '#94A3B8',
};

// ─── L3 Soft Linen (Açık) ───
export const lightL3: ThemeColors = {
  primary: '#6B8F71',
  primaryLight: '#EEF2EE',
  primaryDark: '#4F6B54',
  accent: '#8A847A',
  background: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceVariant: '#F0EBE4',
  text: '#3D3A36',
  textSecondary: '#8A847A',
  muted: '#A39E96',
  border: '#E5DFD6',
  danger: '#C45C5C',
  warning: '#B8956A',
  success: '#6B8F71',
  info: '#5B8DEF',
  tabBar: '#FAF8F5',
  tabBarBorder: '#EFEAE3',
  tabBarActive: '#6B8F71',
  tabBarInactive: '#B0A89E',
};

// ─── D1 Charcoal Mono (Koyu) ───
export const darkD1: ThemeColors = {
  primary: '#F5F5F4',
  primaryLight: '#262626',
  primaryDark: '#D6D3D1',
  accent: '#A8A29E',
  background: '#141414',
  surface: '#1C1C1C',
  surfaceVariant: '#262626',
  text: '#F5F5F4',
  textSecondary: '#A8A29E',
  muted: '#737373',
  border: '#2A2A2A',
  danger: '#FB7185',
  warning: '#FBBF24',
  success: '#A3A3A3',
  info: '#94A3B8',
  tabBar: '#141414',
  tabBarBorder: '#222222',
  tabBarActive: '#D6D3D1',
  tabBarInactive: '#737373',
};

// ─── D2 Night Slate (Koyu) ───
export const darkD2: ThemeColors = {
  primary: '#E7ECF1',
  primaryLight: '#1A222C',
  primaryDark: '#CBD5E1',
  accent: '#94A3B8',
  background: '#0F1419',
  surface: '#151C24',
  surfaceVariant: '#1A222C',
  text: '#E7ECF1',
  textSecondary: '#94A3B8',
  muted: '#64748B',
  border: '#243041',
  danger: '#FB7185',
  warning: '#FBBF24',
  success: '#34D399',
  info: '#3B82F6',
  tabBar: '#0F1419',
  tabBarBorder: '#1A222C',
  tabBarActive: '#94A3B8',
  tabBarInactive: '#64748B',
};

// ─── D3 Forest Night (Koyu) ───
export const darkD3: ThemeColors = {
  primary: '#3D5A45',
  primaryLight: '#1A2420',
  primaryDark: '#9CB4A3',
  accent: '#9CB4A3',
  background: '#0C100E',
  surface: '#121A15',
  surfaceVariant: '#1A2420',
  text: '#E8EDE9',
  textSecondary: '#8A9A8E',
  muted: '#5C6B62',
  border: '#243028',
  danger: '#E07A7A',
  warning: '#D4A574',
  success: '#9CB4A3',
  info: '#6B9BD1',
  tabBar: '#0C100E',
  tabBarBorder: '#16201A',
  tabBarActive: '#9CB4A3',
  tabBarInactive: '#5C6B62',
};

// ─── D4 Kampfire Gold (Koyu) ───
export const darkD4: ThemeColors = {
  primary: '#D4AF6A',
  primaryLight: '#221D15',
  primaryDark: '#8A7348',
  accent: '#E8C97A',
  background: '#07090A',
  surface: '#0E1210',
  surfaceVariant: '#141A16',
  text: '#F2EDE3',
  textSecondary: '#A89F8E',
  muted: '#6B655A',
  border: 'rgba(212,175,106,0.14)',
  danger: '#E07A7A',
  warning: '#D4AF6A',
  success: '#6B8F71',
  info: '#5B7C99',
  tabBar: '#0E1210',
  tabBarBorder: 'rgba(212,175,106,0.08)',
  tabBarActive: '#D4AF6A',
  tabBarInactive: '#8A7348',
};

// ─── Scheme-specific palette lists (Profil seçici) ───

export type LightPaletteId = 'L1' | 'L2' | 'L3';
export type DarkPaletteId = 'D1' | 'D2' | 'D3' | 'D4';

export const lightPalettes: Record<LightPaletteId, SchemePalette> = {
  L1: {
    id: 'L1',
    name: 'Sıcak Kum',
    emoji: '🏜️',
    scheme: 'light',
    colors: lightL1,
  },
  L2: {
    id: 'L2',
    name: 'Serin Sis',
    emoji: '🌫️',
    scheme: 'light',
    colors: lightL2,
  },
  L3: {
    id: 'L3',
    name: 'Yumuşak Keten',
    emoji: '🌿',
    scheme: 'light',
    colors: lightL3,
  },
};

export const darkPalettes: Record<DarkPaletteId, SchemePalette> = {
  D1: {
    id: 'D1',
    name: 'Kömür Mono',
    emoji: '⬛',
    scheme: 'dark',
    colors: darkD1,
  },
  D2: {
    id: 'D2',
    name: 'Gece Arduvaz',
    emoji: '🌙',
    scheme: 'dark',
    colors: darkD2,
  },
  D3: {
    id: 'D3',
    name: 'Orman Gecesi',
    emoji: '🌲',
    scheme: 'dark',
    colors: darkD3,
  },
  D4: {
    id: 'D4',
    name: 'Kampfire Gold',
    emoji: '🌟',
    scheme: 'dark',
    colors: darkD4,
  },
};

export const lightPaletteList: SchemePalette[] = Object.values(lightPalettes);
export const darkPaletteList: SchemePalette[] = Object.values(darkPalettes);

export const defaultLightPaletteId: LightPaletteId = 'L3';
export const defaultDarkPaletteId: DarkPaletteId = 'D3';

// ─── Geriye dönük birleşik paletler (eski setPaletteId API) ───
// Eski nature/ocean/sunset/lavender → yeni L/D eşlemesi

export const palettes: Record<string, ThemePalette> = {
  // Yeni birleşik id'ler (aynı light+dark çifti tercihinde)
  L1_D1: { id: 'L1_D1', name: 'Sıcak Kum / Kömür', emoji: '🏜️', light: lightL1, dark: darkD1 },
  L2_D2: { id: 'L2_D2', name: 'Sis / Arduvaz', emoji: '🌫️', light: lightL2, dark: darkD2 },
  L3_D3: { id: 'L3_D3', name: 'Keten / Orman', emoji: '🌿', light: lightL3, dark: darkD3 },
  L3_D4: { id: 'L3_D4', name: 'Keten / Kampfire Gold', emoji: '🌟', light: lightL3, dark: darkD4 },
  // Eski id'ler → soft map (migration)
  nature: { id: 'nature', name: 'Doğa', emoji: '🌿', light: lightL3, dark: darkD3 },
  ocean: { id: 'ocean', name: 'Okyanus', emoji: '🌊', light: lightL2, dark: darkD2 },
  sunset: { id: 'sunset', name: 'Gün Batımı', emoji: '🌅', light: lightL1, dark: darkD1 },
  lavender: { id: 'lavender', name: 'Lavanta', emoji: '💜', light: lightL2, dark: darkD2 },
};

export const paletteList: ThemePalette[] = Object.values(palettes);

/** @deprecated use defaultLightPaletteId / defaultDarkPaletteId */
export const defaultPaletteId = 'L3_D3';

// Eski export isimleri (import kırılmasın)
export const naturePalette = palettes.nature;
export const oceanPalette = palettes.ocean;
export const sunsetPalette = palettes.sunset;
export const lavenderPalette = palettes.lavender;

/** Swatch preview for profile UI */
export function getLightSwatches(id: LightPaletteId): string[] {
  const c = lightPalettes[id].colors;
  return [c.background, c.surface, c.primary, c.accent, c.muted];
}

export function getDarkSwatches(id: DarkPaletteId): string[] {
  const c = darkPalettes[id].colors;
  return [c.background, c.surface, c.primary, c.accent, c.muted];
}

export function isLightPaletteId(id: string): id is LightPaletteId {
  return id === 'L1' || id === 'L2' || id === 'L3';
}

export function isDarkPaletteId(id: string): id is DarkPaletteId {
  return id === 'D1' || id === 'D2' || id === 'D3' || id === 'D4';
}
