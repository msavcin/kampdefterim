/**
 * bluetoothTransport.ts
 * Classic Bluetooth (RFCOMM/SPP) üzerinden P2P mesajlaşma.
 *
 * Kullanılan kütüphane: react-native-bluetooth-classic
 *
 * ─── Neden Classic BT? ───────────────────────────────────────────────────────
 *
 *  react-native-ble-plx sadece Central modunu destekler; GATT server
 *  kurulamaz. Bu nedenle BLE üzerinden mesaj alınamıyor.
 *  Classic Bluetooth zaten eşleştirilmiş (paired) cihazlar arasında
 *  RFCOMM soket kanalı açar ve güvenilir şekilde mesajlaşmayı sağlar.
 *
 * ─── Akış ────────────────────────────────────────────────────────────────────
 *
 *  1. Her cihaz accept() döngüsü başlatır → gelen bağlantıları kabul eder.
 *  2. Her cihaz eşleştirilmiş cihazlara connect() ile bağlanmaya çalışır.
 *  3. Bağlantı kurulunca iki yönlü handshake gönderilir (userId + userName).
 *  4. Handshake doğrulandıktan sonra peer listesine eklenir.
 *  5. Mesajlar JSON + '\n' delimiter ile seri hale getirilir.
 *  6. Periyodik olarak bağlı olmayan paired cihazlara yeniden bağlanılır.
 *
 * ─── Platform ────────────────────────────────────────────────────────────────
 *
 *  Android: tam destek (BLUETOOTH_CONNECT, BLUETOOTH_SCAN izinleri gerekli).
 *  iOS    : Classic BT 3. parti uygulamalar için MFi sertifikası gerektirir;
 *           bu platform için BLE veya WiFi transport kullanılması önerilir.
 */

import type { PeerInfo, PeerMessage } from './wifiLanTransport';

export type { PeerInfo, PeerMessage };

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DELIMITER           = '\n';
const HANDSHAKE_TYPE      = 'KD_HS';
/** Eşleştirilmiş cihazlara yeniden bağlanma aralığı (ms) */
const RECONNECT_MS        = 30_000;
/** Tek bir connect() çağrısı için maksimum bekleme süresi (ms) */
const CONNECT_TIMEOUT_MS  = 8_000;
/** accept() döngüsünde hata sonrası bekleme süresi (ms) */
const ACCEPT_RETRY_MS     = 3_000;

type MessageHandler    = (msg: PeerMessage, peerId: string) => void;
type PeerChangeHandler = (peers: PeerInfo[]) => void;

// ─── Dahili tip ───────────────────────────────────────────────────────────────

interface Connection {
  device:   any;
  info:     PeerInfo;
  dataSub:  any;
}

// ─── BluetoothTransport ───────────────────────────────────────────────────────

export class BluetoothTransport {
  private _bt: any    = null;
  private _userId     = '';
  private _userName   = '';
  private _running    = false;

  /** deviceAddress → Connection */
  private _connections = new Map<string, Connection>();

  private _reconnectTimer: ReturnType<typeof setInterval> | null = null;

  private _msgHandlers:  MessageHandler[]    = [];
  private _peerHandlers: PeerChangeHandler[] = [];

  // ─── Abonelikler ────────────────────────────────────────────────────────────

  onMessage(handler: MessageHandler): () => void {
    this._msgHandlers.push(handler);
    return () => {
      const i = this._msgHandlers.indexOf(handler);
      if (i >= 0) this._msgHandlers.splice(i, 1);
    };
  }

  onPeersChanged(handler: PeerChangeHandler): () => void {
    this._peerHandlers.push(handler);
    return () => {
      const i = this._peerHandlers.indexOf(handler);
      if (i >= 0) this._peerHandlers.splice(i, 1);
    };
  }

  getPeers(): PeerInfo[] {
    return Array.from(this._connections.values()).map(c => c.info);
  }

  // ─── Yaşam döngüsü ──────────────────────────────────────────────────────────

