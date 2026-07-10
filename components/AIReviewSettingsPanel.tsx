/**
 * AI Review Ayarları Bileşeni
 * 
 * Superadmin kullanıcılar için AI review değerlendirme ayarlarını yönetir.
 * Profil sayfasında ayrı bir sekme olarak gösterilir.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl
} from 'react-native';
import { useTheme } from './ThemeProvider';
import { Sparkles, Settings, TrendingUp, CheckCircle, AlertCircle, Info } from 'lucide-react-native';
import {
  getAIReviewSettings,
  updateAIReviewSettings,
  getAIReviewStats,
  AIReviewSettings,
  AIReviewStats
} from '@/lib/adminSettingsApi';
import {
  batchEvaluateCampingAreaReviews,
  getEligibleCampingAreasForReview
} from '@/lib/aiReviewApi';

export default function AIReviewSettingsPanel() {
  const { colors, scheme } = useTheme();
  const isDark = scheme === 'dark';

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [settings, setSettings] = useState<AIReviewSettings>({
    dailyLimit: 100,
    enabledGlobal: true,
    showInUI: true
  });

  const [stats, setStats] = useState<AIReviewStats>({
    totalEvaluated: 0,
    evaluatedLast24h: 0,
    evaluatedLast7d: 0,
    pendingEvaluation: 0,
    dailyLimit: 100,
    todayCount: 0,
    remainingToday: 100
  });

  const [eligibleCount, setEligibleCount] = useState(0);

  // Temp state for editing
  const [tempDailyLimit, setTempDailyLimit] = useState('100');

  // İlk yükleme
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [settingsData, statsData, eligibleAreas] = await Promise.all([
        getAIReviewSettings(),
        getAIReviewStats(),
        getEligibleCampingAreasForReview()
      ]);

      setSettings(settingsData);
      setTempDailyLimit(settingsData.dailyLimit.toString());
      setStats(statsData);
      setEligibleCount(eligibleAreas.length);
    } catch (error) {
      console.error('AI Review ayarları yükleme hatası:', error);
      Alert.alert('Hata', 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);

      const dailyLimit = parseInt(tempDailyLimit, 10);
      if (isNaN(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) {
        Alert.alert('Hata', 'Günlük limit 1-1000 arasında olmalıdır');
        return;
      }

      await updateAIReviewSettings({
        dailyLimit,
        enabledGlobal: settings.enabledGlobal,
        showInUI: settings.showInUI
      });

      await loadData();
      Alert.alert('Başarılı', 'Ayarlar kaydedildi');
    } catch (error) {
      console.error('Ayar kaydetme hatası:', error);
      Alert.alert('Hata', 'Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchEvaluate = async () => {
    if (stats.remainingToday <= 0) {
      Alert.alert(
        'Limit Doldu',
        'Bugün için günlük limit doldu. Yarın tekrar deneyin veya limiti artırın.',
        [{ text: 'Tamam' }]
      );
      return;
    }

    Alert.alert(
      'Toplu Değerlendirme',
      `${Math.min(batchableCount, stats.remainingToday)} kamp alanı için AI değerlendirmesi yapılacak. Devam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Başlat',
          onPress: async () => {
            try {
              setProcessing(true);

              const limit = Math.min(batchableCount, stats.remainingToday);
              const result = await batchEvaluateCampingAreaReviews({
                limit
              });

              await loadData();

              Alert.alert(
                'Tamamlandı',
                `${result.processed} alan başarıyla değerlendirildi\n` +
                `${result.failed} alan başarısız\n` +
                `${result.skipped} alan atlandı`
              );
            } catch (error) {
              console.error('Toplu değerlendirme hatası:', error);
              Alert.alert('Hata', 'Toplu değerlendirme yapılamadı');
            } finally {
              setProcessing(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const progressPercent = stats.dailyLimit > 0
    ? (stats.todayCount / stats.dailyLimit) * 100
    : 0;

  // Toplu değerlendirme için gösterilecek sayı: Bekleyen - Toplam Değerlendirme
  const batchableCount = Math.max(0, stats.pendingEvaluation - stats.totalEvaluated);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary + '20' }]}>
          <Sparkles size={28} color={colors.primary} />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          AI Değerlendirme Yönetimi
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          Kamp alanları için Google Places yorumlarını AI ile değerlendirin
        </Text>
      </View>

      {/* İstatistikler */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <TrendingUp size={20} color={colors.text} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            İstatistikler
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: isDark ? colors.surface : '#F0F9FF' }]}>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>
              {stats.totalEvaluated}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Toplam Değerlendirme
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: isDark ? colors.surface : '#F0FDF4' }]}>
            <Text style={[styles.statValue, { color: '#22C55E' }]}>
              {stats.evaluatedLast24h}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Son 24 Saat
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: isDark ? colors.surface : '#FFFBEB' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>
              {stats.pendingEvaluation}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Bekleyen
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: isDark ? colors.surface : '#FEF2F2' }]}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              {stats.remainingToday}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Kalan Hak
            </Text>
          </View>
        </View>

        {/* Günlük Progress */}
        <View style={[styles.progressCard, { backgroundColor: colors.surface }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>
              Bugünkü Kullanım
            </Text>
            <Text style={[styles.progressValue, { color: colors.primary }]}>
              {stats.todayCount} / {stats.dailyLimit}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.min(100, progressPercent)}%`
                }
              ]}
            />
          </View>
        </View>
      </View>

      {/* Ayarlar */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Settings size={20} color={colors.text} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Ayarlar
          </Text>
        </View>

        {/* Global Enable */}
        <View style={[styles.settingRow, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              AI Değerlendirme Aktif
            </Text>
            <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
              Sistem genelinde AI değerlendirmesini aç/kapat
            </Text>
          </View>
          <Switch
            value={settings.enabledGlobal}
            onValueChange={(value) => setSettings({ ...settings, enabledGlobal: value })}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={settings.enabledGlobal ? colors.primary : colors.muted}
          />
        </View>

        {/* Show in UI */}
        <View style={[styles.settingRow, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              UI'da Göster
            </Text>
            <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
              AI değerlendirmelerini kullanıcılar görebilsin
            </Text>
          </View>
          <Switch
            value={settings.showInUI}
            onValueChange={(value) => setSettings({ ...settings, showInUI: value })}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={settings.showInUI ? colors.primary : colors.muted}
          />
        </View>

        {/* Daily Limit */}
        <View style={[styles.settingRow, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              Günlük Limit
            </Text>
            <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
              Günde maksimum kaç değerlendirme yapılacağı (1-1000)
            </Text>
          </View>
          <TextInput
            style={[
              styles.limitInput,
              {
                backgroundColor: isDark ? colors.surfaceVariant : '#F3F4F6',
                color: colors.text,
                borderColor: colors.border
              }
            ]}
            value={tempDailyLimit}
            onChangeText={setTempDailyLimit}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>

        {/* Kaydet Butonu */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            {
              backgroundColor: colors.primary,
              opacity: saving ? 0.6 : 1
            }
          ]}
          onPress={handleSaveSettings}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <CheckCircle size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Ayarları Kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Toplu İşlem */}
      {batchableCount > 0 && (
        <View style={styles.section}>
          <View style={[styles.actionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.actionHeader}>
              <View style={[styles.actionIcon, { backgroundColor: colors.primary + '20' }]}>
                <Sparkles size={24} color={colors.primary} />
              </View>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  Toplu Değerlendirme
                </Text>
                <Text style={[styles.actionDescription, { color: colors.textSecondary }]}>
                  {batchableCount} kamp alanı değerlendirmeye hazır
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: colors.primary,
                  opacity: processing || stats.remainingToday <= 0 || batchableCount <= 0 ? 0.6 : 1
                }
              ]}
              onPress={handleBatchEvaluate}
              disabled={processing || stats.remainingToday <= 0 || batchableCount <= 0}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  Değerlendirmeyi Başlat
                </Text>
              )}
            </TouchableOpacity>

            {stats.remainingToday <= 0 && (
              <View style={styles.warningBanner}>
                <AlertCircle size={16} color="#F59E0B" />
                <Text style={[styles.warningText, { color: '#F59E0B' }]}>
                  Günlük limit doldu. Yarın tekrar deneyin.
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Bilgi Notu */}
      <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
        <Info size={20} color={colors.primary} />
        <View style={styles.infoContent}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            Nasıl Çalışır?
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            • owner_id boş olan kamp alanları otomatik değerlendirilir{'\n'}
            • Google Places'ten yorumlar çekilir{'\n'}
            • AI ile özet değerlendirme metni oluşturulur{'\n'}
            • Her alan için 6 ay cooldown vardır{'\n'}
            • Rating, olanaklar vb. bilgiler güncellenir
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  header: {
    alignItems: 'center',
    marginBottom: 24
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8
  },
  headerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  section: {
    marginBottom: 24
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center'
  },
  progressCard: {
    padding: 16,
    borderRadius: 12
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600'
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '700'
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 4
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12
  },
  settingInfo: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18
  },
  limitInput: {
    width: 80,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 8
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  actionCard: {
    padding: 16,
    borderRadius: 12
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionInfo: {
    flex: 1
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4
  },
  actionDescription: {
    fontSize: 14
  },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#FFFBEB'
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24
  },
  infoContent: {
    flex: 1
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20
  }
});
