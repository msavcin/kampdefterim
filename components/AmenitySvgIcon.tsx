import React from 'react';
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polyline,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

export type AmenityIconId =
  | 'tuvalet'
  | 'duş'
  | 'dus'
  | 'içme_suyu'
  | 'icme_suyu'
  | 'elektrik'
  | 'wifi'
  | 'market'
  | 'restoran'
  | 'otopark'
  | 'piknik_masası'
  | 'piknik_masasi'
  | 'barbekü'
  | 'barbeku'
  | 'ateş_yeri'
  | 'ates_yeri';

const AMENITY_LABELS: Record<string, string> = {
  tuvalet: 'Tuvalet',
  duş: 'Duş',
  dus: 'Duş',
  içme_suyu: 'İçme Suyu',
  icme_suyu: 'İçme Suyu',
  elektrik: 'Elektrik',
  wifi: 'WiFi',
  market: 'Market',
  restoran: 'Restoran',
  otopark: 'Otopark',
  piknik_masası: 'Piknik Masası',
  piknik_masasi: 'Piknik Masası',
  barbekü: 'Barbekü',
  barbeku: 'Barbekü',
  ateş_yeri: 'Ateş Yeri',
  ates_yeri: 'Ateş Yeri',
};

export function normalizeAmenityId(amenity: string) {
  return String(amenity || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '_');
}

export function getAmenityLabel(amenity: string) {
  const normalized = normalizeAmenityId(amenity);
  return AMENITY_LABELS[normalized] || String(amenity || '').trim();
}

type AmenitySvgIconProps = {
  amenity: string;
  size?: number;
  color: string;
  backgroundColor?: string;
  strokeWidth?: number;
};

export default function AmenitySvgIcon({
  amenity,
  size = 32,
  color,
  strokeWidth = 2.6,
}: AmenitySvgIconProps) {
  const id = normalizeAmenityId(amenity);
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const renderIcon = () => {
    switch (id) {
      case 'tuvalet':
        return (
          <G {...common}>
            <Rect x={13} y={8} width={10} height={19} rx={2} />
            <Path d="M23 25h15v4c0 5.5-4.5 10-10 10h-7" />
            <Path d="M12 27h27" />
            <Path d="M18 39h16" />
            <Path d="M16 27l2 12" />
          </G>
        );
      case 'duş':
      case 'dus':
        return (
          <G {...common}>
            <Path d="M30 10h4a5 5 0 0 1 5 5v24" />
            <Path d="M12 27a12 12 0 0 1 24 0Z" />
            <Line x1={15} y1={32} x2={15} y2={36} />
            <Line x1={22} y1={33} x2={22} y2={39} />
            <Line x1={29} y1={32} x2={29} y2={36} />
            <Line x1={36} y1={33} x2={36} y2={39} />
          </G>
        );
      case 'içme_suyu':
      case 'icme_suyu':
        return (
          <G {...common}>
            <Path d="M24 7c-7 8.5-11 15-11 21a11 11 0 0 0 22 0c0-6-4-12.5-11-21Z" />
            <Path d="M19 31c1.4 2.7 3.7 4.1 7 4.1" />
          </G>
        );
      case 'elektrik':
        return (
          <G {...common}>
            <Line x1={18} y1={8} x2={18} y2={18} />
            <Line x1={30} y1={8} x2={30} y2={18} />
            <Path d="M14 18h20v9a10 10 0 0 1-20 0Z" />
            <Path d="M24 39v-7" />
            <Path d="M26 21l-5 7h5l-3 6" />
            <Path d="M24 39c2.5 0 4 1.6 4 4" />
          </G>
        );
      case 'wifi':
        return (
          <G {...common}>
            <Path d="M10 20c8-7 20-7 28 0" />
            <Path d="M15 27c5.2-4.6 12.8-4.6 18 0" />
            <Path d="M20 34c2.4-2 5.6-2 8 0" />
            <Circle cx={24} cy={39} r={1.6} fill={color} stroke="none" />
          </G>
        );
      case 'market':
        return (
          <G {...common}>
            <Path d="M10 12h5l3 19h17l4-13H18" />
            <Path d="M19 31h16" />
            <Circle cx={21} cy={38} r={2} />
            <Circle cx={34} cy={38} r={2} />
          </G>
        );
      case 'restoran':
        return (
          <G {...common}>
            <Line x1={11} y1={10} x2={11} y2={38} />
            <Line x1={8} y1={10} x2={8} y2={22} />
            <Line x1={14} y1={10} x2={14} y2={22} />
            <Path d="M8 22h6" />
            <Circle cx={25} cy={25} r={8} />
            <Line x1={39} y1={10} x2={39} y2={38} />
            <Path d="M39 10c-5 5-5 10 0 15" />
          </G>
        );
      case 'otopark':
        return (
          <G>
            <Circle cx={24} cy={24} r={16} {...common} />
            <SvgText
              x={24}
              y={31}
              textAnchor="middle"
              fill={color}
              fontSize={22}
              fontWeight="700"
            >
              P
            </SvgText>
          </G>
        );
      case 'piknik_masası':
      case 'piknik_masasi':
        return (
          <G {...common}>
            <Line x1={13} y1={19} x2={35} y2={19} />
            <Line x1={18} y1={19} x2={13} y2={36} />
            <Line x1={30} y1={19} x2={35} y2={36} />
            <Line x1={9} y1={27} x2={39} y2={27} />
            <Line x1={14} y1={31} x2={34} y2={31} />
          </G>
        );
      case 'barbekü':
      case 'barbeku':
        return (
          <G {...common}>
            <Path d="M13 22h22a11 11 0 0 1-22 0Z" />
            <Line x1={17} y1={36} x2={13} y2={42} />
            <Line x1={31} y1={36} x2={35} y2={42} />
            <Line x1={24} y1={33} x2={24} y2={42} />
            <Path d="M18 13c-2 2-2 4 0 6" />
            <Path d="M24 11c-2 2-2 5 0 7" />
            <Path d="M30 13c-2 2-2 4 0 6" />
          </G>
        );
      case 'ateş_yeri':
      case 'ates_yeri':
        return (
          <G {...common}>
            <Path d="M24 8c5 5 2 9 1 12 4-2 7 2 7 7a8 8 0 0 1-16 0c0-4 3-7 8-11" />
            <Path d="M22 31c-1.5-4 2-6 4-8 1 4 5 6 2 10" />
            <Line x1={12} y1={38} x2={36} y2={30} />
            <Line x1={12} y1={30} x2={36} y2={38} />
          </G>
        );
      default:
        return (
          <G {...common}>
            <Circle cx={24} cy={24} r={14} />
            <Path d="M18 24h12" />
          </G>
        );
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {renderIcon()}
    </Svg>
  );
}
