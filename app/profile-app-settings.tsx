/**
 * Profil → Uygulama & izinler
 * Route: /profile-app-settings
 *
 * Mockup A drill-in: Konum | Offline & veri | Geliştirici
 *
 * Taşınacaklar (legacy profile.tsx):
 * - locationEnabled, locationPermissionStatus, request/refresh permissions
 * - OfflineRegionSelector, full sync, clearTileCache
 * - Superadmin: syncServerCampgroundsToLocal, handleDeleteDatabase
 * - doNotShowLocationPermissionModal reset
 * - AIReviewSettingsPanel (superadmin)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import {
  MapPin,
  Settings,
  RefreshCw,
  Trash2,
  Bell,
  Database,
  Cloud,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../components/ThemeProvider';
import ProfileSubScreenHeader from '../components/ProfileSubScreenHeader';
import ProfileHubRow from '../components/ProfileHubRow';
import OfflineRegionSelector from '../components/OfflineRegionSelector';
import AIReviewSettingsPanel from '../components/AIReviewSettingsPanel';
import { clearTileCache, getTileCacheStats } from '@/lib/mapTileCache';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { eventBus } from '@/lib/eventBus';
import { getMe } from '@/lib/userCommunityApi';
import { getToken } from '@/lib/auth';
import { API_URL } from '@/lib/config';

export default function ProfileAppSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const isConnected = useNetworkStatus();

  React.useEffect(() => {
    const onBack = () => {
      router.replace('/profile');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  const [user, setUser] = useState<any>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] =
    useState('unknown');
  const [fullSyncLoading, setFullSyncLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setUser(me?.user ? { ...me, ...me.user } : me);
      } catch {
        setUser(null);
      }
      try {
        const foreground = await Location.getForegroundPermissionsAsync();
        setLocationPermissionStatus(foreground.status);
      } catch {
        setLocationPermissionStatus('unknown');
      }
    })();
  }, []);

  const refreshLocationPermissions = useCallback(async () => {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      setLocationPermissionStatus(foreground.status);
      return foreground.status;
    } catch {
      setLocationPermissionStatus('unknown');
      return 'unknown';
    }
  }, []);

  const requestLocationPermissions = async () => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === 'denied' && !current.canAskAgain) {
        Alert.alert(
          'Konum İzni Gerekli',
          'Konum izni reddedilmiş. Lütfen sistem ayarlarından açın.',
          [
            { text: 'İptal', style: 'cancel' },
            {
              text: 'Ayarları Aç',
              onPress: () =>
                Platform.OS === 'ios'
                  ? Linking.openURL('app-settings:')
                  : Linking.openSettings(),
            },
          ],
        );
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermissionStatus(status);
      if (status === 'granted') {
        try {
          eventBus.emit('locationPermissionGranted', { fromProfile: true });
        } catch {
          /* ignore */
        }
        Alert.alert('Başarılı', 'Konum izni verildi!');
      }
    } catch {
      Alert.alert('Hata', 'Konum izni istenemedi.');
    }
  };

  const locationLabel =
    locationPermissionStatus === 'granted'
      ? 'Verildi'
      : locationPermissionStatus === 'denied'
        ? 'Reddedildi'
        : 'Belirsiz';

  const isSuperAdmin = user?.role === 'superadmin';
  const isPremium = !!user?.offline_enabled;

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <ProfileSubScreenHeader title="Uygulama & izinler" onBack={() => router.replace('/profile')} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Konum */}
        <Text style={[styles.groupLabel, { color: colors.muted }]}>KONUM</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.statusBox, { backgroundColor: colors.surfaceVariant }]}>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>
              Foreground izin
            </Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {locationPermissionStatus === 'granted' ? '✅ ' : '⚠️ '}
              {locationLabel}
            </Text>
          </View>
          {locationPermissionStatus !== 'granted' && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={requestLocationPermissions}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                Konum izni ver
              </Text>
            </TouchableOpacity>
          )}
          <ProfileHubRow
            icon={<Settings size={18} color={colors.primary} />}
            title="Sistem ayarları"
            subtitle="Cihaz izinleri"
            onPress={() =>
              Platform.OS === 'ios'
                ? Linking.openURL('app-settings:')
                : Linking.openSettings()
            }
          />
          <ProfileHubRow
            icon={<RefreshCw size={18} color={colors.primary} />}
            title="Durumu yenile"
            onPress={async () => {
              const s = await refreshLocationPermissions();
              Alert.alert('Konum izni', `Foreground: ${s}`);
            }}
          />
          <ProfileHubRow
            icon={<Bell size={18} color={colors.info} />}
            title="Konum bildirimini sıfırla"
            subtitle="Modal tekrar gösterilsin"
            onPress={async () => {
              await SecureStore.deleteItemAsync(
                'doNotShowLocationPermissionModal',
              );
              Alert.alert(
                'Başarılı',
                'Konum izni bildirimi tekrar aktif edildi.',
              );
            }}
          />
        </View>

        {/* Offline & data */}
        {isPremium && (
          <>
            <Text style={[styles.groupLabel, { color: colors.muted }]}>
              OFFLINE & VERİ
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={{ padding: 12 }}>
                <OfflineRegionSelector user={user} />
              </View>
              <ProfileHubRow
                icon={<RefreshCw size={18} color={colors.primary} />}
                title="Tam eşitleme"
                subtitle="Günde en fazla 1 kez"
                onPress={async () => {
                  if (!isConnected) {
                    Alert.alert('Çevrimdışı', 'İnternet bağlantısı gerekli.');
                    return;
                  }
                  try {
                    const lastStr = await SecureStore.getItemAsync(
                      'lastManualFullSyncAt',
                    );
                    if (lastStr) {
                      const lastDate = new Date(lastStr);
                      const dayMs = 24 * 60 * 60 * 1000;
                      if (Date.now() - lastDate.getTime() < dayMs) {
                        Alert.alert(
                          'Sınır',
                          'Tam eşitlemeyi günde bir kez başlatabilirsiniz.',
                        );
                        return;
                      }
                    }
                    setFullSyncLoading(true);
                    await SecureStore.setItemAsync(
                      'lastManualFullSyncAt',
                      new Date().toISOString(),
                    );
                    router.push('/' as any);
                    setTimeout(() => {
                      try {
                        eventBus.emit('trigger:initialFullSync');
                      } catch {
                        /* ignore */
                      }
                    }, 250);
                  } catch (e: any) {
                    Alert.alert('Hata', e?.message || 'Eşitleme başlatılamadı');
                  } finally {
                    setFullSyncLoading(false);
                  }
                }}
              />
              {fullSyncLoading && (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginVertical: 8 }}
                />
              )}
              <ProfileHubRow
                icon={<Trash2 size={18} color={colors.warning} />}
                title="Harita cache temizle"
                subtitle="Offline tile depolama"
                onPress={async () => {
                  try {
                    const stats = await getTileCacheStats();
                    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
                    Alert.alert(
                      'Harita Cache Temizle',
                      `${stats.tileCount} tile (${sizeMB} MB) silinecek.`,
                      [
                        { text: 'İptal', style: 'cancel' },
                        {
                          text: 'Temizle',
                          style: 'destructive',
                          onPress: async () => {
                            await clearTileCache();
                            Alert.alert('Başarılı', 'Harita cache temizlendi!');
                          },
                        },
                      ],
                    );
                  } catch {
                    Alert.alert('Hata', 'Cache temizlenemedi.');
                  }
                }}
              />
            </View>
          </>
        )}

        {/* Developer */}
        {isSuperAdmin && (
          <>
            <Text style={[styles.groupLabel, { color: colors.muted }]}>
              GELİŞTİRİCİ
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <ProfileHubRow
                icon={<Cloud size={18} color={colors.primary} />}
                title="Sunucu eşleştirme"
                subtitle="source_id:1 → lokal DB"
                onPress={async () => {
                  try {
                    const token = await getToken();
                    const res = await fetch(
                      `${API_URL}/campgrounds?source_id=1`,
                      {
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );
                    const data = await res.json();
                    if (!Array.isArray(data)) throw new Error('Veri alınamadı');
                    const db = require('../../lib/database').getDatabase();
                    let added = 0;
                    for (const area of data) {
                      try {
                        await db.insertOrUpdateCampingArea(area);
                        added++;
                      } catch {
                        /* skip */
                      }
                    }
                    Alert.alert(
                      'Başarılı',
                      `${added} kamp alanı lokal DB’ye yazıldı.`,
                    );
                  } catch (e: any) {
                    Alert.alert('Hata', e?.message || 'Eşleştirme başarısız');
                  }
                }}
              />
              <ProfileHubRow
                icon={<Database size={18} color={colors.danger} />}
                title="Veritabanını sıfırla"
                subtitle="Geri alınamaz"
                danger
                onPress={async () => {
                  Alert.alert(
                    'Veritabanını sil',
                    'Tüm lokal veriler silinecek. Emin misiniz?',
                    [
                      { text: 'İptal', style: 'cancel' },
                      {
                        text: 'Sil',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            const DatabaseManager =
                              require('../../lib/database').getDatabase();
                            const result =
                              await DatabaseManager.deleteDatabaseFile();
                            Alert.alert(
                              result ? 'Başarılı' : 'Hata',
                              result
                                ? 'Veritabanı silindi. Uygulamayı yeniden başlatın.'
                                : 'Silinemedi.',
                            );
                          } catch {
                            Alert.alert('Hata', 'Silme başarısız.');
                          }
                        },
                      },
                    ],
                  );
                }}
              />
              <View style={{ padding: 12 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: '600',
                    marginBottom: 8,
                  }}
                >
                  AI Değerlendirme
                </Text>
                <AIReviewSettingsPanel />
              </View>
            </View>
          </>
        )}

        <Text
          style={{
            textAlign: 'center',
            color: colors.muted,
            fontSize: 12,
            marginTop: 8,
          }}
        >
          Konum · offline · sync tek ekranda
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  statusBox: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
  },
  primaryBtn: {
    marginHorizontal: 12,
    marginBottom: 8,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
