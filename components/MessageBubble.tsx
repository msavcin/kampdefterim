import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';

export default function MessageBubble({ message, isMe, onDelete }: { message: any; isMe: boolean; onDelete?: (id: any) => void }) {
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
    // remove control chars, format chars, line/paragraph separators, zero-width and similar
    cleanText = cleanText.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\uFEFF]/g, '');
    // collapse remaining whitespace to single spaces
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
  }
  const androidTextProps = Platform.OS === 'android' ? ({ includeFontPadding: false, textBreakStrategy: 'balanced' } as any) : {};

  return (
    <View style={[styles.container, isMe ? styles.right : styles.left]}>
      <TouchableOpacity activeOpacity={0.85} onLongPress={handleLongPress} style={styles.touchable}>
        <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          {isDeleted ? (
            <Text allowFontScaling={false} {...androidTextProps} style={[styles.text, styles.deletedText]}>Mesaj silindi</Text>
          ) : (
            <Text allowFontScaling={false} {...androidTextProps} style={[styles.text, isMe ? styles.textRight : styles.textLeft]}>{cleanText}</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 6, paddingHorizontal: 10, flexDirection: 'row', width: '100%' },
  touchable: { alignSelf: 'flex-start', maxWidth: '85%' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '100%', padding: 12, borderRadius: 16, minWidth: 0 },
  bubbleLeft: { backgroundColor: '#efefef', borderTopLeftRadius: 0, alignSelf: 'flex-start' },
  bubbleRight: { backgroundColor: '#0b93f6', borderTopRightRadius: 0, alignSelf: 'flex-end' },
  text: { fontSize: 16, lineHeight: 20, flexShrink: 1, flexWrap: 'wrap', minWidth: 0 },
  textLeft: { color: '#111', textAlign: 'left' },
  textRight: { color: '#fff', textAlign: 'right' },
  deletedText: { color: '#888', fontStyle: 'italic' },
  debugContainer: { marginTop: 8, padding: 8, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8 },
  debugLabel: { fontSize: 12, fontWeight: '700', color: '#333', marginTop: 4 },
  debugText: { fontSize: 12, color: '#333', marginTop: 2 },
});
