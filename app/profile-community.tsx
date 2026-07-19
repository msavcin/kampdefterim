/**
 * Profil → Topluluk
 * Route: /profile-community
 *
 * Taşınacaklar (legacy profile.tsx):
 * - membership, communityDetail, communityMembers, statusModal
 * - communitySearch / joinCommunity (üyelik yoksa)
 * - handleStatusChange, listCommunityMembers
 * - Lider üye listesi + durum modalı
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeProvider';
import ProfileSubScreenHeader from '../components/ProfileSubScreenHeader';
import FriendAvatar from '../components/FriendAvatar';
import { getMe, listCommunityMembers, getCommunity as getCommunityById, listCommunities, joinCommunity, removeMember } from '@/lib/userCommunityApi';
import { getToken } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { updateMemberStatus } from '@/lib/updateMemberStatus';
import { syncPendingChanges } from '@/lib/syncPendingChanges';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRouter } from 'expo-router';
import { UserCheck, CheckCircle, Clock, XCircle } from 'lucide-react-native';

export default function ProfileCommunityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const isConnected = useNetworkStatus();

  const [user, setUser] = useState<any>(null);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [communityDetail, setCommunityDetail] = useState<any>(null);
  const [communitySearch, setCommunitySearch] = useState('');
  const [allCommunities, setAllCommunities] = useState<any[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<any[]>([]);
  const [communityApplyLoading, setCommunityApplyLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [loadingCommunities, setLoadingCommunities] = useState(true);

  const [communityMembers, setCommunityMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [statusModal, setStatusModal] = useState<{ open: boolean; member: any | null }>({ open: false, member: null });

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setUser(me?.user ? { ...me, ...me.user } : me);
      } catch {
        setUser(null);
      }
      try {
        const data = await listCommunities();
        const visible = Array.isArray(data) ? data.filter((c: any) => c.visibility === 'public') : [];
        setAllCommunities(visible);
      } catch (e) {
        setAllCommunities([]);
      } finally {
        setLoadingCommunities(false);
      }
    })();
  }, []);

  // Kullanıcının topluluk üyelik bilgisini ve topluluk detayını remote API'den al
  useEffect(() => {
    if (!user || !user.community_id || !user.id) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/communities/${user.community_id}/members/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const membershipData = await res.json().catch(() => null);
        if (membershipData) {
          setMembership({ role: membershipData.role, status: membershipData.status });
        }
      } catch (e) {
        // ignore
      }

      try {
        const cDetail = await getCommunityById(user.community_id).catch(() => null);
        setCommunityDetail(cDetail || null);
      } catch (e) {
        // ignore
      }
    })();
  }, [user]);

  useEffect(() => {
    if (communitySearch.trim().length >= 2) {
      const filtered = allCommunities.filter((c: any) => c.name.toLowerCase().includes(communitySearch.toLowerCase()));
      setFilteredCommunities(filtered);
    } else {
      setFilteredCommunities([]);
    }
  }, [communitySearch, allCommunities]);

  useEffect(() => {
    if (user && membership && (membership.role === 'leader' || membership.role === 'member') && user.community_id) {
      setMembersLoading(true);
      listCommunityMembers(user.community_id)
        .then(members => {
          const filtered = Array.isArray(members)
            ? members.filter(m => {
                const role = m.user?.role || m.user?.dataValues?.role;
                const isCurrentUser = m.user_id === user.id;
                return role !== 'superadmin' && !isCurrentUser;
              })
            : [];
          setCommunityMembers(filtered);
        })
        .catch(() => setCommunityMembers([]))
        .finally(() => setMembersLoading(false));
    }
  }, [user, membership]);

  useEffect(() => {
    const onBack = () => {
      router.replace('/profile');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [router]);

  const statusOptions = [
    { label: 'Aktif', value: 'active', color: colors.success, icon: <CheckCircle size={16} color={colors.success} /> },
    { label: 'Onay Bekliyor', value: 'pending', color: colors.warning, icon: <Clock size={16} color={colors.warning} /> },
    { label: 'Reddedildi', value: 'rejected', color: colors.danger, icon: <XCircle size={16} color={colors.danger} /> },
  ];

  const handleStatusChange = async (member: any, newStatus: string) => {
    try {
      if (newStatus === 'rejected') {
        const result = await removeMember(member.community_id, member.user_id);
        if ((result as any)?.error || !(result as any)?.success) {
          Alert.alert('Hata', (result as any).error || 'Üye topluluktan silinemedi');
          return;
        }
        setCommunityMembers(prev => prev.filter(m => m.user_id !== member.user_id));
        Alert.alert('Başarılı', (result as any)?.pending ? 'Üye silme çevrimdışı kuyruğa alındı' : 'Üye topluluktan silindi.');
        if ((result as any)?.pending) {
          try { await syncPendingChanges(); } catch (_) {}
        }
      } else {
        const result = await updateMemberStatus(member.community_id, member.user_id, newStatus);
        if ((result as any)?.error) {
          Alert.alert('Hata', (result as any).error || 'Durum güncellenemedi');
          return;
        }
        setCommunityMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, status: newStatus } : m));
        Alert.alert('Başarılı', 'Üye durumu güncellendi.');
        if ((result as any)?.pending) {
          try { await syncPendingChanges(); } catch (_) {}
        }
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Durum güncellenemedi');
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      <ProfileSubScreenHeader title="Topluluk" onBack={() => router.replace('/profile')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Topluluk</Text>

          {communityDetail && (
            <View style={{ marginTop: 8, backgroundColor: colors.surfaceVariant, borderRadius: 12, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <UserCheck size={16} color={colors.primary} />
                <Text style={{ marginLeft: 8, color: colors.primary, fontWeight: '700' }}>{communityDetail.name}</Text>
              </View>
              {communityDetail.description ? <Text style={{ color: colors.muted, marginTop: 6 }}>{communityDetail.description}</Text> : null}
            </View>
          )}

          {/* Join / search */}
          {!user?.community_id && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.muted, marginBottom: 6 }}>Topluluk ara</Text>
              <TextInput placeholder="Topluluk adı ara..." placeholderTextColor={colors.muted} value={communitySearch} onChangeText={setCommunitySearch} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 }} />
              {loadingCommunities && <ActivityIndicator style={{ marginTop: 8 }} />}
              {communityError && <Text style={{ color: colors.danger }}>{communityError}</Text>}
              {filteredCommunities.length > 0 && communitySearch.trim().length >= 2 && (
                <View style={{ marginTop: 8, borderRadius: 8, backgroundColor: colors.surfaceVariant }}>
                  {filteredCommunities.map((c) => (
                    <TouchableOpacity key={c.id} disabled={communityApplyLoading} onPress={async () => {
                      setCommunityApplyLoading(true);
                      setCommunityError(null);
                      try {
                        const res = await joinCommunity(c.id);
                        if (res && res.error) throw new Error(res.error || 'Başvuru gönderilemedi');
                        Alert.alert('Başarılı', 'Topluluğa başvuru gönderildi!');
                        setCommunitySearch('');
                      } catch (e: any) {
                        setCommunityError(e?.message || 'Başvuru gönderilemedi');
                      } finally {
                        setCommunityApplyLoading(false);
                      }
                    }} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.surface }}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>{c.name}</Text>
                      <Text style={{ color: colors.muted }}>{c.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Members for leader */}
          {membership && (membership.role === 'leader' || membership.role === 'member') && (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.primary, fontWeight: '700', marginBottom: 8 }}>Topluluk Üyeleri</Text>
              {membersLoading ? <ActivityIndicator /> : communityMembers.length === 0 ? <Text style={{ color: colors.muted }}>Üye bulunamadı.</Text> : (
                <View style={{ backgroundColor: colors.surfaceVariant, borderRadius: 8 }}>
                  {communityMembers.map((member) => {
                    const statusOpt = statusOptions.find(o => o.value === member.status) || statusOptions[0];
                    const avatarUrl = member.user?.avatar_url || member.user?.avatarUrl || member.user?.image || '';
                    return (
                      <View key={member.user_id} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <FriendAvatar avatar_url={avatarUrl} name={member.user?.name || member.user?.username} size={48} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{member.user?.name || member.user?.username || 'Üye'}</Text>
                          {member.user?.email ? <Text style={{ color: colors.muted, marginTop: 4 }}>{member.user?.email}</Text> : null}
                        </View>
                        {membership.role === 'leader' ? (
                          <TouchableOpacity onPress={() => setStatusModal({ open: true, member })} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: statusOpt.color, backgroundColor: (statusOpt.color || colors.surface) + '22', flexDirection: 'row', alignItems: 'center' }}>
                            {statusOpt.icon}
                            <Text style={{ marginLeft: 8, color: statusOpt.color, fontWeight: '700' }}>{statusOpt.label}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: statusOpt.color, backgroundColor: (statusOpt.color || colors.surface) + '22', flexDirection: 'row', alignItems: 'center' }}>
                            {statusOpt.icon}
                            <Text style={{ marginLeft: 8, color: statusOpt.color, fontWeight: '700' }}>{statusOpt.label}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Durum seçim modalı */}
        <Modal
          visible={statusModal.open}
          transparent
          animationType="fade"
          onRequestClose={() => setStatusModal({ open: false, member: null })}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, minWidth: 260, alignItems: 'center', elevation: 4 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 18, color: colors.info }}>Durum Seç</Text>
              {statusOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, marginBottom: 6, backgroundColor: statusModal.member?.status === opt.value ? opt.color + '22' : colors.surfaceVariant, borderWidth: statusModal.member?.status === opt.value ? 2 : 1, borderColor: statusModal.member?.status === opt.value ? opt.color : colors.border }}
                  onPress={async () => {
                    if (statusModal.member && statusModal.member.status !== opt.value) {
                      await handleStatusChange(statusModal.member, opt.value);
                    }
                    setStatusModal({ open: false, member: null });
                  }}
                >
                  {opt.icon}
                  <Text style={{ marginLeft: 10, color: opt.color, fontWeight: 'bold', fontSize: 15 }}>{opt.label}</Text>
                  {statusModal.member?.status === opt.value && (
                    <CheckCircle size={16} color={opt.color} style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setStatusModal({ open: false, member: null })} style={{ marginTop: 10, padding: 8 }}>
                <Text style={{ color: colors.muted, fontWeight: 'bold' }}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  title: { fontSize: 16, fontWeight: '700' },
});
