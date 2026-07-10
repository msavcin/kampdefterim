/**
 * Çadır Konumlandırma Ekranı (taşındı)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { Compass, Sun, Moon, CloudRain, Info, Camera, MapPin } from 'lucide-react-native';
import {
  getSunTimes,
  getSunPosition,
  calculateOptimalTentOrientation,
  getDirectionName,
  getSunPathForDay,
  type OptimalTentOrientation,
  type SunTimes,
} from '../lib/sunPosition';
import {
  checkMagnetometerPermission,
  isMagnetometerAvailable,
} from '../lib/compassUtils';
import TentOrientationCamera from './TentOrientationCamera';
import OptimalDirectionIndicator from './OptimalDirectionIndicator';

const { width } = Dimensions.get('window');

export default function TentSetupScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null);
  const [optimalOrientation, setOptimalOrientation] = useState<OptimalTentOrientation | null>(null);
  const [priorityShade, setPriorityShade] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    initializeScreen();
  }, []);

  useEffect(() => {
    if (location) {
      calculateOrientation();
    }
  }, [priorityShade, selectedDate, location]);

  const initializeScreen = async () => {
    try {
      setLoading(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum izni olmadan çadır konumlandırma önerileri verilemez.');
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLocation);

      const hasPermission = await checkMagnetometerPermission();
      const isAvailable = await isMagnetometerAvailable();
      setMagnetometerAvailable(hasPermission && isAvailable);

      setLoading(false);
    } catch (error) {
      console.error('[TentSetup] Başlatma hatası:', error);
      Alert.alert('Hata', 'Konum bilgileri alınamadı.');
      setLoading(false);
    }
  };

  const calculateOrientation = () => {
    if (!location) return;

    const { latitude, longitude } = location.coords;

    const times = getSunTimes(latitude, longitude, selectedDate);
    setSunTimes(times);

    const orientation = calculateOptimalTentOrientation(latitude, longitude, selectedDate, priorityShade);
    setOptimalOrientation(orientation);
  };

  const handleOpenCamera = () => {
    if (!magnetometerAvailable) {
      Alert.alert(
        'Magnetometre Mevcut Değil',
        'Cihazınızda pusula sensörü bulunamadı veya izin verilmedi. Yön tespiti için bu özellik gereklidir.'
      );
      return;
    }
    setShowCamera(true);
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Konum bilgileri alınıyor...</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.errorContainer}>
        <MapPin size={48} color="#ef4444" />
        <Text style={styles.errorText}>Konum bilgisi alınamadı</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeScreen}>
          <Text style={styles.retryButtonText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showCamera && magnetometerAvailable && optimalOrientation) {
    return (
      <TentOrientationCamera
        targetDirection={optimalOrientation.directionDegrees}
        latitude={location.coords.latitude}
        longitude={location.coords.longitude}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Sun size={32} color="#f59e0b" />
        </View>
        <Text style={styles.headerTitle}>Çadır Konumlandırma</Text>
        <Text style={styles.headerSubtitle}>Güneş yönüne göre optimal çadır kurulumu</Text>
      </View>

      {/* Öncelik Seçimi */}
      <View style={styles.priorityCard}>
        <View style={styles.priorityHeader}>
          <Text style={styles.priorityTitle}>Öncelik</Text>
          <Info size={20} color="#6b7280" />
        </View>
        <View style={styles.priorityToggle}>
          <Text style={[styles.priorityLabel, !priorityShade && styles.priorityLabelActive]}>Sabah Güneşi</Text>
          <Switch
            value={priorityShade}
            onValueChange={setPriorityShade}
            trackColor={{ false: '#fbbf24', true: '#3b82f6' }}
            thumbColor="#fff"
          />
          <Text style={[styles.priorityLabel, priorityShade && styles.priorityLabelActive]}>Gün Boyu Gölge</Text>
        </View>
        <Text style={styles.priorityDescription}>
          {priorityShade
            ? 'Çadırınız gün boyu serin kalacak şekilde konumlandırılır.'
            : 'Sabah güneşinden faydalanarak ısınma sağlar, öğleden sonra gölgede olur.'}
        </Text>
      </View>

      {/* Güneş Zamanları */}
      {sunTimes && (
        <View style={styles.sunTimesCard}>
          <Text style={styles.sectionTitle}><Sun size={18} color="#f59e0b" /> Güneş Zamanları</Text>
          <View style={styles.sunTimesGrid}>
            <View style={styles.sunTimeItem}>
              <Text style={styles.sunTimeLabel}>Gün Doğumu</Text>
              <Text style={styles.sunTimeValue}>{formatTime(sunTimes.sunrise)}</Text>
            </View>
            <View style={styles.sunTimeItem}>
              <Text style={styles.sunTimeLabel}>Öğle</Text>
              <Text style={styles.sunTimeValue}>{formatTime(sunTimes.solarNoon)}</Text>
            </View>
            <View style={styles.sunTimeItem}>
              <Text style={styles.sunTimeLabel}>Gün Batımı</Text>
              <Text style={styles.sunTimeValue}>{formatTime(sunTimes.sunset)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Optimal Yön Göstergesi */}
      {optimalOrientation && (
        <OptimalDirectionIndicator
          orientation={optimalOrientation}
          onOpenCamera={handleOpenCamera}
          cameraAvailable={magnetometerAvailable}
        />
      )}

      {/* Gölge Analizi */}
      {optimalOrientation && (
        <View style={styles.shadeCard}>
          <Text style={styles.sectionTitle}><CloudRain size={18} color="#3b82f6" /> Gölge Durumu</Text>
          <View style={styles.shadeGrid}>
            <View style={styles.shadeItem}>
              <Text style={styles.shadeLabel}>Sabah</Text>
              <View style={[
                styles.shadeIndicator,
                optimalOrientation.shadeAnalysis.morningShade
                  ? styles.shadeIndicatorActive
                  : styles.shadeIndicatorInactive,
              ]}>
                <Text style={styles.shadeIndicatorText}>{optimalOrientation.shadeAnalysis.morningShade ? '🌤️ Gölge' : '☀️ Güneş'}</Text>
              </View>
            </View>
            <View style={styles.shadeItem}>
              <Text style={styles.shadeLabel}>Öğleden Sonra</Text>
              <View style={[
                styles.shadeIndicator,
                optimalOrientation.shadeAnalysis.afternoonShade
                  ? styles.shadeIndicatorActive
                  : styles.shadeIndicatorInactive,
              ]}>
                <Text style={styles.shadeIndicatorText}>{optimalOrientation.shadeAnalysis.afternoonShade ? '🌤️ Gölge' : '☀️ Güneş'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Güneş Yolu Bilgisi */}
      {optimalOrientation && (
        <View style={styles.sunPathCard}>
          <Text style={styles.sectionTitle}>Güneş Yolu</Text>
          <View style={styles.sunPathInfo}>
            <View style={styles.sunPathItem}>
              <Text style={styles.sunPathLabel}>Doğuş</Text>
              <Text style={styles.sunPathValue}>{getDirectionName(optimalOrientation.sunPath.sunrise)}</Text>
              <Text style={styles.sunPathDegrees}>{Math.round(optimalOrientation.sunPath.sunrise)}°</Text>
            </View>
            <View style={styles.sunPathArrow}><Text style={styles.sunPathArrowText}>→</Text></View>
            <View style={styles.sunPathItem}>
              <Text style={styles.sunPathLabel}>Öğle</Text>
              <Text style={styles.sunPathValue}>{getDirectionName(optimalOrientation.sunPath.noon)}</Text>
              <Text style={styles.sunPathDegrees}>{Math.round(optimalOrientation.sunPath.noon)}°</Text>
            </View>
            <View style={styles.sunPathArrow}><Text style={styles.sunPathArrowText}>→</Text></View>
            <View style={styles.sunPathItem}>
              <Text style={styles.sunPathLabel}>Batış</Text>
              <Text style={styles.sunPathValue}>{getDirectionName(optimalOrientation.sunPath.sunset)}</Text>
              <Text style={styles.sunPathDegrees}>{Math.round(optimalOrientation.sunPath.sunset)}°</Text>
            </View>
          </View>
        </View>
      )}

      {/* Bilgi Notu */}
      <View style={styles.infoCard}>
        <Info size={20} color="#3b82f6" />
        <Text style={styles.infoText}>
          Bu öneriler mevcut konumunuz ve seçtiğiniz tarihe göre hesaplanmıştır. Yerel arazi özellikleri
          (ağaçlar, tepeler vb.) de göz önünde bulundurulmalıdır.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  priorityCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  priorityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  priorityTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  priorityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priorityLabel: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
  priorityLabelActive: {
    color: '#1f2937',
    fontWeight: '600',
  },
  priorityDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  sunTimesCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  sunTimesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sunTimeItem: {
    alignItems: 'center',
  },
  sunTimeLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  sunTimeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  shadeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shadeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shadeItem: {
    alignItems: 'center',
  },
  shadeLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  shadeIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  shadeIndicatorActive: {
    backgroundColor: '#dbeafe',
  },
  shadeIndicatorInactive: {
    backgroundColor: '#fef3c7',
  },
  shadeIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sunPathCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sunPathInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sunPathItem: {
    alignItems: 'center',
    flex: 1,
  },
  sunPathLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  sunPathValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  sunPathDegrees: {
    fontSize: 11,
    color: '#6b7280',
  },
  sunPathArrow: {
    paddingHorizontal: 4,
  },
  sunPathArrowText: {
    fontSize: 20,
    color: '#f59e0b',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
});
