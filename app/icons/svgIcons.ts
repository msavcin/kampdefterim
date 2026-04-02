// Kamp türü seçim ekranı için ikon renkleri (sadece Add/Edit modal)
export const CAMP_TYPE_ICON_COLORS: Record<string, { fill: string; stroke: string }> = {
  bungalow: { fill: '#000', stroke: 'none' },
  accommodation: { fill: '#000', stroke: 'none' },
  hiking_road: { fill: '#000', stroke: 'none' },
  caravan_site: { fill: '#000', stroke: 'none' },
  // Diğer türler için ekleme yapabilirsiniz
};

// Kamp türü için ikon döndüren yardımcı fonksiyon (Add/Edit modal için)
export function getCampingTypeIcon(
  type: MarkerType,
  options?: SVGStandardizeOptions
): string {
  // Eğer listede yoksa varsayılan renkleri uygula
  const colorOpts = CAMP_TYPE_ICON_COLORS[type] || { fill: 'none', stroke: '#000' };
  return getSVGIcon(type, { ...colorOpts, ...options });
}
// Kamp türü ikon renkleri (tek noktadan yönetim)
export const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  campground: { fill: 'none', stroke: '#fff' },
  caravan_site: { fill: '#fff', stroke: 'none' },
  recreation: { fill: 'none', stroke: '#fff' },
  accommodation: { fill: '#fff', stroke: 'none' },
  bungalow: { fill: '#fff', stroke: 'none' },
  camp_store: { fill: 'none', stroke: '#fff' },
  national_park: { fill: 'none', stroke: '#fff' },
  hiking_road: { fill: '#fff', stroke: 'none' },
  touristic_place: { fill: 'none', stroke: '#fff' },
  parking: { fill: 'none', stroke: '#fff' },
  restaurant: { fill: 'none', stroke: '#fff'},
  zorluk_seviyesi: { fill: 'none', stroke: '#000' },
  etkinlik_turu: { fill: 'none', stroke: '#000' },
  etkinlik_tarihi: { fill: 'none', stroke: '#000' },
  etkinlik_suresi: { fill: 'none', stroke: '#000' },
  etkinlik_yeri: { fill: 'none', stroke: '#000' },

  private_campground: { fill: '#fff', stroke: 'none' },
  shared_campground: { fill: '#fff', stroke: 'none' },

};
// SVG ikonlarını merkezi olarak yöneten modül
// Her ikonun string halini ve standartlaştırıcı fonksiyonu içerir

export type MarkerType =
  | 'campground'
  | 'caravan_site'
  | 'recreation'
  | 'accommodation'
  | 'bungalow'
  | 'camp_store'
  | 'national_park'
  | 'hiking_road'
  | 'touristic_place'
  | 'parking'
  | 'travel_agency'
  | 'lodging'
  | 'real_estate_agency'
  | 'park'
  | 'point_of_interest'
  | 'establishment'
  | 'restaurant'
  | 'private_campground'
  | 'shared_campground'
  | 'etkinlik_tarihi'
  | 'etkinlik_suresi'
  | 'etkinlik_yeri'
  | 'zorluk_seviyesi'
  | 'etkinlik_turu';

