/**
 * SunPathDial — Kampfire Gold Luxury Chronograph (Radar Gölge & Gelişmiş Kamp İkonu)
 * ---------------------------------------------------------------------------------
 * YENİLİKLER & GÜNCELLEMELER:
 * 1. Pusula Canlı Modunda Gölge Desteği: Gölge vektörü ve radar taraması
 *    dönen pusula grubunun (dialRotation) içerisine alınarak pusula aktifken de
 *    kadrana tam kilitli biçimde sorunsuz gösterilir.
 * 2. Radar Taraması Şeklinde Gölge Barı (Radar Cone Sweep): Düz çizgi yerine
 *    güneşin yüksekliği ve açısına göre açısal kavis çizen, dereceli ve
 *    saydam degrade dolgulu yüksek görünürlüklü radar gölge konisi.
 * 3. Detaylı & Şık Kamp İkonu: Çadır formu, açık kapı detayı, sabitleme
 *    çizgileri ve önündeki minyatür kamp ateşi detayı ile 1.5px Precision Gold.
 * 4. Yön Hizalaması: Sol taraf (Batı) SAĞA YASLI, Sağ taraf (Doğu) SOLA YASLI,
 *    etiketler "GÜN BATIMI" ve "GÜN DOĞUMU".
 * 5. Sürükleme Sınırı: Gün batımı saatinden (maxHour) sonra slider %100'de kilitlenir.
 */

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  TouchableOpacity,
} from 'react-native';
import Svg, {
  Circle,
  Path,
  G,
  Text as SvgText,
  Defs,
  Filter,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  LinearGradient,
  Stop,
  Line,
} from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { Magnetometer, Accelerometer } from 'expo-sensors';
import { emit as emitEvent } from '@/lib/eventBus';
import { getSunPathShadowInfo } from '@/lib/sunPathShadowModel';

export interface SunPathDialProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  primary: string;
  primarySoft: string;
  text: string;
  muted: string;
  surface: string;
  containerStyle?: object;
  compassActive?: boolean;
  onToggleCompass?: () => void;
}

interface ComputedSun {
  sunrise: Date | null;
  solarNoon: Date | null;
  sunset: Date | null;
  sunriseAzDeg: number;
  noonAzDeg: number;
  sunsetAzDeg: number;
  altitudeDeg: number;
  valid: boolean;
}

