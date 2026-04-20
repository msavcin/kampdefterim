import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './ThemeProvider';
import { Sparkles, Crown } from 'lucide-react-native';
import { AIEvaluationRequest, AIEvaluationResponse, getAIEvaluation, getAIEvalStatus } from '@/lib/aiEvaluationApi';
import AIEvaluationDashboardModal from './AIEvaluationDashboardModal';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRouter } from 'expo-router';
import { getMe } from '@/lib/userCommunityApi';

let premiumCache: boolean | null = null;
let premiumPromise: Promise<boolean> | null = null;
const ensurePremium = async (): Promise<boolean> => {
  if (premiumCache !== null) return premiumCache;
  if (premiumPromise) return premiumPromise;
  premiumPromise = (async () => {
    try {
      const u = await getMe();
      const prem = !!(u?.isPremium || u?.is_premium || u?.offline_enabled || u?.user?.is_premium || u?.user?.offline_enabled);
      premiumCache = prem;
      premiumPromise = null;
      return prem;
    } catch (e) {
      premiumPromise = null;
      premiumCache = false;
      return false;
    }
  })();
  return premiumPromise;
};

type Props = {
  campingArea: any;
  campingAreaImage?: string | null;
  planTitle?: string | null;
  fullWidth?: boolean;
};

const CAMP_AREA_AI_EVAL_CACHE_KEY = 'campAreaAIEvals';
const CAMP_AREA_AI_EVAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

