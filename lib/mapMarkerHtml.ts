/**
 * Leaflet divIcon HTML — minimal pin shell
 * Keeps existing app icons from getSVGIcon(); only changes chrome.
 *
 * Shape (matches design markers set):
 *   rounded square body (rx≈10) + bottom tip + optional rating badge
 *
 * Usage in app/(tabs)/index.tsx generateMapHTML:
 *   import { buildCampingMarkerHtml, buildUserLocationHtml } from '@/lib/mapMarkerHtml';
 *
 *   icon: L.divIcon({
 *     className: 'camping-marker',
 *     html: buildCampingMarkerHtml({
 *       color: marker.markerColor,
 *       iconSvg: marker.markerIcon,
 *       rating: marker.rating,
 *       isDark,
 *     }),
 *     iconSize: [36, 46],
 *     iconAnchor: [18, 46], // tip bottom-center
 *   })
 */

export type BuildCampingMarkerHtmlOptions = {
  /** Pin fill color (existing getMarkerColor / getCampingAreaBgColor) */
  color: string;
  /** Raw SVG string from getSVGIcon(...) — not changed */
  iconSvg: string;
  /** 0 or missing → no badge */
  rating?: number | null;
  isDark?: boolean;
  /** Icon box size inside pin body (default 18) */
  iconSize?: number;
};

/**
 * Ensure embedded SVG fits the pin body.
 * Does not alter paths — only width/height/style if missing.
 */
function normalizeIconSvg(svg: string, size: number): string {
  if (!svg || typeof svg !== 'string') return '';
  let out = svg.trim();
  // Force display size
  if (/width="[^"]*"/.test(out)) {
    out = out.replace(/width="[^"]*"/, `width="${size}"`);
  } else {
    out = out.replace(/<svg\b/, `<svg width="${size}"`);
  }
  if (/height="[^"]*"/.test(out)) {
    out = out.replace(/height="[^"]*"/, `height="${size}"`);
  } else {
    out = out.replace(/<svg\b/, `<svg height="${size}"`);
  }
  // Prevent layout blowout
  if (!/style=/.test(out)) {
    out = out.replace(
      /<svg\b/,
      `<svg style="display:block;width:${size}px;height:${size}px;"`,
    );
  }
  return out;
}

/**
 * Build full marker HTML (pin + tip + rating).
 * Escaping: color/rating are numeric/hex from our code; iconSvg is trusted app asset.
 */
export function buildCampingMarkerHtml(
  opts: BuildCampingMarkerHtmlOptions,
): string {
  const color = (opts.color || '#64748b').replace(/"/g, '');
  const iconSize = opts.iconSize ?? 18;
  const icon = normalizeIconSvg(opts.iconSvg || '', iconSize);
  const rating =
    opts.rating != null && !Number.isNaN(Number(opts.rating)) && Number(opts.rating) > 0
      ? Number(opts.rating).toFixed(1)
      : null;
  const isDark = !!opts.isDark;

  const badgeBg = isDark ? 'rgba(20,20,20,0.92)' : 'rgba(255,255,255,0.95)';
  const badgeFg = isDark ? '#F5F5F4' : '#1A1F26';
  const badgeBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)';
  const perfect = rating === '5.0';
  const badgeAccentBorder = perfect
    ? isDark
      ? 'rgba(245,245,244,0.55)'
      : 'rgba(44,42,38,0.35)'
    : badgeBorder;
  const badgeAccentFg = perfect ? (isDark ? '#F5F5F4' : '#2C2A26') : badgeFg;

  const ratingHtml = rating
    ? `<div style="position:absolute;top:-4px;right:-8px;z-index:2;background:${badgeBg};color:${badgeAccentFg};font-size:9px;font-weight:700;font-family:Roboto,-apple-system,system-ui,sans-serif;padding:2px 5px;border-radius:6px;border:1px solid ${badgeAccentBorder};line-height:1.15;box-shadow:0 2px 6px rgba(0,0,0,0.2);">${rating}</div>`
    : '';

  // Tip uses same fill as body (CSS border triangle)
  return (
    `<div style="position:relative;width:36px;height:46px;display:flex;flex-direction:column;align-items:center;">` +
    ratingHtml +
    `<div style="width:32px;height:32px;border-radius:10px;background:${color};display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 12px rgba(0,0,0,0.28);position:relative;z-index:1;">` +
    `<div style="width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;overflow:hidden;">${icon}</div>` +
    `</div>` +
    // bottom pointer
    `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${color};margin-top:-1px;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.15));"></div>` +
    `</div>`
  );
}

/** User GPS location pulse (theme sky color) */
export function buildUserLocationHtml(skyColor = '#3B82F6'): string {
  const c = skyColor.replace(/"/g, '');
  return (
    `<div style="position:relative;width:28px;height:28px;">` +
    `<div style="position:absolute;inset:0;border-radius:50%;background:${c}33;"></div>` +
    `<div style="position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:${c};border:2.5px solid #fff;box-shadow:0 0 0 5px ${c}2A;"></div>` +
    `</div>`
  );
}

export const CAMPING_MARKER_ICON_SIZE: [number, number] = [36, 46];
export const CAMPING_MARKER_ICON_ANCHOR: [number, number] = [18, 46];

export default buildCampingMarkerHtml;
