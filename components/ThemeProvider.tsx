import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type ThemeColors,
  type ThemePalette,
  type LightPaletteId,
  type DarkPaletteId,
  palettes,
  defaultPaletteId,
  defaultLightPaletteId,
  defaultDarkPaletteId,
  lightPalettes,
  darkPalettes,
  isLightPaletteId,
  isDarkPaletteId,
} from '../constants/theme/colors';
import {
  type ThemeVariant,
  type ThemeVariantId,
  themeVariants,
  defaultThemeVariantId,
  isThemeVariantId,
} from '../constants/theme/variants';

// ─── Geriye dönük uyumluluk ───
export const themes = {
  light: { colors: lightPalettes[defaultLightPaletteId].colors },
  dark: { colors: darkPalettes[defaultDarkPaletteId].colors },
};

// ─── Kategori ikon/renk haritası (mevcut dosyadan korundu) ───
export type CatSeverity = 'good' | 'warning' | 'danger' | 'info';

export const defaultCategoryMap: Record<string, { icon: string; severity: CatSeverity }> = {
  'hava durumu': { icon: 'CloudSun', severity: 'info' },
  hava: { icon: 'CloudSun', severity: 'info' },
  sıcaklık: { icon: 'Thermometer', severity: 'info' },
  weather: { icon: 'CloudSun', severity: 'info' },
  rüzgar: { icon: 'Wind', severity: 'warning' },
  yağış: { icon: 'CloudRain', severity: 'warning' },
  yağmur: { icon: 'CloudRain', severity: 'warning' },
  güvenlik: { icon: 'ShieldCheck', severity: 'danger' },
  uyarı: { icon: 'AlertTriangle', severity: 'danger' },
  dikkat: { icon: 'AlertTriangle', severity: 'danger' },
  duyuru: { icon: 'Megaphone', severity: 'warning' },
  ekipman: { icon: 'Backpack', severity: 'info' },
  malzeme: { icon: 'Package', severity: 'info' },
  'kamp alanı': { icon: 'campground', severity: 'good' },
  kamp: { icon: 'campground', severity: 'good' },
  konum: { icon: 'MapPin', severity: 'good' },
  lokasyon: { icon: 'MapPin', severity: 'good' },
  mesafe: { icon: 'Route', severity: 'info' },
  yorum: { icon: 'MessageSquare', severity: 'info' },
  ulaşım: { icon: 'Route', severity: 'info' },
  yol: { icon: 'Route', severity: 'info' },
  genel: { icon: 'ClipboardList', severity: 'info' },
  özet: { icon: 'BarChart3', severity: 'good' },
  sonuç: { icon: 'CheckCircle2', severity: 'good' },
  öneri: { icon: 'Lightbulb', severity: 'info' },
  not: { icon: 'StickyNote', severity: 'info' },
  puan: { icon: 'Star', severity: 'good' },
  skor: { icon: 'Star', severity: 'good' },
  değerlendirme: { icon: 'Sparkles', severity: 'good' },
  yakın: { icon: 'Compass', severity: 'info' },
  alternatif: { icon: 'ArrowRightLeft', severity: 'info' },
  'alternatif kamp': { icon: 'MapPin', severity: 'info' },
};

export const DEFAULT_CATEGORY_ACCENTS: Record<
  CatSeverity,
  {
    accentLight: string;
    accentDark: string;
    bgLight: string;
    borderLight: string;
    iconBgLight: string;
  }
> = {
  good: {
    accentLight: '#059669',
    accentDark: '#4ADE80',
    bgLight: '#F0FDF4',
    borderLight: '#BBF7D0',
    iconBgLight: '#D1FAE5',
  },
  warning: {
    accentLight: '#D97706',
    accentDark: '#FBBF24',
    bgLight: '#FFFBEB',
    borderLight: '#FDE68A',
    iconBgLight: '#FEF3C7',
  },
  danger: {
    accentLight: '#EF4444',
    accentDark: '#FB7185',
    bgLight: '#FEF2F2',
    borderLight: '#FECACA',
    iconBgLight: '#FEE2E2',
  },
  info: {
    accentLight: '#3B82F6',
    accentDark: '#60A5FA',
    bgLight: '#EFF6FF',
    borderLight: '#BFDBFE',
    iconBgLight: '#DBEAFE',
  },
};

