import * as SunCalc from 'suncalc';

export interface SunPathShadowInfo {
  valid: boolean;
  referenceTime: Date;
  requestedTime: Date;
  usedSolarNoonFallback: boolean;
  isDaytime: boolean;
  sunAzimuthDegrees: number;
  sunAltitudeDegrees: number;
  shadowDirectionDegrees: number;
  shadowDirectionName: string;
}

export function getSunPathDirectionName(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;

  if (normalized >= 337.5 || normalized < 22.5) return 'Kuzey';
  if (normalized >= 22.5 && normalized < 67.5) return 'Kuzeydoğu';
  if (normalized >= 67.5 && normalized < 112.5) return 'Doğu';
  if (normalized >= 112.5 && normalized < 157.5) return 'Güneydoğu';
  if (normalized >= 157.5 && normalized < 202.5) return 'Güney';
  if (normalized >= 202.5 && normalized < 247.5) return 'Güneybatı';
  if (normalized >= 247.5 && normalized < 292.5) return 'Batı';
  return 'Kuzeybatı';
}

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function buildFallbackInfo(date: Date): SunPathShadowInfo {
  return {
    valid: false,
    referenceTime: date,
    requestedTime: date,
    usedSolarNoonFallback: false,
    isDaytime: false,
    sunAzimuthDegrees: 0,
    sunAltitudeDegrees: 0,
    shadowDirectionDegrees: 0,
    shadowDirectionName: 'Bilinmiyor',
  };
}

/**
 * SunPathDial ile aynı gölge yönü modelini uygular.
 *
 * Model özeti:
 * - SunCalc azimuth değeri dereceye çevrilir.
 * - SunPathDial'daki mevcut formül korunur: (azimuthRad * 180 / PI + 360) % 360
 * - Doğal gölge yönü güneş azimutunun 180° karşı yönüdür.
 *
 * fallbackToSolarNoon true ise güneş ufkun altındayken aynı günün solarNoon zamanı
 * referans alınır. Bu, Çadır/Karavan yönü ekranında gece de tutarlı öneri verebilmek içindir.
 */
export function getSunPathShadowInfo(
  latitude: number,
  longitude: number,
  date: Date = new Date(),
  options: { fallbackToSolarNoon?: boolean } = {},
): SunPathShadowInfo {
  if (!isValidCoordinate(latitude, longitude)) {
    return buildFallbackInfo(date);
  }

  const requestedTime = date;
  let referenceTime = date;
  let usedSolarNoonFallback = false;
  let position = SunCalc.getPosition(referenceTime, latitude, longitude);

  if (options.fallbackToSolarNoon && position.altitude <= 0) {
    const times = SunCalc.getTimes(date, latitude, longitude);
    if (times.solarNoon instanceof Date && !Number.isNaN(times.solarNoon.getTime())) {
      referenceTime = times.solarNoon;
      usedSolarNoonFallback = true;
      position = SunCalc.getPosition(referenceTime, latitude, longitude);
    }
  }

  const sunAzimuthDegrees = ((position.azimuth * 180) / Math.PI + 360) % 360;
  const sunAltitudeDegrees = (position.altitude * 180) / Math.PI;
  const shadowDirectionDegrees = (sunAzimuthDegrees + 180) % 360;

  return {
    valid: true,
    referenceTime,
    requestedTime,
    usedSolarNoonFallback,
    isDaytime: position.altitude > 0,
    sunAzimuthDegrees,
    sunAltitudeDegrees,
    shadowDirectionDegrees,
    shadowDirectionName: getSunPathDirectionName(shadowDirectionDegrees),
  };
}