  async start(userId: string, userName: string): Promise<void> {
    if (this._running) return;
    this._userId   = userId;
    this._userName = userName;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const RNBluetoothClassic = require('react-native-bluetooth-classic').default;
      this._bt = RNBluetoothClassic;

      const enabled: boolean = await this._bt.isBluetoothEnabled();
      if (!enabled) {
        console.warn(
          '[BluetoothTransport] Classic BT kapalı veya bu cihazda desteklenmiyor. ' +
          'iOS için BLE/WiFi transport kullanın. Android için EAS Build gerekebilir.',
        );
        this._bt = null;
        return;
      }

      this._running = true;

      // Arka planda gelen bağlantıları dinle
      this._runAcceptLoop();

      // Zaten eşleştirilmiş cihazlara bağlan
      await this._connectToBonded();

      // Periyodik yeniden bağlanma (yeni eşleşmeler veya kopan bağlantılar için)
      this._reconnectTimer = setInterval(() => this._connectToBonded(), RECONNECT_MS);

      console.log('[BluetoothTransport] Classic BT başlatıldı, userId:', userId);
    } catch (e) {
      const msg = (e as any)?.message ?? String(e);
      if (msg.includes('Cannot find module') || msg.includes('undefined is not an object')) {
        console.warn(
          '[BluetoothTransport] react-native-bluetooth-classic native modülü yüklü değil. ' +
          'Native modülü etkinleştirmek için EAS Build çalıştırın: ' +
          'eas build --platform android --profile preview',
        );
      } else {
        console.warn('[BluetoothTransport] başlatma başarısız:', msg);
      }
      this._running = false;
      this._bt = null;
    }
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // Bekleyen accept() çağrısını iptal et
    try { await this._bt?.cancelAccept?.(); } catch { /* ignore */ }

    // Tüm bağlantıları kapat
    for (const [addr, conn] of this._connections) {
      try { conn.dataSub?.remove?.(); }   catch { /* ignore */ }
      try { await conn.device.disconnect(); } catch { /* ignore */ }
    }
    this._connections.clear();
    this._bt = null;