export type ColorMode = 'light' | 'dark' | 'system';

const STORAGE_KEY_MODE = '@theme_color_mode';
const STORAGE_KEY_LIGHT = '@theme_light_palette_id';
const STORAGE_KEY_DARK = '@theme_dark_palette_id';
const STORAGE_KEY_VARIANT = '@theme_variant_id';
/** Eski tek-palet key (migration) */
const STORAGE_KEY_PALETTE_LEGACY = '@theme_palette_id';

type ThemeContextType = {
  colors: ThemeColors;
  theme: { colors: ThemeColors };
  scheme: 'light' | 'dark';
  /** Geriye dönük: birleşik palet objesi */
  palette: ThemePalette;
  colorMode: ColorMode;
  /** @deprecated Tercihen setLightPaletteId / setDarkPaletteId */
  setPaletteId: (id: string) => void;
  setColorMode: (mode: ColorMode) => void;
  /** Açık tema rengi L1|L2|L3 */
  lightPaletteId: LightPaletteId;
  setLightPaletteId: (id: LightPaletteId) => void;
  /** Koyu tema rengi D1|D2|D3|D4 */
  darkPaletteId: DarkPaletteId;
  setDarkPaletteId: (id: DarkPaletteId) => void;
  /** Yapısal görünüm varyantı: mevcut tema / Kampfire Gold */
  themeVariantId: ThemeVariantId;
  themeVariant: ThemeVariant;
  setThemeVariantId: (id: ThemeVariantId) => void;
  isKampfireTheme: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  colors: lightPalettes[defaultLightPaletteId].colors,
  theme: { colors: lightPalettes[defaultLightPaletteId].colors },
  scheme: 'light',
  palette: palettes[defaultPaletteId],
  colorMode: 'system',
  setPaletteId: () => {},
  setColorMode: () => {},
  lightPaletteId: defaultLightPaletteId,
  setLightPaletteId: () => {},
  darkPaletteId: defaultDarkPaletteId,
  setDarkPaletteId: () => {},
  themeVariantId: defaultThemeVariantId,
  themeVariant: themeVariants[defaultThemeVariantId],
  setThemeVariantId: () => {},
  isKampfireTheme: false,
});

