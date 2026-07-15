export type ThemeVariantId = 'classic' | 'kampfireGold';

export type ThemeVariant = {
  id: ThemeVariantId;
  name: string;
  badge: string;
  description: string;
  preview: string[];
  darkOnly?: boolean;
};

export const themeVariants: Record<ThemeVariantId, ThemeVariant> = {
  classic: {
    id: 'classic',
    name: 'Klasik',
    badge: 'Klasik',
    description: 'Mevcut arayüz davranışı korunur. Uygulamanın mevcut teması bozulmaz.',
    preview: ['#FAF8F5', '#FFFFFF', '#6B8F71', '#1E293B', '#94A3B8'],
  },
  kampfireGold: {
    id: 'kampfireGold',
    name: 'Kampfire Gold',
    badge: 'Gold',
    description:
      'Koyu orman haritası, altın vurgu ve parlayan işaretçiler ile alternatif görünüm.',
    preview: ['#07090A', '#0E1210', '#D4AF6A', '#E8C97A', '#F2EDE3'],
    darkOnly: true,
  },
};

export const themeVariantList: ThemeVariant[] = Object.values(themeVariants);

export const defaultThemeVariantId: ThemeVariantId = 'classic';

export function isThemeVariantId(value: string): value is ThemeVariantId {
  return value === 'classic' || value === 'kampfireGold';
}
