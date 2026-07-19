/**
 * Profil → Görünüm
 * Route: /profile-appearance
 */

import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeProvider';
import ProfileSubScreenHeader from '../components/ProfileSubScreenHeader';
import ProfileThemeSection from '../components/ProfileThemeSection';

export default function ProfileAppearanceScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    const onBack = () => {
      router.replace('/profile');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <ProfileSubScreenHeader title="Görünüm" onBack={() => router.replace('/profile')} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <ProfileThemeSection />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
});
