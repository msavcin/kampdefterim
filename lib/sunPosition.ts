/**
 * Güneş pozisyonu hesaplama modülü
 * Gün doğumu, batımı ve optimal çadır konumlandırması için güneş hesaplamaları
 */

import * as SunCalc from 'suncalc';
import { getSunPathShadowInfo, type SunPathShadowInfo } from './sunPathShadowModel';

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  sunriseEnd: Date;
  sunsetStart: Date;
  dawn: Date;
  dusk: Date;
  nauticalDawn: Date;
  nauticalDusk: Date;
  nightEnd: Date;
  night: Date;
  goldenHourEnd: Date;
  goldenHour: Date;
}

export interface SunPosition {
  altitude: number; // Güneşin yükseklik açısı (radyan)
  azimuth: number;  // Güneşin yatay açısı (radyan), güneyin 0 olduğu
  azimuthDegrees: number; // Derece cinsinden azimuth (0-360, Kuzey = 0)
  altitudeDegrees: number; // Derece cinsinden yükseklik
}

export interface OptimalTentOrientation {
  recommendedDirection: string; // Tavsiye edilen yön (Kuzey, Güneydoğu, vb.)
  directionDegrees: number; // Derece cinsinden yön (0-360)
  reasoning: string; // Neden bu yön önerildi
  shadeAnalysis: {
    morningShade: boolean;
    afternoonShade: boolean;
    allDayShade: boolean;
  };
  sunPath: {
    sunrise: number; // Gün doğumu azimuth (derece)
    sunset: number;  // Gün batımı azimuth (derece)
    noon: number;    // Öğlen azimuth (derece)
  };
  shadowModel?: SunPathShadowInfo; // SunPathDial ile aynı modelden doğal gölge yönü
}

/**
 * Belirli bir konum ve zamanda güneş zamanlarını hesaplar
 */
export function getSunTimes(latitude: number, longitude: number, date: Date = new Date()): SunTimes {
  return SunCalc.getTimes(date, latitude, longitude) as SunTimes;
}

/**
 * Belirli bir konum ve zamanda güneş pozisyonunu hesaplar
 */
export function getSunPosition(latitude: number, longitude: number, date: Date = new Date()): SunPosition {
  const pos = SunCalc.getPosition(date, latitude, longitude);
  
  // Azimuth'u kuzeyden başlayacak şekilde dönüştür (0° = Kuzey, 90° = Doğu, 180° = Güney, 270° = Batı)
  let azimuthDegrees = ((pos.azimuth * 180 / Math.PI) + 180) % 360;
  
  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
    azimuthDegrees,
    altitudeDegrees: pos.altitude * 180 / Math.PI,
  };
}

/**
 * Radyanı dereceye çevir
 */
function radToDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

/**
 * Dereceyi radyana çevir
 */
function degToRad(deg: number): number {
  return deg * Math.PI / 180;
}

/**
 * Mevsime göre güneş açısı ayarlaması
 */
function getSeasonalAdjustment(date: Date): number {
  const month = date.getMonth(); // 0-11
  
  // Kuzey yarımküre için mevsimsel faktör
  if (month >= 5 && month <= 7) {
    // Yaz ayları (Haziran-Ağustos): Güneş daha yüksekte
    return 15;
  } else if (month >= 11 || month <= 1) {
    // Kış ayları (Aralık-Şubat): Güneş daha alçakta
    return -15;
  } else if (month >= 2 && month <= 4) {
    // İlkbahar (Mart-Mayıs)
    return 5;
  } else {
    // Sonbahar (Eylül-Kasım)
    return -5;
  }
}

/**
 * Yön derecesini okunabilir metin haline getirir
 */
export function getDirectionName(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  
  if (normalized >= 337.5 || normalized < 22.5) return 'Kuzey';
  if (normalized >= 22.5 && normalized < 67.5) return 'Kuzeydoğu';
  if (normalized >= 67.5 && normalized < 112.5) return 'Doğu';
  if (normalized >= 112.5 && normalized < 157.5) return 'Güneydoğu';
  if (normalized >= 157.5 && normalized < 202.5) return 'Güney';
  if (normalized >= 202.5 && normalized < 247.5) return 'Güneybatı';
  if (normalized >= 247.5 && normalized < 292.5) return 'Batı';
  if (normalized >= 292.5 && normalized < 337.5) return 'Kuzeybatı';
  
  return 'Bilinmiyor';
}

/**
 * Optimal çadır konumlandırması hesaplar
 * @param latitude Enlem
 * @param longitude Boylam
 * @param date Tarih (varsayılan: şu an)
 * @param priorityShade Gölge önceliği (true ise gün boyu gölge, false ise sabah güneşi)
 */
