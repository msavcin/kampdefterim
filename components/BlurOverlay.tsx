import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function BlurOverlay({ visible }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} pointerEvents="auto" />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    zIndex: 99,
    // iOS için blur eklemek isterseniz:
    // backdropFilter: 'blur(6px)',
  },
});
