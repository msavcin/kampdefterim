import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeProvider';
import ProfileSubScreenHeader from '../components/ProfileSubScreenHeader';
import FriendAvatar from '../components/FriendAvatar';
import { Mail, Trash, CheckCircle } from 'lucide-react-native';
import { getToken } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { apiFetch } from '@/lib/apiFetch';
import { openConversationOrCommunity } from '@/lib/chatNavigation';
import { getMe } from '@/lib/userCommunityApi';
import { setLargeItemAsync, getLargeItemAsync } from '@/lib/largeStorage';
import { Friend } from '../types/friend';
import { useRouter } from 'expo-router';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { offlineTransportManager } from '@/lib/offlineTransport';

export default function ProfileFriendsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  React.useEffect(() => {
    const onBack = () => {
      router.replace('/profile');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);
  const isConnected = useNetworkStatus();

  const [user, setUser] = useState<any>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [requestedUserIds, setRequestedUserIds] = useState<number[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [nearbyPeerIds, setNearbyPeerIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        const resolvedUser = (function () {
          if (!me) return null;
          const accountUser = me?.member?.user ?? me?.user ?? null;
          if (accountUser) {
            return {
              ...me,
              ...accountUser,
              role: accountUser.role ?? me.role,
              offline_enabled: !!(me.offline_enabled || accountUser.offline_enabled),
            };
          }
          return { ...me, role: me.role };
        })();
        setUser(resolvedUser);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (isConnected) fetchFriends();
  }, [isConnected]);

  // Yakın peer'ları dinle — hotspot ile bulunan kullanıcıları işaretlemek için
  useEffect(() => {
    const sync = (peers: any[]) => {
      try {
        setNearbyPeerIds(Array.isArray(peers) ? peers.map((p) => String(p.userId)) : []);
      } catch (e) {
        setNearbyPeerIds([]);
      }
    };
    // İlk durum
    sync(offlineTransportManager.peers || []);
    const unsub = offlineTransportManager.onPeersChanged(sync);
    return () => {
      try { unsub(); } catch {};
    };
  }, []);

  useEffect(() => {
    fetchFriendRequests(true);
  }, []);

  const fetchFriends = async () => {
    try {
      setFriendError(null);
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        const mapped: Friend[] = data.map((f: any) => {
          const idFromTag = typeof f.tag === 'string' && f.tag.startsWith('#') ? Number(f.tag.replace('#', '')) : undefined;
          const idCandidate = f.user_id ?? f.id ?? idFromTag;
          const resolvedId = typeof idCandidate !== 'undefined' && idCandidate !== null ? Number(idCandidate) : undefined;
          return {
            id: resolvedId,
            username: f.username,
            tag: f.tag,
            name: f.name || '',
            email: f.email || '',
            avatar_url: f.avatar_url || '',
          };
        });
        setFriends(mapped);
      } else {
        setFriends([]);
      }
    } catch (e) {
      setFriendError('Arkadaşlar alınamadı');
    }
  };

  const fetchFriendRequests = async (showNotification = false) => {
    setFriendRequestsLoading(true);
    setFriendError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const mapped = Array.isArray(data)
        ? data.map((req: any) => ({
            id: req.id,
            user_id: req.user_id,
            name: req.requester?.name || '',
            username: req.requester?.username || '',
            email: req.requester?.email || '',
            avatar_url: req.requester?.avatar_url || '',
            tag: req.requester?.tag || '',
          }))
        : [];
      setFriendRequests(mapped);
      if (showNotification && mapped.length > 0) {
        try {
          const shownIdsStr = await getLargeItemAsync('shownFriendRequestIds');
          const shownIds = shownIdsStr ? JSON.parse(shownIdsStr) : [];
          const newRequests = mapped.filter((req) => !shownIds.includes(req.id));
          if (newRequests.length > 0) {
            Alert.alert('Yeni Arkadaşlık İsteği', `${newRequests.length} yeni arkadaşlık isteğiniz var!`, [
              {
                text: 'Tamam',
                onPress: async () => {
                  const allIds = [...shownIds, ...newRequests.map((r) => r.id)];
                  await setLargeItemAsync('shownFriendRequestIds', JSON.stringify(allIds));
                },
              },
            ]);
          }
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      setFriendError('İstekler alınamadı');
    } finally {
      setFriendRequestsLoading(false);
    }
  };

  const respondFriendRequest = async (request_id: number, status: 'accepted' | 'rejected') => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ request_id, status }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Yanıt gönderilemedi');
      Alert.alert('Başarılı', status === 'accepted' ? 'Arkadaşlık isteği kabul edildi!' : 'İstek reddedildi');
      fetchFriendRequests();
      fetchFriends();
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Yanıt gönderilemedi');
    }
  };

  const sendFriendRequest = async (friend_id: number) => {
    setFriendRequestLoading(true);
    setFriendError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ friend_id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'İstek gönderilemedi');
      setRequestedUserIds((prev) => [...prev, friend_id]);
      Alert.alert('Başarılı', 'Arkadaşlık isteği gönderildi!');
    } catch (e: any) {
      setFriendError(e?.message || 'İstek gönderilemedi');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  const handleOpenFriendConversation = async (friend: any) => {
    if (!friend?.id) {
      Alert.alert('Hata', 'Bu kullanıcı için alıcı kimliği yok.');
      return;
    }

    const currentUserId = user?.id ?? user?.user_id ?? user?.userId ?? user?.member?.user?.id;
    const recipientId = Number(friend.id);
    const participantIds = [String(recipientId)];
    if (currentUserId != null) participantIds.unshift(String(currentUserId));

    if (currentUserId) {
      try {
        const buildQuery = (order: [string, string]) => `${order[0]},${order[1]}`;
        const queries = [
          buildQuery([String(currentUserId), String(friend.id)]),
          buildQuery([String(friend.id), String(currentUserId)]),
        ];
        for (const query of queries) {
          try {
            const res = await apiFetch(`${API_URL}/chat/conversations?participant_ids=${encodeURIComponent(query)}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (!Array.isArray(data)) continue;
            const found = data.find((c: any) => {
              const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
              return convId != null && !c?.community_id;
            });
            const convId = found?.id ?? found?.conversation_id ?? found?.conversation?.id;
            if (convId) {
              try {
                await openConversationOrCommunity(router, convId, { replace: false });
                return;
              } catch (e) {
                // fallback
              }
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    }

    try {
      const msgPayload: any = {
        actualRecipientId: recipientId,
        recipient_id: recipientId,
        participant_ids: participantIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id)),
      };
      const res = await apiFetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgPayload),
      });
      if (res) {
        const text = await res.text();
        let responseData: any = null;
        try {
          responseData = text ? JSON.parse(text) : null;
        } catch (parseErr) {
          // ignore
        }
        const convId = responseData?.conversation_id ?? responseData?.conversation?.id ?? responseData?.id ?? responseData?.message?.conversation_id ?? responseData?.message?.conversation?.id;
        if (convId) {
          await openConversationOrCommunity(router, convId, { replace: false });
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    // Fallback: open new chat composer with recipient
    router.push({ pathname: '/chat/new', params: { recipientId: String(friend.id) } } as any);
  };

  const handleFriendSearch = async () => {
    if (!friendSearch.trim()) return;
    setFriendSearchLoading(true);
    setFriendError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/friendships/users/search?username=${encodeURIComponent(friendSearch)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const mapped = Array.isArray(data)
        ? data
            .filter((u: any) => {
              if (!user) return true;
              if (u.isSelf === true || u.isSelf === 'true') return false;
              const userId = u.userId || u.id;
              return userId !== user.id && u.username !== user.username;
            })
            .map((u: any) => ({
              id: u.userId || u.id,
              username: u.username || '',
              name: u.name || u.fullName || '',
              tag: u.tag || '',
              avatar_url: u.avatarUrl || u.image || u.avatar_url || '',
            }))
        : [];
      const filtered = mapped.filter((u) => !friends.some((f) => f.id === u.id));
      setSearchResults(filtered);
    } catch (e) {
      setFriendError('Arama başarısız');
    } finally {
      setFriendSearchLoading(false);
    }
  };

  // Otomatik arama: Kullanıcı en az 3 karakter yazdığında, debounce ile arama tetikle
  useEffect(() => {
    const q = friendSearch.trim();
    if (q === '') {
      setSearchResults([]);
      return;
    }
    const handler = setTimeout(() => {
      if (q.length >= 3) {
        handleFriendSearch();
      }
    }, 350);
    return () => clearTimeout(handler);
  }, [friendSearch]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      <ProfileSubScreenHeader title="Arkadaşlar" onBack={() => router.replace('/profile')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Arkadaşlarım</Text>

          {/* Arkadaş ekle (üstte) */}
          <View style={{ marginTop: 8, marginBottom: 8 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Arkadaş ekle</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                placeholder="Kullanıcı adı ara..."
                placeholderTextColor={colors.muted}
                value={friendSearch}
                onChangeText={setFriendSearch}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />

            </View>
            {friendSearchLoading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
            {searchResults.length > 0 && (
              <View style={{ marginTop: 8 }}>
                {searchResults.map((u) => {
                  const isRequested = requestedUserIds.includes(u.id);
                  const displayName = u.name || u.username || 'Kullanıcı';
                  return (
                    <View key={String(u.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomColor: colors.surfaceVariant, borderBottomWidth: 1 }}>
                      <FriendAvatar avatar_url={u.avatar_url} name={displayName} size={44} />
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600' }}>{displayName}</Text>
                        {u.username ? <Text style={{ color: colors.muted }}>@{u.username}</Text> : null}
                      </View>
                      <TouchableOpacity disabled={isRequested || friendRequestLoading} onPress={() => sendFriendRequest(u.id)} style={[styles.requestBtn, { backgroundColor: isRequested ? colors.success : colors.primary }]}> 
                        <Text style={{ color: '#fff' }}>{isRequested ? 'Gönderildi' : 'Ekle'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {friendError ? <Text style={{ color: colors.danger }}>{friendError}</Text> : null}
          {friends.length === 0 ? (
            <Text style={{ color: colors.muted }}>Henüz arkadaşınız yok.</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {friends.map((f) => {
                const peerIdStr = f?.id != null ? String(f.id) : null;
                const isPeerNearby = peerIdStr ? nearbyPeerIds.includes(peerIdStr) : false;
                const disabledMsg = !isConnected && !isPeerNearby;
                return (
                  <View key={String(f.id)} style={[styles.friendRow, { borderBottomColor: colors.surfaceVariant }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <FriendAvatar avatar_url={f.avatar_url} name={f.name || f.username || 'Kullanıcı'} size={48} />
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1} ellipsizeMode="tail">{f.name || f.username || 'Kullanıcı'}</Text>
                        {f.username ? <Text style={{ color: colors.muted }} numberOfLines={1} ellipsizeMode="tail">@{f.username}</Text> : null}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: 140, justifyContent: 'flex-end' }}>
                      <TouchableOpacity onPress={() => {}} style={[styles.iconBtn, { backgroundColor: isPeerNearby ? colors.success + '18' : colors.surfaceVariant + '11' }]}> 
                        <CheckCircle size={16} color={isPeerNearby ? colors.success : colors.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (disabledMsg) {
                            Alert.alert('Çevrimdışı', 'Bu kullanıcı hotspot ile bulunana kadar mesaj gönderilemez.');
                            return;
                          }
                          handleOpenFriendConversation(f);
                        }}
                        style={[styles.iconBtn, { backgroundColor: colors.info + '18', marginLeft: 8, opacity: disabledMsg ? 0.45 : 1 }]}
                      >
                        <Mail size={16} color={disabledMsg ? colors.muted : colors.info} />
                      </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        Alert.alert('Arkadaş Sil', 'Silmek istediğinize emin misiniz?', [
                          { text: 'İptal', style: 'cancel' },
                          {
                            text: 'Sil',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                const token = await getToken();
                                const res = await fetch(`${API_URL}/friendships/remove`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({ friend_id: f.id }),
                                });
                                const data = await res.json();
                                if (!res.ok || data.error) throw new Error(data.error || 'Arkadaş silinemedi');
                                fetchFriends();
                              } catch (e: any) {
                                Alert.alert('Hata', e?.message || 'Arkadaş silinemedi');
                              }
                            },
                          },
                        ]);
                      }}
                      style={[styles.iconBtn, { backgroundColor: colors.danger + '18', marginLeft: 8 }]}
                    >
                      <Trash size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            </View>
          )}

          {/* Gelen istekler */}
          {friendRequests.length > 0 && (
            <View style={{ marginTop: 12, backgroundColor: colors.surfaceVariant, padding: 10, borderRadius: 8 }}>
              <Text style={{ color: colors.warning, fontWeight: '700', marginBottom: 8 }}>Gelen Arkadaşlık İstekleri</Text>
              {friendRequestsLoading ? (
                <ActivityIndicator />
              ) : (
                friendRequests.map((req) => (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <FriendAvatar avatar_url={req.avatar_url} name={req.name || req.username || 'Kullanıcı'} size={48} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{req.name || req.username}</Text>
                      {req.username ? <Text style={{ color: colors.muted }}>@{req.username}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => respondFriendRequest(req.id, 'accepted')} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                        <Text style={{ color: '#fff' }}>Kabul Et</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => respondFriendRequest(req.id, 'rejected')} style={[styles.actionBtn, { backgroundColor: colors.danger, marginLeft: 8 }]}>
                        <Text style={{ color: '#fff' }}>Reddet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  searchBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  requestBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
});
