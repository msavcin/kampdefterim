import React from 'react';
import { SvgXml } from 'react-native-svg';
import weatherSvgs from '../app/icons/weatherSvgs';

type Props = {
  condition?: string | null;
  size?: number;
};

function normalize(condition?: string | null): string {
  if (!condition) return 'cloud';
  const c = condition.toLowerCase();
  if (c.includes('rain') || c.includes('yağ')) return 'rain';
  if (c.includes('snow') || c.includes('kar')) return 'snow';
  if (c.includes('thunder') || c.includes('gök')) return 'thunder';
  if (c.includes('clear') || c.includes('sun') || c.includes('güneş') || c.includes('açık')) return 'sun';
  if (c.includes('fog') || c.includes('mist') || c.includes('sis')) return 'fog';
  if (c.includes('cloud') || c.includes('bulut') || c.includes('parç')) return 'cloud';
  return 'cloud';
}

export default function WeatherIcon({ condition, size = 36 }: Props) {
  const key = normalize(condition);
  const svg = (weatherSvgs as any)[key];
  if (!svg) return null;
  return <SvgXml xml={svg} width={size} height={size} />;
}
