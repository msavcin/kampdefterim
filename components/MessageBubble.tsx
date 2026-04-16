import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import FriendAvatar from './FriendAvatar';
import { useTheme } from './ThemeProvider';

export default function MessageBubble({
  message,
  isMe,
  onDelete,
  senderName,
  senderAvatarUrl,
}: {
  message: any;
  isMe: boolean;
  onDelete?: (id: any) => void;
  senderName?: string;
  senderAvatarUrl?: string;
}) {
  const { colors } = useTheme();
  const isDeleted = !!(message?.is_deleted || message?.deleted || message?.isDeleted);
  const handleLongPress = () => {
    if (!isMe || !onDelete || isDeleted) return;
    const targetId = message?.id ?? message?.message_id ?? message?.messageId ?? null;
    if (!targetId) return;
    Alert.alert('Mesajı sil', 'Bu mesajı silmek istediğinizden emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => onDelete(targetId) },
    ]);
  };

  const rawText = message?.text ?? message?.body ?? '';
  let cleanText: any = rawText;
  if (typeof rawText === 'string') {
    try { cleanText = rawText.normalize?.('NFC') ?? rawText; } catch (e) { cleanText = rawText; }
    cleanText = cleanText.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\uFEFF]/g, '');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
  }

  const messageSender = message?.sender ?? message?.from ?? message?.user ?? message?.author ?? message?.participant;
  const inferredName = senderName
    || message?.sender_name
    || message?.senderName
    || message?.sender_username
    || message?.senderUsername
    || message?.name
    || message?.username
    || (messageSender && (messageSender.name || messageSender.full_name || messageSender.display_name || messageSender.username));
  const inferredAvatar = senderAvatarUrl
    || message?.sender_avatar_url
    || message?.senderAvatar
    || message?.avatar_url
    || message?.avatar
    || (messageSender && (messageSender.avatar_url || messageSender.avatar || messageSender.avatarUrl || messageSender.photo));

  const androidTextProps = Platform.OS === 'android' ? ({ includeFontPadding: false, textBreakStrategy: 'balanced' } as any) : {};

  return (
    <View style={[styles.container, isMe ? styles.right : styles.left]}>
      {!isMe && inferredAvatar ? (
        <FriendAvatar avatar_url={inferredAvatar} name={String(inferredName || '?')} size={32} />
      ) : null}
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={handleLongPress}
        style={[styles.touchable, !isMe ? styles.touchableIncoming : undefined]}
      >
        <View style={[
          styles.bubble,
          isMe ? styles.bubbleRight : styles.bubbleLeft,
          { backgroundColor: isMe ? colors.primary : colors.surfaceVariant },
        ]}>
          {!isMe && inferredName ? (
            <Text allowFontScaling={false} style={[styles.senderName, { color: colors.muted }]}>{String(inferredName)}</Text>
          ) : null}
          {isDeleted ? (
            <Text
              allowFontScaling={false}
              {...androidTextProps}
              style={[
                styles.text,
                styles.deletedText,
                { color: isMe ? '#fff' : colors.muted },
              ]}
            >
              Mesaj silindi
            </Text>
          ) : (
            <Text allowFontScaling={false} {...androidTextProps} style={[styles.text, isMe ? styles.textRight : styles.textLeft, { color: isMe ? '#fff' : colors.text }]}> 
              {cleanText}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 6, paddingHorizontal: 10, flexDirection: 'row', width: '100%', alignItems: 'flex-start' },
  touchable: { alignSelf: 'flex-start', maxWidth: '85%' },
  touchableIncoming: { flex: 1 },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '100%', padding: 12, borderRadius: 16, minWidth: 0 },
  bubbleLeft: { borderTopLeftRadius: 0, alignSelf: 'flex-start' },
  bubbleRight: { borderTopRightRadius: 0, alignSelf: 'flex-end' },
  text: { fontSize: 16, lineHeight: 20, flexShrink: 1, flexWrap: 'wrap', minWidth: 0 },
  textLeft: { textAlign: 'left' },
  textRight: { textAlign: 'right' },
  senderName: { fontSize: 12, marginBottom: 4, fontWeight: '600' },
  deletedText: { color: '#888', fontStyle: 'italic' },
  debugContainer: { marginTop: 8, padding: 8, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8 },
  debugLabel: { fontSize: 12, fontWeight: '700', color: '#333', marginTop: 4 },
  debugText: { fontSize: 12, color: '#333', marginTop: 2 },
});
