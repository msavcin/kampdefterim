/**
 * Leaflet popup + map chrome colors from active ThemeColors.
 * Use inside generateMapHTML() so popup tracks L1–L3 / D1–D3 + light/dark.
 *
 *   const { colors, scheme } = useTheme();
 *   const popup = buildMapPopupTheme(colors, scheme === 'dark');
 *   // then inject popup.* into HTML/CSS template
 */

import type { ThemeColors } from '../constants/theme/colors';

export type MapPopupTheme = {
  isDark: boolean;
  /** Page / map chrome */
  pageBg: string;
  surface: string;
  surfaceVariant: string;
  border: string;
  text: string;
  textSecondary: string;
  muted: string;
  primary: string;
  primaryLight: string;
  primaryOn: string;
  accent: string;
  danger: string;
  info: string;
  /** Favorite heart */
  favoriteBg: string;
  favoriteBgActive: string;
  favoriteBorder: string;
  /** Zoom control */
  zoomBg: string;
  zoomFg: string;
  zoomBorder: string;
  /** Attribution */
  attrBg: string;
  attrFg: string;
  attrLink: string;
  /** Amenity chips */
  amenityBg: string;
  /** Placeholder image area */
  imagePlaceholderBg: string;
  imagePlaceholderFg: string;
  /** User-submitted badge */
  userSubmitted: string;
  /** Menus (Google/Yandex) */
  menuBg: string;
  menuBorder: string;
  menuShadow: string;
  /** CSS block for <style> */
  css: string;
};

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return 0.5;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Text color on primary buttons (handles D1 invert CTA) */
export function getPrimaryOnColor(colors: ThemeColors): string {
  return hexLuminance(colors.primary) > 0.62 ? colors.background : '#FFFFFF';
}

export function buildMapPopupTheme(
  colors: ThemeColors,
  isDark: boolean,
): MapPopupTheme {
  const primaryOn = getPrimaryOnColor(colors);

  const t: Omit<MapPopupTheme, 'css'> = {
    isDark,
    pageBg: isDark ? colors.background : '#FFFFFF',
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    border: colors.border,
    text: colors.text,
    textSecondary: colors.textSecondary,
    muted: colors.muted,
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryOn,
    accent: colors.accent,
    danger: colors.danger,
    info: colors.info,
    favoriteBg: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(254,242,242,0.95)',
    favoriteBgActive: colors.danger,
    favoriteBorder: colors.danger,
    zoomBg: colors.surface,
    zoomFg: colors.text,
    zoomBorder: colors.border,
    attrBg: isDark ? `${colors.surface}cc` : 'rgba(255,255,255,0.85)',
    attrFg: colors.muted,
    attrLink: colors.info,
    amenityBg: colors.surfaceVariant,
    imagePlaceholderBg: colors.surfaceVariant,
    imagePlaceholderFg: isDark ? colors.text : '#444444',
    userSubmitted: isDark ? colors.accent : colors.accent,
    menuBg: colors.surface,
    menuBorder: colors.border,
    menuShadow: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)',
  };

  const css = `
          body { margin: 0; padding: 0; background: ${t.pageBg}; }
          #map { height: 100vh; width: 100vw; }
          .custom-popup {
            font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          }
          .popup-title {
            font-weight: 600;
            color: ${t.primary};
            margin-bottom: 8px;
          }
          .popup-type {
            background: ${t.primaryLight};
            color: ${t.primary};
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            display: inline-block;
          }
          .location-picker-cursor {
            cursor: crosshair !important;
          }
          .leaflet-popup-content-wrapper {
            background: ${t.surface};
            color: ${t.text};
            border-radius: 12px;
            box-shadow: 0 8px 28px rgba(0,0,0,${isDark ? '0.45' : '0.12'});
          }
          .leaflet-popup-tip {
            background: ${t.surface};
          }
          .leaflet-control-zoom a {
            background: ${t.zoomBg} !important;
            color: ${t.zoomFg} !important;
            border-color: ${t.zoomBorder} !important;
          }
          .leaflet-control-attribution {
            background: ${t.attrBg} !important;
            color: ${t.attrFg} !important;
          }
          .leaflet-control-attribution a {
            color: ${t.attrLink} !important;
          }
          .popup-distance {
            font-size: 12px;
            color: ${t.muted};
          }
          .popup-user-submitted {
            font-size: 12px;
            color: ${t.userSubmitted};
          }
          .popup-detail-label {
            font-size: 13px;
            color: ${t.text};
            margin-left: 5px;
          }
          .popup-menu {
            background: ${t.menuBg};
            border: 1px solid ${t.menuBorder};
            border-radius: 8px;
            box-shadow: 0 2px 8px ${t.menuShadow};
          }
          .popup-menu-item-text {
            font-size: 13px;
            color: ${t.text};
          }
          .popup-primary-btn {
            width: 100%;
            padding: 8px 10px;
            background: ${t.primary};
            color: ${t.primaryOn};
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            font-weight: 600;
          }
          .popup-amenity {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 6px;
            background: ${t.amenityBg};
            margin-right: 2px;
            font-size: 16px;
          }
  `.trim();

  return { ...t, css };
}

/**
 * Inline style helpers for markup that is not class-based
 * (keeps existing HTML structure; only color strings change).
 */
export function popupInlineStyles(t: MapPopupTheme) {
  return {
    imageBoxBg: t.imagePlaceholderBg,
    imagePlaceholderFg: t.imagePlaceholderFg,
    favoriteBtn: (isFavorite: boolean) =>
      `font-size:0;color:${t.danger};width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${
        isFavorite ? t.favoriteBgActive : t.favoriteBg
      };border:1px solid ${t.favoriteBorder};transition:background 0.2s;cursor:pointer;`,
    userSubmitted: `font-size:12px;color:${t.userSubmitted};`,
    distance: `font-size:12px;color:${t.muted};`,
    amenityChip: `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:${t.amenityBg};margin-right:2px;font-size:16px;`,
    detailRow: `font-size:0;color:${t.primary};flex:1;display:flex;align-items:center;justify-content:flex-start;cursor:pointer;`,
    detailStroke: t.muted,
    detailLabel: `font-size:13px;color:${t.text};margin-left:5px;`,
    mapMenu: `display:none;position:absolute;top:55px;left:-85px;background:${t.menuBg};border:1px solid ${t.menuBorder};border-radius:8px;box-shadow:0 2px 8px ${t.menuShadow};padding:6px 0;min-width:120px;z-index:999;`,
    menuItemText: `font-size:13px;color:${t.text};`,
    selectForPlanBtn: `width:100%;padding:8px 10px;background:${t.primary};color:${t.primaryOn};border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;`,
    addHereBtn: `margin-top:8px;padding:6px 12px;background:${t.primary};color:${t.primaryOn};border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;`,
  };
}

export default buildMapPopupTheme;
