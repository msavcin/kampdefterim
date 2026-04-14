import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type ThemeColors,
  type ThemePalette,
  palettes,
  defaultPaletteId,
} from '../constants/theme/colors';

// ─── Geriye dönük uyumluluk için eski themes nesnesi ───
// Yeni kodlarda doğrudan useTheme().colors kullanılmalı
export const themes = {
  light: { colors: palettes[defaultPaletteId].light },
  dark: { colors: palettes[defaultPaletteId].dark },
};

// ─── Kategori ikon/renk haritası (merkezi kontrol) ───
export type CatSeverity = 'good' | 'warning' | 'danger' | 'info';

export const defaultCategoryMap: Record<string, { icon: string; severity: CatSeverity }> = {
  'hava durumu': { icon: 'CloudSun', severity: 'info' },
  'hava': { icon: 'CloudSun', severity: 'info' },
  'sıcaklık': { icon: 'Thermometer', severity: 'info' },
  'weather': { icon: 'CloudSun', severity: 'info' },
  'rüzgar': { icon: 'Wind', severity: 'warning' },
  'yağış': { icon: 'CloudRain', severity: 'warning' },
  'yağmur': { icon: 'CloudRain', severity: 'warning' },
  'güvenlik': { icon: 'ShieldCheck', severity: 'danger' },
  'uyarı': { icon: 'AlertTriangle', severity: 'danger' },
  'dikkat': { icon: 'AlertTriangle', severity: 'danger' },
  'duyuru': { icon: 'Megaphone', severity: 'warning' },
  'ekipman': { icon: 'Backpack', severity: 'info' },
  'malzeme': { icon: 'Package', severity: 'info' },
  'kamp alanı': { icon: 'campground', severity: 'good' },
  'kamp': { icon: 'campground', severity: 'good' },
  'konum': { icon: 'MapPin', severity: 'good' },
  'lokasyon': { icon: 'MapPin', severity: 'good' },
  'mesafe': { icon: 'Route', severity: 'info' },
  'yorum': { icon: 'MessageSquare', severity: 'info' },
  'ulaşım': { icon: 'Route', severity: 'info' },
  'yol': { icon: 'Route', severity: 'info' },
  'genel': { icon: 'ClipboardList', severity: 'info' },
  'özet': { icon: 'BarChart3', severity: 'good' },
  'sonuç': { icon: 'CheckCircle2', severity: 'good' },
  'öneri': { icon: 'Lightbulb', severity: 'info' },
  'not': { icon: 'StickyNote', severity: 'info' },
  'puan': { icon: 'Star', severity: 'good' },
  'skor': { icon: 'Star', severity: 'good' },
  'değerlendirme': { icon: 'Sparkles', severity: 'good' },
  'yakın': { icon: 'Compass', severity: 'info' },
  'alternatif': { icon: 'ArrowRightLeft', severity: 'info' },
  'alternatif kamp': { icon: 'MapPin', severity: 'info' },
};

export const DEFAULT_CATEGORY_ACCENTS: Record<CatSeverity, { accentLight: string; accentDark: string; bgLight: string; borderLight: string; iconBgLight: string }> = {
  good:    { accentLight: '#059669', accentDark: '#4ADE80', bgLight: '#F0FDF4', borderLight: '#BBF7D0', iconBgLight: '#D1FAE5' },
  warning: { accentLight: '#D97706', accentDark: '#FBBF24', bgLight: '#FFFBEB', borderLight: '#FDE68A', iconBgLight: '#FEF3C7' },
  danger:  { accentLight: '#EF4444', accentDark: '#FB7185', bgLight: '#FEF2F2', borderLight: '#FECACA', iconBgLight: '#FEE2E2' },
  info:    { accentLight: '#3B82F6', accentDark: '#60A5FA', bgLight: '#EFF6FF', borderLight: '#BFDBFE', iconBgLight: '#DBEAFE' },
};

// ─── Mod türleri ───
export type ColorMode = 'light' | 'dark' | 'system';

const STORAGE_KEY_PALETTE = '@theme_palette_id';
const STORAGE_KEY_MODE = '@theme_color_mode';

type ThemeContextType = {
  /** Aktif renk seti */
  colors: ThemeColors;
  /** Geriye dönük uyumluluk: { colors } objesi */
  theme: { colors: ThemeColors };
  /** Aktif şema: 'light' | 'dark' */
  scheme: 'light' | 'dark';
  /** Aktif palet objesi */
  palette: ThemePalette;
  /** Kullanıcının seçtiği mod: 'light' | 'dark' | 'system' */
  colorMode: ColorMode;
  /** Palet değiştir */
  setPaletteId: (id: string) => void;
  /** Mod değiştir (light/dark/system) */
  setColorMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  colors: palettes[defaultPaletteId].light,
  theme: { colors: palettes[defaultPaletteId].light },
  scheme: 'light',
  palette: palettes[defaultPaletteId],
  colorMode: 'system',
  setPaletteId: () => {},
  setColorMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // useColorScheme may not always trigger in every environment reliably,
  // so keep a local state and also subscribe to Appearance changes to
  // ensure the app reacts when the OS theme toggles.
  const rawSystemScheme = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(rawSystemScheme === 'dark' ? 'dark' : 'light');

  // Keep state in-sync with the hook value
  useEffect(() => {
    if (rawSystemScheme) setSystemScheme(rawSystemScheme === 'dark' ? 'dark' : 'light');
  }, [rawSystemScheme]);

  // Also attach a low-level Appearance listener for extra reliability
  useEffect(() => {
    const sub = Appearance.addChangeListener((appearance) => {
      const cs = appearance?.colorScheme === 'dark' ? 'dark' : 'light';
      setSystemScheme(cs);
    });
    return () => {
      try { sub.remove(); } catch { /* ignore on platforms that return unsubscribe fn */ }
    };
  }, []);
  const [paletteId, setPaletteIdState] = useState<string>(defaultPaletteId);
  const [colorMode, setColorModeState] = useState<ColorMode>('system');
  const [loaded, setLoaded] = useState(false);

  // Kaydedilmiş tercihleri yükle
  useEffect(() => {
    (async () => {
      try {
        const [savedPalette, savedMode] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_PALETTE),
          AsyncStorage.getItem(STORAGE_KEY_MODE),
        ]);
        if (savedPalette && palettes[savedPalette]) {
          setPaletteIdState(savedPalette);
        }
        if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
          setColorModeState(savedMode as ColorMode);
        }
      } catch (e) {
        // Sessiz hata — varsayılanlar kullanılır
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setPaletteId = useCallback((id: string) => {
    if (palettes[id]) {
      setPaletteIdState(id);
      AsyncStorage.setItem(STORAGE_KEY_PALETTE, id).catch(() => {});
    }
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY_MODE, mode).catch(() => {});
  }, []);

  // Aktif şema hesapla
  const scheme: 'light' | 'dark' = colorMode === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : colorMode;

  const palette = palettes[paletteId] || palettes[defaultPaletteId];
  const colors = scheme === 'dark' ? palette.dark : palette.light;

  const value = useMemo<ThemeContextType>(() => ({
    colors,
    theme: { colors },
    scheme,
    palette,
    colorMode,
    setPaletteId,
    setColorMode,
  }), [colors, scheme, palette, colorMode, setPaletteId, setColorMode]);

  // Tercihler yüklenene kadar boş render verme
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </SafeAreaView>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeProvider;
