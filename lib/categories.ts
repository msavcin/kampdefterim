// owner_id ve visibility'ye göre arka plan rengi belirleyici fonksiyon (merkezi)
export function getCampingAreaBgColor(area: { owner_id?: string | null, visibility?: string, type?: string, tags?: any }) {
  if (!area.owner_id || area.owner_id === '' || area.owner_id === null) {
    const typeId = area.tags && area.tags.type;
    const cat = campingTypes.find(t => t.id === typeId);
    return cat?.color || '#000000ff';
  }
  switch (area.visibility) {
    case 'public':
      return '#3f889eff'; // Genel (mavi)
    case 'community':
      return '#a84949ff'; // Topluluk (sarı)
    case 'friends':
      return '#828a3dff'; // Arkadaş (yeşil)
    case 'private':
      return '#927c34ff'; // Kişisel/özel (turuncu)
    default:
      return '#64748b'; // Bilinmeyen/gri
  }
}
// Merkezi kamp türü yönetimi
export const campingTypes = [
  { id: 'campground', label: 'Kamp Alanı', icon: 'campground', color: '#73768fff' }, // + mavi
  { id: 'caravan_site', label: 'Karavan Alanı', icon: 'caravan_site', color: '#73768fff' }, // + mavi
  { id: 'bungalow', label: 'Bungalov', icon: 'bungalow', color: '#73768fff' }, // + mavi
  { id: 'recreation', label: 'Rekreasyon Alanı', icon: 'recreation', color: '#16a672' }, // + yeşil
  { id: 'restaurant', label: 'Restoran', icon: 'restaurant', color: '#855facff' }, // + mor
  { id: 'camp_store', label: 'İşletme', icon: 'camp_store', color: '#855facff' }, // + mor
  { id: 'national_park', label: 'Milli Park', icon: 'national_park', color: '#16a672' }, // + yeşil
  { id: 'hiking_road', label: 'Yürüyüş Parkuru', icon: 'hiking_road', color: '#16a672' }, // + yeşil
  { id: 'touristic_place', label: 'Gezilecek Yer', icon: 'touristic_place', color: '#7244a0ff' }, // + mor
  { id: 'accommodation', label: 'Konaklama', icon: 'accommodation', color: '#855facff' }, // + mor
  { id: 'parking', label: 'Otopark', icon: 'parking', color: '#afaf27ff' }, // + sarı

  // Yeni tür eklemek için buraya ekleyin
];
import { getSVGIcon, CAMP_TYPE_ICON_COLORS } from '../app/icons/svgIcons';

export type CampingTypeId = typeof campingTypes[number]['id'];

export function getCampingTypeLabel(id: string) {
  return campingTypes.find(t => t.id === id)?.label || 'Bilinmeyen';
}

import type { SVGStandardizeOptions } from '../app/icons/svgIcons';
export function getCampingTypeIcon(id: string, options?: SVGStandardizeOptions) {
  const iconKey = campingTypes.find(t => t.id === id)?.icon;
  if (!iconKey) return '❓';
  // Eğer fill/stroke opsiyonu verilmemişse merkezi renkleri uygula
  const colorOpts = CAMP_TYPE_ICON_COLORS[iconKey] || { fill: 'none', stroke: '#000' };
  return getSVGIcon(iconKey as any, { width: 18, height: 18, ...colorOpts, ...options });
}
