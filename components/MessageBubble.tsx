import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import FriendAvatar from './FriendAvatar';
import ThemedIcon from './ThemedIcon';
import { useTheme } from './ThemeProvider';

/** Mesaj zaman damgasını HH:mm veya "Dün HH:mm" veya "GG.AA HH:mm" formatında döner. */
function formatMsgTime(message: any): string {
  const raw =
    message?.meta?.client_sent_at ??
    message?.timestamp ??
    message?.created_at ??
    message?.createdAt ??
    message?.sent_at;
  if (!raw) return '';
  try {
    const ms = typeof raw === 'number' ? raw : Date.parse(String(raw));
    if (!ms || isNaN(ms)) return '';
    const d = new Date(ms);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return timeStr;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return `Dün ${timeStr}`;
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${timeStr}`;
  } catch {
    return '';
  }
}

export default function MessageBubble({
  message,
  isMe,
  onDelete,
  senderName,
  senderAvatarUrl,
  isOffline,
}: {
  message: any;
  isMe: boolean;
  onDelete?: (id: any) => void;
  senderName?: string;
  senderAvatarUrl?: string;
  isOffline?: boolean;
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

  const rawText = message?.text ?? message?.body ?? message?.content ?? message?.message ?? '';
  let cleanText: string = '';
  const sanitize = (s: string) => {
    try { s = s.normalize?.('NFC') ?? s; } catch { /* ignore */ }
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\uFEFF]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  };

  if (typeof rawText === 'string') {
    cleanText = sanitize(rawText);
  } else if (rawText && typeof rawText === 'object') {
    // Eğer text alanı nesne olarak geliyorsa içindeki olası metin alanlarını dene
    const inner = (rawText as any).text ?? (rawText as any).body ?? (rawText as any).content ?? (rawText as any).message ?? null;
    if (typeof inner === 'string') {
      cleanText = sanitize(inner);
    } else {
      // Medya veya meta içeren mesajlar için kullanıcıya gösterilecek kısa placeholder
      if (Array.isArray(message?.attachments) && message.attachments.length > 0) {
        cleanText = '[Medya]';
      } else if (message?.meta && Object.keys(message.meta || {}).length > 0) {
        cleanText = '[İçerik]';
      } else {
        // Son çare: boş string (render hatasını önlemek için)
        cleanText = '';
      }
    }
  } else {
    cleanText = '';
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

  const androidTextProps = Platform.OS === 'android' ? ({ includeFontPadding: false, textBreakStrategy: 'simple' } as any) : {};
  const timeStr = formatMsgTime(message);

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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
            {timeStr ? (
              <Text
                allowFontScaling={false}
                style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.65)' : colors.muted }]}
              >
                {timeStr}
              </Text>
            ) : null}
            {isOffline ? (
              <View style={{ marginLeft: 6 }}>
                <ThemedIcon name="WifiOff" size={12} color={isMe ? 'rgba(255,255,255,0.65)' : colors.muted} />
              </View>
            ) : null}
          </View>
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
  timeText: { fontSize: 11, marginTop: 4, opacity: 0.85 },
  debugContainer: { marginTop: 8, padding: 8, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8 },
  debugLabel: { fontSize: 12, fontWeight: '700', color: '#333', marginTop: 4 },
  debugText: { fontSize: 12, color: '#333', marginTop: 2 },
});
