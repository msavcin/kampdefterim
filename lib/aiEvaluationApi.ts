import { API_URL } from './config';
import { apiFetch } from './apiFetch';

export interface AIEvaluationRequest {
  weather?: {
    days: Array<{
      date: string;
      maxTemp?: number | null;
      minTemp?: number | null;
      avgTemp?: number | null;
      pop?: number;
      wind_kph?: number;
      text?: string;
    }>;
    summary?: string;
  };
  campingArea?: {
    id?: number;
    /** Sunucu PostgreSQL campgrounds tablosunda eşleştirme için kullanılır */
    external_id?: string;
    name: string;
    lat: number;
    lng: number;
    type?: string;
    booking_url?: string;
  };
  nearbyAreas?: Array<{
    name: string;
    type?: string;
    distance_km: number;
    lat: number;
    lng: number;
    booking_url?: string;
  }>;
  announcements?: Array<{
    title: string;
    message?: string;
    valilik_id?: number;
    community_id?: number;
  }>;
  campType?: string;
  startDate?: string | null;
  endDate?: string | null;
  valilikId?: number | null;
  locationName?: string | null;
  userLocation?: { lat: number; lng: number } | null;
  /** İleride eklenecek modüller için genişletilebilir alan */
  [key: string]: any;
}

export interface AIEvaluationResponse {
  evaluation: string;
  generatedAt: string;
  modules: string[];
  cached: boolean;
  fallback: boolean;
  /**
   * Yapısal (structured) değerlendirme verisi.
   * Backend bunu gönderiyorsa client doğrudan kullanır, markdown parsing atlanır.
   * Gönderilmiyorsa (null/undefined) eski markdown parse davranışı devam eder.
   *
   * ─── BACKEND İÇİN STANDART ŞEMA ───
   *
   * Her kategori bir `EvalCategory` nesnesidir. `items` dizisi polimorfik:
   * item.type alanına göre farklı render uygulanır.
   *
   * ▸ "bullet"      → Madde işareti (basit metin satırı)
   * ▸ "subheading"  → Kategori içi alt başlık (kalın, aksan renkli sol çizgi)
   * ▸ "weather-day" → Hava durumu kartı (tarih, sıcaklık, yağış, rüzgar, durum)
   * ▸ "alert"       → Uyarı/tehlike/bilgi kutusu (ikonlu renkli kutu)
   * ▸ "key-value"   → Etiket-değer çifti (künye/badge satırı)
   * ▸ "chart-bar"   → Yatay bar grafik satırı (label + value + maxValue)
   * ▸ "progress"    → İlerleme çubuğu (%0-100)
   * ▸ "table"       → Tablo (başlık + satırlar)
   * ▸ "rating"          → Yıldız/puan gösterimi (1-5 veya 1-10)
   * ▸ "camp-suggestion" → Alternatif kamp alanı kartı (ad, mesafe, puan, tip, rezervasyon URL'i)
   *
   * Yeni item.type değerleri ileriye dönük eklenebilir;
   * client tanımadığı type'ları "bullet" olarak render eder (graceful fallback).
   *
   * Yeni kategoriler serbest: icon alanına Lucide ikon adı verilir, seviyeye göre renklenir.
   */
  structured?: EvalStructuredData | null;
}

// ─── Structured Evaluation Types ───

export interface EvalStructuredData {
  /** Genel puan (ör. "7.5/10"). Üst hero alanında gösterilir. */
  score?: string | null;
  /** Üst badge'lerde gösterilecek özet metrikler */
  stats?: EvalStat[];
  /** Değerlendirme kategorileri */
  categories: EvalCategory[];
}

export interface EvalStat {
  icon: string;             // Lucide icon adı: "Thermometer", "Wind", "CloudRain" vb.
  label: string;            // Kısa etiket: "Sıcaklık", "Rüzgar"
  value: string;            // Gösterim değeri: "18°C", "32 km/s"
  severity?: EvalSeverity;  // Renk tonu
}

export type EvalSeverity = 'good' | 'warning' | 'danger' | 'info';

export interface EvalCategory {
  /** Lucide ikon adı: "CloudSun", "Tent", "ShieldCheck" vb. */
  icon: string;
  /** Kategori başlığı: "Hava Durumu Analizi", "Kamp Alanı Değerlendirmesi" */
  title: string;
  /** Severity renk tonu */
  severity?: EvalSeverity;
  /** Başlık yanında gösterilen özet künye: "7.5/10", "18°C", "%32" */
  highlight?: string | null;
  /** Bu kategorinin hava durumu olup olmadığı (forecast kart görünümü) */
  isWeather?: boolean;
  /** Kategori içi item'lar — polimorfik, type alanına göre render edilir */
  items: EvalItem[];
}