// SVG ikonlarının orijinal halleri (gerekirse daha fazla eklenebilir)
const rawIcons: Record<MarkerType | 'default' | 'navigation' | 'offline_sync', string> = {
  etkinlik_turu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-footprints-icon lucide-footprints"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>`,
  etkinlik_tarihi: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days-icon lucide-calendar-days"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`,
  etkinlik_suresi: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history-icon lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
  etkinlik_yeri: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-icon lucide-map"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>`,
  zorluk_seviyesi: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-route-icon lucide-route"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`,
  offline_sync: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208.63 208.31"><g><path fill="#010101" d="M199.64.12c6.59-1.07,11.07,5.3,7.96,11.21l-44.45,44.69c4.67,6.22,7.73,13.47,8.95,21.17,24.53,7.36,39.89,30.72,35.9,56.34-3.35,21.52-21.8,38.74-43.34,41.27-40.04.86-80.25.64-120.31.1l-32.43,32.19c-7.26,4.36-15.16-3.93-9.99-10.92L196.5,1.62c.82-.75,2.06-1.33,3.15-1.5Z"/><path fill="#010101" d="M136.76,40.24L15.88,161.36c-.51.22-3.44-2.9-3.96-3.5-24.03-27.27-9.69-70.94,24.65-80.43,2.14-15.4,11.06-29.5,24.55-37.28,12.38-7.14,27.04-8.67,40.66-4.24,2.44.79,11.73,5.96,12.42,5.98,1.01.04,5.72-1.72,7.57-2.01,5.1-.79,9.92-.49,14.98.34Z"/></g></svg>`,
  navigation: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 383.29 343.04"><g fill="black"><path d="M382.98,60.89c.39,3.88.41,11.86,0,15.72-1.24,11.56-8.98,27.82-14.83,37.93-13.82,23.88-34.05,45.39-54.25,63.82-23.48-22.07-49.24-49.45-61.94-79.54C230.6,48.2,266.19-4.25,321.27.27c30.54,2.51,58.63,30.04,61.72,60.62ZM312.53,46.86c-32.48,2.59-23.24,53,8.23,43.45,24.95-7.57,17.47-45.5-8.23-43.45Z"/><path d="M60.46,165.16c22.94-2.33,45.66,5.88,60.72,23.38,45.66,53.11-13.21,118.33-52.06,154.5-14-12.42-27.23-26.29-38.71-41.19-22.9-29.72-42.18-64.77-21.78-101.74,10.11-18.31,30.8-32.81,51.84-34.95ZM67.19,211.55c-33.29,3.08-21.88,54.96,9.87,42.83,23.73-9.06,15.05-45.13-9.87-42.83Z"/><path d="M269.29,152.21v22.46h-63.95c-3.1,0-11.27,4.27-13.86,6.34-19.31,15.46-12.02,47.28,11.95,52.46,28.96,6.26,71.14-7.2,97.04,8.43,33.8,20.38,32.8,70.73-1.33,90.28-5.14,2.94-16.25,7.17-22,7.17H113.72v-22.08l1.12-1.12h164.55c2.44,0,10.55-4.9,12.73-6.72,19.97-16.64,9.89-49.85-15.73-52.41-26.87-2.69-67.23,6.1-90.88-6.35-39.3-20.69-35.9-78.72,5.26-95.07,1.99-.79,9.23-3.38,10.83-3.38h67.69Z"/></g></svg>`,
  campground: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tent-icon lucide-tent"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`,
  caravan_site: `<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 326.75 230.76" fill="none" stroke="currentColor"><g id="Layer_1-2" data-name="Layer 1"><g><path d="M150.47,193.62c-.16-28.23-22.81-50.45-50.32-50.57-27.53-.11-50.57,21.89-50.78,50.46l-31.83.15C8.55,193.71.02,187.19.01,177.25v-57.88c-.02-19.24,3.79-37.68,10.96-55.32,10.87-26.74,31.71-46.77,59.01-56.13C85.46,2.62,101.15-.03,117.86,0l141.98.3c20.49.04,36.74,17.19,36.79,37.39l.3,135.5,19.23.08c6,.03,10.51,4.26,10.59,9.96.08,5.43-4.1,10.37-10.3,10.37l-165.99.02ZM109.12,104.47c3.65,0,5.77-3.31,5.77-6.22l.02-39.71c0-3.45-2.45-6.41-6.09-6.42l-32.79-.11c-7.77-.03-14.59,2.81-20.06,8.43-9.64,9.91-13.7,23.23-12.68,37.03.29,3.9,1.89,7.03,6.42,7.03l59.41-.04ZM175.83,104.47c3.59,0,6.04-2.94,6.05-6.11l.02-39.97c0-3.63-2.8-6.31-6.44-6.31h-30.79c-3.67,0-6.44,2.68-6.44,6.31l.02,39.96c0,3.69,2.92,6.15,6.44,6.15l31.14-.03ZM251.42,169.67c3.59,0,5.66-3.33,5.66-6.41V58.64c0-3.59-2.41-6.51-6.06-6.51h-39.71c-3.68,0-6.11,2.89-6.11,6.51v104.6c0,3.67,2.51,6.47,6.12,6.47l40.09-.03Z"/><path d="M92.31,157.2c20.91-4.34,40.25,9.26,44.15,29.53,3.8,19.76-9.17,39.33-29.31,43.33-19.78,3.93-39.51-8.79-43.67-29.01-4-19.46,8.14-39.54,28.82-43.84ZM96.04,180.21c-8.08,2.34-11.8,10.64-9.25,18.02,2.37,6.85,9.89,10.83,17.1,8.69s11.5-9.81,9.46-17.04-9.41-11.96-17.31-9.67Z"/></g></g></svg>`,
  recreation: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tree-pine-icon lucide-tree-pine"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/></svg>`,
  parking: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-parking-icon lucide-circle-parking"><circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>`,
  restaurant: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-utensils-crossed-icon lucide-utensils-crossed"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>`,
  accommodation: `<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 368.25 226.05" fill="none" stroke="currentColor"><g id="Layer_1-2" data-name="Layer 1"><g><path d="M338.17,210.03l-.12-27.79-307.64.69-.35,28.16c-.11,8.53-6.95,15.02-15.06,14.95C6.92,225.99,0,219.67,0,210.91V15.14C0,6.37,6.98.01,14.98,0c8.71-.01,15.14,6.76,15.14,15.78l.03,118.97,338.1-.76v76.22c0,8.67-6.94,15.07-14.98,15.11-8.21.04-15.06-6.38-15.1-15.3Z"/><path d="M368.23,121.9h-228.59s-.03-56.43-.03-56.43c0-16.7,13.21-29.68,29.91-29.86l137.95-.04c33.31,0,60.71,26.1,60.74,59.55l.02,26.77Z"/><path d="M82.11,42.4c20.64-2.26,38.14,12.67,40.41,32.14s-12.32,38.48-32.48,40.64c-19.92,2.13-37.98-12.06-40.39-32.03-2.38-19.75,11.6-38.46,32.45-40.75Z"/></g></g></svg>`,
  bungalow: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 370.29 383.24" fill="#000" stroke="none"><g><path d="M365.04,383.24H5.25c-2.24-1.56-5.2-3.63-5.21-6.81L0,344.28c0-4.08,3.19-7.63,7.35-7.64l22.58-.07.04-27.58-21.49-11.52c-3.64-1.95-5.01-6.67-2.71-10.45L178.49,3.98c1.54-2.53,3.94-3.88,6.32-3.98s5.21,1.09,6.65,3.46l58.21,95.31c1.51-4.59-2.5-17.38,8.22-17.39h41.25c4.54-.01,8.02,3.1,8.02,7.81l.02,103.86,57.36,94c2.36,3.87.75,8.24-2.71,10.45l-21.52,11.48.04,27.57,22.58.07c4.15.01,7.36,3.56,7.35,7.64l-.04,32.14c0,3.19-2.97,5.25-5.21,6.82ZM191.66,80.22l135.1,218.87,20.86-10.93L185.15,21.8,22.71,288.06l20.82,11.03L179.07,79.52c1.39-2.25,4.39-3.09,6.4-3.02s4.53,1.03,6.19,3.72ZM292.02,167.78l.12-71.43-26.99.05v27.84s26.87,43.55,26.87,43.55ZM248.24,200.44l-63.09-102.19-63.07,102.17,126.16.03ZM236.36,249.4c5.27,0,7.45,5.52,6.85,8.7-.96,5.08-5.27,6.6-10.51,6.2v23.67s47.75.02,47.75.02c3.74.26,7.2,3.12,7.21,7.08l.09,41.53,37.58-.04v-19.9c-3.88-.1-6.42-1.37-8.2-4.64l-59.66-96.61-144.7.04-59.59,96.59c-1.8,3.24-4.33,4.53-8.2,4.64v19.92s37.59-.02,37.59-.02l.06-41.5c0-3.94,3.48-6.82,7.22-7.07l47.84-.03-.04-23.78c-5.94,1.07-10.43-2.02-10.65-7.08-.2-4.78,3.57-7.77,8.72-7.77l100.64.07ZM192.6,297.52l.08,39.1,24.91-.13v-72.16s-64.88,0-64.88,0v72.16s24.87.13,24.87.13l.17-40.05c.02-4.03,4.64-6.45,7.71-6.3,3.48.17,7.13,2.83,7.14,7.25ZM137.74,336.49l-.11-33.54-40.04.04.02,33.62,40.12-.12ZM272.74,336.49l-.11-33.54-40.04.04.02,33.62,40.12-.12ZM355.15,368.27c.18-6.35.19-11.5-.19-16.7H15.14s0,16.71,0,16.71h340.02Z"/></g></svg>`,
  camp_store: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store-icon lucide-store"><path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/></svg>`,
  national_park: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trees-icon lucide-trees"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/></svg>`,
  hiking_road: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 29.58 47.91" fill="#000" stroke="none"><g><g><path d="M18.83,0c2.55.51,4.35,2.67,4.13,5.29s-2.35,4.46-4.91,4.43-4.67-2.04-4.8-4.62S14.92.47,17.42,0h1.41Z"/><path d="M18.68,20.4l-3.99-4.65c-.22-.26-.55-.32-.77-.19-.32.2-.34.55-.16.84l4,4.66-1.29,7.95,5.34,5.63c.36.38.48.87.51,1.4v9.82c0,1.16-.95,2.02-2.05,2.06-1.01.04-2.12-.81-2.12-1.96l-.03-9.11-7.89-8.32c-1.25-1.32-1.81-3.04-1.52-4.85l1.67-10.2c.4-2.43,2.69-3.98,5.05-3.51s3.91,2.85,3.25,5.29l1.97,2.29,6.17-.65.1-2.3c.01-.33.29-.58.57-.6.31-.02.69.21.68.59l-.06,2.22c.9.14,1.47.85,1.47,1.67s-.64,1.57-1.6,1.68l-1.01,27.15c-.01.36-.34.57-.6.58-.28.01-.67-.21-.66-.59l1-27.01-6.66.68c-.54.05-1-.19-1.38-.58Z"/><path d="M7.51,24.02c-.15.9-.96,1.48-1.82,1.34l-4.37-.71c-.85-.14-1.45-.94-1.31-1.81l2-12.19c.14-.86.97-1.43,1.81-1.29l4.35.71c.89.14,1.46.96,1.32,1.86l-1.98,12.09Z"/><path d="M5.05,46.83c-.62,1.06-1.86,1.36-2.87.8s-1.38-1.83-.77-2.88l4.84-8.38,2.59-7.68,3.26,3.44-2,5.95-5.05,8.74Z"/></g></g></svg>`,
  touristic_place: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera-icon lucide-camera"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></svg>`,
  travel_agency: '🧳',
  lodging: '🏨',
  real_estate_agency: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store-icon lucide-store"><path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/></svg>`,
  park: '🌲',
  point_of_interest: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-milestone-icon lucide-milestone"><path d="M12 13v8"/><path d="M12 3v3"/><path d="M4 6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h13a2 2 0 0 0 1.152-.365l3.424-2.317a1 1 0 0 0 0-1.635l-3.424-2.318A2 2 0 0 0 17 6z"/></svg>`,
  establishment: '🏬',
  shared_campground: `<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 137.24 131.33"><g id="Layer_1-2" data-name="Layer 1"><g><path fill="currentColor" d="M131.85,30.46v1c-.51.98-1.28,1.89-1.99,2.74-11.28,13.4-28.38,16.34-42.26,4.73-1.99-1.67-4.92-4.57-6.31-6.74-1.14-1.78.5-3.18,1.62-4.51,11.61-13.74,29.09-16.26,42.97-4.03,2.22,1.95,4.37,4.34,5.97,6.82ZM104.95,20.33c-6.45.66-10.58,7.45-8.87,13.59,2.06,7.4,11.34,10.21,17.2,5.2,8.07-6.89,2.41-19.88-8.33-18.79Z"/><path fill="currentColor" d="M105.54,25.21c5.84-.7,8.98,6.47,4.5,10.18s-10.74-.54-9.26-5.97c.57-2.07,2.59-3.95,4.75-4.21Z"/></g><path fill="currentColor" d="M129.86,122.21L74.11,31.64l16.19-26.74c.04-.38-.26-.54-.51-.74-.65-.51-6.66-4.24-7.06-4.15l-13.84,22.49L54.68.1c-.28-.24-.48,0-.72.09-.59.23-6.72,4-6.94,4.35l16.11,27.09L7.64,121.94c-.87.72-6.18.02-7.64.27v9.11h137.24v-9.11h-7.37ZM86.04,122.21l-17.16-36.18-17.69,36.18h-9.92l27.6-56.82,27.08,56.82h-9.92Z"/></g></svg>`,
  private_campground: `<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 152.26 131.33"><g id="Layer_1-2" data-name="Layer 1"><g><path fill="currentColor" d="M152.26,28.7v1.4c-.59,1.74-1.87,3.31-3.04,4.72-2.26,2.73-5.01,5.25-7.97,7.16l-7.4-7.4c4.22-9.66-4.26-19.86-14.58-17.34-.71.17-1.38.44-2.04.72l-5.32-5.4c13.75-4.77,28.3.52,37.32,11.43,1.18,1.43,2.42,2.95,3.04,4.72Z"/><path fill="currentColor" d="M141.49,51.63c-.76.76-1.9.83-2.8.26l-5.74-5.58c-6.53,2.09-13.51,2.27-20.08.27s-12.86-6.41-17.28-11.75c-2.91-3.52-4.35-5-1.33-9.14,2.54-3.48,5.77-6.42,9.26-8.93l-3.75-3.83c-1.05-2.49,1.76-4.36,3.7-2.53l38.02,38.02c.84.9.91,2.34.02,3.23ZM111.03,24.27c-.38,0-1.04,3.11-1.09,3.57-1,8.07,5.85,14.95,13.92,14.04,1.21-.14,2.54-.49,3.62-1.05l-3.21-3.32c-.8-.14-1.55.1-2.39.05-4.04-.24-7.45-3.71-7.64-7.75-.04-.8.2-1.52.06-2.28l-3.26-3.27Z"/><path fill="currentColor" d="M130.45,31.03l-9.68-9.68c5.75-1.03,10.7,3.93,9.68,9.68Z"/></g><path fill="currentColor" d="M129.86,122.21L74.11,31.64l16.19-26.74c.04-.38-.26-.54-.51-.74-.65-.51-6.66-4.24-7.06-4.15l-13.84,22.49L54.68.1c-.28-.24-.48,0-.72.09-.59.23-6.72,4-6.94,4.35l16.11,27.09L7.64,121.94c-.87.72-6.18.02-7.64.27v9.11h137.24v-9.11h-7.37ZM86.04,122.21l-17.16-36.18-17.69,36.18h-9.92l27.6-56.82,27.08,56.82h-9.92Z"/></g></svg>`,
  default: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 137.5 137.5"><g><path d="M0,125.17V0h137.5v137.5H0v-3.22l.26-.54h136.64l.33.54c-.21-.06-.5-.13-.54-.31-.27-1.29-.13-6.86,0-8.41l.54-.39c-.06.21-.14.52-.31.54-1.03.12-5.81.18-6.68,0l-.38-.54-.59.06c-18.63-30.16-37.18-60.35-55.64-90.57,5.23-9.02,10.59-17.99,16.09-26.9-.78-.59-6.46-4.27-6.82-4.09l-13.4,21.79c-.28.43-.79.36-1.18.13L54.31,3.58c-2.25,1.24-4.49,2.57-6.57,4.09l15.68,26.38.19.52c-18.36,30.21-36.83,60.37-55.44,90.49-1.2,1.03-6,.8-7.74.62l-.44-.49Z"/><path d="M129.86,125.17l-55.76-90.58,16.19-26.74c.04-.38-.26-.54-.51-.74-.65-.51-6.66-4.24-7.06-4.15l-13.84,22.49L54.68,3.06c-.28-.24-.48,0-.72.09-.59.23-6.72,4-6.94,4.35l16.11,27.09L7.64,124.9c-.87.72-6.18.02-7.64.27v9.11h137.24v-9.11h-7.37ZM86.04,125.17l-17.16-36.18-17.69,36.18h-9.92l27.6-56.82,27.08,56.82h-9.92Z"/></g></svg>`
};

