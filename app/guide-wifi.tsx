import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Animated,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../components/ThemeProvider';
import {
  Wifi,
  WifiOff,
  Users,
  MessageCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Router,
  Signal,
  Send,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

// ─── Renk Sabitleri ───────────────────────────────────────────────────────────
const C = {
  wifi: '#0ea5e9',
  wifiBg: '#f0f9ff',
  wifiDark: '#0369a1',
  wifiLight: '#bae6fd',
};

// ─── Rehber Adımları ─────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 0,
    area: 'welcome',
    title: 'WiFi ile Offline Sohbet',
    description:
      'İnternet olmadan, aynı WiFi ağındaki Kamp Defterim kullanıcılarıyla doğrudan mesajlaşabilirsiniz. Bu rehber kurulum adımlarını anlatır.',
  },
  {
    id: 1,
    area: 'network',
    title: '1. Aynı WiFi Ağına Bağlanın',
    description:
      'Her iki cihazın da aynı yerel WiFi ağına bağlı olması gerekir. Ev, kamp alanı veya taşınabilir hotspot ağı olabilir — internet bağlantısı şart değildir.',
  },
  {
    id: 2,
    area: 'discovery',
    title: '2. Otomatik Keşif',
    description:
      'Sohbet ekranı açıldığında uygulama, ağdaki diğer Kamp Defterim kullanıcılarını otomatik olarak arar. Herhangi bir eşleştirme gerekmez.',
  },
  {
    id: 3,
    area: 'chat',
    title: '3. Sohbet Edin',
    description:
      'Bir arkadaş seçip mesaj gönderin. Mesajlar doğrudan ağ üzerinden iletilir; internet olmasa bile anlık olarak karşı tarafa ulaşır.',
  },
  {
    id: 4,
    area: 'sync',
    title: '4. İnternet Gelince Senkronize',
    description:
      'Offline gönderilen mesajlar sunucuya da kaydedilir. İnternet bağlantısı tekrar sağlandığında yazışma geçmişi otomatik olarak senkronize edilir.',
  },
];

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function GuideWifiScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  useEffect(() => {
    const onBack = () => {
      router.replace('/profile');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [router]);

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
    if (isLast) { router.back(); return; }
    animateTransition(() => setCurrentStep((s) => s + 1));
  };

  const goPrev = () => {
    if (isFirst) return;
    animateTransition(() => setCurrentStep((s) => s - 1));
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* ─── Üst Bar ─── */}
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.topBarLeft}>
          <Wifi size={20} color={C.wifi} />
          <Text style={[styles.topBarTitle, { color: colors.text }]}>WiFi Bağlantı Rehberi</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.replace('/profile')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }], backgroundColor: colors.surface }]}>
          <SpotlightArea area={step.area} />

          <View style={styles.textArea}>
            <Text style={[styles.stepLabel, { color: C.wifi }]}>
              {currentStep === 0 ? 'WiFi Offline Sohbet' : `Adım ${currentStep} / ${STEPS.length - 1}`}
            </Text>
            <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
            <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>{step.description}</Text>
          </View>
        </Animated.View>

        {/* Adım Göstergesi */}
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
                  { backgroundColor: colors.border },
                  i === currentStep && [styles.dotActive, { backgroundColor: C.wifi }],
                  i < currentStep && { backgroundColor: C.wifiLight },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Navigasyon */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnSecondary, { borderColor: C.wifi }, isFirst && [styles.navBtnDisabled, { borderColor: colors.border }]]}
            onPress={goPrev}
            disabled={isFirst}
          >
            <ChevronLeft size={20} color={isFirst ? colors.border : C.wifi} />
            <Text style={[styles.navBtnText, { color: isFirst ? colors.border : C.wifi }]}>Önceki</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: C.wifi }]} onPress={goNext}>
            {isLast ? (
              <>
                <CheckCircle size={20} color="#fff" />
                <Text style={[styles.navBtnText, { color: '#fff' }]}>Tamamla</Text>
              </>
            ) : (
              <>
                <Text style={[styles.navBtnText, { color: '#fff' }]}>Sonraki</Text>
                <ChevronRight size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/profile')}>
            <Text style={[styles.skipBtnText, { color: colors.muted }]}>Rehberi Kapat</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Spotlight Alanları ───────────────────────────────────────────────────────
function SpotlightArea({ area }: { area: string }) {
  switch (area) {
    case 'welcome':   return <WelcomeSpotlight />;
    case 'network':   return <NetworkSpotlight />;
    case 'discovery': return <DiscoverySpotlight />;
    case 'chat':      return <ChatSpotlight />;
    case 'sync':      return <SyncSpotlight />;
    default:          return null;
  }
}

function WelcomeSpotlight() {
  return (
    <View style={[styles.spotlightBase, { backgroundColor: C.wifiBg }]}>
      <View style={styles.welcomeIconStack}>
        <View style={[styles.welcomeRing, { borderColor: C.wifiLight }]} />
        <View style={[styles.welcomeRingInner, { borderColor: C.wifi, opacity: 0.3 }]} />
        <View style={[styles.welcomeIconWrap, { backgroundColor: '#e0f2fe' }]}>
          <Wifi size={48} color={C.wifi} />
        </View>
      </View>
      <Text style={[styles.welcomeTagline, { color: C.wifiDark }]}>Yerel Ağ Modu</Text>
      <Text style={styles.welcomeSubtitle}>İnternetsiz, doğrudan yazışma</Text>
    </View>
  );
}

function NetworkSpotlight() {
  return (
    <View style={[styles.spotlightBase, { backgroundColor: '#1e293b' }]}>
      {/* Sahte ağ diyagramı */}
      <View style={styles.networkDiagram}>
        {/* Router */}
        <View style={[styles.networkNode, { backgroundColor: '#334155' }]}>
          <Router size={28} color={C.wifi} />
          <Text style={styles.networkNodeLabel}>WiFi Ağı</Text>
        </View>
        {/* Bağlantı çizgileri */}
        <View style={styles.networkLines}>
          <View style={[styles.networkLine, { backgroundColor: C.wifi }]} />
          <View style={[styles.networkLine, { backgroundColor: C.wifi }]} />
        </View>
        {/* Cihazlar */}
        <View style={styles.networkDevices}>
          <View style={styles.networkDevice}>
            <View style={[styles.deviceIcon, { backgroundColor: '#0ea5e930' }]}>
              <Signal size={20} color={C.wifi} />
            </View>
            <Text style={styles.deviceLabel}>Cihaz 1</Text>
          </View>
          <View style={styles.networkDevice}>
            <View style={[styles.deviceIcon, { backgroundColor: '#0ea5e930' }]}>
              <Signal size={20} color={C.wifi} />
            </View>
            <Text style={styles.deviceLabel}>Cihaz 2</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function DiscoverySpotlight() {
  return (
    <View style={[styles.spotlightBase, { backgroundColor: '#1e293b' }]}>
      <View style={styles.discoveryWrap}>
        {/* Tarama animasyonu görseli */}
        <View style={styles.scanCircleOuter}>
          <View style={styles.scanCircleMid}>
            <View style={[styles.scanCircleInner, { backgroundColor: '#0ea5e920' }]}>
              <Wifi size={32} color={C.wifi} />
            </View>
          </View>
        </View>
        {/* Bulunan kullanıcılar */}
        <View style={styles.discoveredUsers}>
          {['Ahmet K.', 'Zeynep M.'].map((name, i) => (
            <View key={i} style={styles.discoveredUser}>
              <View style={[styles.discoveredAvatar, { backgroundColor: C.wifi + '30' }]}>
                <Users size={14} color={C.wifi} />
              </View>
              <Text style={styles.discoveredName}>{name}</Text>
              <View style={[styles.discoveredBadge, { backgroundColor: '#22c55e' }]}>
                <Text style={styles.discoveredBadgeText}>Yakınlarda</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ChatSpotlight() {
  const fakeMsgs = [
    { text: 'Merhaba! Kamp alanı nasıl?', mine: false },
    { text: 'Harika! Ateş de yakıldı 🔥', mine: true },
    { text: 'İnternet yok ama mesajlaşıyoruz 👍', mine: false },
  ];
  return (
    <View style={[styles.spotlightBase, { backgroundColor: '#1e293b', paddingVertical: 16 }]}>
      <View style={styles.fakeChatHeader}>
        <View style={[styles.fakeChatAvatar, { backgroundColor: C.wifi + '40' }]}>
          <MessageCircle size={14} color={C.wifi} />
        </View>
        <Text style={styles.fakeChatName}>Ahmet K.</Text>
        <View style={styles.wifiIndicator}>
          <Wifi size={12} color={C.wifi} />
          <Text style={[styles.wifiIndicatorText, { color: C.wifi }]}>WiFi</Text>
        </View>
      </View>
      <View style={styles.fakeMsgList}>
        {fakeMsgs.map((m, i) => (
          <View key={i} style={[styles.fakeMsgRow, m.mine && { justifyContent: 'flex-end' }]}>
            <View style={[styles.fakeMsgBubble, { backgroundColor: m.mine ? C.wifi : '#334155' }]}>
              <Text style={styles.fakeMsgText}>{m.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SyncSpotlight() {
  return (
    <View style={[styles.spotlightBase, { backgroundColor: C.wifiBg, gap: 12 }]}>
      <View style={styles.syncRow}>
        <View style={[styles.syncStep, { borderColor: C.wifi }]}>
          <WifiOff size={22} color="#94a3b8" />
          <Text style={styles.syncStepLabel}>Offline</Text>
          <Text style={styles.syncStepSub}>Mesaj kuyruğa alındı</Text>
        </View>
        <View style={[styles.syncArrow, { backgroundColor: C.wifiLight }]}>
          <Send size={14} color={C.wifi} />
        </View>
        <View style={[styles.syncStep, { borderColor: '#22c55e' }]}>
          <Wifi size={22} color="#22c55e" />
          <Text style={styles.syncStepLabel}>Online</Text>
          <Text style={styles.syncStepSub}>Otomatik senkronize</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────
const PHONE_W = width * 0.72;

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarTitle: { fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 4 },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 20,
  },

  // Kart
  card: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  textArea: { padding: 24, paddingTop: 20 },
  stepLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  stepTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10, lineHeight: 26 },
  stepDescription: { fontSize: 15, lineHeight: 23 },

  // Dots
  dotsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24, height: 8, borderRadius: 4 },

  // Nav
  navRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'space-between' },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  navBtnPrimary: {},
  navBtnSecondary: { borderWidth: 1.5 },
  navBtnDisabled: {},
  navBtnText: { fontSize: 15, fontWeight: '700' },
  skipBtn: { paddingVertical: 10 },
  skipBtnText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },

  // Spotlight Base
  spotlightBase: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },

  // Welcome
  welcomeIconStack: { position: 'relative', width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  welcomeRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  welcomeRingInner: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
  },
  welcomeIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTagline: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  welcomeSubtitle: { fontSize: 13, color: '#64748b', fontWeight: '500' },

  // Network
  networkDiagram: { alignItems: 'center', gap: 8 },
  networkNode: {
    width: 80,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#475569',
  },
  networkNodeLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  networkLines: { flexDirection: 'row', gap: 48, height: 20, alignItems: 'center' },
  networkLine: { width: 1, height: 20, opacity: 0.7 },
  networkDevices: { flexDirection: 'row', gap: 48 },
  networkDevice: { alignItems: 'center', gap: 6 },
  deviceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  deviceLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },

  // Discovery
  discoveryWrap: { alignItems: 'center', gap: 12 },
  scanCircleOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: '#0ea5e920',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCircleMid: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: '#0ea5e940',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCircleInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoveredUsers: { flexDirection: 'row', gap: 10 },
  discoveredUser: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1e3a5f40', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 },
  discoveredAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  discoveredName: { color: '#e2e8f0', fontSize: 11, fontWeight: '600' },
  discoveredBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  discoveredBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Fake Chat
  fakeChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
    width: PHONE_W * 0.88,
  },
  fakeChatAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fakeChatName: { flex: 1, color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
  wifiIndicator: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  wifiIndicatorText: { fontSize: 10, fontWeight: '600' },
  fakeMsgList: { gap: 5, width: PHONE_W * 0.88 },
  fakeMsgRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  fakeMsgBubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, maxWidth: '78%' },
  fakeMsgText: { color: '#f1f5f9', fontSize: 11, lineHeight: 15 },

  // Sync
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncStep: {
    width: 110,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
  },
  syncStepLabel: { fontSize: 12, fontWeight: '800', color: '#1e293b' },
  syncStepSub: { fontSize: 10, color: '#64748b', textAlign: 'center' },
  syncArrow: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
