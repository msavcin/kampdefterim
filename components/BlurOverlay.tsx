import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';

interface BlurOverlayProps {
  visible: boolean;
  onPremiumPress?: () => void;
}

export default function BlurOverlay({ visible, onPremiumPress }: BlurOverlayProps) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} pointerEvents="auto">
      {onPremiumPress && (
        <View style={styles.content}>
          <Text style={styles.title}>🔒 Premium Özellik</Text>
          <Text style={styles.message}>
            Offline modda haritaları kullanabilmek için Premium aboneliğe ihtiyacınız var
          </Text>
          <TouchableOpacity style={styles.premiumButton} onPress={onPremiumPress}>
            <Text style={styles.premiumButtonText}>Premium Ol!</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 99,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  premiumButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
