import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  Dimensions,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '../app/icons';
import WeatherIcon from './WeatherIcon';
import { useTheme, defaultCategoryMap, DEFAULT_CATEGORY_ACCENTS } from './ThemeProvider';
import type {
  AIEvaluationResponse,
  EvalStructuredData, EvalCategory, EvalItem, EvalSeverity, EvalStat,
  EvalItemWeatherDay, EvalItemAlert, EvalItemKeyValue,
  EvalItemChartBar, EvalItemProgress, EvalItemTable, EvalItemRating,
  EvalItemCampSuggestion,
} from '../lib/aiEvaluationApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ───

type Severity = 'good' | 'warning' | 'danger' | 'info';

interface ParsedItem {
  type: 'bullet' | 'subheading' | 'weather-day' | 'alert' | 'key-value' | 'chart-bar' | 'progress' | 'table' | 'rating' | 'camp-suggestion';
  text: string;
  // weather-day fields
  date?: string;
  dayTemp?: number;
  nightTemp?: number;
  rain?: number;
  wind?: number;
  condition?: string;
  // alert fields
  alertSeverity?: 'warning' | 'danger' | 'info';
  alertIcon?: string;
  // key-value fields
  kvLabel?: string;
  kvValue?: string;
  kvIcon?: string;
  kvSeverity?: Severity;
  // chart-bar fields
  barValue?: number;
  barMax?: number;
  barUnit?: string;
  barColor?: string;
  // progress fields
  percent?: number;
  progressColor?: string;
  // table fields
  tableHeaders?: string[];
  tableRows?: string[][];
  // rating fields
  ratingValue?: number;
  ratingMax?: number;
  // camp-suggestion fields
  suggestionName?: string;
  suggestionDistance?: number;
  suggestionType?: string;
  suggestionDesc?: string;
  suggestionBookingUrl?: string;
  suggestionRating?: number;
  suggestionSeverity?: Severity;
}

interface ParsedCategory {
  icon: string;
  title: string;
  items: ParsedItem[];
  highlight?: string;
  severity?: Severity;
  isWeather?: boolean;
}

// ─── Structured → Internal conversion ───

function convertStructured(sd: EvalStructuredData): {
  categories: ParsedCategory[];
  score: string | null;
  stats: EvalStat[];
} {
  const categories: ParsedCategory[] = sd.categories.map(cat => ({
    icon: cat.icon,
    title: cat.title,
    severity: cat.severity as Severity | undefined,
    highlight: cat.highlight ?? undefined,
    isWeather: cat.isWeather,
    items: cat.items.map(convertItem),
  }));
  return {
    categories,
    score: sd.score ?? null,
    stats: sd.stats ?? [],
  };
}

function convertItem(item: EvalItem): ParsedItem {
  switch (item.type) {
    case 'bullet':
      return { type: 'bullet', text: item.text };
    case 'subheading':
      return { type: 'subheading', text: item.text };
    case 'weather-day':
      return {
        type: 'weather-day',
        text: item.date,
        date: item.date,
        dayTemp: item.dayTemp ?? undefined,
        nightTemp: item.nightTemp ?? undefined,
        rain: item.rain ?? undefined,
        wind: item.wind ?? undefined,
        condition: item.condition ?? undefined,
      };
    case 'alert':
      return {
        type: 'alert',
        text: item.text,
        alertSeverity: item.severity,
        alertIcon: item.icon,
      };
    case 'key-value':
      return {
        type: 'key-value',
        text: `${item.label}: ${item.value}`,
        kvLabel: item.label,
        kvValue: item.value,
        kvIcon: item.icon,
        kvSeverity: item.severity as Severity | undefined,
      };
    case 'chart-bar':
      return {
        type: 'chart-bar',
        text: `${item.label}: ${item.value}${item.unit ?? ''}`,
        kvLabel: item.label,
        barValue: item.value,
        barMax: item.maxValue,
        barUnit: item.unit,
        barColor: item.color,
      };
    case 'progress':
      return {
        type: 'progress',
        text: `${item.label}: ${item.percent}%`,
        kvLabel: item.label,
        percent: item.percent,
        progressColor: item.color,
      };
    case 'table':
      return {
        type: 'table',
        text: '',
        tableHeaders: item.headers,
        tableRows: item.rows,
      };
    case 'rating':
      return {
        type: 'rating',
        text: `${item.label}: ${item.value}/${item.max ?? 5}`,
        kvLabel: item.label,
        ratingValue: item.value,
        ratingMax: item.max ?? 5,
      };
    case 'camp-suggestion':
      return {
        type: 'camp-suggestion',
        text: item.name,
        suggestionName: item.name,
        suggestionDistance: item.distance_km ?? undefined,
        suggestionType: item.campType ?? undefined,
        suggestionDesc: item.description ?? undefined,
        suggestionBookingUrl: item.booking_url ?? undefined,
        suggestionRating: item.rating ?? undefined,
        suggestionSeverity: item.severity as Severity | undefined,
      };
    default:
      // Bilinmeyen tip → bullet fallback
      return { type: 'bullet', text: (item as any).text ?? JSON.stringify(item) };
  }
}

// Use centralized category map from ThemeProvider
const CATEGORY_MAP = defaultCategoryMap;

function matchCategory(title: string): { icon: string; severity: Severity } {
  const lower = title.toLowerCase();
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val as any;
  }
  return { icon: 'Info', severity: 'info' };
}

// ─── Alert keyword detection ───

const DANGER_WORDS = ['tehlike', 'tehlikeli', 'tahliye', 'hayati risk', 'acil durum'];
const WARNING_WORDS = ['nem riski', 'su sızdırma', 'don riski', 'fırtına', 'sel riski', 'yıldırım', 'risk yüksek', 'dikkat!', 'uyarı:'];
const INFO_WORDS = ['not:', 'önemli:', 'ipucu:', 'tavsiye:'];