/**
 * Polimorfik item tipi.
 * client tanımadığı type'ları `text` alanını bullet olarak render eder.
 */
export type EvalItem =
  | EvalItemBullet
  | EvalItemSubheading
  | EvalItemWeatherDay
  | EvalItemAlert
  | EvalItemKeyValue
  | EvalItemChartBar
  | EvalItemProgress
  | EvalItemTable
  | EvalItemRating
  | EvalItemCampSuggestion;

export interface EvalItemBullet {
  type: 'bullet';
  text: string;
}

export interface EvalItemSubheading {
  type: 'subheading';
  text: string;
}

export interface EvalItemWeatherDay {
  type: 'weather-day';
  /** Tarih etiketi: "15.04.2026" veya "15-16 Nisan" */
  date: string;
  /** Gündüz / ortalama sıcaklık °C */
  dayTemp?: number | null;
  /** Gece / minimum sıcaklık °C */
  nightTemp?: number | null;
  /** Yağış olasılığı 0-100 */
  rain?: number | null;
  /** Rüzgar hızı km/s */
  wind?: number | null;
  /** Hava durumu açıklaması: "Parçalı bulutlu", "Yağmurlu" */
  condition?: string | null;
  /** Opsiyonel metin notu */
  text?: string;
}

export interface EvalItemAlert {
  type: 'alert';
  text: string;
  severity: 'warning' | 'danger' | 'info';
  /** Lucide ikon adı, default: severity'ye göre otomatik */
  icon?: string;
}

export interface EvalItemKeyValue {
  type: 'key-value';
  label: string;
  value: string;
  /** Opsiyonel ikon */
  icon?: string;
  severity?: EvalSeverity;
}

export interface EvalItemChartBar {
  type: 'chart-bar';
  label: string;
  value: number;
  maxValue: number;
  /** Birim etiketi (°C, %, km/s) */
  unit?: string;
  color?: string;
}

export interface EvalItemProgress {
  type: 'progress';
  label: string;
  /** 0-100 arası yüzde */
  percent: number;
  color?: string;
}

export interface EvalItemTable {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface EvalItemRating {
  type: 'rating';
  label: string;
  /** Puan (ör. 4.2) */
  value: number;
  /** Maksimum puan (default 5) */
  max?: number;
}

/**
 * Alternatif kamp alanı önerisi kartı.
 * "Alternatif Kamp Önerileri" gibi kategorilerde kullanılır.
 *
 * Örnek:
 * {
 *   type: 'camp-suggestion',
 *   name: 'Abant Gölü Kamp Alanı',
 *   distance_km: 12.4,
 *   campType: 'Çadır + Karavan',
 *   rating: 4.2,
 *   description: 'Göl kenarı, ormanlık, tesis imkânı var.',
 *   booking_url: 'https://...',
 *   severity: 'good'
 * }
 */
export interface EvalItemCampSuggestion {
  type: 'camp-suggestion';
  /** Kamp alanı adı */
  name: string;
  /** Mevcut alana uzaklık (km) */
  distance_km?: number | null;
  /** Kamp tipi: "Çadır", "Karavan", "Çadır + Karavan" vb. */
  campType?: string | null;
  /** Kısa açıklama / öne çıkan özellikler */
  description?: string | null;
  /** Rezervasyon veya bilgi URL'i */
  booking_url?: string | null;
  /** Genel puan (0-5 arası float) */
  rating?: number | null;
  /** Kart renk tonu */
  severity?: EvalSeverity;
}

/**
 * Backend üzerindeki self-hosted LLM'den kamp planı AI değerlendirmesi alır.
 * Hata durumunda null döner (fallback mekanizması client tarafında devreye girer).
 */
export async function getAIEvaluation(planData: AIEvaluationRequest): Promise<AIEvaluationResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await apiFetch(`${API_URL}/planner/ai-evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planData }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (__DEV__) console.warn('[aiEvaluation] API yanıtı başarısız:', res.status);
      return null;
    }
    const data = await res.json();
    if (!data || !data.evaluation) return null;
    return data as AIEvaluationResponse;
  } catch (err) {
    if (__DEV__) console.warn('[aiEvaluation] hata:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
