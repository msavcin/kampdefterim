/**
 * Çadır Yönlendirme Kamerası
 * AR benzeri overlay ile optimal çadır yönünü gösterir
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { X, Navigation, Target, TrendingUp } from 'lucide-react-native';
import {
  CompassListener,
  getDirectionInfo,
  calculateAlignmentScore,
  getAlignmentFeedback,
  getAngleDifference,
  magneticToTrueHeading,
  type CompassReading,
} from '../lib/compassUtils';
import { evaluateTentDirection } from '../lib/sunPosition';

const { width, height } = Dimensions.get('window');

interface TentOrientationCameraProps {
  targetDirection: number; // Hedef yön (derece, 0 = Kuzey)
  latitude: number;
  longitude: number;
  onClose: () => void;
}

export default function TentOrientationCamera({
  targetDirection,
  latitude,
  longitude,
  onClose,
}: TentOrientationCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [currentHeading, setCurrentHeading] = useState(0);
  const [alignmentScore, setAlignmentScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [compassAccuracy, setCompassAccuracy] = useState(0);
  const compassListenerRef = useRef<CompassListener | null>(null);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    // Compass listener başlat
    const listener = new CompassListener((reading: CompassReading) => {
      // Magnetic heading'i true heading'e çevir
      const trueHeading = magneticToTrueHeading(reading.heading, latitude, longitude);
      setCurrentHeading(trueHeading);
      setCompassAccuracy(reading.accuracy);

      // Hizalama skorunu hesapla
      const score = calculateAlignmentScore(trueHeading, targetDirection);
      setAlignmentScore(score);
      setFeedback(getAlignmentFeedback(score));
    }, 0.15); // Biraz daha yumuşak smoothing

    listener.start(100); // 100ms güncelleme aralığı
    compassListenerRef.current = listener;

    return () => {
      listener.stop();
    };
  }, [targetDirection, latitude, longitude]);

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Kamera izni kontrol ediliyor...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Kamera erişimi gerekli</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>İzin Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const angleDiff = getAngleDifference(currentHeading, targetDirection);
  const isAligned = alignmentScore >= 90;
  const directionInfo = getDirectionInfo(currentHeading);
  const targetDirectionInfo = getDirectionInfo(targetDirection);

  // Evaluation
  const evaluation = evaluateTentDirection(currentHeading, latitude, longitude);

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back">
        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={24} color="#fff" />
          </TouchableOpacity>

          {/* Compass Display */}
          <View style={styles.compassDisplay}>
            <Text style={styles.compassLabel}>Mevcut Yön</Text>
            <Text style={styles.compassHeading}>{Math.round(currentHeading)}°</Text>
            <Text style={styles.compassDirection}>{directionInfo.cardinalDirection}</Text>
          </View>

          {/* Center Target Indicator */}
          <View style={styles.centerContainer}>
            {/* Target Reticle */}
            <View style={[styles.reticle, isAligned && styles.reticleAligned]}>
              <View style={styles.reticleLine} />
              <View style={[styles.reticleLine, styles.reticleLineHorizontal]} />
              {isAligned && (
                <View style={styles.reticleCenter}>
                  <Target size={32} color="#10b981" />
                </View>
              )}
            </View>

            {/* Direction Arrow */}
            {!isAligned && (
              <View
                style={[
                  styles.directionArrow,
                  {
                    transform: [{ rotate: `${angleDiff}deg` }],
                  },
                ]}
              >
                <Navigation size={48} color="#fbbf24" fill="#fbbf24" />
              </View>
            )}

            {/* Alignment Score */}
            <View style={styles.scoreContainer}>
              <View
                style={[
                  styles.scoreBar,
                  { width: `${alignmentScore}%` },
                  isAligned && styles.scoreBarAligned,
                ]}
              />
            </View>
          </View>

          {/* Bottom Info Panel */}
          <View style={styles.infoPanel}>
            <View style={styles.infoPanelHeader}>
              <Text style={styles.infoPanelTitle}>Hedef: {targetDirectionInfo.cardinalDirection}</Text>
              <Text style={styles.infoPanelDegrees}>{Math.round(targetDirection)}°</Text>
            </View>

            {/* Feedback */}
            <View style={styles.feedbackContainer}>
              <Text style={[styles.feedbackText, isAligned && styles.feedbackTextSuccess]}>
                {feedback}
              </Text>
            </View>

            {/* Evaluation Scores */}
            <View style={styles.evaluationContainer}>
              <View style={styles.evaluationItem}>
                <Text style={styles.evaluationLabel}>Skor</Text>
                <Text style={styles.evaluationValue}>{evaluation.score}/100</Text>
              </View>
              <View style={styles.evaluationDivider} />
              <View style={styles.evaluationItem}>
                <Text style={styles.evaluationLabel}>Sabah Güneşi</Text>
                <Text style={styles.evaluationValue}>
                  {evaluation.willGetMorningSun ? '☀️ Var' : '🌤️ Yok'}
                </Text>
              </View>
              <View style={styles.evaluationDivider} />
              <View style={styles.evaluationItem}>
                <Text style={styles.evaluationLabel}>Öğleden Sonra</Text>
                <Text style={styles.evaluationValue}>
                  {evaluation.willGetAfternoonSun ? '☀️ Güneş' : '🌤️ Gölge'}
                </Text>
              </View>
            </View>

            {/* Detailed Feedback */}
            <View style={styles.detailFeedback}>
              <Text style={styles.detailFeedbackText}>{evaluation.feedback}</Text>
            </View>

            {/* Angle Difference Indicator */}
            {!isAligned && Math.abs(angleDiff) > 5 && (
              <View style={styles.angleIndicator}>
                <Text style={styles.angleIndicatorText}>
                  {angleDiff > 0 ? '← Sola dön' : 'Sağa dön →'}
                </Text>
                <Text style={styles.angleIndicatorDegrees}>{Math.abs(Math.round(angleDiff))}°</Text>
              </View>
            )}
          </View>

          {/* Compass Accuracy Warning */}
          {compassAccuracy < 0.5 && (
            <View style={styles.accuracyWarning}>
              <Text style={styles.accuracyWarningText}>
                ⚠️ Pusula doğruluğu düşük. Cihazı metal objelerden uzak tutun.
              </Text>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    padding: 32,
  },
  permissionText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  compassDisplay: {
    position: 'absolute',
    top: 48,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  compassLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  compassHeading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  compassDirection: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticle: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticleLine: {
    position: 'absolute',
    width: 2,
    height: 60,
    backgroundColor: '#fbbf24',
    opacity: 0.8,
  },
  reticleLineHorizontal: {
    width: 60,
    height: 2,
  },
  reticleAligned: {
    // Animation could be added here
  },
  reticleCenter: {
    position: 'absolute',
  },
  directionArrow: {
    marginTop: 24,
  },
  scoreContainer: {
    width: 200,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    marginTop: 24,
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
    backgroundColor: '#fbbf24',
    borderRadius: 4,
  },
  scoreBarAligned: {
    backgroundColor: '#10b981',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoPanelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  infoPanelDegrees: {
    fontSize: 16,
    color: '#fbbf24',
    fontWeight: '600',
  },
  feedbackContainer: {
    marginBottom: 16,
  },
  feedbackText: {
    fontSize: 16,
    color: '#fbbf24',
    textAlign: 'center',
    fontWeight: '600',
  },
  feedbackTextSuccess: {
    color: '#10b981',
  },
  evaluationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  evaluationItem: {
    alignItems: 'center',
  },
  evaluationLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  evaluationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  evaluationDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  detailFeedback: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailFeedbackText: {
    fontSize: 13,
    color: '#93c5fd',
    textAlign: 'center',
  },
  angleIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderRadius: 8,
    padding: 12,
  },
  angleIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fbbf24',
  },
  angleIndicatorDegrees: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fbbf24',
  },
  accuracyWarning: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 8,
    padding: 12,
  },
  accuracyWarningText: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
  },
});
