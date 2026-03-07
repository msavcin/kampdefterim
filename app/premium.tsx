import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Star, MapPin, Search, Filter, List, Zap, RefreshCw } from 'lucide-react-native';
import { on as onEvent, off as offEvent } from '@/lib/eventBus';
import * as IAPManager from '@/lib/iapManager';
import type { Subscription } from '@/lib/iapManager';

const { width } = Dimensions.get('window');

interface PremiumFeature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export default function PremiumScreen() {
  const router = useRouter();
  const appStateRef = useRef(AppState.currentState);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [iapReady, setIapReady] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    isActive: boolean;
    offlineRadiusKm?: number;
    expiresAt?: string;
    autoRenewing?: boolean;
  } | null>(null);

  useEffect(() => {
    initializeIAP();
    checkCurrentSubscription();

    const handleSubscribed = () => {
      Alert.alert(
        '✅ Başarılı!',
        'Premium aboneliğiniz aktif edildi. Tüm özelliklere erişebilirsiniz.',
        [{ text: 'Tamam', onPress: () => router.replace('/(tabs)' as any) }]
      );
    };
    onEvent('premium:subscribed', handleSubscribed);

    // index.tsx'in AppState/startup'ta emit ettiği abonelik güncellemelerini dinle
    const handleSubStatusUpdated = (subStatus: any) => {
      if (subStatus) {
        setSubscriptionStatus({
          isActive: subStatus.isActive,
          offlineRadiusKm: subStatus.offlineRadiusKm,
          expiresAt: subStatus.expiresAt,
          autoRenewing: subStatus.autoRenewing,
        });
      }
    };
    onEvent('subscription:statusUpdated', handleSubStatusUpdated);

    // AppState: uygulama ön plana geldiğinde (index.tsx'in yakalamadığı durum için güvenlik aği)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        checkCurrentSubscription();
      }
      appStateRef.current = nextState;
    });

    return () => {
      offEvent('premium:subscribed', handleSubscribed);
      offEvent('subscription:statusUpdated', handleSubStatusUpdated);
      appStateSub.remove();
      IAPManager.endIAP();
    };
  }, []);

  const initializeIAP = async () => {
    try {
      const ready = await IAPManager.initIAP();
      setIapReady(ready);
      
      if (ready) {
        const subs = await IAPManager.getSubscriptions();
        setSubscriptions(subs);
      }
    } catch (error) {
      console.error('[Premium] IAP init error:', error);
    } finally {
      setPricesLoading(false);
    }
  };

  const checkCurrentSubscription = async () => {
    try {
      const status = await IAPManager.checkSubscriptionStatus();
      if (status) {
        setSubscriptionStatus({
          isActive: status.isActive,
          offlineRadiusKm: status.offlineRadiusKm,
          expiresAt: status.expiresAt,
          autoRenewing: status.autoRenewing,
        });
      }
    } catch (error) {
      console.error('[Premium] Status check error:', error);
    }
  };

  const premiumFeatures: PremiumFeature[] = [
    {
      icon: <MapPin size={24} color="#059669" />,
      title: 'Offline Harita Erişimi',
      description: 'İnternet olmadan haritaları görüntüleyin ve kullanın',
    },
    {
      icon: <Search size={24} color="#059669" />,
      title: 'Gelişmiş Arama',
      description: 'Kamp alanlarını offline modda arayın ve bulun',
    },
    {
      icon: <Filter size={24} color="#059669" />,
      title: 'Filtreleme Özellikleri',
      description: 'İnternet olmadan da filtreleme yapın',
    },
    {
      icon: <List size={24} color="#059669" />,
      title: 'Liste Görünümü',
      description: 'Offline modda liste görünümünü kullanın',
    },
    {
      icon: <Zap size={24} color="#059669" />,
      title: 'Öncelikli Destek',
      description: 'Premium kullanıcılara özel hızlı destek',
    },
    {
      icon: <Star size={24} color="#059669" />,
      title: 'Tüm Özelliklere Erişim',
      description: 'Gelecekteki tüm premium özelliklere erişim',
    },
  ];

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!iapReady) {
      Alert.alert(
        'IAP Paketi Gerekli', 
        'Satın alma özelliği için react-native-iap paketi yüklenmelidir.\n\nKomut: npm install react-native-iap\n\nSonra uygulamayı yeniden başlatın.',
        [{ text: 'Tamam' }]
      );
      return;
    }
    setLoading(true);
    try {
      await IAPManager.purchaseSubscription(plan);
      // Satın alma başarılı oldu, status'u yenile
      await checkCurrentSubscription();
    } catch (error: any) {
      // error bazen plain object, bazen Error instance olabilir
      const code: string = error?.code ?? '';
      const message: string =
        error?.message ||
        (typeof error === 'string' ? error : 'Satın alma işlemi başarısız oldu.');
      console.error('[Premium] Purchase error code:', code, 'message:', message);
      if (code !== 'E_USER_CANCELLED') {
        const codeStr = code ? `\n(Kod: ${code})` : '';
        Alert.alert('Satın Alma Hatası', message + codeStr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!iapReady) {
      Alert.alert('Hata', 'Satın alma sistemi henüz hazır değil.');
      return;
    }

    setRestoring(true);
    try {
      await IAPManager.restorePurchases();
      // Restore başarılı oldu, status'u yenile
      await checkCurrentSubscription();
    } catch (error) {
      console.error('[Premium] Restore error:', error);
    } finally {
      setRestoring(false);
    }
  };

  const getSubscriptionPrice = (plan: 'monthly' | 'yearly'): string => {
    if (pricesLoading) return '...';
    return IAPManager.getPriceForPlan(plan, subscriptions);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.starIconContainer}>
            <Star size={48} color="#FCD34D" fill="#FCD34D" />
          </View>
          <Text style={styles.heroTitle}>Kampdefterim Premium</Text>
          <Text style={styles.heroSubtitle}>
            Offline mod ve tüm gelişmiş özelliklerin kilidini açın
          </Text>
        </View>

        {/* Active Subscription Banner */}
        {subscriptionStatus?.isActive && (
          <View style={styles.activeSubscriptionBanner}>
            <View style={styles.activeBannerIcon}>
              <Check size={20} color="#fff" />
            </View>
            <View style={styles.activeBannerContent}>
              <Text style={styles.activeBannerTitle}>✨ Premium Aktif</Text>
              <Text style={styles.activeBannerText}>
                Offline radius: {subscriptionStatus.offlineRadiusKm} km
              </Text>
              {subscriptionStatus.expiresAt && subscriptionStatus.autoRenewing !== false && (
                <Text style={styles.activeBannerDate}>
                  Yenileme: {new Date(subscriptionStatus.expiresAt).toLocaleDateString('tr-TR')}
                </Text>
              )}
              {/* Otomatik yenileme kapalı uyarısı */}
              {subscriptionStatus.autoRenewing === false && subscriptionStatus.expiresAt && (
                <View style={{ marginTop: 6, backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, color: '#92400e', fontWeight: '600' }}>
                    ⚠️ Otomatik yenileme kapalı
                  </Text>
                  <Text style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                    {new Date(subscriptionStatus.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihinde sona erecek
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Features */}
        <View style={styles.featuresContainer}>
          {premiumFeatures.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={styles.featureIcon}>{feature.icon}</View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              <Check size={20} color="#059669" />
            </View>
          ))}
        </View>

        {/* Pricing Plans */}
        <View style={styles.pricingContainer}>
          <Text style={styles.pricingTitle}>Planınızı Seçin</Text>

          {/* Yearly Plan */}
          <TouchableOpacity
            style={[
              styles.pricingCard,
              selectedPlan === 'yearly' && styles.pricingCardSelected,
            ]}
            onPress={() => setSelectedPlan('yearly')}
          >
            {selectedPlan === 'yearly' && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>EN POPÜLER</Text>
              </View>
            )}
            <View style={styles.pricingHeader}>
              <View>
                <Text style={styles.pricingPlanName}>Yıllık</Text>
                <Text style={styles.pricingDescription}>12 ay premium erişim</Text>
              </View>
              <View style={styles.pricingAmount}>
                <Text style={styles.pricingPrice}>{getSubscriptionPrice('yearly')}</Text>
                <Text style={styles.pricingPeriod}>/yıl</Text>
              </View>
            </View>
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>Aylığa göre %20 tasarruf edin!</Text>
            </View>
          </TouchableOpacity>

          {/* Monthly Plan */}
          <TouchableOpacity
            style={[
              styles.pricingCard,
              selectedPlan === 'monthly' && styles.pricingCardSelected,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <View style={styles.pricingHeader}>
              <View>
                <Text style={styles.pricingPlanName}>Aylık</Text>
                <Text style={styles.pricingDescription}>1 ay premium erişim</Text>
              </View>
              <View style={styles.pricingAmount}>
                <Text style={styles.pricingPrice}>{getSubscriptionPrice('monthly')}</Text>
                <Text style={styles.pricingPeriod}>/ay</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, (loading || !iapReady) && styles.subscribeButtonDisabled]}
          onPress={() => handleSubscribe(selectedPlan)}
          disabled={loading || !iapReady}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              {selectedPlan === 'yearly' ? 'Yıllık Abonelik Başlat' : 'Aylık Abonelik Başlat'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Restore Button */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={restoring || !iapReady}
        >
          {restoring ? (
            <ActivityIndicator size="small" color="#059669" />
          ) : (
            <>
              <RefreshCw size={16} color="#059669" />
              <Text style={styles.restoreButtonText}>Satın Alımları Geri Yükle</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Hesap bağlama notu */}
        <View style={{ marginHorizontal: 4, marginBottom: 12, backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#bfdbfe' }}>
          <Text style={{ fontSize: 12, color: '#1e40af', lineHeight: 18 }}>
            ℹ️ Her uygulama hesabı için ayrı bir {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} hesabıyla abonelik başlatılması gerekmektedir. Bir {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} hesabıyla yalnızca bir uygulama kullanıcısı premium olabilir.
          </Text>
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          Abonelik otomatik olarak yenilenir. İstediğiniz zaman {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} ayarlarından iptal edebilirsiniz.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  heroSection: {
    backgroundColor: '#fff',
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  starIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  activeSubscriptionBanner: {
    backgroundColor: '#059669',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activeBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activeBannerContent: {
    flex: 1,
  },
  activeBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  activeBannerText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  activeBannerDate: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
  featuresContainer: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  pricingContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  pricingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  pricingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  pricingCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  pricingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingPlanName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  pricingDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  pricingAmount: {
    alignItems: 'flex-end',
  },
  pricingPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#059669',
  },
  pricingPeriod: {
    fontSize: 14,
    color: '#6b7280',
  },
  savingsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  savingsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    textAlign: 'center',
  },
  subscribeButton: {
    backgroundColor: '#059669',
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  subscribeButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.7,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    gap: 8,
  },
  restoreButtonText: {
    color: '#059669',
    fontSize: 15,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 40,
    lineHeight: 18,
  },
});
