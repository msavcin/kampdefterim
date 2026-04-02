import React from 'react';
import { View, Image, Text } from 'react-native';
import { useTheme } from './ThemeProvider';

export default function FriendAvatar({ avatar_url, name, size = 36 }: { avatar_url?: string; name?: string; size?: number }) {
  const { colors } = useTheme();
  return avatar_url ? (
    <Image source={{ uri: avatar_url }} style={{ width: size, height: size, borderRadius: size / 2, marginRight: 10, backgroundColor: colors.border }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, marginRight: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.muted, fontWeight: 'bold', fontSize: size / 2 }}>{name && name.length > 0 ? name[0].toUpperCase() : '?'}</Text>
    </View>
  );
}
