/**
 * Pusula ve yön hesaplama modülü
 * Magnetometre verilerini işleyerek cihaz yönünü tespit eder
 */

import { Magnetometer } from 'expo-sensors';

export interface CompassReading {
  heading: number; // Derece cinsinden yön (0-360, Kuzey = 0)
  magneticField: {
    x: number;
    y: number;
    z: number;
  };
  accuracy: number; // 0-1 arası doğruluk
}

export interface DirectionInfo {
  degrees: number;
  cardinalDirection: string; // 'Kuzey', 'Doğu', vb.
  shortDirection: string;    // 'K', 'D', 'KD', vb.
}

/**
 * Magnetometre için izin kontrol eder
 */
export async function checkMagnetometerPermission(): Promise<boolean> {
  try {
    const { status } = await Magnetometer.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[CompassUtils] İzin kontrolü hatası:', error);
    return false;
  }
}

/**
 * Magnetometre mevcut mu kontrol eder
 */
export async function isMagnetometerAvailable(): Promise<boolean> {
  try {
    const isAvailable = await Magnetometer.isAvailableAsync();
    return isAvailable;
  } catch (error) {
    console.error('[CompassUtils] Magnetometre kontrol hatası:', error);
    return false;
  }
}

/**
 * Magnetometre verilerinden heading (yön) hesaplar
 * @param x Magnetometre X değeri
 * @param y Magnetometre Y değeri
 * @param z Magnetometre Z değeri
 */
export function calculateHeading(x: number, y: number, z: number): number {
  // Magnetometrenin yatay düzlem bileşenlerinden açı hesapla
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  
  // Açıyı 0-360 aralığına normalize et (Kuzey = 0)
  let heading = (angle + 360) % 360;
  
  // Magnetik kuzeyi gerçek kuzeye dönüştür (magnetic declination - isteğe bağlı)
  // Türkiye için ortalama ~5 derece doğuya sapma var, ancak lokasyona göre değişir
  // Şimdilik basit hesaplama kullanıyoruz
  
  return heading;
}

/**
 * Magnetometre verilerini smoothing (yumuşatma) için exponential moving average
 */
export class CompassSmoother {
  private alpha: number;
  private previousHeading: number | null = null;
  
  constructor(smoothingFactor: number = 0.2) {
    this.alpha = smoothingFactor; // 0-1 arası, düşük değer daha yumuşak
  }
  
  smooth(newHeading: number): number {
    if (this.previousHeading === null) {
      this.previousHeading = newHeading;
      return newHeading;
    }
    
    // Circular smoothing (360-0 geçişini düzgün halleder)
    let diff = newHeading - this.previousHeading;
    
    // 180 dereceden büyük farkları normalize et
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    this.previousHeading = (this.previousHeading + this.alpha * diff + 360) % 360;
    return this.previousHeading;
  }
  
  reset() {
    this.previousHeading = null;
  }
}

/**
 * Derece değerinden yön bilgisi üretir
 */
export function getDirectionInfo(degrees: number): DirectionInfo {
  const normalized = ((degrees % 360) + 360) % 360;
  
  let cardinalDirection: string;
  let shortDirection: string;
  
  if (normalized >= 337.5 || normalized < 22.5) {
    cardinalDirection = 'Kuzey';
    shortDirection = 'K';
  } else if (normalized >= 22.5 && normalized < 67.5) {
    cardinalDirection = 'Kuzeydoğu';
    shortDirection = 'KD';
  } else if (normalized >= 67.5 && normalized < 112.5) {
    cardinalDirection = 'Doğu';
    shortDirection = 'D';
  } else if (normalized >= 112.5 && normalized < 157.5) {
    cardinalDirection = 'Güneydoğu';
    shortDirection = 'GD';
  } else if (normalized >= 157.5 && normalized < 202.5) {
    cardinalDirection = 'Güney';
    shortDirection = 'G';
  } else if (normalized >= 202.5 && normalized < 247.5) {
    cardinalDirection = 'Güneybatı';
    shortDirection = 'GB';
  } else if (normalized >= 247.5 && normalized < 292.5) {
    cardinalDirection = 'Batı';
    shortDirection = 'B';
  } else {
    cardinalDirection = 'Kuzeybatı';
    shortDirection = 'KB';
  }
  
  return {
    degrees: normalized,
    cardinalDirection,
    shortDirection,
  };
}

/**
 * İki yön arasındaki açı farkını hesaplar (en kısa yol)
 * @param angle1 İlk açı (derece)
 * @param angle2 İkinci açı (derece)
 * @returns Açı farkı (-180 ile 180 arası)
 */