export default function AIEvalButton({ campingArea, campingAreaImage = null, planTitle = null, fullWidth = false }: Props) {
  const { colors } = useTheme();
  const isConnected = useNetworkStatus();
  const router = useRouter();
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<AIEvaluationResponse | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  // Load cached area evaluation (per-user)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await getMe();
        const uid = u?.id ? String(u.id) : null;
        const storageKey = uid ? `${CAMP_AREA_AI_EVAL_CACHE_KEY}:${uid}` : CAMP_AREA_AI_EVAL_CACHE_KEY;
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw || '{}');
        const areaId = campingArea?.id ? String(campingArea.id) : null;
        if (!areaId) return;
        const ev = parsed[areaId] as AIEvaluationResponse | undefined | null;
        if (!ev) return;

        // If fallback, keep but do not count towards cooldown
        if ((ev as any).fallback === true) {
          if (!mounted) return;
          setEvaluation(ev as any);
          return;
        }

        if (ev.generatedAt) {
          const gen = new Date(ev.generatedAt).getTime();
          if (Date.now() - gen < CAMP_AREA_AI_EVAL_TTL_MS) {
            if (!mounted) return;
            setEvaluation(ev as any);
          } else {
            // stale -> remove and persist cleaned cache
            try {
              delete parsed[areaId];
              await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
            } catch (e) {}
          }
        } else {
          if (!mounted) return;
          setEvaluation(ev as any);
        }

        if ((ev as any).remaining !== undefined) {
          if (!mounted) return;
          setRemaining((ev as any).remaining ?? null);
          setLimit((ev as any).limit ?? null);
        } else {
          try {
            const s = await getAIEvalStatus();
            if (s && mounted) {
              setRemaining(s.remaining ?? null);
              setLimit(s.limit ?? null);
            }
          } catch (e) {}
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [campingArea]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const prem = await ensurePremium();
        if (!mounted) return;
        setIsPremium(prem);
      } catch (e) {
        if (!mounted) return;
        setIsPremium(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const prepareCampObj = () => {
    return {
      id: (campingArea as any).id ?? undefined,
      external_id: (campingArea as any).external_id ?? undefined,
      name: campingArea?.name ?? 'İsimsiz',
      lat: Number((campingArea as any).latitude) || 0,
      lng: Number((campingArea as any).longitude) || 0,
      type: (campingArea?.tags && (campingArea as any).tags.type) ? (campingArea as any).tags.type : (campingArea as any).type,
      booking_url: (campingArea as any).booking_url ?? undefined,
    };
  };

  const handleEvaluate = async () => {
    if (!isConnected) { Alert.alert('Çevrimdışı', 'Değerlendirme yapabilmek için internet bağlantısı gerekiyor.'); return; }
    if (!isPremium) { router.push('/premium'); return; }
    // Cooldown: disallow if a non-fallback evaluation exists and is less than 24 hours old
    try {
      if (evaluation && !(evaluation as any).fallback && evaluation.generatedAt) {
        const gen = new Date(evaluation.generatedAt).getTime();
        if (Date.now() - gen < CAMP_AREA_AI_EVAL_TTL_MS) {
          Alert.alert('Bekleyin', 'Bu kamp için yapılan değerlendirme 24 saat geçmeden yeniden yapılamaz.');
          return;
        }
      }
    } catch (e) {}
    setLoading(true);
    try {
      const campObj = prepareCampObj();
      const req: AIEvaluationRequest = {
        campingArea: campObj,
        campType: campObj.type ?? undefined,
        startDate: new Date().toISOString().slice(0,10),
      };
      const res = await getAIEvaluation(req);
      if (res && res.evaluation) {
        setEvaluation(res);
        // persist area evaluation per-user
        (async () => {
          try {
            const u = await getMe();
            const uid = u?.id ? String(u.id) : null;
            const storageKey = uid ? `${CAMP_AREA_AI_EVAL_CACHE_KEY}:${uid}` : CAMP_AREA_AI_EVAL_CACHE_KEY;
            const raw = await AsyncStorage.getItem(storageKey);
            const parsed = raw ? JSON.parse(raw) : {};
            const areaId = campingArea?.id ? String(campingArea.id) : null;
            if (areaId) {
              parsed[areaId] = res;
              await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
            }
          } catch (e) {}
        })();
        setModalVisible(true);
        if ((res as any).remaining !== undefined) {
          setRemaining((res as any).remaining ?? null);
          setLimit((res as any).limit ?? null);
        } else {
          try {
            const s = await getAIEvalStatus();
            if (s) {
              setRemaining(s.remaining ?? null);
              setLimit(s.limit ?? null);
            }
          } catch (e) {}
        }
      } else {
        Alert.alert('Değerlendirme', 'Değerlendirme alınamadı. Lütfen daha sonra tekrar deneyin.');
      }
    } catch (err: any) {
      console.warn('[AIEvalButton] error', err);
      // Rate limit (Too Many Requests)
      if (err?.status === 429) {
        let status = null;
        try {
          status = await getAIEvalStatus();
        } catch (e) { status = null; }
        const remainingVal = status?.remaining ?? err?.body?.remaining ?? null;
        const limitVal = status?.limit ?? err?.body?.limit ?? null;
        const resetAt = status?.reset_at ?? err?.body?.reset_at ?? null;
        let msg = 'İstek limiti aşıldı. Birkaç dakika sonra tekrar deneyin.';
        if (remainingVal !== null && limitVal !== null) {
          msg = `Günlük kullanım sınırı aşıldı. Kalan: ${remainingVal}/${limitVal}.`;
        } else if (resetAt) {
          try { msg = `İstek limiti aşıldı. Yeniden deneme zamanı: ${new Date(resetAt).toLocaleString()}`; } catch (e) {}
        } else if (err?.body?.message) {
          msg = String(err.body.message);
        }
        Alert.alert('Sınır aşıldı', msg, [
          { text: 'Tamam' },
        ]);
      } else {
        Alert.alert('Hata', err?.message || 'Değerlendirme sırasında bir hata oluştu.');
      }
    } finally {
      setLoading(false);
    }
  };

    const timeSince = (iso?: string) => {
      try {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const hrs = Math.floor(diff / (1000 * 60 * 60));
        if (hrs < 1) return 'az önce';
        if (hrs < 24) return `${hrs} saat önce`;
        const days = Math.floor(hrs / 24);
        return `${days} gün önce`;
      } catch (e) { return ''; }
    };

    const isRecentlyEvaluated = (() => {
      try {
        if (!evaluation || !evaluation.generatedAt) return false;
        if ((evaluation as any).fallback === true) return false;
        const diff = Date.now() - new Date(evaluation.generatedAt).getTime();
        return diff < CAMP_AREA_AI_EVAL_TTL_MS;
      } catch (e) { return false; }
    })();

  return (
    <>
      <View style={{ position: 'relative' }}>
        {evaluation ? (
          <View style={{ marginTop: 10, marginBottom: 8 }}>
            <TouchableOpacity
              style={{ padding: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', flexDirection: 'row' }}
              onPress={() => setModalVisible(true)}
            >
              <Sparkles size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, marginLeft: 8, fontWeight: '600', flex: 1 }}>Kamp Defterim Değerlendirmesini Gör</Text>
            </TouchableOpacity>

            {isRecentlyEvaluated ? (
              <Text style={{ marginTop: 8, color: colors.muted }}>Bu alan {timeSince(evaluation.generatedAt)} değerlendirildi. Yeni değerlendirme 1 gün sonra aktif olacak.</Text>
            ) : (
              <View style={{ marginTop: 8, position: 'relative' }}>
                <TouchableOpacity
                  style={[
                    styles.button,
                    fullWidth && { width: '100%' },
                    !isPremium ? { backgroundColor: colors.surfaceVariant ?? '#f1f5f9', borderColor: colors.border ?? '#cbd5e1', opacity: 0.9 } : { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  activeOpacity={isPremium ? 0.7 : 0.9}
                  onPress={() => {
                    if (!isPremium) { router.push('/premium'); return; }
                    handleEvaluate();
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Sparkles size={16} color={isPremium ? '#fff' : colors.muted} />
                      <Text style={[styles.label, { color: isPremium ? '#fff' : colors.muted }]}>Yeniden Değerlendir</Text>
                    </>
                  )}
                </TouchableOpacity>
                {!isPremium && (
                  <View style={[styles.premiumIcon, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
                    <Crown size={14} color={colors.primary} />
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.button,
              fullWidth && { width: '100%' },
              !isPremium ? { backgroundColor: colors.surfaceVariant ?? '#f1f5f9', borderColor: colors.border ?? '#cbd5e1', opacity: 0.9 } : { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            activeOpacity={!isPremium || loading || !isConnected ? 0.9 : 0.7}
            disabled={!isPremium || loading || !isConnected}
            onPress={handleEvaluate}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Sparkles size={16} color={(!isPremium || loading || !isConnected) ? colors.muted : '#fff'} />
                <Text style={[styles.label, { color: (!isPremium || loading || !isConnected) ? colors.muted : '#fff' }]}>Kamp Defterim ile Değerlendir</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {!isPremium && (
          <View style={[styles.premiumIcon, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
            <Crown size={14} color={colors.primary} />
          </View>
        )}
      </View>

      <AIEvaluationDashboardModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        evaluation={evaluation}
        onRefresh={isRecentlyEvaluated ? undefined : () => handleEvaluate()}
        campingAreaImage={campingAreaImage}
        planTitle={planTitle ?? (campingArea?.name ?? 'Kamp Defterim Değerlendirmesi')}
        weatherData={undefined}
        destinationLat={typeof (campingArea as any).latitude === 'number' ? (campingArea as any).latitude : null}
        destinationLng={typeof (campingArea as any).longitude === 'number' ? (campingArea as any).longitude : null}
        remaining={remaining}
        limit={limit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  premiumIcon: { position: 'absolute', right: 6, top: -6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e6eef6' },
});
