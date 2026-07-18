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
import { useTheme } from './ThemeProvider';

const { width } = Dimensions.get('window');

interface TentSetupScreenProps {
  sourceLocation?: Location.LocationObject | null;
  evaluationKey?: number | string;
}

export default function TentSetupScreen({
  sourceLocation = null,
  evaluationKey,
}: TentSetupScreenProps) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null);
  const [optimalOrientation, setOptimalOrientation] = useState<OptimalTentOrientation | null>(null);
  const [priorityShade, setPriorityShade] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { colors, scheme, isKampfireTheme } = useTheme();
  const isKampfireDark = isKampfireTheme && scheme === 'dark';
  const screenBg = isKampfireTheme ? colors.background : '#f8fafc';
  const cardBg = isKampfireTheme ? colors.surface : '#fff';
  const cardAltBg = isKampfireTheme ? colors.surfaceVariant : '#eff6ff';
  const borderColor = isKampfireTheme ? colors.border : 'transparent';
  const primaryColor = isKampfireTheme ? colors.primary : '#10b981';
  const accentColor = isKampfireTheme ? colors.accent : '#f59e0b';
  const infoColor = isKampfireTheme ? colors.primary : '#3b82f6';
  const dangerColor = isKampfireTheme ? colors.danger : '#ef4444';
  const textColor = isKampfireTheme ? colors.text : '#1f2937';
  const secondaryTextColor = isKampfireTheme ? colors.textSecondary : '#6b7280';
  const mutedTextColor = isKampfireTheme ? colors.muted : '#9ca3af';
  const softGoldBg = isKampfireTheme ? colors.primaryLight : '#fef3c7';
  const themedCardStyle = isKampfireTheme
    ? {
        backgroundColor: cardBg,
        borderColor,
        borderWidth: 1,
        shadowOpacity: isKampfireDark ? 0.34 : 0.12,
        shadowRadius: isKampfireDark ? 18 : 10,
        elevation: isKampfireDark ? 8 : 3,
      }
    : null;

  useEffect(() => {
    initializeScreen();
  }, [
    evaluationKey,
    sourceLocation?.coords?.latitude,
    sourceLocation?.coords?.longitude,
  ]);

  useEffect(() => {
    if (location) {
      calculateOrientation();
    }
  }, [priorityShade, selectedDate, location]);

  const initializeScreen = async () => {
    try {
      setLoading(true);

      // Ekran her açıldığında zamanı yenile. Modal görünmezken component canlı kalsa bile
      // değerlendirme açılış anındaki konum + zamana göre tekrar hesaplanır.
      setSelectedDate(new Date());

      if (sourceLocation?.coords) {
        setLocation(sourceLocation);
      } else {
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
      }

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
      <View style={[styles.loadingContainer, { backgroundColor: screenBg }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.loadingText, { color: secondaryTextColor }]}>Konum bilgileri alınıyor...</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: screenBg }]}>
        <MapPin size={48} color={dangerColor} />
        <Text style={[styles.errorText, { color: textColor }]}>Konum bilgisi alınamadı</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: primaryColor }]} onPress={initializeScreen}>
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
    <ScrollView style={[styles.container, { backgroundColor: screenBg }]} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={[styles.header, isKampfireTheme && styles.kampfireHeader]}>
        <View style={[styles.headerIcon, { backgroundColor: softGoldBg, borderColor: isKampfireTheme ? borderColor : softGoldBg }]}>
          <Sun size={32} color={accentColor} />
        </View>
        <Text style={[styles.headerTitle, { color: textColor }]}>Çadır Konumlandırma</Text>
        <Text style={[styles.headerSubtitle, { color: secondaryTextColor }]}>Güneş yönüne göre optimal çadır kurulumu</Text>
      </View>

      {/* Öncelik Seçimi */}
      <View style={[styles.priorityCard, themedCardStyle]}>
        <View style={styles.priorityHeader}>
          <Text style={[styles.priorityTitle, { color: textColor }]}>Öncelik</Text>
          <Info size={20} color={secondaryTextColor} />
        </View>
        <View style={styles.priorityToggle}>
          <Text style={[styles.priorityLabel, { color: mutedTextColor }, !priorityShade && styles.priorityLabelActive, !priorityShade && { color: textColor }]}>Sabah Güneşi</Text>
          <Switch
            value={priorityShade}
            onValueChange={setPriorityShade}
            trackColor={{ false: accentColor, true: primaryColor }}
            thumbColor={isKampfireTheme ? colors.surface : '#fff'}
          />
          <Text style={[styles.priorityLabel, { color: mutedTextColor }, priorityShade && styles.priorityLabelActive, priorityShade && { color: textColor }]}>Gün Boyu Gölge</Text>
        </View>
        <Text style={[styles.priorityDescription, { color: secondaryTextColor }]}>
          {priorityShade
            ? 'Çadırınız gün boyu serin kalacak şekilde konumlandırılır.'
            : 'Sabah güneşinden faydalanarak ısınma sağlar, öğleden sonra gölgede olur.'}
        </Text>
      </View>

      {/* Güneş Zamanları */}
      {sunTimes && (
        <View style={[styles.sunTimesCard, themedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}><Sun size={18} color={accentColor} /> Güneş Zamanları</Text>
          <View style={styles.sunTimesGrid}>
            <View style={styles.sunTimeItem}>
              <Text style={[styles.sunTimeLabel, { color: secondaryTextColor }]}>Gün Doğumu</Text>
              <Text style={[styles.sunTimeValue, { color: textColor }]}>{formatTime(sunTimes.sunrise)}</Text>
            </View>
            <View style={styles.sunTimeItem}>
              <Text style={[styles.sunTimeLabel, { color: secondaryTextColor }]}>Öğle</Text>
              <Text style={[styles.sunTimeValue, { color: textColor }]}>{formatTime(sunTimes.solarNoon)}</Text>
            </View>
            <View style={styles.sunTimeItem}>
              <Text style={[styles.sunTimeLabel, { color: secondaryTextColor }]}>Gün Batımı</Text>
              <Text style={[styles.sunTimeValue, { color: textColor }]}>{formatTime(sunTimes.sunset)}</Text>
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
        <View style={[styles.shadeCard, themedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}><CloudRain size={18} color={infoColor} /> Gölge Durumu</Text>
          {optimalOrientation.shadowModel?.valid && (
            <View style={[styles.shadowModelBox, { backgroundColor: cardAltBg, borderColor: isKampfireTheme ? borderColor : '#bfdbfe' }]}>
              <View style={styles.shadowModelHeader}>
                <Text style={[styles.shadowModelLabel, { color: primaryColor }]}>Gölge Yönü</Text>
                <Text style={[styles.shadowModelBadge, { color: isKampfireTheme ? colors.surface : '#1e40af', backgroundColor: primaryColor }]}>SunPathDial modeli</Text>
              </View>
              <Text style={[styles.shadowModelDirection, { color: textColor }]}>
                {optimalOrientation.shadowModel.shadowDirectionName} · {Math.round(optimalOrientation.shadowModel.shadowDirectionDegrees)}°
              </Text>
              <Text style={[styles.shadowModelDescription, { color: secondaryTextColor }]}>
                {optimalOrientation.shadowModel.usedSolarNoonFallback
                  ? `Güneş ufkun altında olduğu için ${formatTime(optimalOrientation.shadowModel.referenceTime)} öğle referansı kullanıldı.`
                  : `${formatTime(optimalOrientation.shadowModel.referenceTime)} anlık güneş konumuna göre hesaplandı.`}
              </Text>
            </View>
          )}
          <View style={styles.shadeGrid}>
            <View style={styles.shadeItem}>
              <Text style={[styles.shadeLabel, { color: secondaryTextColor }]}>Sabah</Text>
              <View style={[
                styles.shadeIndicator,
                optimalOrientation.shadeAnalysis.morningShade
                  ? styles.shadeIndicatorActive
                  : styles.shadeIndicatorInactive,
                { backgroundColor: optimalOrientation.shadeAnalysis.morningShade ? cardAltBg : softGoldBg },
              ]}>
                <Text style={[styles.shadeIndicatorText, { color: textColor }]}>{optimalOrientation.shadeAnalysis.morningShade ? '🌤️ Gölge' : '☀️ Güneş'}</Text>
              </View>
            </View>
            <View style={styles.shadeItem}>
              <Text style={[styles.shadeLabel, { color: secondaryTextColor }]}>Öğleden Sonra</Text>
              <View style={[
                styles.shadeIndicator,
                optimalOrientation.shadeAnalysis.afternoonShade
                  ? styles.shadeIndicatorActive
                  : styles.shadeIndicatorInactive,
                { backgroundColor: optimalOrientation.shadeAnalysis.afternoonShade ? cardAltBg : softGoldBg },
              ]}>
                <Text style={[styles.shadeIndicatorText, { color: textColor }]}>{optimalOrientation.shadeAnalysis.afternoonShade ? '🌤️ Gölge' : '☀️ Güneş'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Güneş Yolu Bilgisi */}
      {optimalOrientation && (
        <View style={[styles.sunPathCard, themedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Güneş Yolu</Text>
          <View style={styles.sunPathInfo}>
            <View style={styles.sunPathItem}>
              <Text style={[styles.sunPathLabel, { color: mutedTextColor }]}>Doğuş</Text>
              <Text style={[styles.sunPathValue, { color: textColor }]}>{getDirectionName(optimalOrientation.sunPath.sunrise)}</Text>
              <Text style={[styles.sunPathDegrees, { color: secondaryTextColor }]}>{Math.round(optimalOrientation.sunPath.sunrise)}°</Text>
            </View>
            <View style={styles.sunPathArrow}><Text style={[styles.sunPathArrowText, { color: accentColor }]}>→</Text></View>
            <View style={styles.sunPathItem}>
              <Text style={[styles.sunPathLabel, { color: mutedTextColor }]}>Öğle</Text>
              <Text style={[styles.sunPathValue, { color: textColor }]}>{getDirectionName(optimalOrientation.sunPath.noon)}</Text>
              <Text style={[styles.sunPathDegrees, { color: secondaryTextColor }]}>{Math.round(optimalOrientation.sunPath.noon)}°</Text>
            </View>
            <View style={styles.sunPathArrow}><Text style={[styles.sunPathArrowText, { color: accentColor }]}>→</Text></View>
            <View style={styles.sunPathItem}>
              <Text style={[styles.sunPathLabel, { color: mutedTextColor }]}>Batış</Text>
              <Text style={[styles.sunPathValue, { color: textColor }]}>{getDirectionName(optimalOrientation.sunPath.sunset)}</Text>
              <Text style={[styles.sunPathDegrees, { color: secondaryTextColor }]}>{Math.round(optimalOrientation.sunPath.sunset)}°</Text>
            </View>
          </View>
        </View>
      )}

      {/* Bilgi Notu */}
      <View style={[styles.infoCard, { backgroundColor: cardAltBg, borderColor: isKampfireTheme ? borderColor : 'transparent' }]}>
        <Info size={20} color={infoColor} />
        <Text style={[styles.infoText, { color: isKampfireTheme ? secondaryTextColor : '#1e40af' }]}>
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
  kampfireHeader: {
    marginBottom: 20,
    paddingTop: 4,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
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
  shadowModelBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 16,
  },
  shadowModelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  shadowModelLabel: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shadowModelBadge: {
    fontSize: 10,
    color: '#1e40af',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
  },
  shadowModelDirection: {
    fontSize: 20,
    color: '#1e3a8a',
    fontWeight: '800',
    marginBottom: 4,
  },
  shadowModelDescription: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 17,
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
    borderWidth: 1,
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
