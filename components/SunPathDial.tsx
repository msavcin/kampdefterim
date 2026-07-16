/**
 * SunPathDial (frameless, kompakt)
 * --------------------------------
 * Kampfire Gold bottom sheet içinde, kamp alanı seçili değilken kullanıcının
 * konumuna göre gün doğumu / öğle / gün batımı azimuth'larını ve güneş
 * yüksekliğini kompas diyagramı olarak gösterir.
 *
 * - Tıklanamaz (diyagram); altındaki timeline slider ile etkileşimli.
 * - Konum prop'ları değiştiğinde yeniden hesaplar.
 * - `suncalc` paketi zaten projede kurulu (lib/sunPosition.ts ile aynı kaynak).
 * - Düzen (kompakt, çerçevesiz): pusula diyagramı ortada, doğuş/batış
 *   saatleri kendi gerçek pusula yönlerine göre diyagramın solunda veya
 *   sağında konumlanır. Pusula merkezinde çadır + güneşin ters yönüne
 *   gölge çizgisi. Altta doğuş-batış zaman çizgisi slider'ı.
 */

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Svg, { Circle, Path, G, Text as SvgText, Defs, Filter, FeGaussianBlur, FeMerge, FeMergeNode } from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { Magnetometer, Accelerometer } from 'expo-sensors';

export interface SunPathDialProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  /** Kampfire Gold primary (ör. #D4AF6A). Tema ile uyum için dışarıdan alınır. */
  primary: string;
  /** Kampfire Gold primary light / yumuşak (ör. rgba(212,175,106,0.18)). */
  primarySoft: string;
  /** Metin rengi (saat/yükseklik değerleri). */
  text: string;
  /** İkincil metin / muted rengi. */
  muted: string;
  /** Yüzey rengi (iç halka dolgusu). */
  surface: string;
  /** Dış sarmalayıcıya ekstra stil. */
  containerStyle?: object;
  /** Pusula modu açık mı? true ise diyagram telefonun yönelimine göre döner. */
  compassActive?: boolean;
  /** Pusula modu açma/kapama callback'i (toggle butonu için). */
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

/** Azimuth dereceyi (kuzey=0) SVG/View koordinatına çevirir.
 *  Diyagramda yukarı = kuzey. Açı saat yönünde büyür. */
function azToPoint(azDeg: number, r: number, cx: number, cy: number) {
  const rad = (azDeg * Math.PI) / 180;
  // Saat yönünde: yukarı=0, sağ=90 — x=sin, y=-cos
  const x = cx + Math.sin(rad) * r;
  const y = cy - Math.cos(rad) * r;
  return { x, y };
}

