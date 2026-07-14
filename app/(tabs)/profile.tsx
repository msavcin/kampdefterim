/**
 * Profil HUB — Alternatif A
 * Kısa ana ekran: kimlik + premium + hub menü
 *
 * Kurulum:
 *   1) Eski monolitik dosyayı yedekle:
 *      cp app/(tabs)/profile.tsx app/(tabs)/profile.legacy.tsx
 *   2) Bu dosyayı profile.tsx olarak koy:
 *      cp profile.hub.tsx app/(tabs)/profile.tsx
 *   3) Handler/state’leri legacy’den alt ekranlara taşı
 *      (PROFILE_RESTRUCTURE.md haritası)
 *
 * Bu iskelet: getMe + avatar + isim edit + çıkış + hub navigasyon.
 * Arkadaş/topluluk/izin listeleri alt route’larda.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  TextInput,
  BackHandler,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Shield,
  UserCheck,
  Upload,
  X,
  Edit2,
  Palette,
  Users,
  Building2,
  Settings,
  BookOpen,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../../components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';
import ProfileHubRow from '../../components/ProfileHubRow';
import { getMe, deleteAccount } from '../../lib/userCommunityApi';
import { getToken, removeToken } from '../../lib/auth';
import { API_URL } from '@/lib/config';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import * as IAPManager from '@/lib/iapManager';
import Constants from 'expo-constants';

export default function ProfileHubScreen() {
  const { colors, scheme, colorMode } = useTheme();
  const themed = createThemedStyles(colors);
  const navigation = useNavigation();
  const router = useRouter();
  const isConnected = useNetworkStatus();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<{
    role: string;
    status: string;
  } | null>(null);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [pendingLogout, setPendingLogout] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);
  const [editNameModal, setEditNameModal] = useState(false);
  const [editUsernameModal, setEditUsernameModal] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [editUsernameValue, setEditUsernameValue] = useState('');
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);
  // Optional summary badges (fill from API when ready)
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (navigation && (navigation as any).setOptions) {
        (navigation as any).setOptions({ gestureEnabled: false });
      }
      const onBackPress = () => true;
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );
      return () => backHandler.remove();
    }, [navigation]),
  );

  useEffect(() => {
    if (pendingLogout) {
      router.replace('/(tabs)/checklist?logout=1');
      setPendingLogout(false);
    }
  }, [pendingLogout]);

  useEffect(() => {
    if (!isConnected) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const me = await getMe();
        if (me?.forceLogout) {
          Alert.alert(
            'Oturum Sonlandırıldı',
            'Deneme süreniz dolduğu için oturumunuz kapatıldı.',
            [
              {
                text: 'Tamam',
                onPress: async () => {
                  await removeToken();
                  setUser(null);
                  router.replace('/login');
                },
              },
            ],
          );
          return;
        }
        const accountUser = me?.member?.user ?? me?.user ?? null;
        const resolvedUser = accountUser
          ? {
              ...me,
              ...accountUser,
              role: accountUser.role ?? me.role,
              offline_enabled: !!(
                me.offline_enabled || accountUser.offline_enabled
              ),
            }
          : me
            ? { ...me, role: me.role }
            : null;
        setUser(resolvedUser);

        // Optional: membership summary for hub subtitle
        if (resolvedUser?.community_id && resolvedUser?.id) {
          try {
            const token = await getToken();
            const res = await fetch(
              `${API_URL}/communities/${resolvedUser.community_id}/members/${resolvedUser.id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const membershipData = await res.json().catch(() => null);
            if (membershipData) {
              setMembership({
                role: membershipData.role,
                status: membershipData.status,
              });
            }
          } catch {
            /* ignore */
          }
        } else {
          setMembership(null);
        }

        // Optional friend counts (non-blocking)
        try {
          const token = await getToken();
          const [listRes, reqRes] = await Promise.all([
            fetch(`${API_URL}/friendships/list`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_URL}/friendships/requests`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);
          const listData = await listRes.json().catch(() => []);
          const reqData = await reqRes.json().catch(() => []);
          if (Array.isArray(listData)) setFriendsCount(listData.length);
          if (Array.isArray(reqData)) setFriendRequestCount(reqData.length);
        } catch {
          /* ignore */
        }
      } catch (e) {
        console.warn('Profil hub verileri alınamadı', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isConnected]);

  useEffect(() => {
    (async () => {
      try {
        const ready = await IAPManager.initIAP();
        const subs = ready ? await IAPManager.getSubscriptions() : [];
        setMonthlyPrice(IAPManager.getPriceForPlan('monthly', subs));
      } catch {
        setMonthlyPrice(IAPManager.getPriceForPlan('monthly', []));
      }
    })();
  }, []);

  // ─── Avatar / profile update (from legacy) ───
  async function uploadImageToS3(fileUri: string): Promise<string | null> {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/avatar/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.uploadUrl || !data?.fileName) {
        throw new Error('Presigned URL alınamadı');
      }
      const image = await fetch(fileUri);
      const blob = await image.blob();
      const uploadRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error('S3 yükleme başarısız');
      return `https://kamp-defterim.s3.amazonaws.com/${data.fileName}`;
    } catch (e) {
      console.error('S3 upload error:', e);
      return null;
    }
  }

  async function updateUserAvatar(avatarUrl: string) {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      return await res.json();
    } catch (e) {
      console.error('Avatar güncelleme hatası:', e);
      return null;
    }
  }

  const handlePickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      setAvatarUploading(true);
      const asset = result.assets[0];
      const s3Url = await uploadImageToS3(asset.uri);
      if (!s3Url) throw new Error('Fotoğraf yüklenemedi');
      const updateRes = await updateUserAvatar(s3Url);
      if (updateRes?.error) throw new Error(updateRes.error);
      setLocalAvatar(null);
      setUser((prev: any) => (prev ? { ...prev, avatar_url: s3Url } : prev));
      Alert.alert('Başarılı', 'Profil fotoğrafınız güncellendi!');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Fotoğraf yüklenemedi.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    Alert.alert(
      'Fotoğrafı Kaldır',
      'Profil fotoğrafınızı kaldırmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            try {
              setAvatarUploading(true);
              const updateRes = await updateUserAvatar('');
              if (updateRes?.error) throw new Error(updateRes.error);
              setLocalAvatar(null);
              setUser((prev: any) =>
                prev ? { ...prev, avatar_url: '' } : prev,
              );
              Alert.alert('Başarılı', 'Profil fotoğrafınız kaldırıldı!');
            } catch (e: any) {
              Alert.alert('Hata', e?.message || 'Fotoğraf kaldırılamadı.');
            } finally {
              setAvatarUploading(false);
            }
          },
        },
      ],
    );
  };

  const isGuest = user?.role === 'guest';
  const isRestrictedGuest = isGuest || user?.id === 34;

  const handleUpdateName = async () => {
    if (isRestrictedGuest) {
      Alert.alert('Kısıtlı Erişim', 'Misafir hesabıyla isim değiştirilemez.');
      return;
    }
    if (!editNameValue.trim()) {
      Alert.alert('Hata', 'İsim boş olamaz');
      return;
    }
    try {
      setProfileUpdateLoading(true);
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editNameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Güncelleme başarısız');
      setUser((prev: any) =>
        prev ? { ...prev, name: editNameValue.trim() } : prev,
      );
      setEditNameModal(false);
      Alert.alert('Başarılı', 'İsminiz güncellendi!');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'İsim güncellenemedi');
    } finally {
      setProfileUpdateLoading(false);
    }
  };

  const handleUpdateUsername = async () => {
    if (isRestrictedGuest) {
      Alert.alert(
        'Kısıtlı Erişim',
        'Misafir hesabıyla kullanıcı adı değiştirilemez.',
      );
      return;
    }
    if (!editUsernameValue.trim()) {
      Alert.alert('Hata', 'Kullanıcı adı boş olamaz');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(editUsernameValue.trim())) {
      Alert.alert(
        'Hata',
        'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir',
      );
      return;
    }
    try {
      setProfileUpdateLoading(true);
      const token = await getToken();
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: editUsernameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Güncelleme başarısız');
      setUser((prev: any) =>
        prev ? { ...prev, username: editUsernameValue.trim() } : prev,
      );
      setEditUsernameModal(false);
      Alert.alert('Başarılı', 'Kullanıcı adınız güncellendi!');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Kullanıcı adı güncellenemedi');
    } finally {
      setProfileUpdateLoading(false);
    }
  };

  const roleLabel =
    user?.role === 'admin'
      ? 'Yönetici'
      : user?.role === 'user'
        ? 'Kullanıcı'
        : user?.role === 'superadmin'
          ? 'Üst Yönetici'
          : user?.role === 'guest'
            ? 'Misafir'
            : 'Bilinmiyor';

  const membershipLabel =
    membership?.role === 'leader'
      ? 'Topluluk Lideri'
      : membership?.role === 'member'
        ? 'Topluluk Üyesi'
        : null;

  const friendsSubtitle =
    friendsCount != null
      ? friendRequestCount > 0
        ? `${friendsCount} arkadaş · ${friendRequestCount} istek`
        : `${friendsCount} arkadaş`
      : 'Liste · istek · ara';

  const communitySubtitle = membership
    ? `${membershipLabel || 'Üye'}${
        membership.status === 'active'
          ? ' · Aktif'
          : membership.status === 'pending'
            ? ' · Onay bekliyor'
            : ''
      }`
    : 'Katıl veya yönet';

  const primaryOn =
    // rough invert for D1-style light primary
    (() => {
      const hex = (colors.primary || '').replace('#', '');
      if (hex.length < 6) return '#fff';
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some((n) => Number.isNaN(n))) return '#fff';
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
        ? colors.background
        : '#FFFFFF';
    })();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Identity card */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.avatarWrap}>
            <Image
              source={
                localAvatar
                  ? { uri: localAvatar }
                  : user?.avatar_url
                    ? { uri: user.avatar_url }
                    : require('../../assets/images/avatar-placeholder.png')
              }
              style={styles.avatar}
              resizeMode="cover"
              defaultSource={require('../../assets/images/avatar-placeholder.png')}
            />
            <View style={styles.avatarActions}>
              <TouchableOpacity
                onPress={handlePickProfilePhoto}
                style={[styles.avatarFab, { backgroundColor: colors.info }]}
              >
                <Upload size={16} color="#fff" />
              </TouchableOpacity>
              {(user?.avatar_url || localAvatar) && (
                <TouchableOpacity
                  onPress={handleRemoveAvatar}
                  style={[styles.avatarFab, { backgroundColor: colors.danger }]}
                >
                  <X size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            {avatarUploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : user ? (
            <>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.primary }]}>
                  {user.name || 'Kullanıcı'}
                </Text>
                {!isRestrictedGuest && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditNameValue(user.name || '');
                      setEditNameModal(true);
                    }}
                    style={[
                      styles.editBtn,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Edit2 size={14} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.nameRow}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {user.username ? `@${user.username}` : ''}
                </Text>
                {!isRestrictedGuest && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditUsernameValue(user.username || '');
                      setEditUsernameModal(true);
                    }}
                    style={[
                      styles.editBtn,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Edit2 size={12} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
              {user.email ? (
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {user.email}
                </Text>
              ) : null}

              <View style={styles.badges}>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.primaryLight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Shield size={12} color={colors.info} />
                  <Text style={[styles.badgeText, { color: colors.info }]}>
                    {roleLabel}
                  </Text>
                </View>
                {membershipLabel && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colors.success + '22',
                        borderColor: colors.success + '55',
                      },
                    ]}
                  >
                    <UserCheck size={12} color={colors.success} />
                    <Text style={[styles.badgeText, { color: colors.success }]}>
                      {membershipLabel}
                      {membership?.status === 'active' ? ' · Aktif' : ''}
                    </Text>
                  </View>
                )}
              </View>

              {isGuest && (
                <View
                  style={[
                    styles.notice,
                    {
                      backgroundColor: colors.danger + '18',
                      borderColor: colors.danger + '44',
                    },
                  ]}
                >
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '600' }}>
                    Kısıtlı erişim: Sadece temel özellikler
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.logout,
                  {
                    backgroundColor: colors.danger + '14',
                    borderColor: colors.danger + '40',
                  },
                ]}
                onPress={() => {
                  Alert.alert('Çıkış', 'Çıkış yapmak istediğinize emin misiniz?', [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'Çıkış Yap',
                      style: 'destructive',
                      onPress: () => setPendingLogout(true),
                    },
                  ]);
                }}
              >
                <Text style={{ color: colors.danger, fontWeight: '700' }}>
                  Çıkış Yap
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: colors.danger }}>Kullanıcı bilgisi alınamadı</Text>
          )}
        </View>

        {/* Premium upsell */}
        {user && !user.offline_enabled && (
          <TouchableOpacity
            style={[
              styles.premium,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primary,
              },
            ]}
            onPress={() => router.push('/premium' as any)}
            activeOpacity={0.85}
          >
            <Text style={[styles.premiumTitle, { color: colors.primary }]}>
              ⭐ Premium’a yükselt
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>
              Offline harita · sohbet · gelişmiş filtre
            </Text>
            <View
              style={[styles.premiumBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: primaryOn, fontWeight: '700', fontSize: 13 }}>
                {monthlyPrice
                  ? `Premium Ol — ${monthlyPrice}/ay`
                  : 'Premium Ol'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Hub menu */}
        <View
          style={[
            styles.hubCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <ProfileHubRow
            icon={<Palette size={18} color={colors.primary} />}
            title="Görünüm"
            subtitle={`Tema · palet (${colorMode === 'system' ? 'sistem' : colorMode})`}
            onPress={() => router.push('/profile-appearance' as any)}
          />
          {!isGuest && (
            <ProfileHubRow
              icon={<Users size={18} color={colors.primary} />}
              title="Arkadaşlar"
              subtitle={friendsSubtitle}
              badge={
                friendRequestCount > 0 ? friendRequestCount : undefined
              }
              onPress={() => router.push('/profile-friends' as any)}
            />
          )}
          {!isGuest && (
            <ProfileHubRow
              icon={<Building2 size={18} color={colors.primary} />}
              title="Topluluk"
              subtitle={communitySubtitle}
              onPress={() => router.push('/profile-community' as any)}
            />
          )}
          <ProfileHubRow
            icon={<Settings size={18} color={colors.primary} />}
            title="Uygulama & İzinler"
            subtitle="Konum · offline · cache · sync"
            onPress={() => router.push('/profile-app-settings' as any)}
          />
          <ProfileHubRow
            icon={<BookOpen size={18} color={colors.primary} />}
            title="Rehber & Hakkında"
            subtitle={`v${Constants.expoConfig?.version || '1.x'}`}
            onPress={() => router.push('/guide' as any)}
          />
        </View>

        {/* Delete account */}
        {user && !isRestrictedGuest && (
          <TouchableOpacity
            style={styles.deleteAccount}
            disabled={isDeletingAccount}
            onPress={() => {
              // Keep full delete flow from legacy — simplified confirm here
              Alert.alert(
                'Hesabı Sil',
                'Hesabınız kalıcı olarak silinecek. Devam?',
                [
                  { text: 'İptal', style: 'cancel' },
                  {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: async () => {
                      setIsDeletingAccount(true);
                      try {
                        await deleteAccount();
                        await removeToken();
                        router.replace('/(auth)/login' as any);
                      } catch (e: any) {
                        Alert.alert(
                          'Hata',
                          e?.message || 'Hesap silinemedi.',
                        );
                      } finally {
                        setIsDeletingAccount(false);
                      }
                    },
                  },
                ],
              );
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 13, textDecorationLine: 'underline' }}>
              {isDeletingAccount ? 'Siliniyor...' : 'Hesabımı sil'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Edit name modal */}
        <Modal
          visible={editNameModal && !isRestrictedGuest}
          transparent
          animationType="slide"
          onRequestClose={() => setEditNameModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                İsminizi düzenleyin
              </Text>
              <TextInput
                value={editNameValue}
                onChangeText={setEditNameValue}
                placeholder="İsim Soyisim"
                placeholderTextColor={colors.muted}
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setEditNameModal(false)}
                  style={[
                    styles.modalBtn,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <Text style={{ color: colors.muted, fontWeight: '600' }}>
                    İptal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUpdateName}
                  style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                  disabled={profileUpdateLoading}
                >
                  {profileUpdateLoading ? (
                    <ActivityIndicator color={primaryOn} />
                  ) : (
                    <Text style={{ color: primaryOn, fontWeight: '600' }}>
                      Kaydet
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={editUsernameModal && !isRestrictedGuest}
          transparent
          animationType="slide"
          onRequestClose={() => setEditUsernameModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Kullanıcı adı
              </Text>
              <TextInput
                value={editUsernameValue}
                onChangeText={setEditUsernameValue}
                placeholder="kullaniciadi"
                autoCapitalize="none"
                placeholderTextColor={colors.muted}
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setEditUsernameModal(false)}
                  style={[
                    styles.modalBtn,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <Text style={{ color: colors.muted, fontWeight: '600' }}>
                    İptal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUpdateUsername}
                  style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                  disabled={profileUpdateLoading}
                >
                  {profileUpdateLoading ? (
                    <ActivityIndicator color={primaryOn} />
                  ) : (
                    <Text style={{ color: primaryOn, fontWeight: '600' }}>
                      Kaydet
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrap: {
    width: 120,
    height: 120,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  avatarActions: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    gap: 4,
  },
  avatarFab: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
  },
  editBtn: {
    padding: 6,
    borderRadius: 8,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  notice: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  logout: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  premium: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  premiumBtn: {
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  deleteAccount: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
