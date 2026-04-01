import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

type Props = {
  variant?: 'default' | 'primary' | 'light' | 'danger';
  children: React.ReactNode;
  style?: any;
};

export default function Badge({ variant = 'default', children, style }: Props) {
  const { theme } = useTheme();
  const variants: Record<string, { backgroundColor: string; color: string }> = {
    default: { backgroundColor: theme.colors.surface, color: theme.colors.muted },
    primary: { backgroundColor: theme.colors.primary, color: '#fff' },
    light: { backgroundColor: '#F1F5F9', color: theme.colors.text },
    danger: { backgroundColor: theme.colors.danger, color: '#fff' },
  };
  const vs = variants[variant] || variants.default;

  return (
    <View style={[styles.badge, { backgroundColor: vs.backgroundColor }, style]}>
      <Text style={{ color: vs.color, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
});