    this._notifyPeerChange();
    console.log('[BluetoothTransport] Classic BT durduruldu');
  }

  // ─── Mesaj gönderme ─────────────────────────────────────────────────────────

  async sendMessage(msg: PeerMessage, targetUserId?: string): Promise<boolean> {
    if (!this._connections.size) return false;

    const line = JSON.stringify(msg) + DELIMITER;
    let sent   = false;

    for (const [addr, conn] of this._connections) {
      if (targetUserId && conn.info.userId !== targetUserId) continue;
      // Yalnızca handshake tamamlanmış (gerçek userId atanmış) peer'lara gönder
      if (conn.info.userId === addr) continue; // henüz handshake gelmedi

      try {
        const isConn: boolean = await conn.device.isConnected();
        if (!isConn) { this._removeConn(addr); continue; }
        await conn.device.write(line);
        sent = true;
      } catch (e) {
        console.warn('[BluetoothTransport] gönderim hatası:', addr, (e as any)?.message);
        this._removeConn(addr);
      }
    }
    return sent;
  }

  /**
   * Mesh relay: mesajı belirtilen peer dışındaki tüm peer'lara ilet.
   * @param exceptUserId Bu userId'ye gönderme (döngü önleme)
   */
  async sendMessageExcept(msg: PeerMessage, exceptUserId: string): Promise<boolean> {
    if (!this._connections.size) return false;

    const line = JSON.stringify(msg) + DELIMITER;
    let sent   = false;

    for (const [addr, conn] of this._connections) {
      if (conn.info.userId === exceptUserId) continue;
      if (conn.info.userId === addr) continue; // henüz handshake gelmedi

      try {
        const isConn: boolean = await conn.device.isConnected();
        if (!isConn) { this._removeConn(addr); continue; }
        await conn.device.write(line);
        sent = true;
      } catch (e) {
        console.warn('[BluetoothTransport] relay gönderim hatası:', addr, (e as any)?.message);
        this._removeConn(addr);
      }
    }
    return sent;
  }

  // ─── Accept döngüsü (sunucu tarafı) ─────────────────────────────────────────

  private async _runAcceptLoop(): Promise<void> {
    while (this._running) {
      try {
        const device = await this._bt.accept({ delimiter: DELIMITER });
        if (!this._running) break;
        if (device) {
          console.log('[BluetoothTransport] gelen bağlantı:', device.address);
          this._setupConn(device);
        }
      } catch (e) {
        if (!this._running) break;
        // accept() hata verdi veya iptal edildi — kısa bekleme sonrası tekrar dene
        await new Promise<void>(r => setTimeout(r, ACCEPT_RETRY_MS));
      }
    }
  }

  // ─── Eşleştirilmiş cihazlara bağlan (istemci tarafı) ───────────────────────

  private async _connectToBonded(): Promise<void> {
    if (!this._running || !this._bt) return;
    try {
      const bonded: any[] = await this._bt.getBondedDevices();
      if (bonded.length === 0) {
        console.log(
          '[BluetoothTransport] Eşleştirilmiş cihaz bulunamadı. ' +
          'Diğer cihazla önce Android Bluetooth Ayarları üzerinden eşleşin (pair).',
        );
        return;
      }
      console.log('[BluetoothTransport] Eşleştirilmiş cihazlar:', bonded.map(d => d.address + ' ' + d.name).join(', '));
      for (const device of bonded) {
        if (!this._running) return;
        const addr: string = device.address;
        if (this._connections.has(addr)) continue; // zaten bağlı

        try {
          const connected = await device.connect({
            delimiter:      DELIMITER,
            connectTimeout: CONNECT_TIMEOUT_MS,
          });
          if (!this._running) { connected.disconnect().catch(() => {}); return; }
          console.log('[BluetoothTransport] bağlandı:', addr, device.name);
          this._setupConn(connected);
        } catch (connErr) {
          console.log(
            '[BluetoothTransport] bağlanamadı:', addr, device.name,
            '—', (connErr as any)?.message ?? 'karşı cihazda uygulama açık değil',
          );
        }
      }
    } catch (e) {
      console.warn('[BluetoothTransport] bonded device listesi alınamadı:', (e as any)?.message);
    }
  }

  // ─── Bağlantı kurulumu (sunucu + istemci ortak) ──────────────────────────────

  private _setupConn(device: any): void {
    const addr: string = device.address;
    if (this._connections.has(addr)) {
      // Yinelenen bağlantıyı reddet
      device.disconnect().catch(() => {});
      return;
    }

    // Gelen satırları dinle
    const dataSub = device.onDataReceived(({ data }: { data: string }) => {
      const line = (data ?? '').trim();
      if (!line) return;
      try {
        const parsed = JSON.parse(line);

        if (parsed?.type === HANDSHAKE_TYPE) {
          // Handshake → peer bilgisini güncelle
          const info: PeerInfo = {
            userId:   parsed.userId   ?? addr,
            userName: parsed.userName ?? `Cihaz:${addr.slice(-5)}`,
            host:     addr,
            port:     0,
          };
          const existing = this._connections.get(addr);
          if (existing) existing.info = info;
          this._notifyPeerChange();
          console.log('[BluetoothTransport] peer tanındı:', info.userId, info.userName);
          return;
        }

        // Normal mesaj — handshake tamamlanmış peer'dan gelmeli
        const conn = this._connections.get(addr);
        if (!conn || conn.info.userId === addr) return; // handshake henüz gelmedi
        for (const h of this._msgHandlers.slice()) {
          try { h(parsed as PeerMessage, conn.info.userId); } catch { /* ignore */ }
        }
      } catch {
        // Bozuk JSON satırı — yoksay
      }
    });

    // Bağlantıyı geçici kaydettik (handshake gelince info güncellenecek)
    this._connections.set(addr, {
      device,
      info: { userId: addr, userName: `Cihaz:${addr.slice(-5)}`, host: addr, port: 0 },
      dataSub,
    });

    // Bağlantı kesilme olayı (mevcut ise)
    const disconnectSub: any = device.onDisconnected?.(() => {
      console.log('[BluetoothTransport] bağlantı kesildi:', addr);
      try { disconnectSub?.remove?.(); } catch { /* ignore */ }
      this._removeConn(addr);
    });

    // Handshake gönder
    device
      .write(
        JSON.stringify({ type: HANDSHAKE_TYPE, userId: this._userId, userName: this._userName }) +
          DELIMITER,
      )
      .catch(() => {});
  }

  // ─── Yardımcılar ─────────────────────────────────────────────────────────────

  private _removeConn(addr: string): void {
    const conn = this._connections.get(addr);
    if (!conn) return;
    try { conn.dataSub?.remove?.(); } catch { /* ignore */ }
    this._connections.delete(addr);
    this._notifyPeerChange();
  }

  private _notifyPeerChange(): void {
    const peers = this.getPeers();
    for (const h of this._peerHandlers.slice()) {
      try { h(peers); } catch { /* ignore */ }
    }
  }
}