export function calculateOptimalTentOrientation(
  latitude: number,
  longitude: number,
  date: Date = new Date(),
  priorityShade: boolean = true
): OptimalTentOrientation {
  const sunTimes = getSunTimes(latitude, longitude, date);
  
  // Gün doğumu, öğlen ve batımı pozisyonları
  const sunrisePos = getSunPosition(latitude, longitude, sunTimes.sunrise);
  const noonPos = getSunPosition(latitude, longitude, sunTimes.solarNoon);
  const sunsetPos = getSunPosition(latitude, longitude, sunTimes.sunset);
  
  // SunPathDial ile aynı modelden doğal gölge yönü
  const shadowModel = getSunPathShadowInfo(latitude, longitude, date, {
    fallbackToSolarNoon: true,
  });
  
  // Mevsimsel ayarlama
  const seasonalAdjustment = getSeasonalAdjustment(date);
  
  let recommendedDirection: string;
  let directionDegrees: number;
  let reasoning: string;
  let shadeAnalysis = {
    morningShade: false,
    afternoonShade: false,
    allDayShade: false,
  };
  
  if (priorityShade) {
    // Gölge öncelikli: SunPathDial'daki radar gölge modeliyle aynı hesap kullanılır.
    if (shadowModel.valid) {
      directionDegrees = shadowModel.shadowDirectionDegrees;
      recommendedDirection = shadowModel.shadowDirectionName;
      const referenceText = shadowModel.usedSolarNoonFallback
        ? 'güneş ufkun altında olduğu için öğle referansına göre'
        : 'mevcut güneş konumuna göre';
      reasoning = `Güneş Yolu Diyagramı ile aynı gölge modeli kullanıldı. ${referenceText} doğal gölge ${recommendedDirection} (${Math.round(directionDegrees)}°) yönüne düşüyor. Çadır/karavan kapınızı veya oturma alanınızı bu yöne alarak gölgeden yararlanabilirsiniz.`;
    } else {
      directionDegrees = 0 + seasonalAdjustment;
      recommendedDirection = getDirectionName(directionDegrees);
      reasoning = `Gölge modeli hesaplanamadı. Gün boyu maksimum gölge için çadır girişi ${recommendedDirection} yönüne bakmalı.`;
    }
    shadeAnalysis.allDayShade = true;
    shadeAnalysis.morningShade = true;
    shadeAnalysis.afternoonShade = true;
  } else {
    // Sabah güneşi öncelikli: Çadır girişi doğuya bakmalı
    directionDegrees = 90 + seasonalAdjustment;
    recommendedDirection = getDirectionName(directionDegrees);
    reasoning = `Sabah güneşinden faydalanmak için çadır girişi ${recommendedDirection} yönüne bakmalı. Sabah ısınmaya yardımcı olur, öğleden sonra gölgede kalır.`;
    shadeAnalysis.morningShade = false;
    shadeAnalysis.afternoonShade = true;
    shadeAnalysis.allDayShade = false;
  }
  
  return {
    recommendedDirection,
    directionDegrees,
    reasoning,
    shadeAnalysis,
    sunPath: {
      sunrise: sunrisePos.azimuthDegrees,
      sunset: sunsetPos.azimuthDegrees,
      noon: noonPos.azimuthDegrees,
    },
    shadowModel,
  };
}

/**
 * Belirli bir yönün gölge kalitesini değerlendirir
 * @param tentDirection Çadır girişinin baktığı yön (derece)
 * @param latitude Enlem
 * @param longitude Boylam
 * @param date Tarih
 */
export function evaluateTentDirection(
  tentDirection: number,
  latitude: number,
  longitude: number,
  date: Date = new Date()
): {
  score: number; // 0-100 arası skor (100 = mükemmel)
  feedback: string;
  willGetMorningSun: boolean;
  willGetAfternoonSun: boolean;
} {
  const sunTimes = getSunTimes(latitude, longitude, date);
  const sunrisePos = getSunPosition(latitude, longitude, sunTimes.sunrise);
  const noonPos = getSunPosition(latitude, longitude, sunTimes.solarNoon);
  const sunsetPos = getSunPosition(latitude, longitude, sunTimes.sunset);
  
  const normalized = ((tentDirection % 360) + 360) % 360;
  
  // Çadır girişi ile güneş yönü arasındaki fark
  const sunriseAngleDiff = Math.abs(normalized - sunrisePos.azimuthDegrees);
  const sunsetAngleDiff = Math.abs(normalized - sunsetPos.azimuthDegrees);
  
  const willGetMorningSun = sunriseAngleDiff < 90;
  const willGetAfternoonSun = sunsetAngleDiff < 90;
  
  let score = 50; // Başlangıç skoru
  let feedback = '';
  
  // Kuzey yönü (0-45 derece) - En iyi gölge
  if (normalized >= 315 || normalized <= 45) {
    score = 95;
    feedback = 'Mükemmel! Çadırınız gün boyu gölgede kalacak.';
  }
  // Doğu yönü (45-135 derece) - Sabah güneşi
  else if (normalized > 45 && normalized <= 135) {
    score = 75;
    feedback = 'İyi! Sabah güneşinden faydalanacak, öğleden sonra serin olacak.';
  }
  // Güney yönü (135-225 derece) - Tüm gün güneş
  else if (normalized > 135 && normalized <= 225) {
    score = 30;
    feedback = 'Dikkat! Çadırınız tüm gün güneş alacak, çok sıcak olabilir.';
  }
  // Batı yönü (225-315 derece) - Öğleden sonra güneşi
  else {
    score = 50;
    feedback = 'Orta seviye. Öğleden sonra sıcak olabilir, sabahları serin.';
  }
  
  return {
    score,
    feedback,
    willGetMorningSun,
    willGetAfternoonSun,
  };
}

/**
 * Gün içinde belirli saatler için güneş pozisyonlarını hesaplar
 * (Güneş yolu görselleştirmesi için)
 */
export function getSunPathForDay(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Array<{ hour: number; position: SunPosition }> {
  const result: Array<{ hour: number; position: SunPosition }> = [];
  
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  
  for (let hour = 0; hour < 24; hour++) {
    const timePoint = new Date(dayStart);
    timePoint.setHours(hour);
    
    const position = getSunPosition(latitude, longitude, timePoint);
    
    // Sadece güneş ufkun üzerindeyse ekle
    if (position.altitudeDegrees > -6) {
      result.push({ hour, position });
    }
  }
  
  return result;
}
