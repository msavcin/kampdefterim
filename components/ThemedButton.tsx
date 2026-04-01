import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

type Props = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  disabled?: boolean;
};

export default function ThemedButton({ variant = 'primary', children, onPress, style, disabled }: Props) {
  const { theme } = useTheme();
  const variants: Record<string, { backgroundColor: string; color: string; borderColor?: string }> = {
    primary: { backgroundColor: theme.colors.primary, color: '#fff' },
    secondary: { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border },
    ghost: { backgroundColor: 'transparent', color: theme.colors.primary },
    danger: { backgroundColor: theme.colors.danger, color: '#fff' },
  };

  const vs = variants[variant] || variants.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, { backgroundColor: vs.backgroundColor, borderColor: vs.borderColor || 'transparent' }, style]}
    >
      <Text style={[styles.txt, { color: vs.color }]}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  txt: {
    fontSize: 14,
    fontWeight: '600',
  },
});
