/**
 * Optimal Yön Göstergesi Komponenti
 * Hesaplanan optimal çadır yönünü görsel olarak gösterir
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Navigation, Camera, CheckCircle, Compass } from 'lucide-react-native';
import type { OptimalTentOrientation } from '../lib/sunPosition';
import Svg, { Circle, Line, Text as SvgText, G, Path } from 'react-native-svg';

const { width } = Dimensions.get('window');
const COMPASS_SIZE = width * 0.7;
const COMPASS_RADIUS = COMPASS_SIZE / 2;
const CENTER = COMPASS_SIZE / 2;

interface OptimalDirectionIndicatorProps {
  orientation: OptimalTentOrientation;
  onOpenCamera: () => void;
  cameraAvailable: boolean;
}

export default function OptimalDirectionIndicator({
  orientation,
  onOpenCamera,
  cameraAvailable,
}: OptimalDirectionIndicatorProps) {
  // Ana yön çizgisi için koordinat hesaplama
  const getLineCoords = (angle: number, length: number) => {
    const rad = ((angle - 90) * Math.PI) / 180; // -90 çünkü 0° yukarı olmalı
    const x = CENTER + Math.cos(rad) * length;
    const y = CENTER + Math.sin(rad) * length;
    return { x, y };
  };

  // Yön işaretçileri (K, D, G, B)
  const cardinalDirections = [
    { angle: 0, label: 'K', name: 'Kuzey' },
    { angle: 90, label: 'D', name: 'Doğu' },
    { angle: 180, label: 'G', name: 'Güney' },
    { angle: 270, label: 'B', name: 'Batı' },
  ];

  // Güneş yolu noktaları
  const sunrisePoint = getLineCoords(orientation.sunPath.sunrise, COMPASS_RADIUS - 25);
  const noonPoint = getLineCoords(orientation.sunPath.noon, COMPASS_RADIUS - 25);
  const sunsetPoint = getLineCoords(orientation.sunPath.sunset, COMPASS_RADIUS - 25);

  // Optimal yön çizgisi
  const optimalPoint = getLineCoords(orientation.directionDegrees, COMPASS_RADIUS - 10);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          <Navigation size={18} color="#10b981" /> Önerilen Çadır Yönü
        </Text>

        {/* Compass Visualization */}
        <View style={styles.compassContainer}>
          <Svg width={COMPASS_SIZE} height={COMPASS_SIZE}>
            {/* Background Circle */}
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={COMPASS_RADIUS - 5}
              fill="#f9fafb"
              stroke="#e5e7eb"
              strokeWidth="2"
            />

            {/* Cardinal Directions */}
            {cardinalDirections.map((dir) => {
              const point = getLineCoords(dir.angle, COMPASS_RADIUS - 15);
              const innerPoint = getLineCoords(dir.angle, COMPASS_RADIUS - 35);

              return (
                <G key={dir.label}>
                  <Line
                    x1={innerPoint.x}
                    y1={innerPoint.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="#9ca3af"
                    strokeWidth="2"
                  />
                  <SvgText
                    x={point.x}
                    y={point.y + (dir.angle === 180 ? 15 : dir.angle === 0 ? -8 : 5)}
                    fontSize="14"
                    fontWeight="600"
                    fill="#4b5563"
                    textAnchor="middle"
                  >
                    {dir.label}
                  </SvgText>
                </G>
              );
            })}

            {/* Intermediate Direction Marks */}
            {[45, 135, 225, 315].map((angle) => {
              const outerPoint = getLineCoords(angle, COMPASS_RADIUS - 5);
              const innerPoint = getLineCoords(angle, COMPASS_RADIUS - 15);

              return (
                <Line
                  key={angle}
                  x1={innerPoint.x}
                  y1={innerPoint.y}
                  x2={outerPoint.x}
                  y2={outerPoint.y}
                  stroke="#d1d5db"
                  strokeWidth="1"
                />
              );
            })}

            {/* Sun Path Points */}
            <Circle cx={sunrisePoint.x} cy={sunrisePoint.y} r="6" fill="#fbbf24" />
            <Circle cx={noonPoint.x} cy={noonPoint.y} r="8" fill="#f59e0b" />
            <Circle cx={sunsetPoint.x} cy={sunsetPoint.y} r="6" fill="#f97316" />

            {/* Sun Path Line */}
            <Path
              d={`M ${sunrisePoint.x} ${sunrisePoint.y} Q ${noonPoint.x} ${noonPoint.y} ${sunsetPoint.x} ${sunsetPoint.y}`}
              stroke="#fbbf24"
              strokeWidth="2"
              fill="none"
              strokeDasharray="4,4"
              opacity="0.5"
            />

            {/* Optimal Direction Arrow */}
            <Line
              x1={CENTER}
              y1={CENTER}
              x2={optimalPoint.x}
              y2={optimalPoint.y}
              stroke="#10b981"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Arrow Head */}
            <Path
              d={`M ${optimalPoint.x} ${optimalPoint.y} 
                  L ${optimalPoint.x - 8} ${optimalPoint.y - 12} 
                  L ${optimalPoint.x + 8} ${optimalPoint.y - 12} Z`}
              fill="#10b981"
              rotation={orientation.directionDegrees}
              origin={`${optimalPoint.x}, ${optimalPoint.y}`}
            />

            {/* Center Point */}
            <Circle cx={CENTER} cy={CENTER} r="8" fill="#fff" stroke="#10b981" strokeWidth="3" />
          </Svg>
        </View>

        {/* Direction Info */}
        <View style={styles.directionInfo}>
          <View style={styles.directionBadge}>
            <Compass size={20} color="#10b981" />
            <Text style={styles.directionText}>{orientation.recommendedDirection}</Text>
          </View>
          <Text style={styles.directionDegrees}>{Math.round(orientation.directionDegrees)}°</Text>
        </View>

        {/* Reasoning */}
        <View style={styles.reasoningContainer}>
          <Text style={styles.reasoningText}>{orientation.reasoning}</Text>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <Text style={styles.legendText}>Gün Doğumu</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>Öğle</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
            <Text style={styles.legendText}>Gün Batımı</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>Önerilen Yön</Text>
          </View>
        </View>

        {/* Camera Button */}
        <TouchableOpacity
          style={[styles.cameraButton, !cameraAvailable && styles.cameraButtonDisabled]}
          onPress={onOpenCamera}
          disabled={!cameraAvailable}
        >
          <Camera size={20} color="#fff" />
          <Text style={styles.cameraButtonText}>
            {cameraAvailable ? 'Kamera ile Yönlendir' : 'Pusula Mevcut Değil'}
          </Text>
        </TouchableOpacity>

        {!cameraAvailable && (
          <Text style={styles.cameraDisabledNote}>
            Cihazınızda magnetometre bulunmuyor veya izin verilmedi.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 20,
  },
  compassContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  directionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  directionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065f46',
  },
  directionDegrees: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10b981',
  },
  reasoningContainer: {
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  reasoningText: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#6b7280',
  },
  cameraButton: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cameraButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraDisabledNote: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
});
