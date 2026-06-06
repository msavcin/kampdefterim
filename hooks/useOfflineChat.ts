/**
 * useOfflineChat.ts
 * Çevrimdışı chat özelliğini chat ekranlarına bağlayan React hook'u.
 *
 * Kullanım örneği (chat ekranında):
 *
 *   const isConnected = useNetworkStatus();
 *   const offline = useOfflineChat(conversationId);
 *
 *   useEffect(() => {
 *     if (!isConnected) offline.start();    // wifi offline moda geç
 *     else              offline.syncToServer(); // internet gelince sync et
 *   }, [isConnected]);
 *
 *   // Mesaj gönderirken:
 *   if (!isConnected) {
 *     await offline.sendMessage(text);
 *   } else {
 *     // mevcut online gönderim ...
 *   }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { offlineTransportManager, PeerInfo, OfflineQueueMessage } from '@/lib/offlineTransport';
import { getMe } from '@/lib/userCommunityApi';

export interface UseOfflineChatReturn {
  /** Offline transport aktif mi? */
  isActive: boolean;
  /** Yerel ağda keşfedilen peer'lar */
  peers: PeerInfo[];
  /** Yerel SQLite'tan okunan offline mesajlar (conversationId gerekliyse) */
  localMessages: OfflineQueueMessage[];
  /** Offline transport'u başlat (WiFi peer keşfini etkinleştirir) */
  start: () => Promise<void>;
  /** Offline transport'u durdur */
  stop: () => Promise<void>;
  /** Offline mesaj gönder → SQLite + peer'lara ilet */
  sendMessage: (text: string, convId?: string) => Promise<string | null>;
  /** Bekleyen mesajları sunucuya ilet (internet gelince çağır) */
  syncToServer: () => Promise<void>;
  /** Yerel mesajları yenile */
  refreshLocalMessages: () => Promise<void>;
}

export function useOfflineChat(conversationId?: string): UseOfflineChatReturn {
  const [peers, setPeers] = useState<PeerInfo[]>(() => offlineTransportManager.peers);
  const [isActive, setIsActive] = useState(() => offlineTransportManager.isActive);
  const [localMessages, setLocalMessages] = useState<OfflineQueueMessage[]>([]);

  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  // ─── Yerel mesajları yükle ─────────────────────────────────────────────────

  const refreshLocalMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const msgs = await offlineTransportManager.getLocalMessages(conversationId);
      if (mountedRef.current) setLocalMessages(msgs);
    } catch (e) {
      console.warn('[useOfflineChat] refreshLocalMessages hatası:', e);
    }
  }, [conversationId]);

  // ─── Başlat ────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (startedRef.current) return;
    try {
      const me = await getMe().catch(() => null);
      const userId = String(me?.id ?? me?.user_id ?? me?.userId ?? 'unknown');
      const userName: string = me?.name || me?.username || 'Kamp Kullanıcısı';
      await offlineTransportManager.start(userId, userName);
      if (mountedRef.current) setIsActive(true);
      startedRef.current = true;
    } catch (e) {
      console.warn('[useOfflineChat] start hatası:', e);
    }
  }, []);

  // ─── Durdur ────────────────────────────────────────────────────────────────

  const stop = useCallback(async () => {
    try {
      await offlineTransportManager.stop();
      if (mountedRef.current) setIsActive(false);
      startedRef.current = false;
    } catch (e) {
      console.warn('[useOfflineChat] stop hatası:', e);
    }
  }, []);

  // ─── Mesaj gönder ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, convId?: string): Promise<string | null> => {
      const targetConvId = convId ?? conversationId;
      if (!targetConvId || !text.trim()) return null;
      try {
        const id = await offlineTransportManager.sendMessage(targetConvId, text.trim());
        await refreshLocalMessages();
        return id;
      } catch (e) {
        console.warn('[useOfflineChat] sendMessage hatası:', e);
        return null;
      }
    },
    [conversationId, refreshLocalMessages],
  );

  // ─── Sunucu sync ───────────────────────────────────────────────────────────

  const syncToServer = useCallback(async () => {
    try {
      await offlineTransportManager.syncPendingToServer();
      await refreshLocalMessages();
    } catch (e) {
      console.warn('[useOfflineChat] syncToServer hatası:', e);
    }
  }, [refreshLocalMessages]);

  // ─── Peer değişikliklerini dinle ───────────────────────────────────────────

  useEffect(() => {
    const unsub = offlineTransportManager.onPeersChanged((p) => {
      if (mountedRef.current) setPeers(p);
    });
    setPeers(offlineTransportManager.peers);
    setIsActive(offlineTransportManager.isActive);
    return unsub;
  }, []);

  // ─── Gelen mesajlarda yerel listeyi yenile ─────────────────────────────────

  useEffect(() => {
    if (!conversationId) return;
    refreshLocalMessages();

    const unsub = offlineTransportManager.onMessage((msg) => {
      if (msg.conversationId === conversationId) {
        refreshLocalMessages();
      }
    });
    return unsub;
  }, [conversationId, refreshLocalMessages]);

  // ─── Unmount temizliği ─────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return {
    isActive,
    peers,
    localMessages,
    start,
    stop,
    sendMessage,
    syncToServer,
    refreshLocalMessages,
  };
}
