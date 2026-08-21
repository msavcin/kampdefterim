/**
 * offlineTransport.ts
 * Çevrimdışı chat için merkezi yönetici (singleton).
 *
 * Sorumlulukları:
 *  - WifiLanTransport'u başlatır/durdurur
 *  - Mesaj gönderiminde WiFi transport'u kullanır
 *  - Gelen peer mesajlarını mevcut chatEvents sistemiyle entegre eder
 *  - Gönderilen mesajları SQLite kuyruğuna yazar
 *  - İnternet gelince bekleyen mesajları sunucuya iletir (syncPendingToServer)
 *
 * Kullanım:
 *   import { offlineTransportManager } from '@/lib/offlineTransport';
 *   await offlineTransportManager.start(userId, userName);
 *   await offlineTransportManager.sendMessage(conversationId, 'Merhaba!');
 *   // İnternet gelince:
 *   await offlineTransportManager.syncPendingToServer();
 */

import { WifiLanTransport, PeerInfo, PeerMessage } from './wifiLanTransport';
import {
  enqueueMessage,
  getPendingMessages,
  markMessageSynced,
  getLocalMessages,
  markPeerDelivered,
  OfflineQueueMessage,
  deleteSyncedMessages,
} from './offlineChatQueue';
import { emitChatEvent } from './chatEvents';
import { apiFetch } from './apiFetch';
import { API_URL } from './config';
import { generateUUID } from './uuid';

export type { PeerInfo, PeerMessage };
export type { OfflineQueueMessage };

// ─── OfflineTransportManager ─────────────────────────────────────────────────

class OfflineTransportManager {
  private readonly _wifi = new WifiLanTransport();

  private _userId = '';
  private _userName = '';
  private _active = false;

  /** WiFi peer listesi */
  private _peers: PeerInfo[] = [];

  private _peerHandlers: Array<(peers: PeerInfo[]) => void> = [];
  private _msgHandlers: Array<(msg: PeerMessage) => void> = [];

  private _unsubWifiMsg:  (() => void) | null = null;
  private _unsubWifiPeer: (() => void) | null = null;

  /**
   * Mesh relay dedup: alınan (veya gönderilen) mesaj ID'lerini tutar.
   * Döngüyü ve tekrar işlemeyi önler.
   */
  private _seenIds = new Set<string>();
  private readonly _MAX_SEEN = 600;

  // ─── Erişimciler ────────────────────────────────────────────────────────────

  get isActive(): boolean { return this._active; }
  get peers(): PeerInfo[] { return this._peers; }

  // ─── Abonelikler ────────────────────────────────────────────────────────────

  onMessage(handler: (msg: PeerMessage) => void): () => void {
    this._msgHandlers.push(handler);
    return () => {
      const i = this._msgHandlers.indexOf(handler);
      if (i >= 0) this._msgHandlers.splice(i, 1);
    };
  }

  onPeersChanged(handler: (peers: PeerInfo[]) => void): () => void {
    this._peerHandlers.push(handler);
    return () => {
      const i = this._peerHandlers.indexOf(handler);
      if (i >= 0) this._peerHandlers.splice(i, 1);
    };
  }

  // ─── Yaşam döngüsü ──────────────────────────────────────────────────────────

  async start(userId: string, userName: string): Promise<void> {
    if (this._active) {
      console.log('[OfflineTransport] zaten aktif, tarama yenileniyor');
      this._wifi.triggerSubnetScan();
      return;
    }
    this._userId = userId;
    this._userName = userName;
    this._active = true;

    // ─── WiFi mesaj ve peer abonelikleri ───────────────────────────────────
    this._unsubWifiMsg = this._wifi.onMessage((msg, peerId) => {
      this._handleIncomingPeerMessage(msg, peerId);
    });
    this._unsubWifiPeer = this._wifi.onPeersChanged(() => {
      this._mergePeers();
    });

    await this._wifi.start(userId, userName);

    // Transport başladığını abonelere bildir (peer sayısı 0 olsa da)
    this._mergePeers();

    console.log('[OfflineTransport] başlatıldı (WiFi), kullanıcı:', userId);
  }

  async stop(): Promise<void> {
    if (!this._active) return;
    this._active = false;

    this._seenIds.clear();

    this._unsubWifiMsg?.();
    this._unsubWifiPeer?.();
    this._unsubWifiMsg = null;
    this._unsubWifiPeer = null;

    await this._wifi.stop();
    this._peers = [];
    console.log('[OfflineTransport] durduruldu');
  }

  // ─── Mesaj gönderme ─────────────────────────────────────────────────────────

