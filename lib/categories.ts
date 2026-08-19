import { useEffect, useMemo, useState } from 'react';
import { emit, off, on } from './eventBus';
import { getSVGIcon, CAMP_TYPE_ICON_COLORS } from '../app/icons/svgIcons';
import type { SVGStandardizeOptions } from '../app/icons/svgIcons';

export type CampingType = {
  /** Uygulamada kullanılan stabil kod. Örn: campground, caravan_site */
  id: string;
  code: string;
  /** Geriye uyumluluk için label alanı korunur. */
  label: string;
  name: string;
  /** Eski uygulama içi ikon anahtarı; sunucudan SVG gelmezse fallback olarak kullanılır. */
  icon?: string;
  /** Sunucudan gelen ve offline cache'de saklanan SVG XML. */
  svg?: string | null;
  iconSvg?: string | null;
  icon_url?: string | null;
  color?: string;
  sort_order?: number;
  active?: boolean;
  serverId?: number;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export const DEFAULT_CAMPING_TYPES: CampingType[] = [
  { id: 'campground', code: 'campground', label: 'Kamp Alanı', name: 'Kamp Alanı', icon: 'campground', color: '#73768fff', sort_order: 10, active: true },
  { id: 'caravan_site', code: 'caravan_site', label: 'Karavan Alanı', name: 'Karavan Alanı', icon: 'caravan_site', color: '#73768fff', sort_order: 20, active: true },
  { id: 'bungalow', code: 'bungalow', label: 'Bungalov', name: 'Bungalov', icon: 'bungalow', color: '#73768fff', sort_order: 30, active: true },
  { id: 'recreation', code: 'recreation', label: 'Rekreasyon Alanı', name: 'Rekreasyon Alanı', icon: 'recreation', color: '#16a672', sort_order: 40, active: true },
  { id: 'restaurant', code: 'restaurant', label: 'Restoran', name: 'Restoran', icon: 'restaurant', color: '#855facff', sort_order: 50, active: true },
  { id: 'camp_store', code: 'camp_store', label: 'İşletme', name: 'İşletme', icon: 'camp_store', color: '#855facff', sort_order: 60, active: true },
  { id: 'national_park', code: 'national_park', label: 'Milli Park', name: 'Milli Park', icon: 'national_park', color: '#16a672', sort_order: 70, active: true },
  { id: 'hiking_road', code: 'hiking_road', label: 'Yürüyüş Parkuru', name: 'Yürüyüş Parkuru', icon: 'hiking_road', color: '#16a672', sort_order: 80, active: true },
  { id: 'touristic_place', code: 'touristic_place', label: 'Gezilecek Yer', name: 'Gezilecek Yer', icon: 'touristic_place', color: '#7244a0ff', sort_order: 90, active: true },
  { id: 'accommodation', code: 'accommodation', label: 'Konaklama', name: 'Konaklama', icon: 'accommodation', color: '#855facff', sort_order: 100, active: true },
  { id: 'parking', code: 'parking', label: 'Otopark', name: 'Otopark', icon: 'parking', color: '#afaf27ff', sort_order: 110, active: true },
];

let allCampingTypeCatalog: CampingType[] = [...DEFAULT_CAMPING_TYPES];

// Geriye uyumluluk: mevcut ekranlar `campingTypes` sabitini kullanıyordu.
// Dizi referansı korunur, sync geldikçe içeriği güncellenir.
export const campingTypes: CampingType[] = [...DEFAULT_CAMPING_TYPES];

function normalizeCode(value: any): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeCampingType(raw: any): CampingType | null {
  if (!raw) return null;
  const fallbackId = typeof raw.id === 'string' ? raw.id : '';
  const code = normalizeCode(raw.code || raw.slug || fallbackId || raw.name || raw.label);
  if (!code) return null;
  const fallback = DEFAULT_CAMPING_TYPES.find((item) => item.id === code || item.code === code);
  const name = String(raw.name || raw.label || fallback?.name || code).trim();
  const active = raw.active === undefined ? raw.deleted_at ? false : true : !!raw.active;
  return {
    ...fallback,
    id: code,
    code,
    label: name,
    name,
    icon: raw.icon || fallback?.icon || code,
    svg: raw.svg || raw.iconSvg || fallback?.svg || null,
    iconSvg: raw.iconSvg || raw.svg || fallback?.iconSvg || null,
    icon_url: raw.icon_url || raw.iconUrl || null,
    color: raw.color || fallback?.color || '#73768fff',
    sort_order: Number.isFinite(Number(raw.sort_order ?? raw.sortOrder))
      ? Number(raw.sort_order ?? raw.sortOrder)
      : fallback?.sort_order ?? 999,
    active,
    serverId: typeof raw.id === 'number' ? raw.id : raw.serverId,
    updated_at: raw.updated_at || raw.updatedAt || null,
    deleted_at: raw.deleted_at || raw.deletedAt || null,
  };
}

function sortCampingTypes(items: CampingType[]) {
  return [...items].sort((a, b) => {
    const sa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999;
    const sb = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label, 'tr');
  });
}

