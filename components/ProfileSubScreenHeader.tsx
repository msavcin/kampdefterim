/**
 * Alt profil ekranları için geri başlık
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from './ThemeProvider';

type Props = {
  title: string;
  onBack?: () => void;
};

function ProfileSubScreenHeaderComponent({ title, onBack }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onBack || (() => router.back())}
        style={styles.back}
        hitSlop={10}
        accessibilityLabel="Geri"
      >
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right} />
    </View>
  );
}

export const ProfileSubScreenHeader = memo(ProfileSubScreenHeaderComponent);
export default ProfileSubScreenHeader;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  right: {
    width: 40,
  },
});
