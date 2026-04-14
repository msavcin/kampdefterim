import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from './ThemeProvider';
import ThemedButton from './ThemedButton';
import { postRatingForCampground } from '@/lib/ratingApi';
import { getToken } from '@/lib/auth';

type RatingFormModalProps = {
  visible: boolean;
  onClose: () => void;
  campingAreaId: string | number;
  onSubmitted?: (res?: any) => void;
  defaultRating?: number;
  defaultComment?: string;
  defaultAnonName?: string;
};

export default function RatingFormModal({
  visible,
  onClose,
  campingAreaId,
  onSubmitted,
  defaultRating,
  defaultComment,
  defaultAnonName,
}: RatingFormModalProps) {
  const { colors } = useTheme();
  const [comment, setComment] = useState('');
  const [anonName, setAnonName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await getToken();
        if (mounted) setIsLoggedIn(!!token);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!visible) {
      setComment('');
      setAnonName('');
    } else {
      setComment(defaultComment ?? '');
      setAnonName(defaultAnonName ?? '');
    }
  }, [visible, defaultComment, defaultAnonName]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: any = { comment: comment.trim() || undefined };
      if (!isLoggedIn && anonName.trim()) payload.anon_name = anonName.trim();
      if (typeof defaultRating === 'number' && Number.isFinite(defaultRating)) {
        const r = Math.min(5, Math.max(1, Math.round(defaultRating)));
        payload.rating = r;
      }
      const res = await postRatingForCampground(campingAreaId, payload);
      onSubmitted?.(res);
      onClose();
    } catch (e: any) {
      console.warn('[RatingFormModal] submit error', e);
      Alert.alert('Hata', e?.message || 'Gönderim başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 10 }}>Yorum Yap / Güncelle</Text>

          {!isLoggedIn && (
            <TextInput
              value={anonName}
              onChangeText={setAnonName}
              placeholder="Kullanıcı adı (isteğe bağlı)"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            />
          )}


          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Yorumun (isteğe bağlı)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { borderColor: colors.border, color: colors.text, minHeight: 100 }]}
            multiline
            numberOfLines={4}
          />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, backgroundColor: colors.surfaceVariant, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>İptal</Text>
            </TouchableOpacity>
            <ThemedButton variant="primary" onPress={handleSubmit} style={{ flex: 1 }} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : 'Gönder'}
            </ThemedButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 8, backgroundColor: 'transparent' },
});