export function getAngleDifference(angle1: number, angle2: number): number {
  let diff = angle2 - angle1;
  
  // Normalize et: -180 ile 180 arası
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  
  return diff;
}

/**
 * Cihaz yönünün hedef yöne ne kadar yakın olduğunu hesaplar
 * @param currentHeading Mevcut heading (derece)
 * @param targetHeading Hedef heading (derece)
 * @returns 0-100 arası skor (100 = tam hedefte)
 */
export function calculateAlignmentScore(currentHeading: number, targetHeading: number): number {
  const diff = Math.abs(getAngleDifference(currentHeading, targetHeading));
  
  // 0 derece fark = 100 skor
  // 180 derece fark = 0 skor
  const score = Math.max(0, 100 - (diff / 180) * 100);
  
  return Math.round(score);
}

/**
 * Hizalama skoruna göre geri bildirim metni üretir
 */
export function getAlignmentFeedback(score: number): string {
  if (score >= 95) return '🎯 Mükemmel! Tam hedefte.';
  if (score >= 85) return '✅ Çok iyi! Neredeyse tam hizalandı.';
  if (score >= 70) return '👍 İyi! Hafif ayarlama yapabilirsiniz.';
  if (score >= 50) return '⚠️ Orta seviye. Daha fazla ayarlama gerekli.';
  if (score >= 30) return '❌ Zayıf. Yönü önemli ölçüde değiştirin.';
  return '🔄 Çok uzak. Tam ters yöne bakıyor olabilirsiniz.';
}

/**
 * Magnetometre subscription helper
 */
export class CompassListener {
  private subscription: any = null;
  private smoother: CompassSmoother;
  private callback: (reading: CompassReading) => void;
  
  constructor(callback: (reading: CompassReading) => void, smoothingFactor: number = 0.2) {
    this.callback = callback;
    this.smoother = new CompassSmoother(smoothingFactor);
  }
  
  /**
   * Magnetometre dinlemeyi başlatır
   * @param updateInterval Güncelleme aralığı (ms)
   */
  start(updateInterval: number = 100) {
    // Güncelleme hızını ayarla
    Magnetometer.setUpdateInterval(updateInterval);
    
    this.subscription = Magnetometer.addListener((data) => {
      const { x, y, z } = data;
      
      // Heading hesapla
      const rawHeading = calculateHeading(x, y, z);
      const smoothedHeading = this.smoother.smooth(rawHeading);
      
      // Doğruluk hesapla (manyetik alan gücüne göre)
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const accuracy = Math.min(1, magnitude / 100); // Basit doğruluk hesabı
      
      const reading: CompassReading = {
        heading: smoothedHeading,
        magneticField: { x, y, z },
        accuracy,
      };
      
      this.callback(reading);
    });
  }
  
  /**
   * Magnetometre dinlemeyi durdurur
   */
  stop() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.smoother.reset();
  }
  
  /**
   * Smoothing'i sıfırlar
   */
  reset() {
    this.smoother.reset();
  }
}

/**
 * Magnetic declination (manyetik sapma) hesaplar
 * Bu, magnetic north ile true north arasındaki farktır
 * @param latitude Enlem
 * @param longitude Boylam
 * @returns Sapma açısı (derece, + doğu, - batı)
 * 
 * NOT: Bu basitleştirilmiş bir hesaplama. Gerçek uygulamada WMM (World Magnetic Model) kullanılmalı
 */
export function getMagneticDeclination(latitude: number, longitude: number): number {
  // Türkiye için yaklaşık değerler:
  // Batı Türkiye: +3 derece
  // Orta Türkiye: +4 derece
  // Doğu Türkiye: +5 derece
  
  // Basit linear interpolasyon (longitude: 26-45 arası)
  const minLon = 26;
  const maxLon = 45;
  const minDec = 3;
  const maxDec = 5;
  
  if (longitude < minLon) return minDec;
  if (longitude > maxLon) return maxDec;
  
  const declination = minDec + ((longitude - minLon) / (maxLon - minLon)) * (maxDec - minDec);
  return declination;
}

/**
 * Magnetic heading'i true heading'e dönüştürür
 */
export function magneticToTrueHeading(magneticHeading: number, latitude: number, longitude: number): number {
  const declination = getMagneticDeclination(latitude, longitude);
  const trueHeading = (magneticHeading + declination + 360) % 360;
  return trueHeading;
}
