/**
 * Leaflet popup + map chrome colors from active ThemeColors.
 * Use inside generateMapHTML() so popup tracks palette + visual variant.
 */

import type { ThemeColors } from '../constants/theme/colors';
import type { ThemeVariantId } from '../constants/theme/variants';

export type MapPopupTheme = {
  variant: ThemeVariantId;
  isDark: boolean;
  isKampfire: boolean;
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
  variant: ThemeVariantId = 'classic',
): MapPopupTheme {
  const isKampfire = variant === 'kampfireGold';
  const classicPrimaryOn = getPrimaryOnColor(colors);

  const primary = isKampfire ? colors.accent || colors.primary : colors.primary;
  const primaryLight = isKampfire
    ? isDark
      ? 'rgba(212,175,106,0.12)'
      : '#F5E9D4'
    : colors.primaryLight;
  const primaryOn = isKampfire
    ? isDark
      ? '#1A1208'
      : '#33291B'
    : classicPrimaryOn;
  const accent = isKampfire
    ? isDark
      ? '#E8C97A'
      : '#8B6A2F'
    : colors.accent;
  const surface = isKampfire ? colors.surface : colors.surface;
  const surfaceVariant = isKampfire ? colors.surfaceVariant : colors.surfaceVariant;
  const border = isKampfire
    ? isDark
      ? 'rgba(212,175,106,0.14)'
      : '#E7DBC7'
    : colors.border;
  const text = isKampfire ? colors.text : colors.text;
  const textSecondary = isKampfire ? colors.textSecondary : colors.textSecondary;
  const muted = isKampfire ? colors.muted : colors.muted;
  const pageBg = isKampfire ? colors.background : isDark ? colors.background : '#FFFFFF';

  const t: Omit<MapPopupTheme, 'css'> = {
    variant,
    isDark,
    isKampfire,
    pageBg,
    surface,
    surfaceVariant,
    border,
    text,
    textSecondary,
    muted,
    primary,
    primaryLight,
    primaryOn,
    accent,
    danger: colors.danger,
    info: colors.info,
    favoriteBg: isKampfire
      ? isDark
        ? 'rgba(10,14,12,0.82)'
        : 'rgba(255,253,249,0.92)'
      : isDark
        ? 'rgba(0,0,0,0.45)'
        : 'rgba(254,242,242,0.95)',
    favoriteBgActive: colors.danger,
    favoriteBorder: isKampfire ? 'rgba(212,175,106,0.18)' : colors.danger,
    zoomBg: isKampfire
      ? isDark
        ? 'rgba(14,18,16,0.92)'
        : 'rgba(255,253,249,0.96)'
      : surface,
    zoomFg: isKampfire ? primary : text,
    zoomBorder: border,
    attrBg: isKampfire
      ? isDark
        ? 'rgba(10,14,12,0.78)'
        : 'rgba(255,253,249,0.92)'
      : isDark
        ? `${surface}cc`
        : 'rgba(255,255,255,0.85)',
    attrFg: isKampfire ? muted : muted,
    attrLink: isKampfire ? primary : colors.info,
    amenityBg: isKampfire
      ? isDark
        ? 'rgba(212,175,106,0.08)'
        : '#F5E9D4'
      : surfaceVariant,
    imagePlaceholderBg: isKampfire
      ? isDark
        ? '#141A16'
        : '#F2E8D9'
      : surfaceVariant,
    imagePlaceholderFg: isKampfire
      ? isDark
        ? '#A89F8E'
        : '#8B6A2F'
      : isDark
        ? text
        : '#444444',
    userSubmitted: isKampfire ? accent : colors.accent,
    menuBg: isKampfire
      ? isDark
        ? '#0E1210'
        : '#FFFDF9'
      : surface,
    menuBorder: border,
    menuShadow: isKampfire
      ? isDark
        ? 'rgba(0,0,0,0.45)'
        : 'rgba(139,106,47,0.12)'
      : isDark
        ? 'rgba(0,0,0,0.4)'
        : 'rgba(0,0,0,0.12)',
  };

  const css = `
          body {
            margin: 0;
            padding: 0;
            background: ${t.pageBg};
          }
          #map {
            height: 100vh;
            width: 100vw;
            background:
              ${t.isKampfire
                ? isDark
                  ? `radial-gradient(ellipse 65% 45% at 78% 18%, rgba(212,175,106,0.12) 0%, transparent 50%),
                     radial-gradient(ellipse 80% 50% at 30% 60%, rgba(26,58,40,0.55) 0%, transparent 55%),
                     linear-gradient(165deg, #0c1410 0%, #0a100c 44%, #080c0a 100%)`
                  : `radial-gradient(ellipse 65% 45% at 78% 18%, rgba(212,175,106,0.16) 0%, transparent 48%),
                     radial-gradient(ellipse 82% 52% at 30% 62%, rgba(212,175,106,0.10) 0%, transparent 54%),
                     linear-gradient(165deg, #fbf7f0 0%, #f7efdf 44%, #f2e8d9 100%)`
                : t.pageBg};
          }
          .leaflet-container {
            background: ${t.isKampfire ? (isDark ? '#0A0E0C' : '#FBF7F0') : t.pageBg};
          }
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
            border: 1px solid ${t.isKampfire ? 'rgba(212,175,106,0.18)' : t.border};
            font-size: 12px;
            display: inline-block;
          }
          .location-picker-cursor {
            cursor: crosshair !important;
          }
          .leaflet-popup {
            max-width: calc(100vw - 32px) !important;
          }
          .leaflet-popup-content-wrapper {
            background: ${t.surface};
            color: ${t.text};
            border-radius: ${t.isKampfire ? '16px' : '12px'};
            border: 1px solid ${t.border};
            box-shadow: 0 12px 36px ${t.isKampfire ? (isDark ? 'rgba(0,0,0,0.5)' : 'rgba(139,106,47,0.14)') : isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.12)'};
            max-width: calc(100vw - 40px) !important;
            overflow: hidden;
          }
          .leaflet-popup-content {
            margin: ${t.isKampfire ? '10px 12px' : '13px 12px'};
            width: auto !important;
            max-width: calc(100vw - 64px) !important;
            overflow: hidden;
            box-sizing: border-box;
          }
          .leaflet-popup-tip {
            background: ${t.surface};
            border: 1px solid ${t.border};
          }
          .leaflet-control-zoom a {
            background: ${t.zoomBg} !important;
            color: ${t.zoomFg} !important;
            border-color: ${t.zoomBorder} !important;
            box-shadow: ${t.isKampfire ? '0 0 0 1px rgba(0,0,0,0.18), 0 0 14px rgba(212,175,106,0.12)' : 'none'};
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
          .camping-marker.kampfire-selected {
            z-index: 999 !important;
          }
          .camping-marker.kampfire-selected .kampfire-marker-glow {
            transform: scale(1.22);
            filter: drop-shadow(0 0 16px ${isDark ? 'rgba(212,175,106,0.72)' : 'rgba(212,175,106,0.42)'});
          }
          .camping-marker.kampfire-selected .kampfire-marker-core {
            box-shadow: 0 0 24px ${isDark ? 'rgba(212,175,106,0.78)' : 'rgba(212,175,106,0.44)'}, inset 0 1px 0 rgba(255,255,255,0.35);
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
    popupCard: `display:flex;flex-direction:row;gap:0;width:min(320px, calc(100vw - 64px));min-width:0;max-width:calc(100vw - 64px);box-sizing:border-box;align-items:stretch;background:${t.surface};border:1px solid ${t.border};border-radius:16px;overflow:hidden;`,
    favoriteBtn: (isFavorite: boolean) =>
      `font-size:0;color:${t.danger};width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${
        isFavorite ? t.favoriteBgActive : t.favoriteBg
      };border:1px solid ${t.favoriteBorder};transition:background 0.2s;cursor:pointer;`,
    userSubmitted: `font-size:12px;color:${t.userSubmitted};`,
    distance: `font-size:12px;color:${t.muted};`,
    amenityChip: `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:${t.amenityBg};margin-right:2px;font-size:16px;`,
    detailRow: `font-size:0;color:${t.primary};flex:1;display:flex;align-items:center;justify-content:flex-start;cursor:pointer;`,
    detailStroke: t.isKampfire ? '#8A7348' : t.muted,
    detailLabel: `font-size:13px;color:${t.text};margin-left:5px;`,
    mapMenu: `display:none;position:absolute;top:55px;left:-85px;background:${t.menuBg};border:1px solid ${t.menuBorder};border-radius:8px;box-shadow:0 2px 8px ${t.menuShadow};padding:6px 0;min-width:120px;z-index:999;`,
    menuItemText: `font-size:13px;color:${t.text};`,
    selectForPlanBtn: `width:100%;padding:8px 10px;background:${t.primary};color:${t.primaryOn};border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;`,
    addHereBtn: `margin-top:8px;padding:6px 12px;background:${t.primary};color:${t.primaryOn};border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;`,
  };
}

export default buildMapPopupTheme;