  /**
   * Mesajı hem yerel kuyruğa kaydeder hem de aktif peer'lara iletir.
   * @param recipientId Diğer kullanıcının ID'si (sunucu sync için zorunlu)
   * @returns Kuyruktaki mesajın yerel ID'si
   */
  async sendMessage(conversationId: string, text: string, recipientId?: number | string | Array<number | string> | null): Promise<string> {
    if (!text.trim()) throw new Error('Mesaj boş olamaz');

    const msg: PeerMessage = {
      id: generateUUID(),
      senderId: this._userId,
      senderName: this._userName,
      conversationId,
      text: text.trim(),
      timestamp: Date.now(),
      ttl: 3,
      relayPath: [],
    };

    // Kendi mesajımızı seen olarak işaretle — relay ile geri gelirse işleme
    this._trackSeen(msg.id);

    // Önce yerel kaydet
    const _recipientForQueue = Array.isArray(recipientId) ? (recipientId.length ? recipientId[0] : null) : (recipientId ?? null);
    const queueId = await enqueueMessage({
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      recipientId: _recipientForQueue as number | string | null,
      text: msg.text,
      timestamp: msg.timestamp,
    });

    // Peer'lara ilet
    if (this._active) {
      try {
        // recipientId param may be a single id or an array of ids (targets)
        if (Array.isArray(recipientId)) {
          const targets = recipientId.map((t) => (t == null ? null : String(t))).filter(Boolean) as string[];
          if (targets.length === 0) {
            const deliveredAny = await this._wifi.sendMessage(msg);
            if (deliveredAny) await markPeerDelivered(queueId).catch(() => {});
          } else {
            const results = await Promise.all(targets.map((tid) => this._wifi.sendMessage(msg, String(tid)).catch(() => false)));
            if (results.some(Boolean)) await markPeerDelivered(queueId).catch(() => {});
            else console.log('[OfflineTransport] hedef peer(lar) bulunamadı, mesaj kuyrukta saklandı');
          }
        } else if (recipientId != null) {
          const delivered = await this._wifi.sendMessage(msg, String(recipientId));
          if (delivered) await markPeerDelivered(queueId).catch(() => {});
          else console.log('[OfflineTransport] hedef peer bulunamadı, mesaj kuyrukta saklandı');
        } else {
          const delivered = await this._wifi.sendMessage(msg);
          if (delivered) await markPeerDelivered(queueId).catch(() => {});
          else console.log('[OfflineTransport] aktif peer yok, mesaj sadece kuyrukta saklandı');
        }
      } catch (e) {
        console.warn('[OfflineTransport] peer iletimi sırasında hata:', e);
      }
    }

    return queueId;
  }

  // ─── Sunucu senkronizasyonu ─────────────────────────────────────────────────

