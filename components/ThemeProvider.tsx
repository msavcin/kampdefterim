import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
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
  const systemScheme = useColorScheme();
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
