import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { listCommunities, joinCommunity } from '../../lib/userCommunityApi';
import { useRouter } from 'expo-router';
import { useTheme } from '../../components/ThemeProvider';

export default function CommunityScreen() {
  const { colors } = useTheme();
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCommunities = async () => {
      setLoading(true);
      try {
        const data = await listCommunities();
        setCommunities(data);
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
        renderItem={({ item }) => (
          <View style={[styles.communityItem, { borderColor: colors.border }]}>
            <Text style={[styles.communityName, { color: colors.text }]}>{item.name}</Text>
            <Button
              title={joining === item.id ? 'Katılıyor...' : 'Katıl'}
              onPress={() => handleJoin(item.id)}
              disabled={joining === item.id}
            />
          </View>
        )}
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