function migrateLegacyPaletteId(legacy: string): {
  light?: LightPaletteId;
  dark?: DarkPaletteId;
} {
  // Eski nature/ocean/sunset/lavender veya yeni L1_D1 vb.
  const map: Record<string, { light: LightPaletteId; dark: DarkPaletteId }> = {
    nature: { light: 'L3', dark: 'D3' },
    ocean: { light: 'L2', dark: 'D2' },
    sunset: { light: 'L1', dark: 'D1' },
    lavender: { light: 'L2', dark: 'D2' },
    L1_D1: { light: 'L1', dark: 'D1' },
    L2_D2: { light: 'L2', dark: 'D2' },
    L3_D3: { light: 'L3', dark: 'D3' },
    L3_D4: { light: 'L3', dark: 'D4' },
  };
  return map[legacy] || {};
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const rawSystemScheme = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    rawSystemScheme === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    if (rawSystemScheme) {
      setSystemScheme(rawSystemScheme === 'dark' ? 'dark' : 'light');
    }
  }, [rawSystemScheme]);

  useEffect(() => {
    const sub = Appearance.addChangeListener((appearance) => {
      const cs = appearance?.colorScheme === 'dark' ? 'dark' : 'light';
      setSystemScheme(cs);
    });
    return () => {
      try {
        sub.remove();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const [lightPaletteId, setLightPaletteIdState] =
    useState<LightPaletteId>(defaultLightPaletteId);
  const [darkPaletteId, setDarkPaletteIdState] =
    useState<DarkPaletteId>(defaultDarkPaletteId);
  const [themeVariantId, setThemeVariantIdState] =
    useState<ThemeVariantId>(defaultThemeVariantId);
  const [colorMode, setColorModeState] = useState<ColorMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [savedMode, savedLight, savedDark, savedVariant, savedLegacy] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEY_MODE),
            AsyncStorage.getItem(STORAGE_KEY_LIGHT),
            AsyncStorage.getItem(STORAGE_KEY_DARK),
            AsyncStorage.getItem(STORAGE_KEY_VARIANT),
            AsyncStorage.getItem(STORAGE_KEY_PALETTE_LEGACY),
          ]);

        if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
          setColorModeState(savedMode as ColorMode);
        }

        let light = savedLight;
        let dark = savedDark;

        // Eski tek-palet kaydından migrate
        if ((!light || !dark) && savedLegacy) {
          const m = migrateLegacyPaletteId(savedLegacy);
          if (!light && m.light) light = m.light;
          if (!dark && m.dark) dark = m.dark;
        }

        if (light && isLightPaletteId(light)) {
          setLightPaletteIdState(light);
        }
        if (dark && isDarkPaletteId(dark)) {
          setDarkPaletteIdState(dark);
        }
        if (savedVariant && isThemeVariantId(savedVariant)) {
          setThemeVariantIdState(savedVariant);
        }
      } catch {
        // varsayılanlar
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setLightPaletteId = useCallback((id: LightPaletteId) => {
    if (!isLightPaletteId(id)) return;
    setLightPaletteIdState(id);
    AsyncStorage.setItem(STORAGE_KEY_LIGHT, id).catch(() => {});
  }, []);

  const setDarkPaletteId = useCallback((id: DarkPaletteId) => {
    if (!isDarkPaletteId(id)) return;
    setDarkPaletteIdState(id);
    AsyncStorage.setItem(STORAGE_KEY_DARK, id).catch(() => {});
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY_MODE, mode).catch(() => {});
  }, []);

  const setThemeVariantId = useCallback((id: ThemeVariantId) => {
    if (!isThemeVariantId(id)) return;
    setThemeVariantIdState(id);
    AsyncStorage.setItem(STORAGE_KEY_VARIANT, id).catch(() => {});
  }, []);

  /** Eski API: birleşik id veya legacy id */
  const setPaletteId = useCallback(
    (id: string) => {
      const m = migrateLegacyPaletteId(id);
      if (m.light) setLightPaletteId(m.light);
      if (m.dark) setDarkPaletteId(m.dark);
      // Bilinmeyen id ise yoksay
    },
    [setLightPaletteId, setDarkPaletteId],
  );

  const scheme: 'light' | 'dark' =
    colorMode === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : colorMode;

  const colors: ThemeColors =
    scheme === 'dark'
      ? darkPalettes[darkPaletteId].colors
      : lightPalettes[lightPaletteId].colors;

  const themeVariant = themeVariants[themeVariantId] || themeVariants[defaultThemeVariantId];
  const isKampfireTheme =
    themeVariantId === 'kampfireGold' && scheme === 'dark';

  // Geriye dönük palette objesi
  const palette: ThemePalette = useMemo(
    () => ({
      id: `${lightPaletteId}_${darkPaletteId}`,
      name: `${lightPalettes[lightPaletteId].name} / ${darkPalettes[darkPaletteId].name}`,
      emoji: scheme === 'dark' ? darkPalettes[darkPaletteId].emoji : lightPalettes[lightPaletteId].emoji,
      light: lightPalettes[lightPaletteId].colors,
      dark: darkPalettes[darkPaletteId].colors,
    }),
    [lightPaletteId, darkPaletteId, scheme],
  );

  const value = useMemo(
    () => ({
      colors,
      theme: { colors },
      scheme,
      palette,
      colorMode,
      setPaletteId,
      setColorMode,
      lightPaletteId,
      setLightPaletteId,
      darkPaletteId,
      setDarkPaletteId,
      themeVariantId,
      themeVariant,
      setThemeVariantId,
      isKampfireTheme,
    }),
    [
      colors,
      scheme,
      palette,
      colorMode,
      setPaletteId,
      setColorMode,
      lightPaletteId,
      setLightPaletteId,
      darkPaletteId,
      setDarkPaletteId,
      themeVariantId,
      themeVariant,
      setThemeVariantId,
      isKampfireTheme,
    ],
  );

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeProvider;
