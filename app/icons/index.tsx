import React from 'react';
import { SvgXml } from 'react-native-svg';
import * as Lucide from 'lucide-react-native';
import { getSVGIcon } from './svgIcons';
import weatherSvgs from './weatherSvgs';

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  [key: string]: any;
};

const Icon: React.FC<IconProps> = ({ name, size = 18, color = '#000', ...rest }) => {
  // Try lucide-react-native first
  const LucideComp = (Lucide as any)[name];
  if (LucideComp) return <LucideComp size={size} color={color} {...rest} />;

  // Then try svgIcons (string-based SVGs)
  try {
    const svg = getSVGIcon(name as any, { width: size, height: size, stroke: color, fill: 'none' });
    if (svg) return <SvgXml xml={svg} width={size} height={size} />;
  } catch (e) {
    // ignore
  }

  // Finally try weather svgs
  if ((weatherSvgs as any)[name]) {
    return <SvgXml xml={(weatherSvgs as any)[name]} width={size} height={size} />;
  }

  return null;
};

export const ICON_CATEGORIES: Record<string, string[]> = {
  ui: ['Plus', 'X', 'ArrowLeft', 'ArrowRight', 'CheckCircle', 'Trash2', 'Calendar'],
  map: ['MapPin', 'navigation'],
  weather: ['sun', 'cloud', 'rain', 'snow', 'thunder', 'fog'],
};

export default Icon;
