import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from './ThemeProvider';
import ThemedButton from './ThemedButton';
import { Star, Trash2 } from 'lucide-react-native';
import { getRatingsForCampground, deleteMyRating } from '@/lib/ratingApi';

type CommentItem = {
  id?: number | string;
  user_name?: string | null;
  anon_name?: string | null;
  user_avatar?: string | null;
  rating: number;
  hide_user?: boolean;
  comment?: string | null;
  created_at?: string | null;
  mine?: boolean;
};

export default function RatingComment({ campingAreaId, currentUserId, perPage = 5, refreshKey, onDeleted }: { campingAreaId: string | number; currentUserId?: string | number; perPage?: number; refreshKey?: number; onDeleted?: () => void }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CommentItem[]>([]);
  const [aggregate, setAggregate] = useState<{ rating: number; review_count: number } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadPage = async (p: number) => {
    setLoading(true);
    try {
      const data: any = await getRatingsForCampground(campingAreaId, { page: p, per_page: perPage, include_aggregate: true, include_user: true });
      const fetched = Array.isArray(data.items) ? data.items : (Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : []));
      if (p === 1) setItems(fetched as CommentItem[]);
      else setItems(prev => [...prev, ...(fetched as CommentItem[])]);
      setAggregate(data.aggregate ?? null);
      // determine hasMore
      if (data.pagination && typeof data.pagination.total === 'number') {
        const total = Number(data.pagination.total);
        setHasMore(p * perPage < total);
      } else {
        setHasMore((fetched as any[]).length >= perPage);
      }
    } catch (e) {
      console.warn('[RatingComment] load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    if (campingAreaId) loadPage(1);
  }, [campingAreaId, refreshKey, currentUserId]);

  const loadMore = async () => {
    if (loading) return;
    const next = page + 1;
    setPage(next);
    await loadPage(next);
  };

  const avg = aggregate ? aggregate.rating : (items.length ? (items.reduce((s, it) => s + (it.rating || 0), 0) / items.length) : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.subHeading, { color: colors.text }]}>Yorumlar</Text>
      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Henüz yorum yok. İlk yorumu siz yapın!</Text>
      ) : (
        <View>
          {items.map((item) => {
            const hidden = (item as any).hide_user === true;
            const displayName = hidden ? 'Anonim' : (item.user_name || (item as any).anon_name || 'Kullanıcı Adı');
            const initial = (displayName || 'K').charAt(0).toUpperCase();
            return (
              <View key={String(item.id ?? Math.random())} style={[styles.commentItem, { borderColor: colors.surfaceVariant }]}>
                <View style={styles.commentHeader}>
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceVariant }]}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{displayName}</Text>
                      <View style={{ marginLeft: 8 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} size={14} color={i <= item.rating ? '#f59e0b' : colors.surfaceVariant} fill={i <= item.rating ? '#f59e0b' : 'none'} />
                      ))}
                    </View>
                  </View>
                  {item.mine && (
                    <View style={styles.commentActions}>
                      <TouchableOpacity onPress={() => {
                        Alert.alert('Yorumu sil', 'Yorumu silmek istediğinize emin misiniz?', [
                          { text: 'İptal', style: 'cancel' },
                          { text: 'Sil', style: 'destructive', onPress: async () => {
                            if (deleting) return;
                            setDeleting(true);
                            try {
                              await deleteMyRating(campingAreaId);
                              setPage(1);
                              await loadPage(1);
                              onDeleted?.();
                              Alert.alert('Başarılı', 'Yorumunuz silindi.');
                            } catch (e) {
                              console.warn('[RatingComment] delete error', e);
                              Alert.alert('Hata', (e as any)?.message || 'Yorum silinemedi');
                            } finally {
                              setDeleting(false);
                            }
                          } }
                        ]);
                      }} style={{ padding: 6 }}>
                        {deleting ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Trash2 size={18} color={colors.danger} />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {item.comment ? <Text style={[styles.commentText, { color: colors.textSecondary }]}>{item.comment}</Text> : null}
              </View>
            );
          })}
        </View>
      )}

      {hasMore && (
        <View style={{ marginTop: 12 }}>
          <ThemedButton variant="secondary" onPress={loadMore}>Daha Fazla Yorum</ThemedButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, borderRadius: 12, borderWidth: 1, marginVertical: 8 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  smallText: { fontSize: 13 },
  selectorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  starBtn: { padding: 6, marginRight: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 10, textAlignVertical: 'top' },
  actionsRow: { flexDirection: 'row', marginTop: 10 },
  subHeading: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 13 },
  commentItem: { borderTopWidth: 1, paddingVertical: 10, paddingHorizontal: 6 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentActions: { marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  commentText: { marginTop: 8, fontSize: 14 },
  rowCenter: { flexDirection: 'row', alignItems: 'center' }
});