export function setCampingTypesCatalog(items: any[]) {
  const normalized = (Array.isArray(items) ? items : [])
    .map(normalizeCampingType)
    .filter(Boolean) as CampingType[];

  const nextAll = normalized.length > 0 ? sortCampingTypes(normalized) : [...DEFAULT_CAMPING_TYPES];
  allCampingTypeCatalog = nextAll;

  const nextActive = sortCampingTypes(nextAll.filter((item) => item.active !== false && !item.deleted_at));
  campingTypes.splice(0, campingTypes.length, ...(nextActive.length > 0 ? nextActive : []));

  emit('campingTypes:updated', { campingTypes, allCampingTypes: allCampingTypeCatalog });
  return campingTypes;
}

export function getAllCampingTypes(includeInactive = false): CampingType[] {
  return includeInactive
    ? [...allCampingTypeCatalog]
    : [...allCampingTypeCatalog].filter((item) => item.active !== false && !item.deleted_at);
}

export type CampingTypeId = string;

function findCampingType(id: string) {
  const key = String(id || '');
  return allCampingTypeCatalog.find((t) => t.id === key || t.code === key)
    || DEFAULT_CAMPING_TYPES.find((t) => t.id === key || t.code === key);
}

export function getCampingTypeLabel(id: string) {
  return findCampingType(id)?.label || 'Bilinmeyen';
}

function applySvgOptions(svg: string, options?: SVGStandardizeOptions & { color?: string }) {
  const { color, width = 18, height = 18, fill, stroke } = options || {};
  let out = String(svg || '').trim();
  if (!out.startsWith('<svg')) return out;

  if (/\bwidth=["'][^"']*["']/.test(out)) out = out.replace(/\bwidth=["'][^"']*["']/, `width="${width}"`);
  else out = out.replace(/<svg\b/, `<svg width="${width}"`);

  if (/\bheight=["'][^"']*["']/.test(out)) out = out.replace(/\bheight=["'][^"']*["']/, `height="${height}"`);
  else out = out.replace(/<svg\b/, `<svg height="${height}"`);

  // currentColor değerlerini önce çözümle (HTML string olarak embed edildiğinde çözümlenemez)
  if (color) {
    out = out.replace(/currentColor/g, color);
    out = out.replace(/stroke=["']#000000["']|stroke=["']#000["']|stroke=["']black["']/gi, `stroke="${color}"`);
    out = out.replace(/fill=["']#000000["']|fill=["']#000["']|fill=["']black["']/gi, `fill="${color}"`);
  } else if (stroke || fill) {
    // color yoksa ama stroke/fill varsa, currentColor'ı uygun değerle değiştir
    const replacementColor = stroke || fill || '#fff';
    out = out.replace(/currentColor/g, replacementColor);
  }
  
  if (fill !== undefined) out = out.replace(/fill=["'][^"']*["']/g, `fill="${fill}"`);
  if (stroke !== undefined) out = out.replace(/stroke=["'][^"']*["']/g, `stroke="${stroke}"`);

  return out;
}

export function getCampingTypeIcon(id: string, options?: SVGStandardizeOptions & { color?: string }) {
  const type = findCampingType(id);
  const serverSvg = type?.svg || type?.iconSvg;
  if (serverSvg && serverSvg.trim().startsWith('<svg')) {
    return applySvgOptions(serverSvg, { width: 18, height: 18, ...options });
  }

  const iconKey = type?.icon || id;
  if (!iconKey) return '❓';
  // Varsayılan olarak currentColor kullan - tema moduna uyumlu
  const baseColorOpts = CAMP_TYPE_ICON_COLORS[iconKey] || { fill: 'none', stroke: 'currentColor' };
  let colorOpts = { ...baseColorOpts };
  const { color, ...restOptions } = options || {};
  // Eğer color parametresi geçildiyse, fill ve stroke değerlerini override et (currentColor dahil)
  if (color) {
    if (baseColorOpts.fill && baseColorOpts.fill !== 'none') colorOpts.fill = color;
    if (baseColorOpts.stroke && baseColorOpts.stroke !== 'none') colorOpts.stroke = color;
  }
  return getSVGIcon(iconKey as any, { width: 18, height: 18, ...colorOpts, ...restOptions });
}

export function getCampingAreaBgColor(area: { owner_id?: string | null, visibility?: string, type?: string, tags?: any }) {
  if (!area.owner_id || area.owner_id === '' || area.owner_id === null) {
    const typeId = (area.tags && area.tags.type) || area.type;
    const cat = findCampingType(typeId || '');
    return cat?.color || '#000000ff';
  }
  switch (area.visibility) {
    case 'public':
      return '#3f889eff';
    case 'community':
      return '#a84949ff';
    case 'friends':
      return '#828a3dff';
    case 'private':
      return '#927c34ff';
    default:
      return '#64748b';
  }
}

export function useCampingTypes(options: { includeInactive?: boolean } = {}) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((prev) => prev + 1);
    on('campingTypes:updated', listener);
    return () => off('campingTypes:updated', listener);
  }, []);

  return useMemo(
    () => getAllCampingTypes(!!options.includeInactive),
    [version, options.includeInactive],
  );
}
