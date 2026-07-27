import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useColorScheme, Appearance, StatusBar as RNStatusBar, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { eventBus } from '../lib/eventBus';
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
const STORAGE_KEY_KAMPFIRE_AUTO_APPLIED = '@theme_kampfire_auto_applied';
const STORAGE_KEY_VARIANT_MANUAL = '@theme_variant_manual';
const CLASSIC_NON_PREMIUM_LIGHT: LightPaletteId = 'L2';
const CLASSIC_NON_PREMIUM_DARK: DarkPaletteId = 'D2';
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
  /** Açık tema rengi L1|L2|L3|L4 */
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
  isPremium: boolean;
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
  isPremium: false,
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
    L4_D4: { light: 'L4', dark: 'D4' },
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

  // Abonelik durum değişikliklerini dinle (ör: backend'den güncelleme geldiğinde)
  useEffect(() => {
    const handler = (subStatus: any) => {
      try {
        const prem = !!(subStatus?.offlineEnabled || subStatus?.isActive || subStatus?.is_premium || subStatus?.isPremium);
        setIsPremiumState(prem);
        AsyncStorage.setItem('@cached_is_premium', prem ? '1' : '0').catch(() => {});
        if (!prem) {
          // Premium olmayan kullanıcıyı klasik arayüze ve klasik default L2/D2 paletine zorla
          setThemeVariantIdState(defaultThemeVariantId);
          setLightPaletteIdState(CLASSIC_NON_PREMIUM_LIGHT);
          setDarkPaletteIdState(CLASSIC_NON_PREMIUM_DARK);
          AsyncStorage.multiSet([
            [STORAGE_KEY_VARIANT, defaultThemeVariantId],
            [STORAGE_KEY_LIGHT, CLASSIC_NON_PREMIUM_LIGHT],
            [STORAGE_KEY_DARK, CLASSIC_NON_PREMIUM_DARK],
          ]).catch(() => {});
          AsyncStorage.removeItem(STORAGE_KEY_KAMPFIRE_AUTO_APPLIED).catch(() => {});
          return;
        }

        // İlk kurulum / ilk premium login: kullanıcı daha önce tema seçmediyse Kampfire'a otomatik geç.
        Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_VARIANT_MANUAL),
        ]).then(([manualVariant]) => {
          if (manualVariant === '1') return;
          setThemeVariantIdState('kampfireGold');
          setLightPaletteIdState('L4');
          setDarkPaletteIdState('D4');
          AsyncStorage.multiSet([
            [STORAGE_KEY_VARIANT, 'kampfireGold'],
            [STORAGE_KEY_LIGHT, 'L4'],
            [STORAGE_KEY_DARK, 'D4'],
            [STORAGE_KEY_KAMPFIRE_AUTO_APPLIED, '1'],
          ]).catch(() => {});
        }).catch(() => {});
      } catch (e) {
        /* ignore */
      }
    };
    eventBus.on('subscription:statusUpdated', handler);
    return () => eventBus.off('subscription:statusUpdated', handler);
  }, []);

  const [lightPaletteId, setLightPaletteIdState] =
    useState<LightPaletteId>(defaultLightPaletteId);
  const [darkPaletteId, setDarkPaletteIdState] =
    useState<DarkPaletteId>(defaultDarkPaletteId);
  const [themeVariantId, setThemeVariantIdState] =
    useState<ThemeVariantId>(defaultThemeVariantId);
  const [isPremium, setIsPremiumState] = useState<boolean>(false);
  const [colorMode, setColorModeState] = useState<ColorMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [
          savedMode,
          savedLight,
          savedDark,
          savedVariant,
          savedLegacy,
          savedCachedPremium,
          savedManualVariant,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_MODE),
          AsyncStorage.getItem(STORAGE_KEY_LIGHT),
          AsyncStorage.getItem(STORAGE_KEY_DARK),
          AsyncStorage.getItem(STORAGE_KEY_VARIANT),
          AsyncStorage.getItem(STORAGE_KEY_PALETTE_LEGACY),
          AsyncStorage.getItem('@cached_is_premium'),
          AsyncStorage.getItem(STORAGE_KEY_VARIANT_MANUAL),
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
        let resolvedPremium = savedCachedPremium === '1';
        // Eğer önbelleğe alınmış premium bilgisi varsa, uygula
        if (savedCachedPremium) {
          resolvedPremium = savedCachedPremium === '1';
          setIsPremiumState(resolvedPremium);
        } else {
          // Eğer AsyncStorage'da yoksa, SecureStore'daki localUser'dan dene
          try {
            const localUserRaw = await SecureStore.getItemAsync('localUser');
            if (localUserRaw) {
              const parsed = JSON.parse(localUserRaw);
              const localPrem = !!(parsed?.is_premium || parsed?.isPremium || parsed?.offline_enabled);
              resolvedPremium = localPrem;
              if (localPrem) {
                setIsPremiumState(true);
                AsyncStorage.setItem('@cached_is_premium', '1').catch(() => {});
              }
            }
          } catch {
            /* ignore */
          }
        }

        // Non-premium + klasik ilk açılış default paletleri: L2 / D2.
        // Kullanıcının daha önce manuel kaydettiği L1/L3/D1/D3 seçimleri varsa korunur;
        // ancak hiç seçim yoksa eski L3/D3 yerine L2/D2 ile açılır.
        if (!resolvedPremium && !light) {
          setLightPaletteIdState(CLASSIC_NON_PREMIUM_LIGHT);
        }
        if (!resolvedPremium && !dark) {
          setDarkPaletteIdState(CLASSIC_NON_PREMIUM_DARK);
        }

        // Tema varyantı yüklenirken premium kısıtlarını uygula
        if (savedVariant && isThemeVariantId(savedVariant)) {
          if (savedVariant === 'kampfireGold' && !resolvedPremium) {
            // Non-premium kullanıcı için Kampfire önbellekliyse zorla klasik + L2/D2'ye çek
            setThemeVariantIdState(defaultThemeVariantId);
            setLightPaletteIdState(CLASSIC_NON_PREMIUM_LIGHT);
            setDarkPaletteIdState(CLASSIC_NON_PREMIUM_DARK);
            AsyncStorage.multiSet([
              [STORAGE_KEY_VARIANT, defaultThemeVariantId],
              [STORAGE_KEY_LIGHT, CLASSIC_NON_PREMIUM_LIGHT],
              [STORAGE_KEY_DARK, CLASSIC_NON_PREMIUM_DARK],
            ]).catch(() => {});
          } else if (resolvedPremium && savedManualVariant !== '1') {
            // İlk kurulum / ilk premium login: manuel tercih yoksa Kampfire'a otomatik geç.
            setThemeVariantIdState('kampfireGold');
            setLightPaletteIdState('L4');
            setDarkPaletteIdState('D4');
            AsyncStorage.multiSet([
              [STORAGE_KEY_VARIANT, 'kampfireGold'],
              [STORAGE_KEY_LIGHT, 'L4'],
              [STORAGE_KEY_DARK, 'D4'],
              [STORAGE_KEY_KAMPFIRE_AUTO_APPLIED, '1'],
            ]).catch(() => {});
          } else {
            setThemeVariantIdState(savedVariant);
          }
        } else if (resolvedPremium) {
          // İlk kurulum / ilk premium login cache'i: tema seçimi yoksa otomatik Kampfire.
          setThemeVariantIdState('kampfireGold');
          setLightPaletteIdState('L4');
          setDarkPaletteIdState('D4');
          AsyncStorage.multiSet([
            [STORAGE_KEY_VARIANT, 'kampfireGold'],
            [STORAGE_KEY_LIGHT, 'L4'],
            [STORAGE_KEY_DARK, 'D4'],
            [STORAGE_KEY_KAMPFIRE_AUTO_APPLIED, '1'],
          ]).catch(() => {});
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
    // Non-premium kullanıcıların Kampfire Gold'u seçmesine izin verme
    if (id === 'kampfireGold' && !isPremium) {
      setThemeVariantIdState(defaultThemeVariantId);
      setLightPaletteIdState(CLASSIC_NON_PREMIUM_LIGHT);
      setDarkPaletteIdState(CLASSIC_NON_PREMIUM_DARK);
      AsyncStorage.multiSet([
        [STORAGE_KEY_VARIANT, defaultThemeVariantId],
        [STORAGE_KEY_LIGHT, CLASSIC_NON_PREMIUM_LIGHT],
        [STORAGE_KEY_DARK, CLASSIC_NON_PREMIUM_DARK],
      ]).catch(() => {});
      return;
    }
    setThemeVariantIdState(id);
    AsyncStorage.setItem(STORAGE_KEY_VARIANT, id).catch(() => {});
    AsyncStorage.setItem(STORAGE_KEY_VARIANT_MANUAL, '1').catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_KAMPFIRE_AUTO_APPLIED).catch(() => {});
  }, [isPremium]);

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

  useEffect(() => {
    if (themeVariantId !== 'kampfireGold') return;
    if (lightPaletteId !== 'L4') {
      setLightPaletteIdState('L4');
      AsyncStorage.setItem(STORAGE_KEY_LIGHT, 'L4').catch(() => {});
    }
    if (darkPaletteId !== 'D4') {
      setDarkPaletteIdState('D4');
      AsyncStorage.setItem(STORAGE_KEY_DARK, 'D4').catch(() => {});
    }
  }, [themeVariantId, lightPaletteId, darkPaletteId]);

  useEffect(() => {
    if (isPremium || themeVariantId !== defaultThemeVariantId) return;
    let changed = false;
    const updates: [string, string][] = [];
    if (lightPaletteId === 'L4') {
      setLightPaletteIdState(CLASSIC_NON_PREMIUM_LIGHT);
      updates.push([STORAGE_KEY_LIGHT, CLASSIC_NON_PREMIUM_LIGHT]);
      changed = true;
    }
    if (darkPaletteId === 'D4') {
      setDarkPaletteIdState(CLASSIC_NON_PREMIUM_DARK);
      updates.push([STORAGE_KEY_DARK, CLASSIC_NON_PREMIUM_DARK]);
      changed = true;
    }
    if (changed) {
      AsyncStorage.multiSet(updates).catch(() => {});
    }
  }, [isPremium, themeVariantId, lightPaletteId, darkPaletteId]);

  const colors: ThemeColors =
    scheme === 'dark'
      ? darkPalettes[darkPaletteId].colors
      : lightPalettes[lightPaletteId].colors;

  const themeVariant = themeVariants[themeVariantId] || themeVariants[defaultThemeVariantId];
  const isKampfireTheme = themeVariantId === 'kampfireGold';

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
      isPremium,
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
      isPremium,
    ],
  );

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {Platform.OS === 'android' && (
        <RNStatusBar
          backgroundColor={colors.surface}
          barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
          translucent={false}
        />
      )}
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeProvider;