  /**
   * İnternet gelince çağrılır. Bekleyen mesajları sunucuya POST eder.
   * useNetworkStatus hook'undaki onOnline callback'inden tetiklenir.
   *
   * @param userId - Mevcut kullanıcının ID'si. Belirtilmezse this._userId kullanılır.
   *                 Transport hiç başlatılmamışsa bu parametre zorunludur.
   */
  async syncPendingToServer(userId?: string): Promise<void> {
    try {
      const pending = await getPendingMessages();
      if (!pending.length) return;

      const effectiveId = userId ?? this._userId;

      // Kendi mesajları: sunucuya POST edilir.
      // Peer mesajları (başka kullanıcıya ait): gönderilmez ancak
      //   synced=1 olarak işaretlenir — karşı cihaz kendi online olduğunda kendi mesajını gönderir.
      //   Temizlenmezse her sync turunda tekrar döngüye girer.
      const ownMessages: typeof pending = [];
      const peerMessages: typeof pending = [];

      for (const msg of pending) {
        const isOwn = !msg.senderId                                  // senderId boş → userId bilinmiyorken kaydedildi
          || (!effectiveId ? false : String(msg.senderId) === String(effectiveId));
        if (isOwn) {
          ownMessages.push(msg);
        } else {
          peerMessages.push(msg);
        }
      }

      // Peer mesajlarını hemen temizle — bunlar bu cihazdan gönderilmez
      for (const msg of peerMessages) {
        await markMessageSynced(msg.id).catch(() => { /* ignore */ });
      }
      if (peerMessages.length > 0) {
        console.log('[OfflineTransport] peer mesajları temizlendi (gönderilmedi):', peerMessages.length);
      }

      if (!effectiveId && ownMessages.some(m => m.senderId)) {
        // userId hâlâ bilinmiyor ve senderId'li mesajlar var — peer mesajı olabilir, atla
        console.log('[OfflineTransport] userId bilinmiyor, senderId\'li mesajlar atlandı');
        return;
      }

      if (!ownMessages.length) {
        console.log('[OfflineTransport] senkronize edilecek kendi mesaj yok');
        return;
      }

      console.log('[OfflineTransport] sunucuya sync:', ownMessages.length, 'mesaj (toplam pending:', pending.length, ')');

      for (const msg of ownMessages) {
        try {
          const clientSentAt = new Date(msg.timestamp).toISOString();
          const res = await apiFetch(`${API_URL}/chat/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: msg.conversationId && msg.conversationId !== 'unknown'
                ? (Number(msg.conversationId) || msg.conversationId)
                : undefined,
              recipient_id: msg.recipientId != null ? Number(msg.recipientId) : undefined,
              text: msg.text,
              offline_id: msg.id,
              // created_at: sunucu bu değeri kabul ediyorsa offline sırasını korur.
              // Kabul etmiyorsa meta.client_sent_at üzerinden UI'da sıralama yapılır.
              created_at: clientSentAt,
              meta: { client_sent_at: clientSentAt },
            }),
          });
          if (res.ok) {
            await markMessageSynced(msg.id);
          } else {
            console.warn('[OfflineTransport] sync başarısız:', res.status, msg.id);
          }
        } catch (e) {
          console.warn('[OfflineTransport] mesaj sync hatası:', msg.id, (e as any)?.message);
        }
      }

      // Senkronizasyon tamamlandı, tüm synced=1 mesajları temizle
      await deleteSyncedMessages().catch(() => { /* ignore */ });
      console.log('[OfflineTransport] senkronize edilen mesajlar temizlendi');
    } catch (e) {
      console.warn('[OfflineTransport] syncPendingToServer hatası:', e);
    }
  }

  // ─── Yerel mesajlar ─────────────────────────────────────────────────────────

  /** Belirli bir konuşmaya ait yerel (offline) mesajları döner. */
  async getLocalMessages(conversationId: string): Promise<OfflineQueueMessage[]> {
    return getLocalMessages(conversationId);
  }

  /**
   * Uygulama ön plana döndüğünde veya dışarıdan tetiklendiğinde
   * subnet scan'ı hemen başlatır. Transport aktif değilse no-op.
   */
  triggerSubnetScan(): void {
    if (!this._active) return;
    this._wifi.triggerSubnetScan();
  }

  // ─── Dahili yardımcılar ──────────────────────────────────────────────────────

  /** Mesaj ID'sini seen setine ekle; set büyüyünce en eski girişi sil */
  private _trackSeen(id: string): void {
    this._seenIds.add(id);
    if (this._seenIds.size > this._MAX_SEEN) {
      const first = this._seenIds.values().next().value!;
      this._seenIds.delete(first);
    }
  }

  /**
   * Gelen peer mesajını işle ve gerekirse relay yap.
   * @param fromPeerId Mesajı doğrudan gönderen peer'ın userId'si (relay döngüsünü önlemek için)
   */
  private _handleIncomingPeerMessage(msg: PeerMessage, fromPeerId: string): void {
    // ── Dedup: daha önce gördüysek atla ───────────────────────────────────────
    if (this._seenIds.has(msg.id)) return;
    this._trackSeen(msg.id);

    // ── Mesh Relay ────────────────────────────────────────────────────────────
    const ttl = msg.ttl ?? 0;
    if (ttl > 0 && this._active) {
      const relayMsg: PeerMessage = {
        ...msg,
        ttl: ttl - 1,
        relayPath: [...(msg.relayPath ?? []), this._userId],
      };
      // Gönderen dışındaki tüm peer'lara ilet
      this._wifi.sendMessageExcept(relayMsg, fromPeerId).catch(() => {});
    }

    // ── Yerel işleme ─────────────────────────────────────────────────────────
    // Kendi gönderdiğimiz mesajlar relay ile geri gelebilir; işleme
    if (msg.senderId === this._userId) return;

    enqueueMessage({
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      text: msg.text,
      timestamp: msg.timestamp,
    })
      .then((qId) => markPeerDelivered(qId))
      .catch(() => { /* ignore */ });

    emitChatEvent({
      type: 'message',
      payload: {
        id: msg.id,
        conversation_id: msg.conversationId,
        text: msg.text,
        sender_id: msg.senderId,
        sender_name: msg.senderName,
        created_at: new Date(msg.timestamp).toISOString(),
        offline_peer: true,
      },
    });

    for (const h of this._msgHandlers.slice()) {
      try { h(msg); } catch { /* ignore */ }
    }
  }

  /**
   * WiFi peer listesini günceller, userId'ye göre deduplicate eder.
   */
  private _mergePeers(): void {
    const seen   = new Set<string>();
    const merged: PeerInfo[] = [];

    for (const p of this._wifi.getPeers()) {
      if (!seen.has(p.userId)) {
        seen.add(p.userId);
        merged.push(p);
      }
    }

    this._peers = merged;
    for (const h of this._peerHandlers.slice()) {
      try { h(merged); } catch { /* ignore */ }
    }
  }
}
/** Uygulama genelinde tek örnek */
export const offlineTransportManager = new OfflineTransportManager();
