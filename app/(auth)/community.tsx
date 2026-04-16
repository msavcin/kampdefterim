import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { listCommunities, joinCommunity, getMe } from '../../lib/userCommunityApi';
import { apiFetch } from '../../lib/apiFetch';
import { API_URL } from '../../lib/config';
import { useRouter } from 'expo-router';
import { useTheme } from '../../components/ThemeProvider';

export default function CommunityScreen() {
  const { colors } = useTheme();
  const [communities, setCommunities] = useState<any[]>([]);
  const [communityConvsMap, setCommunityConvsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCommunities = async () => {
      setLoading(true);
      try {
        const data = await listCommunities();
        setCommunities(data);
        // fetch existing conversations to determine if a community conversation already exists
        try {
          const convRes = await apiFetch(`${API_URL}/chat/conversations`);
          if (convRes && convRes.ok) {
            const convData = await convRes.json();
            const arr = Array.isArray(convData) ? convData : [];
            const map: Record<string, any> = {};
            for (const c of arr) {
              try {
                const cid = c?.community_id ?? c?.community?.id ?? c?.metadata?.community_id ?? c?.meta?.community_id ?? null;
                if (cid) map[String(cid)] = c;
              } catch (e) { /* ignore per-conv errors */ }
            }
            setCommunityConvsMap(map);
          }
        } catch (e) { /* ignore conv fetch errors */ }
      } catch (error: any) {
        Alert.alert('Hata', error?.message || 'Topluluklar yüklenemedi.');
      } finally {
        setLoading(false);
      }
    };
    fetchCommunities();
  }, []);

  const handleJoin = async (communityId: number) => {
    setJoining(communityId);
    try {
      await joinCommunity(communityId);
      Alert.alert('Başarılı', 'Topluluğa katılım isteğiniz gönderildi.');
      // İsteğe bağlı: Ana ekrana yönlendir
      // router.replace('/');
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Katılım başarısız.');
    } finally {
      setJoining(null);
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>Topluluk Seç</Text>
      <FlatList
        data={communities}
        keyExtractor={(item, index) => {
          const base = item && (item.id ?? item.uuid ?? item.slug) ? (item.id ?? item.uuid ?? item.slug) : 'community';
          return `${String(base)}-${index}`;
        }}
        renderItem={({ item }) => {
          const conv = communityConvsMap[String(item.id)];
          const chatLabel = conv ? 'Sohbete Katıl' : 'Mesaj Başlat';
          const hasUnread = conv && Number(conv?.unread_count) > 0;
          return (
            <View style={[styles.communityItem, { borderColor: colors.border }]}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <Text style={[styles.communityName, { color: colors.text }]}>{item.name}</Text>
                {hasUnread && <View style={{ width:10, height:10, borderRadius:6, backgroundColor: colors.info, marginLeft:8 }} />}
              </View>
              <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                <Button
                  title={chatLabel}
                  onPress={async () => {
                    try {
                      const me = await getMe().catch(() => null);
                      if (me && me.community_id && Number(me.community_id) !== Number(item.id)) {
                        Alert.alert('Hata', 'Topluluğa üye değilseniz sohbet başlatamazsınız.');
                        return;
                      }
                      if (conv && (conv.id ?? conv.conversation_id ?? conv.conversation?.id)) {
                        router.push(`/chat/community/${item.id}`);
                        return;
                      }
                      try {
                        const createRes = await apiFetch(`${API_URL}/chat/conversations`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ community_id: Number(item.id) }),
                        });
                        if (createRes && createRes.ok) {
                          const created = await createRes.json();
                          const createdId = created?.id ?? created?.conversation_id ?? created?.conversation?.id;
                          if (createdId) {
                            router.push(`/chat/community/${item.id}`);
                            return;
                          }
                        }
                      } catch (e) { /* ignore create errors */ }
                      Alert.alert('Bilgi', 'Topluluk sohbetine yönlendiriliyorsunuz.');
                      router.push(`/chat/community/${item.id}`);
                    } catch (err) {
                      console.warn('[Community] start chat failed', err);
                      Alert.alert('Hata', 'Sohbet başlatılamadı.');
                    }
                  }}
                />
                <Button
                  title={joining === item.id ? 'Katılıyor...' : 'Katıl'}
                  onPress={() => handleJoin(item.id)}
                  disabled={joining === item.id}
                />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text>Hiç topluluk bulunamadı.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  communityItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  communityName: { fontSize: 18 },
});
