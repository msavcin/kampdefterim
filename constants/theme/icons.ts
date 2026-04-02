/**
 * Merkezi İkon Kayıt Sistemi
 *
 * Tüm ikonlar burada kayıt altına alınır ve tema renklerine göre yönetilir.
 * Lucide ikonları, özel SVG ikonları ve hava durumu ikonları tek yerden kontrol edilir.
 */

import type { ThemeColors } from './colors';

/**
 * İkon kategorileri ve ikon adları
 */
export const iconRegistry = {
  // ─── Navigasyon ───
  navigation: {
    back: 'ArrowLeft',
    forward: 'ArrowRight',
    close: 'X',
    menu: 'Menu',
    chevronDown: 'ChevronDown',
    chevronRight: 'ChevronRight',
    chevronUp: 'ChevronUp',
    search: 'Search',
  },
  // ─── Genel Aksiyonlar ───
  action: {
    add: 'Plus',
    edit: 'Pencil',
    delete: 'Trash2',
    save: 'Check',
    share: 'Share2',
    filter: 'Filter',
    sort: 'ArrowUpDown',
    refresh: 'RefreshCw',
    settings: 'Settings',
    copy: 'Copy',
  },
  // ─── Durumlar ───
  status: {
    success: 'CheckCircle',
    error: 'XCircle',
    warning: 'AlertTriangle',
    info: 'Info',
    loading: 'Loader2',
    offline: 'WifiOff',
    online: 'Wifi',
  },
  // ─── Tab Bar ───
  tab: {
    map: 'Map',
    announcements: 'Bell',
    checklist: 'SquareCheck',
    favorites: 'Heart',
    profile: 'User',
    premium: 'Crown',
  },
  // ─── Kamp / Harita ───
  camp: {
    tent: 'campground',
    caravan: 'caravan_site',
    bungalow: 'bungalow',
    recreation: 'recreation',
    restaurant: 'restaurant',
    store: 'camp_store',
    nationalPark: 'national_park',
    hiking: 'hiking_road',
    touristic: 'touristic_place',
    parking: 'parking',
    accommodation: 'accommodation',
    mapPin: 'MapPin',
    navigation: 'navigation',
  },
  // ─── Hava Durumu ───
  weather: {
    sun: 'sun',
    cloud: 'cloud',
    rain: 'rain',
    snow: 'snow',
    thunder: 'thunder',
    fog: 'fog',
  },
  // ─── Sosyal ───
  social: {
    friends: 'Users',
    addFriend: 'UserPlus',
    community: 'Globe',
    message: 'MessageCircle',
    notification: 'Bell',
  },
  // ─── İçerik ───
  content: {
    calendar: 'Calendar',
    clock: 'Clock',
    location: 'MapPin',
    image: 'Image',
    camera: 'Camera',
    file: 'File',
    link: 'Link',
    bookmark: 'Bookmark',
    star: 'Star',
    eye: 'Eye',
    eyeOff: 'EyeOff',
  },
} as const;

/**
 * İkon tema renklendirmesi — ikon context'ine göre uygun tema rengini döndürür
 */
export function getIconColor(
  context: 'primary' | 'secondary' | 'muted' | 'danger' | 'warning' | 'success' | 'info' | 'inverse',
  colors: ThemeColors
): string {
  switch (context) {
    case 'primary': return colors.primary;
    case 'secondary': return colors.textSecondary;
    case 'muted': return colors.muted;
    case 'danger': return colors.danger;
    case 'warning': return colors.warning;
    case 'success': return colors.success;
    case 'info': return colors.info;
    case 'inverse': return colors.background;
    default: return colors.text;
  }
}

export type IconCategory = keyof typeof iconRegistry;
export type IconName<C extends IconCategory> = keyof typeof iconRegistry[C];
