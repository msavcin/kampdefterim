import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Star, MapPin, Search, Filter, List, Zap } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface PremiumFeature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export default function PremiumScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

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

  const handleSubscribe = (plan: 'monthly' | 'yearly') => {
    // TODO: Google Play In-App Purchase entegrasyonu
    Alert.alert(
      'Abonelik',
      `${plan === 'monthly' ? 'Aylık' : 'Yıllık'} abonelik için Google Play Store'a yönlendirileceksiniz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Devam Et',
          onPress: () => {
            // In-App Purchase işlemi burada yapılacak
            console.log(`Subscribing to ${plan} plan`);
          },
        },
      ]
    );
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
                <Text style={styles.pricingPrice}>₺299</Text>
                <Text style={styles.pricingPeriod}>/yıl</Text>
              </View>
            </View>
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>Aylığa göre %50 tasarruf edin!</Text>
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
                <Text style={styles.pricingPrice}>₺49</Text>
                <Text style={styles.pricingPeriod}>/ay</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={() => handleSubscribe(selectedPlan)}
        >
          <Text style={styles.subscribeButtonText}>
            {selectedPlan === 'yearly' ? 'Yıllık Abonelik Başlat' : 'Aylık Abonelik Başlat'}
          </Text>
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.termsText}>
          Abonelik otomatik olarak yenilenir. İstediğiniz zaman iptal edebilirsiniz.
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
  subscribeButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
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
