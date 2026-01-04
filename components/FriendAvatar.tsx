import React from 'react';
import { View, Image, Text } from 'react-native';

export default function FriendAvatar({ avatar_url, name, size = 36 }: { avatar_url?: string; name?: string; size?: number }) {
  return avatar_url ? (
    <Image source={{ uri: avatar_url }} style={{ width: size, height: size, borderRadius: size / 2, marginRight: 10, backgroundColor: '#e5e7eb' }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, marginRight: 10, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#6b7280', fontWeight: 'bold', fontSize: size / 2 }}>{name && name.length > 0 ? name[0].toUpperCase() : '?'}</Text>
    </View>
  );
}