function detectAlert(text: string): { severity: 'warning' | 'danger' | 'info' | null; icon: string } {
  const lower = text.toLowerCase();
  if (DANGER_WORDS.some(k => lower.includes(k))) return { severity: 'danger', icon: 'AlertOctagon' };
  if (WARNING_WORDS.some(k => lower.includes(k))) return { severity: 'warning', icon: 'AlertTriangle' };
  if (INFO_WORDS.some(k => lower.startsWith(k))) return { severity: 'info', icon: 'Info' };
  return { severity: null, icon: '' };
}

// ─── Weather day pattern ───
// Matches: "15-16 Nisan: 16.3°C (gündüz) / 9.5°C (gece)"

function parseWeatherDay(text: string): Omit<ParsedItem, 'type'> | null {
  const dateRe = /^(\d{1,2}(?:-\d{1,2})?\s+\w+|\d{1,2}\.\d{2}(?:\.\d{4})?)\s*:/i;
  if (!dateRe.test(text)) return null;

  const dateMatch = text.match(/^([^:]+):/);
  if (!dateMatch) return null;
  const date = dateMatch[1].trim();
  const remainder = text.slice(dateMatch[0].length);

  // Two temps: "16.3°C ... / ... 9.5°C"
  const pairRe = /(\d+(?:[.,]\d+)?)\s*°C[^\/]*\/\s*(\d+(?:[.,]\d+)?)\s*°C/;
  const pair = remainder.match(pairRe);

  // Rain: "32%" or "%32"
  const rainRe = /(\d+)\s*%|%\s*(\d+)/;
  const rainM = remainder.match(rainRe);
  const rain = rainM ? parseFloat(rainM[1] ?? rainM[2]) : undefined;

  // Wind: "12.3 km/s" or "12 km/h"
  const windM = remainder.match(/(\d+(?:[.,]\d+)?)\s*km\/(?:s|h)/i);
  const wind = windM ? parseFloat(windM[1].replace(',', '.')) : undefined;

  if (pair) {
    return {
      text, date,
      dayTemp: parseFloat(pair[1].replace(',', '.')),
      nightTemp: parseFloat(pair[2].replace(',', '.')),
      rain, wind,
    };
  }
  const single = remainder.match(/(\d+(?:[.,]\d+)?)\s*°C/);
  if (single) {
    return { text, date, dayTemp: parseFloat(single[1].replace(',', '.')), rain, wind };
  }
  return null;
}

// ─── extractHighlight ───