/** Dakika sayısını saat (decimal) cinsinden döndürür. */
function dateToHours(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

/** "HH.DD" saat değerini Date'e (bugün) çevirir. */
function hoursToDate(hours: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setHours(Math.floor(hours));
  d.setMinutes(Math.round((hours - Math.floor(hours)) * 60));
  d.setSeconds(0, 0);
  return d;
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
  // Slider'ın gösterdiği saat (günün hangi dakikası). 0..24
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // ---- Pusula (heading) ----
  // Sensörlerden gelen ham verileri ref'te tutarız (render tetiklemeden güncellenir).
  const magRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const accRef = useRef<{ x: number; y: number; z: number } | null>(null);
  // Hesaplanmış heading (derece, kuzey=0, doğu=90, saat yönünde). null ise hesaplanamamış.
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);

  // Bugünün referans tarihi (slider her zaman bugün için çalışır)
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

    // SunCalc.getPosition() hem azimuth hem altitude'ı zaten **derece**
    // olarak döndürür (kaynak: getPosition içinde `/ rad` uygulanır).
    // Azimuth referansı kuzey=0, doğu=90, güney=180, batı=270.
    const toAzDeg = (deg: number) => (deg + 360) % 360;

    return {
      sunrise: times.sunrise ?? null,
      solarNoon: times.solarNoon ?? null,
      sunset: times.sunset ?? null,
      sunriseAzDeg: toAzDeg(sunrisePos.azimuth),
      noonAzDeg: toAzDeg(noonPos.azimuth),
      sunsetAzDeg: toAzDeg(sunsetPos.azimuth),
      altitudeDeg: noonPos.altitude,
      valid: true,
    };
  }, [latitude, longitude]);

  // Seçili zaman (slider'dan veya şu an)
  const selectedTime = useMemo<Date>(() => {
    if (selectedHour == null) return new Date();
    return hoursToDate(selectedHour, today);
  }, [selectedHour, today]);

  // Seçili zaman için güneş pozisyonu
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

  // Kompakt SVG geometrisi — 120×120 viewBox
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 52;
  const rMid = 38;
  const rInner = 24;
  const rSunPath = rOuter - 4;

  // Pusula üzerindeki noktalar
  const sunRise = azToPoint(sun.sunriseAzDeg, rSunPath, cx, cy);
  const sunSet = azToPoint(sun.sunsetAzDeg, rSunPath, cx, cy);
  const sunNoon = azToPoint(sun.noonAzDeg, 9, cx, cy);

  // Gölge ve anlık güneş noktası (slider'dan seçili zaman)
  const isDaytime = selectedSun.altitude > 0;
  const rCurrentSun = 30;
  const currentSun = isDaytime
    ? azToPoint(((selectedSun.azimuth + 360) % 360), rCurrentSun, cx, cy)
    : null;
  // Gölge yönü: güneşin tam tersi (azimuth + 180)
  const SHADOW_MAX = 30;
  const shadowLength = isDaytime
    ? Math.max(2, SHADOW_MAX * (1 - selectedSun.altitude / 90))
    : 0;
  const shadowEnd = azToPoint(
    (selectedSun.azimuth + 180 + 360) % 360,
    shadowLength,
    cx,
    cy,
  );

  // Doğuştan batışa üst yarım küre quadratic bezier
  const arcPath = `M ${sunRise.x} ${sunRise.y} Q ${cx} ${cy - rSunPath - 8} ${sunSet.x} ${sunSet.y}`;

  function sideFor(azDeg: number): 'left' | 'right' {
    const p = azToPoint(azDeg, rSunPath, cx, cy);
    return p.x >= cx ? 'right' : 'left';
  }

  const riseSide = sideFor(sun.sunriseAzDeg);
  const setSide = sideFor(sun.sunsetAzDeg);

  // ---- Slider ----
  // Slider'ın sınırları: doğuş-batış. Eğer kutup günü ise (sunrise=null veya sunset=null)
  // 06:00-20:00 arası fallback.
  const minHour = sun.sunrise ? dateToHours(sun.sunrise) : 6;
  const maxHour = sun.sunset ? dateToHours(sun.sunset) : 20;

  // ---- Custom Slider (PanResponder tabanlı) ----
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

  const trackPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setSelectedHour(hourFromX(evt.nativeEvent.locationX));
      },
      onPanResponderMove: (evt) => {
        setSelectedHour(hourFromX(evt.nativeEvent.locationX));
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

  // ---- Pusula: sensör abonelikleri ----
  // Tilt-compensated heading hesaplama:
  //  - Accelerometer → yerçekimi vektörü (g)
  //  - Magnetometer → manyetik alan vektörü (b)
  //  - Gravity'yi kullanarak manyetik alanı yatay düzleme izdüşür:
  //      b_h = b - (b·ĝ)ĝ
  //  - Heading = atan2(by, bx), burada x = doğu, y = kuzey
  //    (telefon koordinat sisteminde: +X sağ, +Y yukarı, +Z ekran-dışı)
  useEffect(() => {
    if (!compassActive) {
      // Pusula kapalı — abonelikleri temizle, heading'i sıfırla
      Magnetometer.removeAllListeners();
      Accelerometer.removeAllListeners();
      magRef.current = null;
      accRef.current = null;
      setHeadingDeg(null);
      return undefined;
    }

    let lastUpdate = 0;
    const UPDATE_INTERVAL_MS = 100; // ~10 Hz, pil için yeterli
    const recompute = () => {
      const now = Date.now();
      if (now - lastUpdate < UPDATE_INTERVAL_MS) return;
      lastUpdate = now;

      const m = magRef.current;
      const a = accRef.current;
      if (!m || !a) return;

      // Yerçekimi vektörünü normalize et
      const gMag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      if (gMag < 0.0001) return;
      const gx = a.x / gMag;
      const gy = a.y / gMag;
      const gz = a.z / gMag;

      // Manyetik alanı yatay düzleme izdüşür: b_h = b - (b·g)g
      const dot = m.x * gx + m.y * gy + m.z * gz;
      const hx = m.x - dot * gx;
      const hy = m.y - dot * gy;
      const hz = m.z - dot * gz;
      // (hz'yi kullanmıyoruz ama manyetik alan 3D bileşeni olarak hesaplandı)

      // Telefon koordinat sistemi: +X sağ, +Y yukarı (ekran üst kenarına doğru),
      // +Z ekrandan dışarı doğru. Telefon düz (sırt üstü) tutulduğunda:
      //   - hx > 0: manyetik kuzey telefonun sağında
      //   - hy > 0: manyetik kuzey telefonun önünde (ekran üst kenarı)
      // Heading: telefonun üst kenarının (ekranın üstü) manyetik kuzeyle yaptığı açı.
      // Yani: hy pozitif ve hx ~ 0 ise heading=0 (kuzey yukarıda).
      //      hx pozitif ve hy ~ 0 ise heading=90 (doğu yukarıda).
      // atan2(hx, hy) → 0=kuzey, 90=doğu, 180=güney, 270=batı. ✓
      const headingRad = Math.atan2(hx, hy);
      let heading = (headingRad * 180) / Math.PI;
      // Negatif açıları 0..360 aralığına getir
      heading = (heading + 360) % 360;
      setHeadingDeg(heading);
    };

    // Android'de expo-sensors varsayılan olarak ~60Hz güncelleme yapar; pil için
    // UpdateInterval ile kısarız.
    const updateIntervalMs = UPDATE_INTERVAL_MS;
    try {
      Magnetometer.setUpdateInterval(updateIntervalMs);
      Accelerometer.setUpdateInterval(updateIntervalMs);
    } catch {
      // Eski sürümlerde yoksa sessiz geç
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

  // Pusula aktifken heading'i SVG'ye uygula. Telefonu saat yönünde çevirince
  // diyagramın K işareti telefonun üst kenarına gelmeli. SVG rotate açısı
  // telefonun saat yönündeki dönüşüne eşit (negatif heading uygularız).
  // Not: atan2(hx, hy) zaten "telefonun üst kenarının kuzeyden sapma açısı"nı verir.
  // Diyagramda K yukarıdayken telefonu kuzeye çevirince heading=0, diyagram 0°
  // döner. Telefonu doğuya çevirince heading=90, diyagram -90° döner (K artık
  // solda, doğu artık üstte). Bu doğru pusula davranışı.
  const dialRotation = compassActive && headingDeg != null ? -headingDeg : 0;

  // Görüntü için: tutamak pozisyonu (px)
  const effectiveHour = selectedHour ?? dateToHours(new Date());
  const handleX = xFromHour(effectiveHour);
  const handleLeft = Math.max(0, Math.min(trackWidth - 1, handleX));

  // Slider üstündeki gölgeli kısım: doğuş'tan seçili zamana kadar
  const filledRatio = (effectiveHour - minHour) / Math.max(0.001, maxHour - minHour);
  const filledWidth = filledRatio * trackWidth;

  return (
    <View style={[styles.root, containerStyle]}>
      <View style={styles.bodyRow}>
        {/* Sol taraf etiketi — ya Doğuş ya da Batış */}
        {sun.valid && (riseSide === 'left' || setSide === 'left') && (
          <View
            style={[
              styles.sideCol,
              riseSide === 'left' ? null : styles.sideColRight,
            ]}
          >
            {riseSide === 'left' ? (
              <>
                <Text style={[styles.sideLabel, { color: muted }]} numberOfLines={1}>
                  Doğuş
                </Text>
                <Text style={[styles.sideValue, { color: primary }]}>
                  {timeStr(sun.sunrise)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.sideLabel, { color: muted }]} numberOfLines={1}>
                  Batış
                </Text>
                <Text style={[styles.sideValue, { color: primary }]}>
                  {timeStr(sun.sunset)}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Orta: SVG Diyagram */}
        <View style={styles.dialWrap}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Defs>
              <Filter id="sunPathGlow" x="-50%" y="-50%" width="200%" height="200%">
                <FeGaussianBlur stdDeviation="1.5" result="b" />
                <FeMerge>
                  <FeMergeNode in="b" />
                  <FeMergeNode in="SourceGraphic" />
                </FeMerge>
              </Filter>
            </Defs>

            {/* Pusula halkaları + yön işaretleri + güneş yolu + anlık güneş +
                doğuş/batış noktaları tek bir dönen grupta. Pusula aktifken
                telefonun yönelimine göre döner. Çadır ve gölge ise dünyaya
                sabit olduğu için dönmez (aşağıda ayrı çizilir). */}
            <G rotation={dialRotation} origin={`${cx}, ${cy}`}>
              {/* İç halkalar */}
              <Circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={primarySoft} strokeWidth={1} />
              <Circle cx={cx} cy={cy} r={rMid} fill="none" stroke={primarySoft} strokeWidth={1} />
              <Circle cx={cx} cy={cy} r={rInner} fill="none" stroke={primarySoft} strokeWidth={1} />

              {/* Güneş yolu yayı */}
              <Path
                d={arcPath}
                fill="none"
                stroke={primary}
                strokeOpacity={0.45}
                strokeWidth={1.2}
                strokeDasharray="2.5 3.5"
              />

              {/* Pusula yön işaretleri */}
              <SvgText x={cx} y={cy - rOuter - 3} textAnchor="middle" fill={primary} fontSize={9} fontWeight="700">
                K
              </SvgText>
              <SvgText x={cx + rOuter + 6} y={cy + 3} textAnchor="middle" fill={muted} fontSize={8} fontWeight="600">
                D
              </SvgText>
              <SvgText x={cx} y={cy + rOuter + 10} textAnchor="middle" fill={muted} fontSize={8} fontWeight="600">
                G
              </SvgText>
              <SvgText x={cx - rOuter - 6} y={cy + 3} textAnchor="middle" fill={muted} fontSize={8} fontWeight="600">
                B
              </SvgText>

              {/* Doğuş / Öğle / Batış sabit noktaları (pusulayla birlikte döner) */}
              {sun.valid && (
                <G>
                  <Circle cx={sunRise.x} cy={sunRise.y} r={3.5} fill={primary} opacity={0.65} filter="url(#sunPathGlow)" />
                  <Circle cx={sunSet.x} cy={sunSet.y} r={3.5} fill={primary} opacity={0.65} />
                  <Circle cx={sunNoon.x} cy={sunNoon.y} r={4} fill={primary} />
                </G>
              )}

              {/* Anlık güneş (gündüz) — pusulayla birlikte döner */}
              {sun.valid && isDaytime && currentSun && (
                <Circle
                  cx={currentSun.x}
                  cy={currentSun.y}
                  r={4.5}
                  fill={primary}
                  stroke={surface}
                  strokeWidth={1.5}
                  filter="url(#sunPathGlow)"
                />
              )}
            </G>

            {/* Çadır + gölge: pusulayla birlikte DÖNMEZ. Çadır yere sabit
                (dünya referanslı), gölge de güneşin konumuna göre sabit.
                Pusula dönerken çadırın altında kalan yön değişir. */}
            {sun.valid && (
              <G>
                {/* Gölge çizgisi */}
                {isDaytime && (
                  <Path
                    d={`M ${cx} ${cy} L ${shadowEnd.x} ${shadowEnd.y}`}
                    stroke={muted}
                    strokeWidth={1.5}
                    strokeOpacity={0.55}
                    strokeLinecap="round"
                  />
                )}

                {/* Çadır — direk + üçgen */}
                <Path
                  d={`M ${cx} ${cy} L ${cx} ${cy - 6}`}
                  stroke={primary}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                <Path
                  d={`M ${cx - 5} ${cy + 1} L ${cx} ${cy - 6} L ${cx + 5} ${cy + 1} Z`}
                  fill={primary}
                  fillOpacity={0.3}
                  stroke={primary}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                />

                {/* Gece ise ay + yıldızlar (pusulayla birlikte dönmeyebilir —
                    yıldızlar gökyüzünde sabit, ay da öyle) */}
                {!isDaytime && (
                  <G>
                    <Circle cx={cx} cy={cy - 6} r={5} fill={muted} opacity={0.85} />
                    <Circle cx={cx + 2} cy={cy - 7} r={4} fill={surface} />
                    <Circle cx={cx - 18} cy={cy - 14} r={1} fill={muted} opacity={0.7} />
                    <Circle cx={cx + 16} cy={cy - 10} r={1.2} fill={muted} opacity={0.7} />
                    <Circle cx={cx - 14} cy={cy + 12} r={0.8} fill={muted} opacity={0.6} />
                    <Circle cx={cx + 20} cy={cy + 8} r={0.9} fill={muted} opacity={0.6} />
                  </G>
                )}
              </G>
            )}

            {/* Pusula aktifse merkezde küçük bir pusula göstergesi (N oku).
                Pusula döndüğünde çadırın altındaki yönü netleştirir. */}
            {compassActive && headingDeg != null && (
              <G>
                {/* Üstte küçük "N" işareti — telefonun üst kenarına sabit */}
                <SvgText
                  x={cx}
                  y={cy - rInner - 2}
                  textAnchor="middle"
                  fill={text}
                  fontSize={6.5}
                  fontWeight="700"
                  opacity={0.5}
                >
                  N
                </SvgText>
                {/* Altta "S" — telefonun alt kenarına sabit */}
                <SvgText
                  x={cx}
                  y={cy + rInner + 8}
                  textAnchor="middle"
                  fill={text}
                  fontSize={6.5}
                  fontWeight="700"
                  opacity={0.5}
                >
                  S
                </SvgText>
              </G>
            )}
          </Svg>
        </View>

        {/* Sağ taraf etiketi — ya Doğuş ya da Batış */}
        {sun.valid && (riseSide === 'right' || setSide === 'right') && (
          <View
            style={[
              styles.sideCol,
              styles.sideColRight,
              riseSide === 'right' ? null : styles.sideColRightOverride,
            ]}
          >
            {riseSide === 'right' ? (
              <>
                <Text style={[styles.sideLabel, { color: muted }]} numberOfLines={1}>
                  Doğuş
                </Text>
                <Text style={[styles.sideValue, { color: primary }]}>
                  {timeStr(sun.sunrise)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.sideLabel, { color: muted }]} numberOfLines={1}>
                  Batış
                </Text>
                <Text style={[styles.sideValue, { color: primary }]}>
                  {timeStr(sun.sunset)}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Alt: Slider timeline + Güneş yüksekliği */}
      {sun.valid && (
        <View style={styles.timelineBlock}>
          {/* Üst satır: seçili saat + 'şimdi' butonu + pusula toggle */}
          <View style={styles.timelineHeader}>
            <Text style={[styles.timelineHeaderText, { color: muted }]}>
              {selectedHour == null ? 'Şu an' : 'Seçili saat'}
            </Text>
            <View style={styles.timelineHeaderRight}>
              {/* Pusula açma/kapama butonu — switch tarzı */}
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
                    {/* Pusula iğnesi — kırmızı yarısı (kuzey) her zaman görünür */}
                    <Path
                      d="M12 2 L15 12 L12 10 L9 12 Z"
                      fill="#E07A7A"
                    />
                    <Path
                      d="M12 22 L9 12 L12 14 L15 12 Z"
                      fill={compassActive ? surface : muted}
                      opacity={compassActive ? 0.9 : 1}
                    />
                    <Circle cx={12} cy={12} r={1.5} fill={compassActive ? surface : primary} />
                    {/* Kapalıyken üstüne çarpı (X) işareti */}
                    {!compassActive && (
                      <G>
                        <Path
                          d="M4 4 L20 20"
                          stroke={primary}
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          opacity={0.55}
                        />
                        <Path
                          d="M20 4 L4 20"
                          stroke={primary}
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          opacity={0.55}
                        />
                      </G>
                    )}
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
            {/* Dolu kısım (doğuş'tan seçili zamana) */}
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
            {/* Öğle işareti (solar noon) */}
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
            {/* Tutamak */}
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

          {/* Uç etiketler — doğuş ve batış saatleri */}
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

      {/* En alt: Güneş yüksekliği (öğle) */}
      <View style={styles.elevRow}>
        <Text style={[styles.elevLabel, { color: muted }]}>Güneş Yüksekliği (öğle)</Text>
        <Text style={[styles.elevValue, { color: text }]}>
          {sun.valid ? `${Math.round(sun.altitudeDeg)}°` : '—'}
        </Text>
      </View>
    </View>
  );
}

const LABEL_COL_WIDTH = 56; // Etiket sütunu genişliği — "HH:MM" + etiket sığacak kadar
const LABEL_GAP = 6;        // Etiket sütunu ile diyagram arasındaki nefes payı (px)

const styles = StyleSheet.create({
  root: {
    // Çerçevesiz — sadece sarmalayıcı
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: LABEL_GAP,
  },
  sideCol: {
    width: LABEL_COL_WIDTH,
    minWidth: 0,
  },
  sideColRight: {
    alignItems: 'flex-end',
  },
  sideColRightOverride: {
    alignItems: 'flex-start',
  },
  sideLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sideValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  dialWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBlock: {
    marginTop: 4,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineHeaderText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timelineHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineHeaderValue: {
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '500',
  },
  elevRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  elevLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  elevValue: {
    fontSize: 12,
    fontWeight: '700',
  },
});
