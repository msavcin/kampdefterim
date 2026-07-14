/**
 * Profil hub satırı — mockup A menü item
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from './ThemeProvider';

type Props = {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string | number;
  onPress: () => void;
  danger?: boolean;
};

function ProfileHubRowComponent({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  danger,
}: Props) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: danger
              ? colors.danger + '18'
              : colors.primaryLight,
          },
        ]}
      >
        {icon}
      </View>
      <View style={styles.textWrap}>
        <Text
          style={[
            styles.title,
            { color: danger ? colors.danger : colors.text },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge != null && badge !== '' ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.primaryLight },
          ]}
        >
          <Text style={[styles.badgeText, { color: colors.primary }]}>
            {badge}
          </Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

export const ProfileHubRow = memo(ProfileHubRowComponent);
export default ProfileHubRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '300',
    marginTop: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
