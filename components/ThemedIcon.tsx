/**
 * ThemedIcon — Tema duyarlı merkezi ikon bileşeni
 * 
 * Tüm ikonlar bu bileşen üzerinden render edilir.
 * Lucide, özel SVG ve hava durumu ikonlarını tek API ile sunar.
 * 
 * Kullanım:
 *   <ThemedIcon name="MapPin" />
 *   <ThemedIcon name="MapPin" size="lg" context="primary" />
 *   <ThemedIcon category="tab" icon="map" size="md" />
 */

import React from 'react';
import { SvgXml } from 'react-native-svg';
import * as Lucide from 'lucide-react-native';
import { getSVGIcon } from '../app/icons/svgIcons';
import weatherSvgs from '../app/icons/weatherSvgs';
import { useTheme } from './ThemeProvider';
import { iconRegistry, getIconColor } from '../constants/theme/icons';
import { iconSizes, type IconSizeKey } from '../constants/theme/spacing';

type IconContext = 'primary' | 'secondary' | 'muted' | 'danger' | 'warning' | 'success' | 'info' | 'inverse';

type Props = {
  /** Doğrudan ikon adı (Lucide adı, SVG key veya weather key) */
  name?: string;
  /** Registry'den kategori + ikon adı ile çözümleme */
  category?: keyof typeof iconRegistry;
  icon?: string;
  /** Boyut — sayı veya preset key */
  size?: number | IconSizeKey;
  /** Renk — doğrudan hex veya tema context'i */
  color?: string;
  context?: IconContext;
  style?: any;
};

const ThemedIcon: React.FC<Props> = ({ name, category, icon, size = 'md', color, context, style }) => {
  const { colors } = useTheme();

  // Boyut çözümle
  const resolvedSize = typeof size === 'number' ? size : (iconSizes[size] ?? iconSizes.md);

  // İkon adını çözümle
  let resolvedName = name;
  if (!resolvedName && category && icon) {
    const cat = iconRegistry[category] as Record<string, string> | undefined;
    resolvedName = cat?.[icon];
  }
  if (!resolvedName) return null;

  // Renk çözümle
  const resolvedColor = color ?? (context ? getIconColor(context, colors) : colors.text);

  // 1) Lucide ikonu dene
  const LucideComp = (Lucide as any)[resolvedName];
  if (LucideComp) return <LucideComp size={resolvedSize} color={resolvedColor} style={style} />;

  // 2) Özel SVG ikonları dene
  try {
    const svg = getSVGIcon(resolvedName as any, { width: resolvedSize, height: resolvedSize, stroke: resolvedColor, fill: 'none' });
    if (svg && svg.startsWith('<svg')) return <SvgXml xml={svg} width={resolvedSize} height={resolvedSize} style={style} />;
  } catch { /* ignore */ }

  // 3) Hava durumu SVG'leri dene
  if ((weatherSvgs as any)[resolvedName]) {
    return <SvgXml xml={(weatherSvgs as any)[resolvedName]} width={resolvedSize} height={resolvedSize} style={style} />;
  }

  return null;
};

export default ThemedIcon;