// SVG'yi standart hale getir (boyut, viewBox, fill, stroke)
export type SVGStandardizeOptions = {
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
};

const DEFAULT_SVG_OPTIONS: Required<SVGStandardizeOptions> = {
  width: 20,
  height: 20,
  fill: 'none', // ikonun içi siyah
  stroke: '#000', // çerçeve beyaz
};

export function standardizeSVG(svg: string, options?: SVGStandardizeOptions): string {
  const opts = { ...DEFAULT_SVG_OPTIONS, ...options };
  let out = svg;
  out = out.replace(/width="[^"]*"/, `width="${opts.width}"`);
  out = out.replace(/height="[^"]*"/, `height="${opts.height}"`);
  // fill ve stroke'u tüm attribute'larda değiştir
  out = out.replace(/fill="[^"]*"/g, `fill="${opts.fill}"`);
  out = out.replace(/stroke="[^"]*"/g, `stroke="${opts.stroke}"`);
  return out;
}

// Marker tipi ve opsiyonlara göre ikon döndür
export function getSVGIcon(
  type: MarkerType | 'default' | 'navigation' | 'offline_sync',
  options?: SVGStandardizeOptions
): string {
  const raw = rawIcons[type] || rawIcons.default;
  // TYPE_COLORS ile fill/stroke'u override et
  let colorOpts: Partial<SVGStandardizeOptions> = {};
  if (TYPE_COLORS[type]) {
    colorOpts = TYPE_COLORS[type];
  }
  const opts = { ...DEFAULT_SVG_OPTIONS, ...colorOpts, ...options };
  if (typeof raw === 'string' && raw.startsWith('<svg')) {
    return standardizeSVG(raw, opts);
  }
  return raw;
}

// Dummy default export (Expo Router hatası için)
export default {};
