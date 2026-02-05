import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Navigation } from 'lucide-react-native';



interface LocationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onPermissionGranted?: () => void;
}

function LocationPermissionModal({ visible, onClose, onPermissionGranted }: LocationPermissionModalProps) {

  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const { getMe } = require('../lib/userCommunityApi');
        const user = await getMe();
        const premium = !!user?.offline_enabled;
        console.log('[PERMISSION MODAL] Premium durumu:', premium, 'User:', user);
        setIsPremium(premium);
      } catch (e) {
        console.log('[PERMISSION MODAL] Premium kontrol hatası:', e);
        setIsPremium(false);
      }
    })();
  }, [visible]);

  const handleRequestPermission = async () => {
    console.log('[PERMISSION MODAL] İzin isteniyor... isPremium:', isPremium);
    try {
      // Önce mevcut izin durumunu kontrol et
      const existingStatus = await Location.getForegroundPermissionsAsync();
      if (existingStatus.status === 'denied' && !existingStatus.canAskAgain) {
        Linking.openSettings();
        return;
      }
      // Foreground izin iste
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[PERMISSION MODAL] Foreground izin sonucu:', status);

      if (status === 'granted') {
        if (isPremium && Platform.OS !== 'web') {
          // Premium kullanıcıda background izni de iste
          const bgStatus = await Location.getBackgroundPermissionsAsync();
          if (bgStatus.status !== 'granted') {
            const { status: bgRequestStatus } = await Location.requestBackgroundPermissionsAsync();
            if (bgRequestStatus !== 'granted') {
              alert('Offline Mode için konum iznini "Her zaman izin ver" olarak ayarlamanız gerekmektedir. Lütfen uygulama ayarlarından izin verin.');
              Linking.openSettings();
              // Modalı açık bırak (return ile çık)
              return;
            } else {
              // Background izin verildi, modalı kapat
              onPermissionGranted?.();
              onClose();
              return;
            }
          } else {
            // Zaten background izin granted, modalı kapat
            onPermissionGranted?.();
            onClose();
            return;
          }
        } else {
          // Premium değilse, foreground izin yeterli, modalı kapat
          onPermissionGranted?.();
          onClose();
          return;
        }
      } else {
        Linking.openSettings();
        // Modalı açık bırak
        return;
      }
    } catch (error) {
      console.error('[PERMISSION MODAL] Konum izni hatası:', error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Navigation size={48} color="#059669" />
          </View>
          <Text style={styles.title}>Konum İzni Neden Gerekli?</Text>
          <Text style={styles.description}>
            {isPremium ? (
              <>
                Kamp alanlarını haritada gösterebilmek ve size en yakın noktaları sunabilmek için konum iznine ihtiyacımız var.{"\n"}
                <Text style={{ fontWeight: 'bold', color: '#059669' }}>
                  {"\n"}Premium (Offline Mode) özelliğini tam kullanabilmek için konum izninizin <Text style={{ textDecorationLine: 'underline' }}>'Her zaman İzin Ver'</Text> olarak ayarlanması gerekmektedir. Böylece haritalar internetiniz olmasa bile otomatik olarak konumunuza göre saklanacaktır. Konum izinleri ile ilgili detaylı bilgiye <Text style={{ textDecorationLine: 'underline', color: '#059669' }} onPress={() => Linking.openURL('https://kampdefterim.com/konum-izinleri.html')}>buradan</Text> ulaşabilirsiniz.
                </Text>
              </>
            ) : (
              'Kamp alanlarını haritada gösterebilmek ve size en yakın noktaları sunabilmek için konum iznine ihtiyacımız var.'
            )}
          </Text>
          <View style={styles.features}>
            <Text style={styles.featureItem}>📍 Yakınımdaki kamp alanlarını göster</Text>
            <Text style={styles.featureItem}>🗺️ Haritada konumumu göster</Text>
            <Text style={styles.featureItem}>📏 Mesafe hesaplamalarını yap</Text>
            {isPremium ? <Text style={styles.featureItem}>🔋 Offline Mode için arka planda harita yükle</Text> : null}
          </View>
          <TouchableOpacity style={styles.button} onPress={handleRequestPermission}>
            <Text style={styles.buttonText}>Konum İzni Ver</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Daha Sonra</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  features: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  featureItem: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  closeButtonText: {
    color: '#6b7280',
    fontSize: 15,
  },
});

export default LocationPermissionModal;
