import React, { useEffect, useState, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Platform, AppState } from 'react-native';
import * as Location from 'expo-location';
import { Navigation } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { eventBus } from '../lib/eventBus';



interface LocationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onPermissionGranted?: () => void;
}


function LocationPermissionModal({ visible, onClose, onPermissionGranted }: LocationPermissionModalProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [doNotRemind, setDoNotRemind] = useState(false);
  const isMounted = useRef(true);
  const appStateListener = useRef<any>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (appStateListener.current) {
        appStateListener.current.remove();
        appStateListener.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const { getMe } = require('../lib/userCommunityApi');
        const user = await getMe();
        const premium = !!user?.offline_enabled;
        console.log('[PERMISSION MODAL] Premium durumu:', premium, 'User:', user);
        if (isMounted.current && visible) {
          setIsPremium(premium);
        }
      } catch (e) {
        console.log('[PERMISSION MODAL] Premium kontrol hatası:', e);
        if (isMounted.current && visible) {
          setIsPremium(false);
        }
      }
    })();
  }, [visible]);

  // Uygulama ön plana geldiğinde izin durumunu kontrol et
  useEffect(() => {
    if (!visible) {
      if (appStateListener.current) {
        appStateListener.current.remove();
        appStateListener.current = null;
      }
      return;
    }

    const checkPermissionOnFocus = async () => {
      if (!isMounted.current || !visible) return;
      try {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (!isMounted.current || !visible) return;
        console.log('[PERMISSION MODAL] AppState check - Foreground izin:', foreground.status);
        if (foreground.status === 'granted') {
          try { eventBus.emit('locationPermissionGranted', { fromModal: true }); } catch (e) {}
          if (!isMounted.current || !visible) return;
          onPermissionGranted?.();
          onClose();
        }
      } catch (error) {
        console.error('[PERMISSION MODAL] İzin kontrolü hatası:', error);
      }
    };

    checkPermissionOnFocus();
    if (appStateListener.current) {
      appStateListener.current.remove();
      appStateListener.current = null;
    }
    appStateListener.current = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isMounted.current && visible) {
        checkPermissionOnFocus();
      }
    });
    return () => {
      if (appStateListener.current) {
        appStateListener.current.remove();
        appStateListener.current = null;
      }
    };
  }, [visible, isPremium, onPermissionGranted, onClose]);

  const handleRequestPermission = async () => {
    if (!isMounted.current || !visible) return;
    console.log('[PERMISSION MODAL] İzin isteniyor... isPremium:', isPremium);
    try {
      const existingStatus = await Location.getForegroundPermissionsAsync();
      if (!isMounted.current || !visible) return;
      if (existingStatus.status === 'denied' && !existingStatus.canAskAgain) {
        Linking.openSettings();
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMounted.current || !visible) return;
      console.log('[PERMISSION MODAL] Foreground izin sonucu:', status);
      if (status === 'granted') {
        // Foreground izin verildi - event emit et ve modalı kapat
        console.log('[PERMISSION MODAL] Foreground izin verildi');
        try {
          eventBus.emit('locationPermissionGranted', { fromModal: true });
        } catch (e) {
          console.error('[PERMISSION MODAL] EventBus hatası:', e);
        }
        if (!isMounted.current || !visible) return;
        onPermissionGranted?.();
        onClose();
        return;
      } else {
        Linking.openSettings();
        return;
      }
    } catch (error) {
      console.error('[PERMISSION MODAL] Konum izni hatası:', error);
    }
  };

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="slide" 
      onRequestClose={onClose}
      hardwareAccelerated
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Navigation size={48} color="#059669" />
          </View>
          <Text style={styles.title}>Konum İzni Neden Gerekli?</Text>
          <Text style={styles.description}>
            Kamp alanlarını haritada gösterebilmek ve size en yakın noktaları sunabilmek için konum iznine ihtiyacımız var.
          </Text>
          <View style={styles.features}>
            <Text style={styles.featureItem}>📍 Yakınımdaki kamp alanlarını göster</Text>
            <Text style={styles.featureItem}>🗺️ Haritada konumumu göster</Text>
            <Text style={styles.featureItem}>📏 Mesafe hesaplamalarını yap</Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleRequestPermission}>
            <Text style={styles.buttonText}>Konum İzni Ver</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={async () => {
            if (!isMounted.current) return;
            let storeError = null;
            if (doNotRemind) {
              try {
                await SecureStore.setItemAsync('doNotShowLocationPermissionModal', 'true');
              } catch (e) {
                storeError = e;
                console.error('[PERMISSION MODAL] SecureStore hatası:', e);
              }
            }
            // SecureStore işlemi tamamlandıktan sonra modalı kapat
            if (!isMounted.current) return;
            onClose();
          }}>
            <Text style={styles.closeButtonText}>Daha Sonra</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.checkboxContainer} 
            onPress={() => {
              if (isMounted.current) setDoNotRemind(!doNotRemind);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, doNotRemind && styles.checkboxChecked]}>
              {doNotRemind && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Bir daha hatırlatma</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Profil sayfasından tekrar açabilirsiniz</Text>
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
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9ca3af',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default LocationPermissionModal;
