/**
 * NearbyPeersBar.tsx
 * Chat ekranlarında P2P transport durumunu ve bağlı yakın cihazları gösterir.
 *
 * - WiFi bağlantı durumunu 🟢/🔴 ile gösterir
 * - Bağlı peer'ları avatar + isim chip'leri olarak listeler
 * - Dismiss edilebilir; yeni peer bağlanınca yeniden açılır
 * - onStatusChange(wifi) callback'i ile üst bileşeni bilgilendirir
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { offlineTransportManager, PeerInfo } from '@/lib/offlineTransport';

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  /** Bar görünür olsun mu (dışarıdan geçersiz kılma; varsayılan: true) */
  visible?: boolean;
  /**
   * WiFi bağlantı durumu değişince çağrılır.
   * Üst bileşen bunu offline banner'daki rehber butonu için kullanır.
   */
  onStatusChange?: (hasWifi: boolean) => void;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const isWifiPeer = (p: PeerInfo) => p.port !== 0;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ─── Alt bileşenler ──────────────────────────────────────────────────────────

function StatusChip({
  icon,
  label,
  connected,
}: {
  icon: string;
  label: string;
  connected: boolean;
}) {
  return (
    <View style={[styles.statusChip, connected ? styles.statusConnected : styles.statusDisconnected]}>
      <Text style={styles.statusIcon}>{icon}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
    </View>
  );
}

function PeerChip({ peer }: { peer: PeerInfo }) {
  const wifi = isWifiPeer(peer);
  return (
    <View style={styles.chip}>
      <View style={[styles.avatar, wifi ? styles.avatarWifi : styles.avatarBt]}>
        <Text style={styles.avatarText}>{initials(peer.userName) || '?'}</Text>
      </View>
      <View style={styles.chipLabels}>
        <Text style={styles.chipName} numberOfLines={1}>{peer.userName}</Text>
        <Text style={styles.chipType}>📡 WiFi</Text>
      </View>
    </View>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────

export default function NearbyPeersBar({ visible = true, onStatusChange }: Props) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isActive, setIsActive] = useState(() => offlineTransportManager.isActive);
  const [dismissed, setDismissed] = useState(false);
  const barHeight = useRef(new Animated.Value(0)).current;
  const prevCount = useRef(0);
  // ref ile callback'in stale closure sorununu önle
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  // ─── Transport durum aboneliği ───────────────────────────────────────────

  useEffect(() => {
    const syncPeers = (newPeers: PeerInfo[]) => {
      const active = offlineTransportManager.isActive;
      setPeers([...newPeers]);
      setIsActive(active);

      const hw = newPeers.some(isWifiPeer);
      onStatusChangeRef.current?.(hw);

      if (newPeers.length > prevCount.current) setDismissed(false);
      prevCount.current = newPeers.length;
    };

    // İlk durum — transport zaten başlatılmışsa hemen uygula
    syncPeers(offlineTransportManager.peers);

    const unsub = offlineTransportManager.onPeersChanged(syncPeers);
    return unsub;
  }, []);

  // ─── Animasyon ───────────────────────────────────────────────────────────

  const shouldShow = visible && !dismissed && isActive;

  useEffect(() => {
    Animated.timing(barHeight, {
      toValue: shouldShow ? 200 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [shouldShow, barHeight]);

  const handleDismiss = useCallback(() => setDismissed(true), []);

  if (!isActive && !shouldShow) return null;

  const hasWifi = peers.some(isWifiPeer);

  return (
    <Animated.View style={{ maxHeight: barHeight, overflow: 'hidden' }}>
      <View
        style={styles.container}
        accessibilityRole="none"
      >
      {/* Üst satır: başlık + kapat */}
      <View style={styles.header}>
        <Text style={styles.headerText}>📡 Yakın Cihazlar</Text>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Kapat"
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Durum satırı: WiFi bağlantı göstergesi */}
      <View style={styles.statusRow}>
        <StatusChip icon="📡" label="WiFi" connected={hasWifi} />
        {!hasWifi && (
          <Text style={styles.scanningText}>taranıyor…</Text>
        )}
      </View>

      {/* Bağlı peer chip listesi */}
      {peers.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.peerScroll}
        >
          {peers.map((p) => (
            <PeerChip key={p.userId} peer={p} />
          ))}
        </ScrollView>
      )}
      </View>
    </Animated.View>
  );
}

// ─── Stiller ────────────────────────────────────────────────────────────────

const BG       = '#065f46';
const TXT      = '#ecfdf5';
const MUTED    = 'rgba(236,253,245,0.65)';

const styles = StyleSheet.create({
  container: {
    backgroundColor: BG,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },

  // ─ Üst satır
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerText: {
    color: TXT,
    fontSize: 12,
    fontWeight: '700',
  },
  closeText: {
    color: TXT,
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.75,
  },

  // ─ Durum satırı
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 8,
    gap: 4,
  },
  statusConnected: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  statusDisconnected: {
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  statusIcon: {
    fontSize: 12,
  },
  statusLabel: {
    color: TXT,
    fontSize: 11,
    fontWeight: '600',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotGreen: { backgroundColor: '#4ade80' },
  dotRed:   { backgroundColor: '#f87171' },
  scanningText: {
    color: MUTED,
    fontSize: 11,
    fontStyle: 'italic',
    marginLeft: 4,
  },

  // ─ Peer listesi
  peerScroll: {
    marginTop: 4,
  },
  scrollContent: {
    paddingRight: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWifi: { backgroundColor: '#0ea5e9' },
  avatarBt:   { backgroundColor: '#8b5cf6' },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  chipLabels: { gap: 1 },
  chipName: {
    color: TXT,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 90,
  },
  chipType: {
    color: MUTED,
    fontSize: 10,
  },
});