function timeStr(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function timeStrHM(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function azToPoint(azDeg: number, r: number, cx: number, cy: number) {
  const rad = (azDeg * Math.PI) / 180;
  const x = cx + Math.sin(rad) * r;
  const y = cy - Math.cos(rad) * r;
  return { x, y };
}

function dateToHours(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

function sunCalcAzimuthToCompassDegrees(azimuthRad: number): number {
  return ((azimuthRad * 180) / Math.PI + 180) % 360;
}

function hoursToDate(hours: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setHours(Math.floor(hours));
  d.setMinutes(Math.round((hours - Math.floor(hours)) * 60));
  d.setSeconds(0, 0);
  return d;
}

function getDirText(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return 'Kuzey';
  if (norm >= 22.5 && norm < 67.5) return 'Kuzeydoğu';
  if (norm >= 67.5 && norm < 112.5) return 'Doğu';
  if (norm >= 112.5 && norm < 157.5) return 'Güneydoğu';
  if (norm >= 157.5 && norm < 202.5) return 'Güney';
  if (norm >= 202.5 && norm < 247.5) return 'Güneybatı';
  if (norm >= 247.5 && norm < 292.5) return 'Batı';
  return 'Kuzeybatı';
}

export default function SunPathDial({
  latitude,
  longitude,
  primary,
  primarySoft,
  text,
  muted,
  surface,
  containerStyle,
  compassActive = false,
  onToggleCompass,
}: SunPathDialProps) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const magRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const accRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);

  const today = useMemo(() => new Date(), []);

  const sun = useMemo<ComputedSun>(() => {
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return {
        sunrise: null,
        solarNoon: null,
        sunset: null,
        sunriseAzDeg: 0,
        noonAzDeg: 180,
        sunsetAzDeg: 0,
        altitudeDeg: 0,
        valid: false,
      };
    }
    const now = new Date();
    const times = SunCalc.getTimes(now, latitude, longitude);
    const noonPos = SunCalc.getPosition(times.solarNoon ?? now, latitude, longitude);
    const sunrisePos = SunCalc.getPosition(times.sunrise ?? now, latitude, longitude);
    const sunsetPos = SunCalc.getPosition(times.sunset ?? now, latitude, longitude);

    return {
      sunrise: times.sunrise ?? null,
      solarNoon: times.solarNoon ?? null,
      sunset: times.sunset ?? null,
      sunriseAzDeg: sunCalcAzimuthToCompassDegrees(sunrisePos.azimuth),
      noonAzDeg: sunCalcAzimuthToCompassDegrees(noonPos.azimuth),
      sunsetAzDeg: sunCalcAzimuthToCompassDegrees(sunsetPos.azimuth),
      altitudeDeg: noonPos.altitude,
      valid: true,
    };
  }, [latitude, longitude]);

  const selectedTime = useMemo<Date>(() => {
    if (selectedHour == null) return new Date();
    return hoursToDate(selectedHour, today);
  }, [selectedHour, today]);

  const selectedSun = useMemo(() => {
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return { azimuth: 0, altitude: 0 };
    }
    const pos = SunCalc.getPosition(selectedTime, latitude, longitude);
    return { azimuth: pos.azimuth, altitude: pos.altitude };
  }, [selectedTime, latitude, longitude]);

  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 56;
  const rMid = 44;
  const rInner = 28;
  const rSunPath = rOuter - 5;

  const sunRise = azToPoint(sun.sunriseAzDeg, rSunPath, cx, cy);
  const sunSet = azToPoint(sun.sunsetAzDeg, rSunPath, cx, cy);

  const isDaytime = selectedSun.altitude > 0;
  const rCurrentSun = rSunPath;
  const currentSun = isDaytime
    ? azToPoint(sunCalcAzimuthToCompassDegrees(selectedSun.azimuth), rCurrentSun, cx, cy)
    : null;

  // Radar Gölge Konisi Hesaplaması — paylaşılan SunPathDial gölge modeli
  const shadowInfo = useMemo(() => {
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return null;
    }
    return getSunPathShadowInfo(latitude, longitude, selectedTime, {
      fallbackToSolarNoon: false,
    });
  }, [latitude, longitude, selectedTime]);
  const sunAzDeg = shadowInfo?.sunAzimuthDegrees ?? 0;
  const shadowAzDeg = shadowInfo?.shadowDirectionDegrees ?? 0;
  
  const SHADOW_MAX = 38;
  const shadowLen = isDaytime
    ? Math.max(16, SHADOW_MAX * (1 - selectedSun.altitude / 90))
    : 0;

  // Radar Yelpazesi (Sector Wedge - 24 derece genişlik)
  const RADAR_HALF_ANGLE = 12;
  const shadowStartAz = (shadowAzDeg - RADAR_HALF_ANGLE + 360) % 360;
  const shadowEndAz = (shadowAzDeg + RADAR_HALF_ANGLE + 360) % 360;

  // Ortadaki kamp çemberinin tam dış sınır çizgisi (radius 14.2)
  const rCenterDisc = 14.2;
  const pInner1 = azToPoint(shadowStartAz, rCenterDisc, cx, cy);
  const pInner2 = azToPoint(shadowEndAz, rCenterDisc, cx, cy);
  const pOuter1 = azToPoint(shadowStartAz, shadowLen, cx, cy);
  const pOuter2 = azToPoint(shadowEndAz, shadowLen, cx, cy);
  const shadowCenterPt = azToPoint(shadowAzDeg, shadowLen, cx, cy);
  const pCenterBase = azToPoint(shadowAzDeg, rCenterDisc, cx, cy);

  // Radar konisi path d dizesi (İç çember dış sınırına tam kavisli kilit)
  const radarWedgePath = `M ${pInner1.x} ${pInner1.y} L ${pOuter1.x} ${pOuter1.y} A ${shadowLen} ${shadowLen} 0 0 1 ${pOuter2.x} ${pOuter2.y} L ${pInner2.x} ${pInner2.y} A ${rCenterDisc} ${rCenterDisc} 0 0 0 ${pInner1.x} ${pInner1.y} Z`;
  const radarArcRimPath = `M ${pOuter1.x} ${pOuter1.y} A ${shadowLen} ${shadowLen} 0 0 1 ${pOuter2.x} ${pOuter2.y}`;

  const shadowDirName = shadowInfo?.shadowDirectionName ?? getDirText(shadowAzDeg);

  const arcPath = `M ${sunRise.x} ${sunRise.y} Q ${cx} ${cy - rSunPath - 10} ${sunSet.x} ${sunSet.y}`;

  function sideFor(azDeg: number): 'left' | 'right' {
    const p = azToPoint(azDeg, rSunPath, cx, cy);
    return p.x >= cx ? 'right' : 'left';
  }

  const riseSide = sideFor(sun.sunriseAzDeg);
  const setSide = sideFor(sun.sunsetAzDeg);

  const intermediateDirectionLabels = useMemo(
    () =>
      [
        { deg: 45, label: 'KD' },
        { deg: 135, label: 'GD' },
        { deg: 225, label: 'GB' },
        { deg: 315, label: 'KB' },
      ].map((item) => ({
        ...item,
        p: azToPoint(item.deg, rOuter + 8, cx, cy),
      })),
    [rOuter, cx, cy],
  );

  const minHour = sun.sunrise ? dateToHours(sun.sunrise) : 5.8;
  const maxHour = sun.sunset ? dateToHours(sun.sunset) : 20.25;

  const [trackWidth, setTrackWidth] = useState(0);
  const trackLayout = useRef({ x: 0, width: 0 });

  const hourFromX = useCallback(
    (x: number) => {
      const { x: tx, width: tw } = trackLayout.current;
      if (tw <= 0) return minHour;
      const ratio = Math.max(0, Math.min(1, (x - tx) / tw));
      return minHour + ratio * (maxHour - minHour);
    },
    [minHour, maxHour],
  );

  const xFromHour = useCallback(
    (h: number) => {
      const { width: tw } = trackLayout.current;
      if (tw <= 0 || maxHour === minHour) return 0;
      const ratio = (h - minHour) / (maxHour - minHour);
      return ratio * tw;
    },
    [minHour, maxHour],
  );

  const hourFromXRef = useRef(hourFromX);

  useEffect(() => {
    hourFromXRef.current = hourFromX;
  }, [hourFromX]);

  const trackPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        emitEvent('kampfire:sunTimelineInteractionStart');
        setSelectedHour(hourFromXRef.current(evt.nativeEvent.locationX));
      },
      onPanResponderMove: (evt) => {
        emitEvent('kampfire:sunTimelineInteractionMove');
        setSelectedHour(hourFromXRef.current(evt.nativeEvent.locationX));
      },
      onPanResponderRelease: () => {
        emitEvent('kampfire:sunTimelineInteractionEnd');
      },
      onPanResponderTerminate: () => {
        emitEvent('kampfire:sunTimelineInteractionEnd');
      },
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    trackLayout.current = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    };
    setTrackWidth(e.nativeEvent.layout.width);
  };

  useEffect(() => {
    if (!compassActive) {
      Magnetometer.removeAllListeners();
      Accelerometer.removeAllListeners();
      magRef.current = null;
      accRef.current = null;
      setHeadingDeg(null);
      return undefined;
    }

    let lastUpdate = 0;
    const UPDATE_INTERVAL_MS = 100;
    const recompute = () => {
      const now = Date.now();
      if (now - lastUpdate < UPDATE_INTERVAL_MS) return;
      lastUpdate = now;

      const m = magRef.current;
      const a = accRef.current;
      if (!m || !a) return;

      const gMag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      if (gMag < 0.0001) return;
      const gx = a.x / gMag;
      const gy = a.y / gMag;
      const gz = a.z / gMag;

      const dot = m.x * gx + m.y * gy + m.z * gz;
      const hx = m.x - dot * gx;
      const hy = m.y - dot * gy;

      const headingRad = Math.atan2(hx, hy);
      let heading = (headingRad * 180) / Math.PI;
      heading = (heading + 360) % 360;
      setHeadingDeg(heading);
    };

    try {
      Magnetometer.setUpdateInterval(UPDATE_INTERVAL_MS);
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
    } catch {
      // ignore
    }

    const magSub = Magnetometer.addListener((data) => {
      magRef.current = { x: data.x, y: data.y, z: data.z };
      recompute();
    });
    const accSub = Accelerometer.addListener((data) => {
      accRef.current = { x: data.x, y: data.y, z: data.z };
      recompute();
    });

    return () => {
      try {
        magSub.remove();
        accSub.remove();
      } catch {
        // ignore
      }
    };
  }, [compassActive]);

  const dialRotation = compassActive && headingDeg != null ? -headingDeg : 0;

  // Gerçek zaman batış saatinin üstündeyse, kaydırma çubuğunun gün batımından sonra ilerlemesini engeller.
  const rawHour = selectedHour ?? dateToHours(new Date());
  const effectiveHour = Math.max(minHour, Math.min(maxHour, rawHour));
  const handleX = xFromHour(effectiveHour);
  const handleLeft = Math.max(0, Math.min(trackWidth - 1, handleX));

  const filledRatio = Math.max(0, Math.min(1, (effectiveHour - minHour) / Math.max(0.001, maxHour - minHour)));
  const filledWidth = filledRatio * trackWidth;

  const ticks = useMemo(() => {
    const tickArray = [];
    for (let deg = 0; deg < 360; deg += 10) {
      const isMajor = deg % 90 === 0;
      const innerR = isMajor ? rOuter - 6 : rOuter - 3;
      const p1 = azToPoint(deg, innerR, cx, cy);
      const p2 = azToPoint(deg, rOuter, cx, cy);
      tickArray.push({ deg, p1, p2, isMajor });
    }
    return tickArray;
  }, [rOuter, cx, cy]);

  return (
    <View style={[styles.root, containerStyle]}>
      <View style={styles.bodyRow}>
        {/* Sol Taraf Metin Sütunu (Soldaysa -> SAĞA YASLI) */}
        {sun.valid && (riseSide === 'left' || setSide === 'left') && (
          <View style={styles.sideColLeft}>
            {riseSide === 'left' ? (
              <>
                <Text style={[styles.sideLabel, styles.textRight, { color: muted }]} numberOfLines={1}>
                  GÜN DOĞUMU
                </Text>
                <Text style={[styles.sideValue, styles.textRight, { color: primary }]}>
                  {timeStr(sun.sunrise)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.sideLabel, styles.textRight, { color: muted }]} numberOfLines={1}>
                  GÜN BATIMI
                </Text>
                <Text style={[styles.sideValue, styles.textRight, { color: primary }]}>
                  {timeStr(sun.sunset)}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Orta: SVG Kadran */}
        <View style={styles.dialWrap}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Defs>
              <Filter id="chronoSunGlow" x="-50%" y="-50%" width="200%" height="200%">
                <FeGaussianBlur stdDeviation="2.5" result="blur" />
                <FeMerge>
                  <FeMergeNode in="blur" />
                  <FeMergeNode in="SourceGraphic" />
                </FeMerge>
              </Filter>
              <LinearGradient id="chronoArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={primary} stopOpacity={0.3} />
                <Stop offset="50%" stopColor="#F5D78B" stopOpacity={0.9} />
                <Stop offset="100%" stopColor={primary} stopOpacity={0.3} />
              </LinearGradient>
              {/* Radar Gölge Koni Degrade Filtresi */}
              <LinearGradient id="radarShadowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={primary} stopOpacity={0.45} />
                <Stop offset="70%" stopColor={primary} stopOpacity={0.2} />
                <Stop offset="100%" stopColor={primary} stopOpacity={0.05} />
              </LinearGradient>
            </Defs>

            {/* Pusulayla Dönen Grup (Pusula Aktifken Gölge de Birlikte Döner!) */}
            <G rotation={dialRotation} origin={`${cx}, ${cy}`}>
              <Circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={primary} strokeWidth={1.2} strokeOpacity={0.4} />
              <Circle cx={cx} cy={cy} r={rMid} fill="none" stroke={primarySoft} strokeWidth={1} strokeDasharray="1 3" />
              <Circle cx={cx} cy={cy} r={rInner} fill="none" stroke={primarySoft} strokeWidth={1} />

              {ticks.map((t) => (
                <Line
                  key={t.deg}
                  x1={t.p1.x}
                  y1={t.p1.y}
                  x2={t.p2.x}
                  y2={t.p2.y}
                  stroke={primary}
                  strokeWidth={t.isMajor ? 1.2 : 0.8}
                  strokeOpacity={t.isMajor ? 0.7 : 0.3}
                />
              ))}

              <SvgText x={cx} y={cy - rOuter - 3} textAnchor="middle" fill={primary} fontSize={10} fontWeight="800">
                K
              </SvgText>
              <SvgText x={cx + rOuter + 7} y={cy + 3.5} textAnchor="middle" fill={muted} fontSize={9} fontWeight="700">
                D
              </SvgText>
              <SvgText x={cx} y={cy + rOuter + 10} textAnchor="middle" fill={muted} fontSize={9} fontWeight="700">
                G
              </SvgText>
              <SvgText x={cx - rOuter - 7} y={cy + 3.5} textAnchor="middle" fill={muted} fontSize={9} fontWeight="700">
                B
              </SvgText>

              {intermediateDirectionLabels.map((dir) => (
                <SvgText
                  key={dir.label}
                  x={dir.p.x}
                  y={dir.p.y + 2.5}
                  textAnchor="middle"
                  fill={muted}
                  fontSize={6.8}
                  fontWeight="700"
                  opacity={0.82}
                >
                  {dir.label}
                </SvgText>
              ))}

              <Path
                d={arcPath}
                fill="none"
                stroke="url(#chronoArcGrad)"
                strokeWidth={1.8}
                strokeDasharray="3 3"
              />

              {/* RADAR GÖLGE BARI (Pusula Dönerken De Tam Uyumlu) */}
              {sun.valid && isDaytime && (
                <G id="radarShadowCone">
                  {/* Radar Konisi Yelpazesi */}
                  <Path
                    d={radarWedgePath}
                    fill="url(#radarShadowGrad)"
                    stroke={primary}
                    strokeWidth={0.8}
                    strokeOpacity={0.4}
                    strokeDasharray="2 2"
                  />
                  {/* Radar Konisi Çerçeve Yayı */}
                  <Path
                    d={radarArcRimPath}
                    fill="none"
                    stroke={primary}
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                  />
                  {/* Orta Ekseni Taraması (Çember dışından başlar) */}
                  <Line
                    x1={pCenterBase.x}
                    y1={pCenterBase.y}
                    x2={shadowCenterPt.x}
                    y2={shadowCenterPt.y}
                    stroke={primary}
                    strokeWidth={1.2}
                    strokeOpacity={0.85}
                    strokeDasharray="3 2"
                  />
                  {/* Uç Radar Noktası */}
                  <Circle cx={shadowCenterPt.x} cy={shadowCenterPt.y} r={2.5} fill={primary} opacity={0.9} />
                </G>
              )}

              {sun.valid && (
                <G>
                  <Circle cx={sunRise.x} cy={sunRise.y} r={4} fill={primary} opacity={0.8} />
                  <Circle cx={sunSet.x} cy={sunSet.y} r={4} fill={primary} opacity={0.8} />
                </G>
              )}

              {sun.valid && isDaytime && currentSun && (
                <G>
                  <Circle
                    cx={currentSun.x}
                    cy={currentSun.y}
                    r={5.5}
                    fill="#F5D78B"
                    filter="url(#chronoSunGlow)"
                  />
                  <Circle
                    cx={currentSun.x}
                    cy={currentSun.y}
                    r={8.5}
                    fill="none"
                    stroke="#F5D78B"
                    strokeWidth={0.8}
                    strokeOpacity={0.6}
                  />
                </G>
              )}
            </G>

            {/* MERKEZ ŞIK KAMP İKONU (Sabit Çadır + Kamp Ateşi Vektörü) */}
            {sun.valid && (
              <G id="centerCampIcon">
                {/* Dış Halkalı Fon Diski */}
                <Circle cx={cx} cy={cy} r={14} fill={surface} stroke={primary} strokeWidth={1.2} />

                {/* 1.5px Gold Lineart Çadır Gövdesi */}
                <Path
                  d={`M ${cx - 7} ${cy + 4} L ${cx} ${cy - 7} L ${cx + 7} ${cy + 4} Z`}
                  fill={primarySoft}
                  stroke={primary}
                  strokeWidth={1.3}
                  strokeLinejoin="round"
                />
                {/* Çadır Açık Kapı Yarığı */}
                <Path
                  d={`M ${cx - 2.5} ${cy + 4} L ${cx} ${cy - 2} L ${cx + 2.5} ${cy + 4} Z`}
                  fill={surface}
                  stroke={primary}
                  strokeWidth={1}
                />
                {/* Direk & İp Çizgileri */}
                <Line x1={cx} y1={cy - 7} x2={cx} y2={cy - 2} stroke={primary} strokeWidth={1.2} />
                <Line x1={cx - 7} y1={cy + 4} x2={cx - 9} y2={cy + 6} stroke={primary} strokeWidth={1} />
                <Line x1={cx + 7} y1={cy + 4} x2={cx + 9} y2={cy + 6} stroke={primary} strokeWidth={1} />

                {/* Minyatür Kamp Ateşi Alevi Detayı */}
                <Path
                  d={`M ${cx - 1.5} ${cy + 6} Q ${cx} ${cy + 4} ${cx + 1.5} ${cy + 6} Q ${cx} ${cy + 2.5} ${cx - 1.5} ${cy + 6} Z`}
                  fill="#F5D78B"
                  stroke={primary}
                  strokeWidth={0.6}
                />

                {!isDaytime && (
                  <G>
                    <Circle cx={cx} cy={cy - 6} r={5} fill={muted} opacity={0.85} />
                    <Circle cx={cx + 2} cy={cy - 7} r={4} fill={surface} />
                    <Circle cx={cx - 18} cy={cy - 14} r={1} fill={primary} opacity={0.8} />
                    <Circle cx={cx + 18} cy={cy - 10} r={1.2} fill={primary} opacity={0.8} />
                  </G>
                )}
              </G>
            )}
          </Svg>
        </View>

        {/* Sağ Taraf Metin Sütunu (Sağdaysa -> SOLA YASLI) */}
        {sun.valid && (riseSide === 'right' || setSide === 'right') && (
          <View style={styles.sideColRight}>
            {riseSide === 'right' ? (
              <>
                <Text style={[styles.sideLabel, styles.textLeft, { color: muted }]} numberOfLines={1}>
                  GÜN DOĞUMU
                </Text>
                <Text style={[styles.sideValue, styles.textLeft, { color: primary }]}>
                  {timeStr(sun.sunrise)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.sideLabel, styles.textLeft, { color: muted }]} numberOfLines={1}>
                  GÜN BATIMI
                </Text>
                <Text style={[styles.sideValue, styles.textLeft, { color: primary }]}>
                  {timeStr(sun.sunset)}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Alt: Timeline Slider */}
      {sun.valid && (
        <View style={styles.timelineBlock}>
          <View style={styles.timelineHeader}>
            <Text style={[styles.timelineHeaderText, { color: muted }]}>
              {selectedHour == null ? 'Şu an' : 'Seçili saat'}
            </Text>
            <View style={styles.timelineHeaderRight}>
              {onToggleCompass && (
                <TouchableOpacity
                  style={[
                    styles.compassButton,
                    {
                      backgroundColor: compassActive ? primary : primarySoft,
                      borderColor: primary,
                    },
                  ]}
                  onPress={onToggleCompass}
                  activeOpacity={0.7}
                  accessibilityLabel={compassActive ? 'Pusulayı kapat' : 'Pusulayı aç'}
                >
                  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 2 L15 12 L12 10 L9 12 Z" fill="#E07A7A" />
                    <Path
                      d="M12 22 L9 12 L12 14 L15 12 Z"
                      fill={compassActive ? surface : muted}
                      opacity={compassActive ? 0.9 : 1}
                    />
                    <Circle cx={12} cy={12} r={1.5} fill={compassActive ? surface : primary} />
                  </Svg>
                </TouchableOpacity>
              )}
              <Text style={[styles.timelineHeaderValue, { color: primary }]}>
                {timeStrHM(selectedTime)}
              </Text>
              {selectedHour != null && (
                <TouchableOpacity
                  style={[
                    styles.nowButton,
                    {
                      backgroundColor: primarySoft,
                      borderColor: primary,
                    },
                  ]}
                  onPress={() => setSelectedHour(null)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.nowButtonText, { color: primary }]}>Şimdi</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Slider track */}
          <View
            style={[styles.sliderTrack, { backgroundColor: primarySoft }]}
            onLayout={handleLayout}
            {...trackPanResponder.panHandlers}
          >
            <View
              style={[
                styles.sliderFill,
                {
                  width: filledWidth,
                  backgroundColor: primary,
                },
              ]}
              pointerEvents="none"
            />
            {sun.solarNoon && (() => {
              const noonHour = dateToHours(sun.solarNoon);
              if (noonHour >= minHour && noonHour <= maxHour) {
                const x = xFromHour(noonHour);
                return (
                  <View
                    style={[
                      styles.sliderNoonMark,
                      {
                        left: x - 1,
                        backgroundColor: primary,
                      },
                    ]}
                    pointerEvents="none"
                  />
                );
              }
              return null;
            })()}
            <View
              style={[
                styles.sliderHandle,
                {
                  left: handleLeft - 7,
                  borderColor: primary,
                  backgroundColor: surface,
                },
              ]}
              pointerEvents="none"
            />
          </View>

          <View style={styles.sliderLabels}>
            <Text style={[styles.sliderLabelText, { color: muted }]}>
              {timeStrHM(sun.sunrise)}
            </Text>
            <Text style={[styles.sliderLabelText, { color: muted }]}>
              {timeStrHM(sun.sunset)}
            </Text>
          </View>
        </View>
      )}

      {/* En alt: Güneş yüksekliği */}
      <View style={styles.elevRow}>
        <Text style={[styles.elevLabel, { color: muted }]}>Güneş Yüksekliği (öğle)</Text>
        <Text style={[styles.elevValue, { color: text }]}>
          {sun.valid ? `${Math.round(sun.altitudeDeg)}°` : '—'}
        </Text>
      </View>

      {/* Gölgeden Yararlanma Rehberi & Bilgilendirme İpucu Kartı */}
      {sun.valid && (
        <View style={[styles.adviceBox, { backgroundColor: primarySoft, borderColor: primary + '33' }]}>
          <View style={styles.adviceHeaderRow}>
            <Text style={[styles.adviceTitle, { color: primary }]}>
              💡 GÖLGE VE ÇADIR YÖNLENDİRME REHBERİ
            </Text>
            {isDaytime && (
              <View style={[styles.dirBadge, { backgroundColor: primary }]}>
                <Text style={[styles.dirBadgeText, { color: surface }]}>
                  {shadowDirName} ({Math.round(shadowAzDeg)}°)
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.adviceText, { color: text }]}>
            {isDaytime
              ? `Sarı radar yelpazesi, çadırın ${shadowDirName} yönüne düşen doğal gölge alanını gösterir. Çadır kapınızı veya oturma alanınızı ${shadowDirName} tarafına kurarak doğrudan gölgeden yararlanabilirsiniz.`
              : 'Güneş ufkun altındadır. Gece çadırınızı sabah ilk güneşini Doğu aksından alacak veya gün boyu serin kalması için Kuzey yönüne bakacak şekilde kurabilirsiniz.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideColLeft: {
    width: 68,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  sideColRight: {
    width: 68,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  sideLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sideValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  textRight: {
    textAlign: 'right',
  },
  textLeft: {
    textAlign: 'left',
  },
  dialWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBlock: {
    marginTop: 6,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineHeaderText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timelineHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineHeaderValue: {
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 4,
  },
  nowButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  nowButtonText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compassButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  sliderFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
  },
  sliderNoonMark: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 10,
    borderRadius: 1,
  },
  sliderHandle: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabelText: {
    fontSize: 9,
    fontWeight: '600',
  },
  elevRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 6,
  },
  elevLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  elevValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  adviceBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  adviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  adviceTitle: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dirBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dirBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  adviceText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '400',
  },
});