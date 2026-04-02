import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { badgeSizes, getBadgeVariantColors, type BadgeVariant, type BadgeSize } from '../constants/theme/badges';

type Props = {
  /** default | primary | primaryLight | danger | warning | success | info | muted | outline */
  variant?: BadgeVariant;
  /** xs | sm | md | lg */
  size?: BadgeSize;
  children: React.ReactNode;
  /** Sola ikon eklemek için */
  icon?: React.ReactNode;
  style?: any;
};

/**
 * Eski variant isimleri → yeni isimlere dönüştürme (geriye dönük uyumluluk)
 */
const legacyVariantMap: Record<string, BadgeVariant> = {
  light: 'primaryLight',
};

export default function Badge({ variant = 'default', size = 'md', children, icon, style }: Props) {
  const { colors } = useTheme();
  const resolvedVariant = legacyVariantMap[variant] ?? variant;
  const vs = getBadgeVariantColors(resolvedVariant, colors);
  const sizeConfig = badgeSizes[size] ?? badgeSizes.md;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: vs.backgroundColor,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          paddingVertical: sizeConfig.paddingVertical,
          borderRadius: sizeConfig.borderRadius,
          borderWidth: vs.borderColor ? 1 : 0,
          borderColor: vs.borderColor || 'transparent',
        },
        style,
      ]}
    >
      {icon && <View style={{ marginRight: 4 }}>{icon}</View>}
      <Text
        style={{
          color: vs.textColor,
          fontSize: sizeConfig.fontSize,
          fontWeight: sizeConfig.fontWeight,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
});