function extractHighlight(text: string): string | undefined {
  const patterns = [
    /(\d+(?:[.,]\d+)?\s*\/\s*\d+)/,
    /(\d+(?:[.,]\d+)?%)/,
    /(\d+(?:[.,]\d+)?°C)/,
    /(\d+(?:[.,]\d+)?\s*km\/s)/,
    /(\d+(?:[.,]\d+)?\s*km)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

// ─── Item classifier ───

function classifyItem(text: string, isWeather: boolean): ParsedItem {
  // Sub-heading: ends with ':', short, no temperature
  if (text.endsWith(':') && text.length < 55 && !/°C/.test(text)) {
    return { type: 'subheading', text: text.slice(0, -1) };
  }
  // Weather day
  if (isWeather) {
    const wd = parseWeatherDay(text);
    if (wd) return { type: 'weather-day', ...wd };
  }
  // Alert
  const { severity, icon } = detectAlert(text);
  if (severity) return { type: 'alert', text, alertSeverity: severity, alertIcon: icon };
  // Default bullet
  return { type: 'bullet', text };
}

// ─── Parser ───

function parseEvaluation(markdown: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];
  const lines = markdown.split('\n');
  let current: ParsedCategory | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (current && current.items.length > 0) categories.push(current);
      const title = headingMatch[1].replace(/[*_]/g, '').trim();
      const { icon, severity } = matchCategory(title);
      const isWeather = title.toLowerCase().includes('hava');
      current = { icon, title, items: [], severity, isWeather };
      continue;
    }

    const boldMatch = trimmed.match(/^\*\*(.+?)(?::|\*\*)/);
    if (boldMatch && !current) {
      const title = boldMatch[1].replace(/[*_]/g, '').trim();
      const { icon, severity } = matchCategory(title);
      const isWeather = title.toLowerCase().includes('hava');
      current = { icon, title, items: [], severity, isWeather };
      continue;
    }

    const cleaned = trimmed
      .replace(/^[-*•]\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\(.*kural tabanlı.*\)/gi, '')
      .trim();

    if (!cleaned || cleaned === '--' || cleaned === '-') continue;

    if (current) {
      const item = classifyItem(cleaned, current.isWeather ?? false);
      if (!current.highlight && item.type === 'bullet') {
        current.highlight = extractHighlight(cleaned);
      }
      current.items.push(item);
    } else {
      const { icon, severity } = matchCategory(cleaned);
      const isWeather = cleaned.toLowerCase().includes('hava');
      current = {
        icon, title: 'Genel Değerlendirme',
        items: [classifyItem(cleaned, isWeather)],
        severity, highlight: extractHighlight(cleaned), isWeather,
      };
    }
  }

  if (current && current.items.length > 0) categories.push(current);

  if (categories.length === 0 && markdown.trim()) {
    categories.push({
      icon: 'Sparkles', title: 'Kamp Defterim Değerlendirmesi',
      items: [{ type: 'bullet', text: markdown.replace(/[#*_]/g, '').trim() }],
      severity: 'info',
    });
  }
  return categories;
}

// ─── Skor Çemberi ───

function ScoreCircle({ score, theme, isDark }: { score: string; theme: any; isDark: boolean }) {
  return (
    <View style={[
      s.scoreCircleOuter,
      { borderColor: isDark ? theme.colors.primary : theme.colors.primary + '50' },
    ]}>
      <View style={[
        s.scoreCircleInner,
        { backgroundColor: isDark ? theme.colors.surface : theme.colors.primaryLight + '80' },
      ]}>
        <Text style={[s.scoreValue, { color: theme.colors.primary }]}>{score}</Text>
      </View>
    </View>
  );
}

// ─── Küçük Badge ───

function StatBadge({ icon, label, value, severity, theme, isDark }: {
  icon: string; label: string; value: string; severity: Severity; theme: any; isDark: boolean;
}) {
  const c = {
    good:    { bg: '#D1FAE5', text: '#047857', label: '#6B7280', icon: '#059669' },
    warning: { bg: '#FEF3C7', text: '#92400E', label: '#6B7280', icon: '#D97706' },
    danger:  { bg: '#FEE2E2', text: '#B91C1C', label: '#6B7280', icon: '#EF4444' },
    info:    { bg: '#DBEAFE', text: '#1E40AF', label: '#6B7280', icon: '#3B82F6' },
  }[severity];
  return (
    <View style={[s.statBadge, { backgroundColor: isDark ? theme.colors.surfaceVariant : c.bg, borderWidth: isDark ? 1 : 0, borderColor: isDark ? theme.colors.border : 'transparent' }]}>
      <View style={[s.statIconCircle, { backgroundColor: isDark ? c.icon + '22' : c.bg }]}>
        <Icon name={icon} size={16} color={c.icon} />
      </View>
      <View style={s.statBadgeContent}>
        <Text style={[s.statBadgeLabel, { color: isDark ? theme.colors.muted : c.label }]} numberOfLines={1}>{label}</Text>
        <Text style={[s.statBadgeValue, { color: isDark ? theme.colors.text : c.text }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Weather Forecast Card ───

function inferWeatherCondition(item: ParsedItem): string {
  if ((item.rain ?? 0) >= 60) return 'yağmurlu';
  if ((item.rain ?? 0) >= 30) return 'bulutlu';
  if ((item.dayTemp ?? 20) >= 22) return 'güneşli';
  return 'parçalı bulutlu';
}

function WeatherForecastCard({ item, isDark, theme }: {
  item: ParsedItem; isDark: boolean; theme: any;
}) {
  const condition = inferWeatherCondition(item);
  return (
    <View style={[s.fcCard, {
      backgroundColor: isDark ? theme.colors.surface : theme.colors.surface,
      borderColor: isDark ? theme.colors.border : theme.colors.border,
    }]}>
      <Text style={[s.fcDate, { color: theme.colors.text }]}>{item.date}</Text>
      <Text style={[s.fcSummary, { color: theme.colors.muted }]} numberOfLines={1}>{condition}</Text>
      <View style={s.fcFlashRow}>
        <View style={[s.fcIconContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
          <WeatherIcon condition={condition} size={40} />
        </View>
        <View style={s.fcTempColumn}>
          <Text style={[s.fcTempMax, { color: theme.colors.text }]}>
            {item.dayTemp != null ? `${item.dayTemp}°C` : '--'}
          </Text>
          {item.nightTemp != null && (
            <Text style={[s.fcTempMin, { color: theme.colors.muted }]}>Min {item.nightTemp}°C</Text>
          )}
        </View>
      </View>
      <View style={[s.fcDivider, { backgroundColor: theme.colors.border }]} />
      <View style={s.fcMeta}>
        {item.rain != null && (
          <View style={s.fcMetaRow}>
            <Text style={s.fcMetaIcon}>💧</Text>
            <Text style={[s.fcMetaText, { color: theme.colors.textSecondary }]}>Yağış: {item.rain}%</Text>
          </View>
        )}
        {item.wind != null && (
          <View style={s.fcMetaRow}>
            <Text style={s.fcMetaIcon}>🍃</Text>
            <Text style={[s.fcMetaText, { color: theme.colors.textSecondary }]}>Rüzgar: {item.wind} km/s</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Alert Box ───

function AlertBox({ item, isDark, theme }: { item: ParsedItem; isDark: boolean; theme: any }) {
  const palette = {
    warning: { bg: isDark ? theme.colors.surfaceVariant : '#FFFBEB', border: isDark ? theme.colors.border : '#FDE68A', text: isDark ? '#FCD34D' : '#92400E', icon: '#FBBF24' },
    danger:  { bg: isDark ? theme.colors.surfaceVariant : '#FEF2F2', border: isDark ? theme.colors.border : '#FECACA', text: isDark ? '#FB7185' : '#B91C1C', icon: '#FB7185' },
    info:    { bg: isDark ? theme.colors.surfaceVariant : '#EFF6FF', border: isDark ? theme.colors.border : '#BFDBFE', text: isDark ? '#93C5FD' : '#1E40AF', icon: '#60A5FA' },
  };
  const c = palette[item.alertSeverity ?? 'info'];
  return (
    <View style={[s.alertBox, { backgroundColor: c.bg, borderColor: c.border }]}>
      <View style={[s.alertIconCircle, { backgroundColor: c.icon + '20' }]}>
        <Icon name={item.alertIcon ?? 'AlertTriangle'} size={13} color={c.icon} />
      </View>
      <Text style={[s.alertBoxText, { color: c.text }]}>{item.text}</Text>
    </View>
  );
}

// ─── Kategori Kartı ───

function CategoryCard({ category, theme, isDark, destinationLat, destinationLng, onOpenCampingAreaDetails }: {
  category: ParsedCategory; theme: any; isDark: boolean;
  destinationLat?: number | null;
  destinationLng?: number | null;
  onOpenCampingAreaDetails?: () => void;
}) {
  const cardBg  = isDark ? theme.colors.surfaceVariant : undefined;
  const cardBdr = isDark ? theme.colors.border : undefined;
  const severityKey = (category.severity ?? 'info') as any;
  const base = DEFAULT_CATEGORY_ACCENTS[severityKey] ?? DEFAULT_CATEGORY_ACCENTS.info;
  const sc = {
    accent: isDark ? base.accentDark : base.accentLight,
    bg: cardBg ?? (isDark ? theme.colors.surfaceVariant : base.bgLight),
    border: cardBdr ?? base.borderLight,
    leftBar: isDark ? base.accentDark : base.accentLight,
    iconBg: isDark ? (base.accentDark + '22') : base.iconBgLight,
    badgeBg: isDark ? (base.accentDark + '22') : base.iconBgLight,
  };

  const weatherDays = category.items.filter(i => i.type === 'weather-day');
  const normalizedTitle = category.title?.toLowerCase() ?? '';
  const showRouteButtons = /(yol|rota)/i.test(normalizedTitle);
  const showDetailButton = /kamp alan|kampalan|kamp alanı|kampalanı/i.test(normalizedTitle);
  const routeEnabled = destinationLat != null && destinationLng != null;

  return (
    <View style={[s.categoryCard, { backgroundColor: sc.bg, borderColor: sc.border }]}>
      {isDark && <View style={[s.categoryLeftBar, { backgroundColor: sc.leftBar }]} />}
      <View style={s.categoryCardInner}>

        {/* Başlık */}
        <View style={s.categoryHeader}>
          <View style={[s.categoryIconCircle, { backgroundColor: sc.iconBg }]}>
            <Icon name={category.icon} size={16} color={sc.accent} />
          </View>
          <Text style={[s.categoryTitle, { color: theme.colors.text }]} numberOfLines={2}>
            {category.title}
          </Text>
          {category.highlight && (
            <View style={[s.highlightBadge, { backgroundColor: isDark ? sc.accent + '22' : sc.badgeBg, borderWidth: 1, borderColor: sc.accent + '45' }]}>
              <Text style={[s.highlightText, { color: sc.accent }]}>{category.highlight}</Text>
            </View>
          )}
        </View>

        {/* Başlık / içerik ayırıcı */}
        <View style={[s.categoryDivider, { backgroundColor: isDark ? theme.colors.border : sc.accent + '40' }]} />

        {/* Hava günleri — yatay kaydırmalı forecast kartları */}
        {weatherDays.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.fcScroll}
            contentContainerStyle={{ paddingRight: 4 }}
            nestedScrollEnabled
          >
            {weatherDays.map((item, idx) => (
              <WeatherForecastCard key={idx} item={item} isDark={isDark} theme={theme} />
            ))}
          </ScrollView>
        )}

        {/* Diğer items — tüm tipler */}
        {category.items.filter(i => i.type !== 'weather-day').map((item, idx) => {
          if (item.type === 'subheading') {
            return (
              <View key={idx} style={[s.subheadingRow, idx > 0 && s.subheadingRowSpaced]}>
                <View style={[s.subheadingLine, { backgroundColor: sc.accent }]} />
                <Text style={[s.subheadingText, { color: isDark ? sc.accent : '#374151' }]}>
                  {item.text.toUpperCase()}
                </Text>
              </View>
            );
          }
          if (item.type === 'alert') {
            return <AlertBox key={idx} item={item} isDark={isDark} theme={theme} />;
          }
          if (item.type === 'key-value') {
            return (
              <View key={idx} style={s.kvRow}>
                {item.kvIcon && (
                  <View style={[s.kvIconWrap, { backgroundColor: sc.iconBg }]}>
                    <Icon name={item.kvIcon} size={13} color={sc.accent} />
                  </View>
                )}
                <Text style={[s.kvLabel, { color: theme.colors.muted }]}>{item.kvLabel ?? item.text}</Text>
                <Text style={[s.kvValue, { color: theme.colors.text }]}>{item.kvValue ?? ''}</Text>
              </View>
            );
          }
          if (item.type === 'chart-bar') {
            const max = item.barMax ?? 100;
            const pct = max > 0 ? Math.min(100, ((item.barValue ?? 0) / max) * 100) : 0;
            const barColor = item.barColor ?? sc.accent;
            return (
              <View key={idx} style={s.chartBarRow}>
                <Text style={[s.chartBarLabel, { color: theme.colors.textSecondary }]}>{item.text}</Text>
                <View style={s.chartBarTrackWrap}>
                  <View style={[s.chartBarTrack, { backgroundColor: isDark ? theme.colors.border : '#E5E7EB' }]}>
                    <View style={[s.chartBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[s.chartBarValue, { color: theme.colors.muted }]}>
                    {item.barValue ?? 0}{item.barUnit ?? ''}
                  </Text>
                </View>
              </View>
            );
          }
          if (item.type === 'progress') {
            const pct = Math.min(100, Math.max(0, item.percent ?? 0));
            const progressColor = item.progressColor ?? sc.accent;
            return (
              <View key={idx} style={s.progressRow}>
                <View style={s.progressHeader}>
                  <Text style={[s.progressLabel, { color: theme.colors.textSecondary }]}>{item.text}</Text>
                  <Text style={[s.progressPct, { color: progressColor }]}>{pct}%</Text>
                </View>
                <View style={[s.progressTrack, { backgroundColor: isDark ? theme.colors.border : '#E5E7EB' }]}>
                  <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: progressColor }]} />
                </View>
              </View>
            );
          }
          if (item.type === 'table') {
            const headers = item.tableHeaders ?? [];
            const rows = item.tableRows ?? [];
            return (
              <View key={idx} style={[s.tableContainer, { borderColor: isDark ? theme.colors.border : '#E5E7EB' }]}>
                {headers.length > 0 && (
                  <View style={[s.tableHeaderRow, { backgroundColor: isDark ? theme.colors.surfaceVariant : '#F3F4F6', borderBottomColor: isDark ? theme.colors.border : '#E5E7EB' }]}>
                    {headers.map((h, hi) => (
                      <Text key={hi} style={[s.tableHeaderCell, { color: theme.colors.muted, flex: 1 }]}>{h}</Text>
                    ))}
                  </View>
                )}
                {rows.map((row, ri) => (
                  <View key={ri} style={[s.tableRow, { borderTopColor: isDark ? theme.colors.border : '#E5E7EB' }]}>
                    {row.map((cell, ci) => (
                      <Text key={ci} style={[s.tableCell, { color: theme.colors.textSecondary, flex: 1 }]}>{cell}</Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          }
          if (item.type === 'rating') {
            const val = item.ratingValue ?? 0;
            const max = item.ratingMax ?? 5;
            return (
              <View key={idx} style={s.ratingRow}>
                <Text style={[s.ratingLabel, { color: theme.colors.textSecondary }]}>{item.text}</Text>
                <View style={s.ratingStars}>
                  {Array.from({ length: max }).map((_, si) => (
                    <Icon key={si} name="Star" size={14} color={si < val ? '#FBBF24' : (isDark ? theme.colors.border : '#D1D5DB')} />
                  ))}
                </View>
              </View>
            );
          }
          if (item.type === 'camp-suggestion') {
            const sRating = item.suggestionRating;
            return (
              <View key={idx} style={[s.campSuggCard, { backgroundColor: isDark ? theme.colors.surface : sc.bg, borderColor: isDark ? theme.colors.border : sc.border }]}>
                <View style={s.campSuggHeader}>
                  <View style={[s.campSuggIconWrap, { backgroundColor: isDark ? theme.colors.surfaceVariant : 'transparent' }]}> 
                    <Icon name="campground" size={14} color={theme.colors.primary} />
                  </View>
                  <Text style={[s.campSuggName, { color: theme.colors.text }]} numberOfLines={2}>
                    {item.suggestionName ?? item.text}
                  </Text>
                  {sRating != null && (
                    <View style={[s.campSuggRatingBadge, { backgroundColor: isDark ? theme.colors.surfaceVariant : '#78350F18', borderWidth: 1, borderColor: isDark ? theme.colors.border : '#FBBF2430' }]}>
                      <Icon name="Star" size={11} color="#FBBF24" />
                      <Text style={s.campSuggRatingText}>{sRating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
                <View style={s.campSuggMeta}>
                  {item.suggestionDistance != null && (
                    <View style={s.campSuggMetaChip}>
                      <Icon name="MapPin" size={11} color={theme.colors.muted} />
                      <Text style={[s.campSuggMetaText, { color: theme.colors.muted }]}>{item.suggestionDistance} km</Text>
                    </View>
                  )}
                  {item.suggestionType && (
                    <View style={s.campSuggMetaChip}>
                      <Icon name="Tag" size={11} color={theme.colors.muted} />
                      <Text style={[s.campSuggMetaText, { color: theme.colors.muted }]}>{item.suggestionType}</Text>
                    </View>
                  )}
                </View>
                {item.suggestionDesc ? (
                  <Text style={[s.campSuggDesc, { color: theme.colors.muted }]} numberOfLines={3}>
                    {item.suggestionDesc}
                  </Text>
                ) : null}
              </View>
            );
          }
          // bullet (varsayılan)
          return (
            <View key={idx} style={s.categoryItem}>
              <View style={[s.itemDot, { backgroundColor: sc.accent }]} />
              <Text style={[s.categoryItemText, { color: theme.colors.textSecondary }]}>
                {item.text}
              </Text>
            </View>
          );
        })}

        {showRouteButtons && (
          <View style={s.routeButtonsRow}>
            <TouchableOpacity
              style={[s.routeBtn, !routeEnabled && s.routeBtnDisabled]}
              disabled={!routeEnabled}
              onPress={() => openRouteLink('google', destinationLat, destinationLng)}
            >
              <Text style={s.routeBtnText}>🧭 Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.routeBtn, !routeEnabled && s.routeBtnDisabled]}
              disabled={!routeEnabled}
              onPress={() => openRouteLink('yandex', destinationLat, destinationLng)}
            >
              <Text style={s.routeBtnText}>🧭 Yandex</Text>
            </TouchableOpacity>
          </View>
        )}
        {showDetailButton && onOpenCampingAreaDetails && (
          <View style={s.routeButtonsRow}>
            <TouchableOpacity
              style={s.routeBtn}
              onPress={onOpenCampingAreaDetails}
            >
              <Text style={s.routeBtnText}>Detaylı Bilgi</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Ana Bileşen ───

type WeatherDay = {
  date?: string | null;
  maxTemp?: number | null;
  minTemp?: number | null;
  avgTemp?: number | null;
  pop?: number | null;
  wind_kph?: number | null;
  text?: string | null;
};

function fmtDate(ymd?: string | null): string {
  if (!ymd) return '';
  try {
    const p = String(ymd).split('-');
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
  } catch {}
  return ymd ?? '';
}

interface AIEvaluationDashboardModalProps {
  visible: boolean;
  onClose: () => void;
  evaluation: AIEvaluationResponse | null;
  onRefresh?: () => void;
  campingAreaImage?: string | null;
  planTitle?: string;
  weatherData?: { days: WeatherDay[] } | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  onOpenCampingAreaDetails?: () => void;
  remaining?: number | null;
  limit?: number | null;
}

function openRouteLink(provider: 'google' | 'yandex', lat?: number | null, lng?: number | null) {
  if (!lat || !lng) return;
  const url = provider === 'google'
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `yandexmaps://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
  Linking.openURL(url).catch(err => console.error('Navigation error:', err));
}

export default function AIEvaluationDashboardModal({
  visible,
  onClose,
  evaluation,
  onRefresh,
  campingAreaImage,
  planTitle,
  weatherData,
  destinationLat,
  destinationLng,
  onOpenCampingAreaDetails,
  remaining,
  limit,
}: AIEvaluationDashboardModalProps) {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';

  // ─── Structured-first: backend yapısal veri gönderdiyse onu kullan, yoksa markdown parse ───
  const structuredResult = useMemo(() => {
    if (evaluation?.structured) return convertStructured(evaluation.structured);
    return null;
  }, [evaluation?.structured]);

  const rawCategories = useMemo(
    () => structuredResult ? structuredResult.categories : (evaluation?.evaluation ? parseEvaluation(evaluation.evaluation) : []),
    [structuredResult, evaluation?.evaluation]
  );

  // Ham hava verisi varsa hava kategorisinin items'larını yapısal ParsedItem'lerle değiştir
  const categories = useMemo(() => {
    // Structured data'dan gelen kategorilerde weatherData enjeksiyonuna gerek yok
    if (structuredResult) return rawCategories;

    if (!weatherData?.days?.length) return rawCategories;

    const injectedItems: ParsedItem[] = weatherData.days.map(d => ({
      type: 'weather-day' as const,
      text: fmtDate(d.date),
      date: fmtDate(d.date),
      dayTemp:   d.avgTemp != null ? parseFloat(d.avgTemp.toFixed(1)) : (d.maxTemp != null ? parseFloat(d.maxTemp.toFixed(1)) : undefined),
      nightTemp: d.minTemp != null ? parseFloat(d.minTemp.toFixed(1)) : undefined,
      rain:      d.pop    != null ? Math.round(d.pop)   : undefined,
      wind:      d.wind_kph != null ? parseFloat(d.wind_kph.toFixed(1)) : undefined,
    }));

    const weatherCatIdx = rawCategories.findIndex(c => c.isWeather);
    if (weatherCatIdx !== -1) {
      return rawCategories.map((cat, i) => {
        if (i !== weatherCatIdx) return cat;
        // Sadece weather-day öğelerini ayır — kalanlardan bullet'ları çıkaracağız
        const nonWeatherItems = cat.items.filter(item => item.type !== 'weather-day');
        return { ...cat, items: [...injectedItems, ...nonWeatherItems.filter(item => item.type !== 'bullet')] };
      });
    }

    const weatherCat: ParsedCategory = {
      icon: 'CloudSun', title: 'Hava Durumu Analizi',
      severity: 'info', isWeather: true,
      items: injectedItems,
    };
    return [weatherCat, ...rawCategories];
  }, [structuredResult, rawCategories, weatherData]);

  // Puan: structured data'da score varsa doğrudan, yoksa metin tarama
  const mainScore = useMemo(() => {
    if (structuredResult?.score) return structuredResult.score;
    const findScore = (cat: ParsedCategory) => {
      if (cat.highlight?.includes('/')) return cat.highlight;
      for (const item of cat.items) {
        const m = item.text.match(/(\d+(?:[.,]\d+)?\s*\/\s*\d+)/);
        if (m) return m[1];
      }
      return null;
    };
    const campCat = categories.find(c => {
      const l = c.title.toLowerCase();
      return l.includes('kamp') && (l.includes('alan') || l.includes('analiz') || l.includes('puan'));
    });
    if (campCat) { const s = findScore(campCat); if (s) return s; }
    for (const cat of categories) { const s = findScore(cat); if (s) return s; }
    return null;
  }, [structuredResult, categories]);

  // Stat badge'ler: structured stats varsa doğrudan kullan, yoksa tarama
  const statBadges = useMemo(() => {
    if (structuredResult?.stats?.length) {
      return structuredResult.stats.slice(0, 4).map(st => ({
        icon: st.icon, label: st.label, value: st.value,
        severity: (st.severity ?? 'info') as Severity,
      }));
    }
    const badges: { icon: string; label: string; value: string; severity: Severity }[] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        if (item.type === 'weather-day') {
          if (item.dayTemp != null && !badges.some(b => b.label === 'Sıcaklık'))
            badges.push({ icon: 'Thermometer', label: 'Sıcaklık', value: `${item.dayTemp}°C`, severity: 'info' });
          if (item.rain != null && !badges.some(b => b.label === 'Yağış'))
            badges.push({ icon: 'CloudRain', label: 'Yağış', value: `${item.rain}%`, severity: item.rain >= 60 ? 'danger' : item.rain >= 30 ? 'warning' : 'good' });
          if (item.wind != null && !badges.some(b => b.label === 'Rüzgar'))
            badges.push({ icon: 'Wind', label: 'Rüzgar', value: `${item.wind} km/s`, severity: item.wind >= 40 ? 'danger' : 'warning' });
        } else if (item.type === 'bullet') {
          const wM = item.text.match(/(\d+(?:[.,]\d+)?)\s*km\/s/);
          if (wM && !badges.some(b => b.label === 'Rüzgar'))
            badges.push({ icon: 'Wind', label: 'Rüzgar', value: `${wM[1]} km/s`, severity: Number(wM[1]) >= 40 ? 'danger' : 'warning' });
          const rM = item.text.match(/(?:yağış|yağmur)[^%]*?(\d+)%/i) || item.text.match(/(\d+)%\s*(?:yağış|yağmur)/i);
          if (rM && !badges.some(b => b.label === 'Yağış')) {
            const v = Number(rM[1]);
            badges.push({ icon: 'CloudRain', label: 'Yağış', value: `${rM[1]}%`, severity: v >= 60 ? 'danger' : v >= 30 ? 'warning' : 'good' });
          }
          const kM = item.text.match(/(\d+(?:[.,]\d+)?)\s*km(?!\/)/);
          if (kM && !badges.some(b => b.label === 'Mesafe'))
            badges.push({ icon: 'Route', label: 'Mesafe', value: `${kM[1]} km`, severity: 'info' });
          const reviewMatch = item.text.match(/(\d+)\s*(?:yorum|değerlendirme|reviews?)/i);
          if (reviewMatch && !badges.some(b => b.label === 'Yorum')) {
            badges.push({ icon: 'MessageSquare', label: 'Yorum', value: `${reviewMatch[1]} yorum`, severity: 'info' });
          }
        }
      }
    }
    return badges.slice(0, 4);
  }, [structuredResult, categories]);

  const overlayColor = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: overlayColor }]}>
        <View style={[s.modal, { backgroundColor: isDark ? theme.colors.background : theme.colors.surface }]} pointerEvents="box-none">

          {/* Hero / Header */}
          {campingAreaImage ? (
            <ImageBackground
              source={{ uri: campingAreaImage }}
              style={s.heroImage}
              imageStyle={s.heroImageInner}
              blurRadius={12}
            >
              <LinearGradient
                colors={isDark ? ['transparent', 'rgba(11,18,32,0.95)'] : ['transparent', 'rgba(255,255,255,0.97)']}
                style={s.heroOverlay}
              >
                {renderHeader(theme, isDark, mainScore, planTitle, onClose)}
              </LinearGradient>
            </ImageBackground>
          ) : (
            <LinearGradient
              colors={isDark
                ? [theme.colors.surfaceVariant, theme.colors.background]
                : [theme.colors.primaryLight + '70', '#FFFFFF']}
              style={s.heroGradient}
            >
              {renderHeader(theme, isDark, mainScore, planTitle, onClose)}
            </LinearGradient>
          )}

          {/* İçerik */}
          <ScrollView
            style={[s.scrollContent, { backgroundColor: isDark ? theme.colors.background : theme.colors.surface }]}
            contentContainerStyle={s.scrollContentInner}
            showsVerticalScrollIndicator={false}
          >
            {/* Üst badge'ler */}
            {statBadges.length > 0 && (
              <View style={s.statRow}>
                {statBadges.map((b, i) => (
                  <StatBadge key={i} {...b} theme={theme} isDark={isDark} />
                ))}
              </View>
            )}

            {/* Durum badge'leri */}
            {evaluation && (
              <View style={s.statusBadgeRow}>
                {evaluation.fallback && (
                  <View style={[s.statusBadge, { backgroundColor: isDark ? theme.colors.surfaceVariant : '#FEF3C7', borderWidth: 1, borderColor: isDark ? theme.colors.border : '#FBBF2440' }]}>
                    <Icon name="AlertTriangle" size={12} color={isDark ? '#FBBF24' : '#D97706'} />
                    <Text style={[s.statusBadgeText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Kural tabanlı</Text>
                  </View>
                )}
                {!evaluation.fallback && evaluation.cached && (
                  <View style={[s.statusBadge, { backgroundColor: isDark ? theme.colors.surfaceVariant : '#F1F5F9', borderWidth: 1, borderColor: isDark ? theme.colors.border : '#47556940' }]}>
                    <Icon name="Database" size={12} color={theme.colors.muted} />
                    <Text style={[s.statusBadgeText, { color: theme.colors.muted }]}>Önbellekten</Text>
                  </View>
                )}
                {evaluation.modules && evaluation.modules.length > 0 && (
                  <View style={[s.statusBadge, { backgroundColor: isDark ? theme.colors.surfaceVariant : '#EFF6FF', borderWidth: 1, borderColor: isDark ? theme.colors.border : '#60A5FA30' }]}>
                    <Icon name="Layers" size={12} color={isDark ? '#60A5FA' : '#3B82F6'} />
                    <Text style={[s.statusBadgeText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>{evaluation.modules.length} modül</Text>
                  </View>
                )}
              </View>
            )}

            {/* Kategori kartları */}
            {categories.map((cat, idx) => (
              <CategoryCard
                key={idx}
                category={cat}
                theme={theme}
                isDark={isDark}
                destinationLat={destinationLat}
                destinationLng={destinationLng}
                onOpenCampingAreaDetails={onOpenCampingAreaDetails}
              />
            ))}

            {!evaluation && (
              <View style={s.emptyState}>
                <Icon name="SearchX" size={40} color={theme.colors.muted} />
                <Text style={[s.emptyText, { color: theme.colors.muted }]}>
                  Değerlendirme verisi bulunamadı.
                </Text>
              </View>
            )}

            {/* Yeniden değerlendir butonu */}
            {onRefresh && (
              <TouchableOpacity
                onPress={onRefresh}
                style={[s.refreshBtn, {
                  backgroundColor: isDark ? theme.colors.surfaceVariant : theme.colors.primaryLight + '50',
                  borderColor: isDark ? theme.colors.border : theme.colors.primary + '30',
                }]}
                activeOpacity={0.7}
              >
                <Icon name="RefreshCcw" size={16} color={theme.colors.primary} />
                <Text style={[s.refreshBtnText, { color: theme.colors.primary }]}>Yeniden Değerlendir</Text>
                {(typeof remaining === 'number' || typeof limit === 'number') && (
                  <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: isDark ? theme.colors.border : theme.colors.primary + '20', backgroundColor: isDark ? theme.colors.surfaceVariant : theme.colors.primaryLight + '20' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.primary }}>{typeof remaining === 'number' ? `Kalan ${remaining}` : 'Kalan ?'}{typeof limit === 'number' ? ` / ${limit}` : ''}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function renderHeader(
  theme: any,
  isDark: boolean,
  mainScore: string | null,
  planTitle: string | undefined,
  onClose: () => void,
) {
  return (
    <View style={s.headerContainer}>
      {/* Üst satır: Logo + Kapat */}
      <View style={s.headerTopRow}>
        <View style={s.headerTitleRow}>
          <View style={[s.sparkleCircle, {
            backgroundColor: isDark ? theme.colors.primary + '25' : theme.colors.primary + '15',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? theme.colors.primary + '50' : 'transparent',
          }]}>
            <Icon name="Sparkles" size={18} color={theme.colors.primary} />
          </View>
          <View>
            <Text style={[s.headerTitle, { color: theme.colors.text }]}>Kamp Defterim Değerlendirmesi</Text>
            {planTitle ? (
              <Text style={[s.headerSubtitle, { color: theme.colors.muted }]} numberOfLines={1}>
                {planTitle}
              </Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={[s.closeBtn, {
            backgroundColor: isDark ? theme.colors.surfaceVariant : '#F1F5F9',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? theme.colors.border : 'transparent',
          }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="X" size={18} color={isDark ? theme.colors.textSecondary : theme.colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Skor çemberi */}
      {mainScore && (
        <View style={s.scoreRow}>
          <ScoreCircle score={mainScore} theme={theme} isDark={isDark} />
          <Text style={[s.scoreLabel, { color: theme.colors.muted }]}>Kamp Alanı Puanı</Text>
        </View>
      )}
    </View>
  );
}

// ─── Stiller ───

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    flexDirection: 'column',
  },

  // Hero
  heroImage: {
    width: '100%',
    minHeight: 140,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  heroImageInner: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  heroOverlay: {
    flex: 1,
    paddingTop: 8,
    minHeight: 140,
  },
  heroGradient: {
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Header
  headerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sparkleCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Score
  scoreRow: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  scoreCircleOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircleInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },

  // Scroll
  scrollContent: {
    flex: 1,
    flexShrink: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },

  // Stat Badges
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flex: 1,
    minWidth: (SCREEN_WIDTH - 56) / 2 - 4,
    maxWidth: (SCREEN_WIDTH - 56) / 2,
  },
  statIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
  },
  statBadgeContent: {
    marginLeft: 8,
    flex: 1,
  },
  statBadgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.75,
  },
  statBadgeValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },

  // Status Badges
  statusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Category Card
  categoryCard: { borderRadius: 16, borderWidth: 1, marginBottom: 10, overflow: 'hidden', flexDirection: 'row' },
  categoryLeftBar: { width: 4 },
  categoryCardInner: { flex: 1, padding: 14 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  categoryIconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { fontSize: 14, fontWeight: '700', marginLeft: 10, flex: 1 },
  categoryDivider: { height: 1, marginBottom: 10 },
  highlightBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  highlightText: { fontSize: 12, fontWeight: '800' },

  // Sub-heading
  subheadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  subheadingRowSpaced: { marginTop: 8 },
  subheadingLine: { width: 3, height: 13, borderRadius: 2, marginRight: 7 },
  subheadingText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, flex: 1 },

  // Bullet
  categoryItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, paddingLeft: 2 },
  itemDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7, marginRight: 10, flexShrink: 0 },
  categoryItemText: { fontSize: 13, lineHeight: 19, flex: 1 },

  // Weather forecast cards (camp-plan style)
  fcScroll: { marginBottom: 6, marginLeft: -2 },
  fcCard: { width: 160, padding: 14, marginRight: 10, borderRadius: 14, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  fcDate: { fontSize: 15, fontWeight: '700' },
  fcSummary: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  fcFlashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  fcIconContainer: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  fcTempColumn: { justifyContent: 'center', alignItems: 'flex-start' },
  fcTempMax: { fontSize: 26, fontWeight: '800' },
  fcTempMin: { fontSize: 12, marginTop: 2 },
  fcDivider: { height: 1, marginTop: 10 },
  fcMeta: { marginTop: 8 },
  fcMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  fcMetaIcon: { marginRight: 6, fontSize: 12 },
  fcMetaText: { fontSize: 12, fontWeight: '500' },

  // Alert box
  alertBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 6, gap: 9 },
  alertIconCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alertBoxText: { fontSize: 12.5, lineHeight: 18, flex: 1, fontWeight: '500' },

  // Key-Value
  kvRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, paddingVertical: 3, paddingLeft: 2 },
  kvIconWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  kvLabel: { fontSize: 12.5, fontWeight: '500', flex: 1 },
  kvValue: { fontSize: 13, fontWeight: '700', marginLeft: 8 },

  // Chart Bar
  chartBarRow: { marginBottom: 7, paddingLeft: 2 },
  chartBarLabel: { fontSize: 12.5, fontWeight: '500', marginBottom: 4 },
  chartBarTrackWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 4 },
  chartBarValue: { fontSize: 11, fontWeight: '600', minWidth: 32, textAlign: 'right' },

  // Progress
  progressRow: { marginBottom: 7, paddingLeft: 2 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressLabel: { fontSize: 12.5, fontWeight: '500', flex: 1 },
  progressPct: { fontSize: 12, fontWeight: '700', marginLeft: 8 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Table
  tableContainer: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 6 },
  tableHeaderRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1 },
  tableHeaderCell: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  tableCell: { fontSize: 12, fontWeight: '500' },

  // Rating
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, paddingLeft: 2, gap: 8 },
  ratingLabel: { fontSize: 12.5, fontWeight: '500', flex: 1 },
  ratingStars: { flexDirection: 'row', gap: 2 },

  // Camp Suggestion Card
  campSuggCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, marginTop: 2 },
  campSuggHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  campSuggIconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  campSuggName: { fontSize: 13, fontWeight: '700', flex: 1, lineHeight: 18 },
  campSuggRatingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  campSuggRatingText: { fontSize: 11, fontWeight: '700', color: '#FBBF24' },
  campSuggMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  campSuggMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  campSuggMetaText: { fontSize: 11.5, fontWeight: '500' },
  campSuggDesc: { fontSize: 12, lineHeight: 17, marginTop: 2 },

  routeButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  routeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFF',
  },
  routeBtnDisabled: {
    opacity: 0.5,
  },
  routeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },

  // Refresh
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
  refreshBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
