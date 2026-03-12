import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  List,
  Search,
  Filter,
  RefreshCw,
  Plus,
  LocateFixed,
  Binoculars,
  X,
  ChevronLeft,
  ChevronRight,
  Map,
  CheckCircle,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// ─── Rehber Adımları ─────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 0,
    title: 'Uygulamaya Hoş Geldiniz!',
    description:
      'Bu rehber, Kampdefterim uygulamasının ana ekranındaki tüm özellikleri adım adım anlatacak. Hazırsanız başlayalım!',
    icon: null,
    area: 'welcome',
    color: '#059669',
    bgColor: '#f0fdf4',
  },
  {
    id: 1,
    title: 'Liste / Harita Görünümü',
    description:
      'Sağ üst köşedeki Liste simgesi, harita görünümü ile liste görünümü arasında geçiş yapmanızı sağlar. Liste görünümünde kamp alanlarını sıralı biçimde inceleyebilirsiniz.',
    icon: 'list',
    area: 'header-right',
    position: 1,
    color: '#059669',
    bgColor: '#f0fdf4',
  },
  {
    id: 2,
    title: 'Kamp Alanı Arama',
    description:
      'Arama simgesine dokunarak kamp alanlarını isim veya konuma göre arayabilirsiniz. Arama sonuçlarından seçtiğiniz alanı haritada gösterebilirsiniz.',
    icon: 'search',
    area: 'header-right',
    position: 2,
    color: '#059669',
    bgColor: '#f0fdf4',
  },
  {
    id: 3,
    title: 'Filtrele',
    description:
      'Filtre simgesi, kamp alanlarını kamp türüne ve özel özelliklere (kamp ateşi, klozet vb.) göre filtrelemenizi sağlar. Aktif filtre olduğunda simge vurgulanır.',
    icon: 'filter',
    area: 'header-right',
    position: 3,
    color: '#059669',
    bgColor: '#f0fdf4',
  },
  {
    id: 4,
    title: 'Manuel Senkronizasyon',
    description:
      'Yenile simgesi sunucudan en güncel kamp alanı verilerini çeker. Offline modda bu simge farklı görünür ve çevrimiçi olduğunuzda otomatik senkronizasyon başlar.',
    icon: 'refresh',
    area: 'header-right',
    position: 4,
    color: '#059669',
    bgColor: '#f0fdf4',
  },
  {
    id: 5,
    title: 'Kamp Alanı Ekle',
    description:
      'Haritanın sağ alt köşesindeki yeşil + (artı) buton, yeni bir kamp alanı eklemenizi sağlar. Butona dokunduktan sonra haritada istediğiniz konuma tıklayarak alanı belirleyin.',
    icon: 'plus',
    area: 'fab-right',
    position: 1,
    color: '#fff',
    bgColor: '#059669',
  },
  {
    id: 6,
    title: 'Konuma Odaklan',
    description:
      'Sağ alt köşedeki hedef simgesi, haritayı anlık GPS konumunuza taşır ve yakınlaştırır. Konumunuzu kaybettiyseniz bu butona dokunarak hızlıca geri dönebilirsiniz.',
    icon: 'locate',
    area: 'fab-right',
    position: 2,
    color: '#fff',
    bgColor: '#059669',
  },
  {
    id: 7,
    title: 'Bölgede Ara (Dürbün)',
    description:
      'Haritayı kaydırdığınızda ortada beliren yeşil dürbün simgesi, görüntülediğiniz bölgedeki kamp alanlarını arar ve haritaya getirir. Yeni bölgeleri keşfetmek için kullanın.',
    icon: 'binoculars',
    area: 'fab-center',
    color: '#fff',
    bgColor: '#059669',
  },
];

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function GuideScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const animateTransition = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const goNext = () => {
    if (isLast) {
      router.back();
      return;
    }
    animateTransition(() => setCurrentStep((s) => s + 1));
  };

  const goPrev = () => {
    if (isFirst) return;
    animateTransition(() => setCurrentStep((s) => s - 1));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ─── Üst Bar ─── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Uygulama Rehberi</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={22} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* ─── İçerik ─── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          {/* Spotlight Alanı */}
          <SpotlightArea step={step} />

          {/* Metin */}
          <View style={styles.textArea}>
            <Text style={styles.stepLabel}>
              {currentStep === 0 ? '' : `Adım ${currentStep} / ${STEPS.length - 1}`}
            </Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepDescription}>{step.description}</Text>
          </View>
        </Animated.View>

        {/* ─── Adım Göstergesi ─── */}
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => animateTransition(() => setCurrentStep(i))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View
                style={[
                  styles.dot,
                  i === currentStep && styles.dotActive,
                  i < currentStep && styles.dotPast,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Navigasyon Butonları ─── */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnSecondary, isFirst && styles.navBtnDisabled]}
            onPress={goPrev}
            disabled={isFirst}
          >
            <ChevronLeft size={20} color={isFirst ? '#cbd5e1' : '#059669'} />
            <Text style={[styles.navBtnText, styles.navBtnSecondaryText, isFirst && { color: '#cbd5e1' }]}>
              Önceki
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navBtn, styles.navBtnPrimary]} onPress={goNext}>
            {isLast ? (
              <>
                <CheckCircle size={20} color="#fff" />
                <Text style={[styles.navBtnText, styles.navBtnPrimaryText]}>Tamamla</Text>
              </>
            ) : (
              <>
                <Text style={[styles.navBtnText, styles.navBtnPrimaryText]}>Sonraki</Text>
                <ChevronRight size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Tüm Adımları Atla */}
        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={() => router.back()}>
            <Text style={styles.skipBtnText}>Rehberi Kapat</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Spotlight Görsel Alanı ───────────────────────────────────────────────────
function SpotlightArea({ step }: { step: (typeof STEPS)[0] }) {
  if (step.area === 'welcome') {
    return (
      <View style={styles.spotlightWelcome}>
        <View style={styles.welcomeIconWrap}>
          <Map size={64} color="#059669" />
        </View>
        <Text style={styles.welcomeTagline}>Kamp Defterim</Text>
      </View>
    );
  }

  if (step.area === 'header-right') {
    return <HeaderSpotlight step={step} />;
  }

  if (step.area === 'fab-right') {
    return <FabRightSpotlight step={step} />;
  }

  if (step.area === 'fab-center') {
    return <FabCenterSpotlight step={step} />;
  }

  return null;
}

// ─── Başlık Butonu Spotlight ──────────────────────────────────────────────────
function HeaderSpotlight({ step }: { step: (typeof STEPS)[0] }) {
  const icons = [
    { key: 'list', component: <List size={22} color="#059669" />, label: 'Liste' },
    { key: 'search', component: <Search size={22} color="#059669" />, label: 'Ara' },
    { key: 'filter', component: <Filter size={22} color="#059669" />, label: 'Filtre' },
    { key: 'refresh', component: <RefreshCw size={22} color="#059669" />, label: 'Yenile' },
  ];

  return (
    <View style={styles.spotlightHeaderWrap}>
      {/* Karartılmış Ekran Arka Planı */}
      <View style={styles.phoneFrame}>
        {/* Sahte Header */}
        <View style={styles.fakeHeader}>
          <View style={styles.fakeHeaderTitle}>
            <Text style={styles.fakeHeaderTitleText}>Kamp Alanları</Text>
          </View>
          <View style={styles.fakeHeaderIcons}>
            {icons.map((icon, i) => {
              const isActive = icon.key === step.icon;
              return (
                <View
                  key={icon.key}
                  style={[
                    styles.fakeHeaderIconBtn,
                    isActive && styles.fakeHeaderIconBtnActive,
                  ]}
                >
                  {icon.component}
                  {isActive && (
                    <View style={styles.spotlightRing} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
        {/* Sahte harita alanı */}
        <View style={styles.fakeMapArea}>
          <View style={styles.fakeMapGrid} />
          <View style={[styles.fakeMapGrid, { top: '33%' }]} />
          <View style={[styles.fakeMapGrid, { top: '66%' }]} />
          <View style={[styles.fakeMapGridV, { left: '25%' }]} />
          <View style={[styles.fakeMapGridV, { left: '50%' }]} />
          <View style={[styles.fakeMapGridV, { left: '75%' }]} />
          <Text style={styles.fakeMapPin}>📍</Text>
          <Text style={[styles.fakeMapPin, { top: '40%', left: '60%' }]}>⛺</Text>
          <Text style={[styles.fakeMapPin, { top: '60%', left: '30%' }]}>⛺</Text>
          <View style={styles.fakeMapOverlay} />
        </View>
      </View>

      {/* Aktif ikonu büyük göster */}
      <View style={[styles.spotlightBigIcon, { backgroundColor: step.bgColor }]}>
        {getIcon(step.icon!, 36, step.color)}
      </View>
    </View>
  );
}

// ─── FAB Sağ Spotlight ────────────────────────────────────────────────────────
function FabRightSpotlight({ step }: { step: (typeof STEPS)[0] }) {
  const fabs = [
    { key: 'plus', component: <Plus size={28} color="#fff" />, bg: '#059669' },
    { key: 'locate', component: <LocateFixed size={24} color="#fff" />, bg: '#059669' },
  ];

  return (
    <View style={styles.spotlightFabWrap}>
      <View style={styles.phoneFrame}>
        {/* Sahte Header */}
        <View style={styles.fakeHeader}>
          <View style={styles.fakeHeaderTitle}>
            <Text style={styles.fakeHeaderTitleText}>Kamp Alanları</Text>
          </View>
          <View style={styles.fakeHeaderIcons}>
            {[<List size={18} color="#059669" />, <Search size={18} color="#059669" />, <Filter size={18} color="#059669" />, <RefreshCw size={18} color="#059669" />].map((ic, i) => (
              <View key={i} style={styles.fakeHeaderIconBtn}>{ic}</View>
            ))}
          </View>
        </View>
        {/* Sahte harita alanı */}
        <View style={styles.fakeMapArea}>
          <View style={styles.fakeMapGrid} />
          <View style={[styles.fakeMapGrid, { top: '50%' }]} />
          <View style={[styles.fakeMapGridV, { left: '33%' }]} />
          <View style={[styles.fakeMapGridV, { left: '66%' }]} />
          <Text style={styles.fakeMapPin}>📍</Text>
          <Text style={[styles.fakeMapPin, { top: '45%', left: '55%' }]}>⛺</Text>
          <View style={styles.fakeMapOverlay} />
          {/* FAB Butonlar */}
          <View style={styles.fakeFabContainer}>
            {fabs.map((fab) => {
              const isActive = fab.key === step.icon;
              return (
                <View
                  key={fab.key}
                  style={[
                    styles.fakeFab,
                    { backgroundColor: fab.bg },
                    isActive && styles.fakeFabActive,
                  ]}
                >
                  {fab.component}
                  {isActive && <View style={styles.fakeFabRing} />}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View style={[styles.spotlightBigIcon, { backgroundColor: step.bgColor }]}>
        {getIcon(step.icon!, 36, step.color)}
      </View>
    </View>
  );
}

// ─── FAB Merkez (Dürbün) Spotlight ───────────────────────────────────────────
function FabCenterSpotlight({ step }: { step: (typeof STEPS)[0] }) {
  return (
    <View style={styles.spotlightFabWrap}>
      <View style={styles.phoneFrame}>
        <View style={styles.fakeHeader}>
          <View style={styles.fakeHeaderTitle}>
            <Text style={styles.fakeHeaderTitleText}>Kamp Alanları</Text>
          </View>
          <View style={styles.fakeHeaderIcons}>
            {[<List size={18} color="#059669" />, <Search size={18} color="#059669" />, <Filter size={18} color="#059669" />, <RefreshCw size={18} color="#059669" />].map((ic, i) => (
              <View key={i} style={styles.fakeHeaderIconBtn}>{ic}</View>
            ))}
          </View>
        </View>
        <View style={styles.fakeMapArea}>
          <View style={styles.fakeMapGrid} />
          <View style={[styles.fakeMapGrid, { top: '50%' }]} />
          <View style={[styles.fakeMapGridV, { left: '33%' }]} />
          <View style={[styles.fakeMapGridV, { left: '66%' }]} />
          <Text style={styles.fakeMapPin}>📍</Text>
          <Text style={[styles.fakeMapPin, { top: '55%', left: '60%' }]}>⛺</Text>
          <Text style={[styles.fakeMapPin, { top: '30%', left: '25%' }]}>⛺</Text>
          <View style={styles.fakeMapOverlay} />
          {/* Dürbün FAB - merkezde */}
          <View style={styles.fakeBinocularsFabWrap}>
            <View style={[styles.fakeFab, { backgroundColor: '#059669' }, styles.fakeFabActive]}>
              <Binoculars size={22} color="#fff" />
              <View style={styles.fakeFabRing} />
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.spotlightBigIcon, { backgroundColor: step.bgColor }]}>
        <Binoculars size={36} color="#fff" />
      </View>
    </View>
  );
}

// ─── Yardımcı: İkon Döndür ────────────────────────────────────────────────────
function getIcon(key: string, size: number, color: string) {
  switch (key) {
    case 'list':     return <List size={size} color={color} />;
    case 'search':   return <Search size={size} color={color} />;
    case 'filter':   return <Filter size={size} color={color} />;
    case 'refresh':  return <RefreshCw size={size} color={color} />;
    case 'plus':     return <Plus size={size} color={color} />;
    case 'locate':   return <LocateFixed size={size} color={color} />;
    case 'binoculars': return <Binoculars size={size} color={color} />;
    default:         return null;
  }
}

// ─── Stiller ──────────────────────────────────────────────────────────────────
const PHONE_W = width * 0.72;
const PHONE_H = PHONE_W * 0.62;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 20,
  },

  // ─ Kart ─
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  textArea: {
    padding: 24,
    paddingTop: 20,
  },
  stepLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    lineHeight: 26,
  },
  stepDescription: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 23,
  },

  // ─ Dots ─
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
  },
  dotActive: {
    width: 24,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  dotPast: {
    backgroundColor: '#6ee7b7',
  },

  // ─ Nav Butonlar ─
  navRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  navBtnPrimary: {
    backgroundColor: '#059669',
  },
  navBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  navBtnDisabled: {
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  navBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  navBtnPrimaryText: {
    color: '#fff',
  },
  navBtnSecondaryText: {
    color: '#059669',
  },

  // ─ Skip ─
  skipBtn: {
    paddingVertical: 10,
  },
  skipBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ─ Welcome Spotlight ─
  spotlightWelcome: {
    height: 180,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  welcomeIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTagline: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },

  // ─ Telefon Çerçevesi ─
  spotlightHeaderWrap: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 16,
  },
  spotlightFabWrap: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 16,
  },
  phoneFrame: {
    width: PHONE_W,
    height: PHONE_H,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#334155',
    backgroundColor: '#fff',
  },

  // ─ Sahte Header ─
  fakeHeader: {
    height: 40,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    zIndex: 10,
  },
  fakeHeaderTitle: {
    flex: 1,
  },
  fakeHeaderTitleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  fakeHeaderIcons: {
    flexDirection: 'row',
    gap: 2,
  },
  fakeHeaderIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fakeHeaderIconBtnActive: {
    backgroundColor: '#dcfce7',
    borderWidth: 2,
    borderColor: '#059669',
  },
  spotlightRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#059669',
  },

  // ─ Sahte Harita ─
  fakeMapArea: {
    flex: 1,
    backgroundColor: '#dbeafe',
    position: 'relative',
    overflow: 'hidden',
  },
  fakeMapGrid: {
    position: 'absolute',
    top: '15%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#bfdbfe',
  },
  fakeMapGridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#bfdbfe',
  },
  fakeMapPin: {
    position: 'absolute',
    top: '20%',
    left: '15%',
    fontSize: 14,
  },
  fakeMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },

  // ─ FAB Sahte ─
  fakeFabContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    gap: 6,
    alignItems: 'center',
  },
  fakeFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fakeFabActive: {
    borderWidth: 2.5,
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },
  fakeFabRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#86efac',
  },
  fakeBinocularsFabWrap: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    left: '35%',
  },

  // ─ Büyük İkon ─
  spotlightBigIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    ...Platform.select({
      ios: { shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
});
