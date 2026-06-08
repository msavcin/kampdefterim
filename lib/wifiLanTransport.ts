/**
 * wifiLanTransport.ts
 * Aynı yerel ağdaki (WiFi) cihazlar arası mesajlaşma.
 *
 * Yöntem:
 *  - react-native-tcp-socket  → TCP sunucu + istemci (mesaj taşıyıcı)
 *  - react-native-zeroconf    → mDNS ile cihaz keşfi (_kampdefterim._tcp)
 *
 * Protokol: newline ile ayrılmış JSON satırları (line-delimited JSON).
 *
 * NOT: Bu modül EAS Build ile derlenen uygulamalarda çalışır;
 *      Expo Go desteklemez.
 */

import { generateUUID } from './uuid';

// ─── Native modül import'ları (opsiyonel - hata durumunda graceful fail) ────
let TcpSocket: any = null;
let Zeroconf: any = null;
let NativeModules: any = null;
let Platform: any = null;
let Network: any = null;

try {
  TcpSocket = require('react-native-tcp-socket');
} catch (e) {
  console.warn('[WifiLanTransport] react-native-tcp-socket yüklenemedi:', (e as any)?.message);
}

try {
  const ZeroconfModule = require('react-native-zeroconf');
  Zeroconf = ZeroconfModule.default ?? ZeroconfModule;
} catch (e) {
  console.warn('[WifiLanTransport] react-native-zeroconf yüklenemedi:', (e as any)?.message);
}

try {
  const RN = require('react-native');
  NativeModules = RN.NativeModules;
  Platform = RN.Platform;
} catch (e) {
  console.warn('[WifiLanTransport] react-native yüklenemedi:', (e as any)?.message);
}

try {
  Network = require('expo-network');
} catch (e) {
  console.warn('[WifiLanTransport] expo-network yüklenemedi:', (e as any)?.message);
}

// ─── UTF-8 decode yardımcısı ──────────────────────────────────────────────────
/**
 * TCP chunk'ını UTF-8 string'e dönüştürür.
 * String.fromCharCode, çok baytlı karakterleri (ı, ş, ğ vb.) bozduğundan
 * TextDecoder veya manuel UTF-8 decode kullanılır.
 */
function decodeChunk(chunk: any): string {
  if (typeof chunk === 'string') return chunk;
  const bytes: Uint8Array =
    chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
  // TextDecoder React Native Hermes/JSC motorlarında mevcuttur.
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch { /* fallthrough */ }
  }
  // Yedek: manuel UTF-8 decode
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
    else if ((b & 0xe0) === 0xc0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3;
    } else {
      // 4-bayt kod noktası (emoji vb.) — surrogate pair
      const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const sc = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (sc >> 10), 0xdc00 + (sc & 0x3ff)); i += 4;
    }
  }
  return out;
}

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface PeerInfo {
  /** Uzak kullanıcının ID'si */
  userId: string;
  /** Uzak kullanıcının adı */
  userName: string;
  /** TCP host adresi */
  host: string;
  /** TCP port numarası */
  port: number;
}

export interface PeerMessage {
  /** Mesaj UUID'si */
  id: string;
  /** Gönderen kullanıcı ID'si */
  senderId: string;
  /** Gönderen kullanıcı adı */
  senderName: string;
  /** Konuşma ID'si */
  conversationId: string;
  /** Mesaj metni */
  text: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /**
   * Mesh relay: kalan hop sayısı.
   * 0 = relay yapma. Varsayılan: 3 (A→B→C→D).
   */
  ttl?: number;
  /**
   * Bu mesajın geçtiği userId listesi.
   * Döngü tespiti ve debug için kullanılır.
   */
  relayPath?: string[];
}

type MessageHandler = (msg: PeerMessage, peerId: string) => void;
type PeerChangeHandler = (peers: PeerInfo[]) => void;

// ─── Sabitler ────────────────────────────────────────────────────────────────

const KAMP_TCP_PORT = 5678;
/** Hotspot alt ağ taraması: her IP için TCP bağlantı zaman aşımı (ms) */
const SCAN_TIMEOUT_MS = 250;
/** Hotspot alt ağ taraması: periyodik tekrar aralığı (ms) */
const SUBNET_SCAN_MS = 8_000;
/** Hotspot alt ağ taraması: taranacak son octet aralığı (.1 – .254, tüm /24) */
const SUBNET_SCAN_RANGE = 254;
/** İlk öncelikli tarama aralığı — Android hotspot istemcileri genellikle bu aralıkta atanır */
const SCAN_PRIORITY_END = 30;
/** Bir tarama turunda aynı anda açılan maksimum TCP soket sayısı */
const MAX_CONCURRENT_SCANS = 30;
const SERVICE_TYPE = 'kampdefterim';
const SERVICE_PROTO = 'tcp';
const SERVICE_DOMAIN = 'local.';
const HANDSHAKE_CONV = '__handshake__';
const CONNECT_TIMEOUT_MS = 6000;
/** Uygulama seviyesi kalp atışı: ping gönderme aralığı (ms) */
const HEARTBEAT_INTERVAL_MS = 15_000;
/** Heartbeat mesajı için özel conversationId */
const HEARTBEAT_CONV = '__heartbeat__';
/** Bilinen peer cache geçerlilik süresi (ms) — 10 dakika */
const KNOWN_PEER_TTL_MS = 10 * 60 * 1000;
/** Peer bağlantısı kopunca ilk yeniden bağlanma gecikmesi (ms) */
const RECONNECT_DELAY_MS = 2_000;
/** Maksimum ardışık yeniden bağlanma denemesi */
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Peer bağlantısını temsil eden iç tip ────────────────────────────────────

interface ConnectedPeer extends PeerInfo {
  socket: any;
  buffer: string;
}

// ─── Ana sınıf ───────────────────────────────────────────────────────────────

export class WifiLanTransport {
  private _userId = '';
  private _userName = '';
  private _server: any = null;
  private _zeroconf: any = null;
  /** Hotspot alt ağ taraması zamanlayıcısı (mDNS'e ek fallback) */
  private _subnetScanTimer: ReturnType<typeof setInterval> | null = null;
  /** Her subnet base'in en son tarandığı zaman (ms). Tekrar taramayı önler. */
  private _lastSubnetScanAt = new Map<string, number>();
  /** Uygulama seviyesi kalp atışı zamanlayıcısı */
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _peers = new Map<string, ConnectedPeer>();
  /** Henüz tamamlanmamış TCP bağlantıları — çift bağlantıyı önler */
  private _connecting = new Set<string>();
  /**
   * Daha önce başarıyla bağlanan peer'ların cache'i.
   * Bağlantı kopunca tam subnet taraması yapmadan doğrudan bu IP'ye dönülür.
   */
  private _knownPeers = new Map<string, { host: string; port: number; userName: string; lastSeen: number }>();
  /** Yeniden bağlanma zamanlayıcıları (userId → timer) */
  private _reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Ardışık yeniden bağlanma deneme sayacı (userId → count) */
  private _reconnectCounts = new Map<string, number>();
  private _messageHandlers: MessageHandler[] = [];
  private _peerChangeHandlers: PeerChangeHandler[] = [];
  private _running = false;

  // ─── Kayıt / abonelik ──────────────────────────────────────────────────────

  onMessage(handler: MessageHandler): () => void {
    this._messageHandlers.push(handler);
    return () => {
      const i = this._messageHandlers.indexOf(handler);
      if (i >= 0) this._messageHandlers.splice(i, 1);
    };
  }

  onPeersChanged(handler: PeerChangeHandler): () => void {
    this._peerChangeHandlers.push(handler);
    return () => {
      const i = this._peerChangeHandlers.indexOf(handler);
      if (i >= 0) this._peerChangeHandlers.splice(i, 1);
    };
  }

  getPeers(): PeerInfo[] {
    return Array.from(this._peers.values()).map(({ socket: _s, buffer: _b, ...p }) => p);
  }

  // ─── Yaşam döngüsü ────────────────────────────────────────────────────────

  async start(userId: string, userName: string): Promise<void> {
    if (this._running) return;
    this._userId = userId;
    this._userName = userName;
    this._running = true;
    // Android'de mDNS multicast paketlerini alabilmek için MulticastLock edin
    await this._acquireMulticastLock();
    await this._startTcpServer();
    await this._startDiscovery();
    // Hotspot fallback: başlat + periyodik tekrar
    this._doSubnetScan();
    this._subnetScanTimer = setInterval(() => {
      // Periyodik tarama her zaman çalışmalı — önceki cache'i temizle
      this._lastSubnetScanAt.clear();
      this._doSubnetScan();
    }, SUBNET_SCAN_MS);
    // Uygulama seviyesi kalp atışı — Android idle TCP drop'larını önler
    this._startHeartbeat();
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    if (this._subnetScanTimer) {
      clearInterval(this._subnetScanTimer);
      this._subnetScanTimer = null;
    }
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    // Bekleyen yeniden bağlanma zamanlayıcılarını iptal et
    for (const timer of this._reconnectTimers.values()) clearTimeout(timer);
    this._reconnectTimers.clear();
    this._reconnectCounts.clear();
    this._lastSubnetScanAt.clear();

    for (const peer of this._peers.values()) {
      try { peer.socket?.destroy(); } catch { /* ignore */ }
    }
    this._peers.clear();
    this._connecting.clear();

    try {
      if (this._zeroconf) {
        this._zeroconf.stop();
        this._zeroconf = null;
      }
    } catch (e) {
      console.warn('[WifiLanTransport] zeroconf stop error', e);
    }

    try {
      this._server?.close();
      this._server = null;
    } catch (e) {
      console.warn('[WifiLanTransport] server close error', e);
    }

    // MulticastLock'u serbest bırak
    this._releaseMulticastLock();

    this._notifyPeerChange();
  }

  // ─── Dışarıdan tetiklenebilir subnet scan ────────────────────────────────

  /** Uygulama ön plana dönünce veya istekte çağrılır — anında bir tarama turu başlatır. */
  triggerSubnetScan(): void {
    if (!this._running) return;
    // Manuel tetiklemede cache'i temizle — taze tarama yapılsın
    this._lastSubnetScanAt.clear();
    this._doSubnetScan();
  }

  // ─── Mesaj gönderme ───────────────────────────────────────────────────────

  async sendMessage(msg: PeerMessage, targetUserId?: string): Promise<boolean> {
    const payload = JSON.stringify(msg) + '\n';
    let sent = false;

    for (const [uid, peer] of this._peers) {
      if (targetUserId && uid !== targetUserId) continue;
      try {
        if (peer.socket) {
          peer.socket.write(payload);
          sent = true;
        }
      } catch (e) {
        console.warn('[WifiLanTransport] send failed to', uid, (e as any)?.message);
      }
    }
    return sent;
  }

  /**
   * Mesh relay: mesajı belirtilen peer dışındaki tüm peer'lara ilet.
   * @param exceptUserId Bu userId'ye gönderme (döngü önleme)
   */
  async sendMessageExcept(msg: PeerMessage, exceptUserId: string): Promise<boolean> {
    const payload = JSON.stringify(msg) + '\n';
    let sent = false;

    for (const [uid, peer] of this._peers) {
      if (uid === exceptUserId) continue;
      try {
        if (peer.socket) {
          peer.socket.write(payload);
          sent = true;
        }
      } catch (e) {
        console.warn('[WifiLanTransport] relay send failed to', uid, (e as any)?.message);
      }
    }
    return sent;
  }

  // ─── TCP sunucu ───────────────────────────────────────────────────────────

  private async _startTcpServer(): Promise<void> {
    if (!TcpSocket) {
      console.warn('[WifiLanTransport] TcpSocket modülü yüklenmemiş, TCP sunucu başlatılamıyor');
      return;
    }
    try {
      this._server = TcpSocket.createServer((socket: any) => {
        let buffer = '';
        let resolvedUserId: string | null = null;
        const remoteAddr: string = socket.remoteAddress ?? '';

        // Gelen TCP bağlantısını logla (handshake öncesi)
        console.log('[WifiLanTransport] gelen TCP bağlantısı:', remoteAddr);

        // Bağlanan tarafa kim olduğumuzu hemen bildir
        const hs: PeerMessage = {
          id: generateUUID(),
          senderId: this._userId,
          senderName: this._userName,
          conversationId: HANDSHAKE_CONV,
          text: '',
          timestamp: Date.now(),
        };
        try { socket.write(JSON.stringify(hs) + '\n'); } catch { /* ignore */ }

        socket.on('data', (chunk: any) => {
          buffer += decodeChunk(chunk);
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as PeerMessage;
              if (msg.conversationId === HANDSHAKE_CONV) {
                // Karşı tarafın handshake'i geldi — _peers'e kaydet (çift yönlü kullanım için)
                const uid = msg.senderId;
                resolvedUserId = uid;
                if (!this._peers.has(uid)) {
                  this._peers.set(uid, {
                    userId: uid,
                    userName: msg.senderName,
                    host: remoteAddr,
                    port: KAMP_TCP_PORT,
                    socket,
                    buffer: '',
                  });
                  // Başarılı bağlantıyı cache'e yaz
                  this._cacheKnownPeer(uid, remoteAddr, KAMP_TCP_PORT, msg.senderName);
                  this._reconnectCounts.delete(uid);
                  this._notifyPeerChange();
                  console.log('[WifiLanTransport] gelen peer tanındı:', uid, remoteAddr);
                  // Bu peer'ın subnet'ini öğrendik — aynı ağdaki diğer cihazları tara
                  // remoteAddr peer'ın IP'sidir, kendi IP'miz değil → -1 (no self-skip)
                  this._doSubnetScanOnBase(remoteAddr, -1);
                }
              } else if (msg.conversationId === HEARTBEAT_CONV) {
                // Kalp atışı — sessizce yoksay
              } else if (resolvedUserId) {
                this._dispatchMessage(msg, resolvedUserId);
              }
            } catch { /* malformed line – ignore */ }
          }
        });
        socket.on('error', (err: any) => {
          console.warn('[WifiLanTransport] incoming socket error', err?.message);
          if (resolvedUserId) { this._peers.delete(resolvedUserId); this._scheduleReconnect(resolvedUserId); this._notifyPeerChange(); }
        });
        socket.on('close', () => {
          if (resolvedUserId) { this._peers.delete(resolvedUserId); this._scheduleReconnect(resolvedUserId); this._notifyPeerChange(); }
        });
      });

      this._server.on('error', (err: any) => {
        console.warn('[WifiLanTransport] server error', err?.message);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('listen timeout')), 5000);
        this._server.listen(
          { port: KAMP_TCP_PORT, host: '0.0.0.0', reuseAddress: true },
          () => {
            clearTimeout(timeout);
            console.log('[WifiLanTransport] TCP server dinleniyor, port:', KAMP_TCP_PORT);
            resolve();
          },
        );
        this._server.once('error', (e: any) => { clearTimeout(timeout); reject(e); });
      });
    } catch (e) {
      console.warn('[WifiLanTransport] TCP server başlatılamadı:', (e as any)?.message);
    }
  }

  // ─── UDP Broadcast Keşfi ─────────────────────────────────────────────────
  /**
   * mDNS'e ek fallback: UDP broadcast üzerinden cihazları keşfet.
   *
   * Hotspot + doğrudan WiFi senaryolarında mDNS multicast Android'de
   * MulticastLock olmadan alınamaz. Bu yöntem 255.255.255.255:KAMP_UDP_PORT
   * adresine periyodik UDP datagram gönderir; aynı ağdaki cihazlar
   * bu paketi alarak TCP bağlantısı başlatır.
   *
  // ─── Hotspot Subnet Taraması ─────────────────────────────────────────────
  /**
   * mDNS'e ek fallback: cihazın IP'sinden alt ağı hesaplar ve aynı
   * ağdaki .1–.30 IP'lerine kısa süreli TCP bağlantıları dener.
   *
   * Android hotspot genellikle 192.168.43.x alt ağını kullanır.
   * Herhangi bir IP'de TCP sunucusu varsa handshake alırız → peer bulundu.
   * Tüm bağlantılar paralel açılır; başarısız olanlar 1.5s sonra kapanır.
   *
   * Gereksinim: expo-network (getIpAddressAsync)
   */
  private async _doSubnetScan(): Promise<void> {
    if (!this._running) return;
    try {
      // ── Öncelik 1: bilinen peer'lara doğrudan yeniden bağlan ──────────
      const now = Date.now();
      for (const [uid, known] of this._knownPeers) {
        if (this._peers.has(uid) || this._connecting.has(uid)) continue;
        if ((now - known.lastSeen) > KNOWN_PEER_TTL_MS) continue;
        if (this._reconnectTimers.has(uid)) continue;
        console.log('[WifiLanTransport] bilinen peer hızlı tarama:', uid, known.host);
        this._connectToPeer(known.host, known.port, uid, known.userName);
      }

      // ── Öncelik 2: ARP tablosu (hotspot sağlayıcı tarafı) ────────────
      // Android, bağlanan her WiFi istemcisini /proc/net/arp tablosuna yazar.
      // Root gerekmez. Subnet taraması yapılmadan anlık bağlı cihaz listesi elde edilir.
      const arpIps = await this._getArpPeerIps();
      if (arpIps.length > 0) {
        console.log('[WifiLanTransport] ARP tablosundan peer IP\'leri:', arpIps);
        // ARP ile bulunan subnet base'lerini hemen işaretle.
        // Peer handshake'i gelince tetiklenecek _doSubnetScanOnBase çağrısı
        // bu sayede "yakın zamanda tarandı" kontrolüne takılarak atlanır.
        const stampNow = Date.now();
        for (const ip of arpIps) {
          const base = ip.split('.').slice(0, 3).join('.') + '.';
          this._lastSubnetScanAt.set(base, stampNow);
          this._connectToPeer(ip, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        }
        // ARP başarılıysa subnet taraması gereksiz; sadece gateway'i de dene (istemci tarafı)
        const gw = await this._getGatewayIp();
        if (gw && !arpIps.includes(gw)) {
          console.log('[WifiLanTransport] ARP + gateway bağlantısı:', gw);
          this._connectToPeer(gw, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        }
        return;
      }

      // ── Öncelik 3: DHCP gateway (hotspot istemci tarafı) ─────────────
      // Hotspot'a WiFi ile bağlanan cihaz: gateway = hotspot sağlayıcısının IP'si.
      // Doğrudan bağlanmak için 254 IP taramak gerekmez.
      const gatewayIp = await this._getGatewayIp();
      if (gatewayIp) {
        console.log('[WifiLanTransport] DHCP gateway\'e doğrudan bağlanılıyor:', gatewayIp);
        this._connectToPeer(gatewayIp, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        // Gateway bağlantısı başarılıysa peer'ın handshake'i üzerinden TCP sunucumuz
        // kendi scan'ini tetikler. Yine de aynı subnet'te başka peer olabilir;
        // gateway subnet'ini tam tara ama gateway IP'sini atlamadan (-1).
        this._doSubnetScanOnBase(gatewayIp, -1);
        return;
      }

      // ── Öncelik 4: Kendi IP'lerinden subnet taraması (fallback) ──────
      const ips = await this._getLocalIpsFromNative();

      // Hotspot fallback subnet'leri — kendi IP'miz bu subnet'lerde bilinmiyor olabilir
      // (örn. hotspot'a WiFi ile bağlanan istemci), bu yüzden -1 (no-skip) geçiyoruz.
      // Kendine bağlanma girişimleri handshake'teki loopback kontrolüyle engellenir.
      const HOTSPOT_SEEDS = ['192.168.43.1', '192.168.49.1', '10.0.0.1', '172.20.10.1', '192.168.1.1'];

      if (ips.length > 0) {
        console.log('[WifiLanTransport] native interface IP\'leri:', ips);
        const scannedBases = new Set<string>();
        for (const ip of ips) {
          const base = ip.split('.').slice(0, 3).join('.') + '.';
          scannedBases.add(base);
          this._doSubnetScanOnBase(ip, Number(ip.split('.')[3]));
        }
        // Ayrıca bilinen hotspot subnet'lerini de tara (cellular IP aktifken hotspot subnet'i atlanmasın)
        for (const seed of HOTSPOT_SEEDS) {
          const base = seed.split('.').slice(0, 3).join('.') + '.';
          if (!scannedBases.has(base)) {
            scannedBases.add(base);
            this._doSubnetScanOnBase(seed, -1); // kendi IP'miz bu subnet'te bilinmiyor
          }
        }
        return;
      }

      // Native modül başarısız → expo-network ile dene
      if (!Network) {
        console.warn('[WifiLanTransport] expo-network modülü yüklenememiş');
        console.log('[WifiLanTransport] IP tespit edilemedi, fallback subnet\'ler taranıyor');
        for (const fallback of HOTSPOT_SEEDS) {
          this._doSubnetScanOnBase(fallback, -1);
        }
        return;
      }
      const localIp: string = await Network.getIpAddressAsync().catch(() => '');
      if (localIp && localIp !== '0.0.0.0') {
        const scannedBases = new Set<string>();
        const localBase = localIp.split('.').slice(0, 3).join('.') + '.';
        scannedBases.add(localBase);
        this._doSubnetScanOnBase(localIp, Number(localIp.split('.')[3]));
        // expo-network cellular IP döndürmüş olabilir; hotspot subnet'lerini de tara
        for (const seed of HOTSPOT_SEEDS) {
          const base = seed.split('.').slice(0, 3).join('.') + '.';
          if (!scannedBases.has(base)) {
            scannedBases.add(base);
            this._doSubnetScanOnBase(seed, -1);
          }
        }
        return;
      }

      // Son çare: bilinen Android hotspot subnet'leri (kendi IP'miz bilinmiyor → -1)
      console.log('[WifiLanTransport] IP tespit edilemedi, fallback subnet\'ler taranıyor');
      for (const fallback of HOTSPOT_SEEDS) {
        this._doSubnetScanOnBase(fallback, -1);
      }
    } catch (e) {
      console.warn('[WifiLanTransport] alt ağ taraması hatası:', (e as any)?.message);
    }
  }

  /**
   * ARP tablosundaki aktif cihaz IP'lerini döndürür (/proc/net/arp).
   *
   * Hotspot SAĞLAYICI tarafında kullanılır: Android her bağlanan WiFi istemcisini
   * bu tabloya yazar. Subnet taraması gerekmeksizin anlık IP listesi elde edilir.
   */
  private async _getArpPeerIps(): Promise<string[]> {
    if (!NativeModules) {
      console.warn('[WifiLanTransport] React Native modülleri yüklenmemiş');
      return [];
    }
    try {
      if (!NativeModules?.NetworkIf?.getArpTable) return [];
      const ips: string[] = await NativeModules.NetworkIf.getArpTable();
      return ips.filter((ip) => ip && ip !== '0.0.0.0');
    } catch (e) {
      console.warn('[WifiLanTransport] ARP tablo sorgusu hatası:', (e as any)?.message);
      return [];
    }
  }

  /**
   * DHCP gateway IP'sini döndürür.
   *
   * Hotspot İSTEMCİSİ tarafında kullanılır: hotspot sağlayıcısının IP'si (örn. 192.168.43.1)
   * her zaman DHCP gateway'idir. Doğrudan bağlanmak için subnet taraması gerekmez.
   */
  private async _getGatewayIp(): Promise<string | null> {
    if (!NativeModules) {
      return null;
    }
    try {
      if (!NativeModules?.NetworkIf?.getGatewayIp) return null;
      const gw: string | null = await NativeModules.NetworkIf.getGatewayIp();
      return gw && gw !== '0.0.0.0' ? gw : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Android NetworkInterface.getNetworkInterfaces() native modülü ile tüm
   * aktif IPv4 adreslerini döndürür. ap0 arayüzü dahil tüm interface'leri kapsar.
   */
  private async _getLocalIpsFromNative(): Promise<string[]> {
    if (!NativeModules) {
      console.warn('[WifiLanTransport] React Native modülleri yüklenmemiş');
      return [];
    }
    try {
      if (!NativeModules?.NetworkIf?.getLocalIps) {
        console.warn('[WifiLanTransport] NetworkIf native modülü bulunamadı');
        return [];
      }
      const ips: string[] = await NativeModules.NetworkIf.getLocalIps();
      return ips.filter((ip) => ip && ip !== '0.0.0.0');
    } catch (e) {
      console.warn('[WifiLanTransport] native IP sorgusu hatası:', (e as any)?.message);
      return [];
    }
  }

  /**
   * Verilen bir IP adresinin /24 subnet'ini tarar.
   * Hem _doSubnetScan hem de gelen peer'dan subnet öğrenince çağrılır.
   *
   * @param anyIpInSubnet Taranacak subnet'i belirleyen herhangi bir IP (sadece ilk 3 oktet kullanılır).
   * @param myOwnLastOctet Kendi IP'nin son okteti — bu IP atlanır (kendine bağlanmayı önler).
   *                       -1 geçilirse hiçbir IP atlanmaz (kendi IP'si bilinmiyorsa: hotspot istemcisi, remote-addr tetikli scan).
   *                       Belirtilmezse anyIpInSubnet'in son okteti kullanılır (eski davranış — yalnızca kendi IP'si ile çağırırken doğru).
   */
  private _doSubnetScanOnBase(anyIpInSubnet: string, myOwnLastOctet?: number): void {
    const parts = anyIpInSubnet.split('.');
    if (parts.length !== 4) return;
    const base = parts.slice(0, 3).join('.') + '.';
    // skipLast < 0 → hiçbir IP atlanmaz (kendi IP'si bu subnet'te bilinmiyor)
    const skipLast: number = myOwnLastOctet !== undefined ? myOwnLastOctet : Number(parts[3]);

    // Bu subnet yakın zamanda zaten tarandıysa tekrar başlatma.
    // Periyodik SUBNET_SCAN_MS zamanlayıcısı veya ARP taraması yeterlidir;
    // peer handshake'i üzerine tetiklenen ikinci tarama gereksizdir.
    const now = Date.now();
    const lastScan = this._lastSubnetScanAt.get(base) ?? 0;
    if (now - lastScan < SUBNET_SCAN_MS) {
      console.log('[WifiLanTransport] alt ağ taraması atlandı (yakın zamanda yapıldı):', base + '0/24');
      return;
    }
    this._lastSubnetScanAt.set(base, now);

    console.log('[WifiLanTransport] alt ağ taraması:', base + '0/24', skipLast >= 0 ? `(skip .${skipLast})` : '(no skip)');

    // ── 1. Öncelikli aralık: hemen tara ──────────────────────────────────
    let batchDelay = 0;
    for (let i = 1; i <= SCAN_PRIORITY_END; i += MAX_CONCURRENT_SCANS) {
      const batchStart = i;
      setTimeout(() => {
        if (!this._running) return;
        for (let last = batchStart; last < batchStart + MAX_CONCURRENT_SCANS && last <= SCAN_PRIORITY_END; last++) {
          if (skipLast >= 0 && last === skipLast) continue;
          this._connectToPeer(base + last, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        }
      }, batchDelay);
      batchDelay += SCAN_TIMEOUT_MS + 50;
    }

    // ── 2. Geri kalan aralık: öncelikli tarama bitince başlat ─────────────
    let delayedBatchDelay = batchDelay;
    for (let i = SCAN_PRIORITY_END + 1; i <= SUBNET_SCAN_RANGE; i += MAX_CONCURRENT_SCANS) {
      const batchStart = i;
      setTimeout(() => {
        if (!this._running) return;
        for (let last = batchStart; last < batchStart + MAX_CONCURRENT_SCANS && last <= SUBNET_SCAN_RANGE; last++) {
          if (skipLast >= 0 && last === skipLast) continue;
          this._connectToPeer(base + last, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        }
      }, delayedBatchDelay);
      delayedBatchDelay += SCAN_TIMEOUT_MS + 50;
    }
  }

  // ─── MulticastLock (Android mDNS için gerekli) ─────────────────────────

  /**
   * Android WiFi multicast kilidini edinir.
   * Bu kilit olmadan zeroconf/mDNS paketleri donanım düzeyinde filtrelenir.
   */
  private async _acquireMulticastLock(): Promise<void> {
    if (!NativeModules || !Platform) {
      console.warn('[WifiLanTransport] React Native modülleri yüklenmemiş');
      return;
    }
    try {
      if (Platform.OS !== 'android') return;
      if (!NativeModules?.NetworkIf?.acquireMulticastLock) return;
      await NativeModules.NetworkIf.acquireMulticastLock();
      console.log('[WifiLanTransport] MulticastLock alındı — mDNS etkin');
    } catch (e) {
      console.warn('[WifiLanTransport] MulticastLock alınamadı:', (e as any)?.message);
    }
  }

  /** Daha önce edinilen MulticastLock'u serbest bırakır. */
  private _releaseMulticastLock(): void {
    if (!NativeModules || !Platform) return;
    try {
      if (Platform.OS !== 'android') return;
      if (!NativeModules?.NetworkIf?.releaseMulticastLock) return;
      NativeModules.NetworkIf.releaseMulticastLock().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }

  // ─── mDNS keşif ──────────────────────────────────────────────────────────

  private async _startDiscovery(): Promise<void> {
    if (!Zeroconf) {
      console.warn('[WifiLanTransport] Zeroconf modülü yüklenmemiş, mDNS keşif başlatılamıyor');
      return;
    }
    try {
      this._zeroconf = new Zeroconf();

      this._zeroconf.on('error', (err: any) =>
        console.warn('[WifiLanTransport] zeroconf hata:', err),
      );

      // Uzak cihaz çözümlendi → bağlan
      this._zeroconf.on('resolved', (service: any) => {
        const serviceName: string = service?.name ?? '';
        // Kendini keşfetmeyi atla
        if (serviceName === `KampDefterim-${this._userId}`) return;

        const host: string = service?.addresses?.[0] ?? service?.host ?? '';
        const port: number = Number(service?.port) || KAMP_TCP_PORT;
        const remoteUserId: string = service?.txt?.userId ?? serviceName;
        const remoteUserName: string = service?.txt?.userName ?? serviceName;

        if (!host) return;
        if (this._peers.has(remoteUserId)) return; // zaten bağlı

        console.log('[WifiLanTransport] peer keşfedildi:', remoteUserId, host, port);
        this._connectToPeer(host, port, remoteUserId, remoteUserName);
      });

      // Uzak cihaz ağdan ayrıldı
      this._zeroconf.on('removed', (service: any) => {
        const serviceName: string = service?.name ?? '';
        // Service name pattern: KampDefterim-{userId}
        const removedUserId = service?.txt?.userId ?? serviceName.replace('KampDefterim-', '');
        if (this._peers.has(removedUserId)) {
          try { this._peers.get(removedUserId)?.socket?.destroy(); } catch { /* ignore */ }
          this._peers.delete(removedUserId);
          this._notifyPeerChange();
          console.log('[WifiLanTransport] peer ayrıldı:', removedUserId);
        }
      });

      // Kendi servisimizi yayınla
      this._zeroconf.publishService(
        SERVICE_TYPE,
        SERVICE_PROTO,
        SERVICE_DOMAIN,
        `KampDefterim-${this._userId}`,
        KAMP_TCP_PORT,
        { userId: this._userId, userName: this._userName },
      );

      // Taramayı başlat
      this._zeroconf.scan(SERVICE_TYPE, SERVICE_PROTO, SERVICE_DOMAIN);
      console.log('[WifiLanTransport] mDNS tarama başladı');
    } catch (e) {
      console.warn('[WifiLanTransport] mDNS keşif başlatılamadı:', (e as any)?.message);
    }
  }

  // ─── Peer'a TCP bağlantısı ────────────────────────────────────────────────
  /**
   * @param userId  Bilinen peer userId'si. Boş ('') = tarama modu:
   *                userId handshake'ten alınır, bağlantı o ana kadar _peers'e eklenmez.
   * @param timeoutMs  Varsayılan CONNECT_TIMEOUT_MS yerine özel zaman aşımı (tarama için kısa).
   */
  private _connectToPeer(
    host: string,
    port: number,
    userId: string,
    userName: string,
    timeoutMs?: number,
  ): void {
    if (userId && this._peers.has(userId)) return;
    // Aynı hedefe eş zamanlı iki bağlantı denemesini önle
    const connectKey = userId || `_scan_${host}`;
    if (this._connecting.has(connectKey)) return;
    // Scan modunda: bu host'a zaten bağlıysa tekrar bağlanma
    if (!userId && [...this._peers.values()].some(p => p.host === host)) return;
    this._connecting.add(connectKey);

    // Tarama modunda gerçek userId handshake'ten gelecek
    let realRemoteId = userId;

    if (!TcpSocket) {
      console.warn('[WifiLanTransport] TcpSocket modülü yüklenmemiş, bağlantı kurulamıyor');
      this._connecting.delete(connectKey);
      return;
    }

    try {
      let buffer = '';

      const socket = TcpSocket.createConnection(
        { host, port, timeout: timeoutMs ?? CONNECT_TIMEOUT_MS },
        () => {
          this._connecting.delete(connectKey);
          if (!this._running) { socket.destroy(); return; }

          if (userId) {
            // userId biliniyorsa hemen _peers'e ekle (normal mod)
            this._peers.set(userId, { userId, userName, host, port, socket, buffer: '' });
            this._notifyPeerChange();
            console.log('[WifiLanTransport] peer bağlantısı kuruldu:', userId);
          } else {
            // Tarama modunda TCP bağlantısı kuruldu — handshake bekleniyor
            console.log('[WifiLanTransport] scan TCP bağlandı:', host);
          }

          // El sıkışma: karşı tarafa kim olduğumuzu bildir
          const handshake: PeerMessage = {
            id: generateUUID(),
            senderId: this._userId,
            senderName: this._userName,
            conversationId: HANDSHAKE_CONV,
            text: '',
            timestamp: Date.now(),
          };
          try { socket.write(JSON.stringify(handshake) + '\n'); } catch { /* ignore */ }
        },
      );

      // Timeout: bağlanamayan soketleri temizle — close eventi _connecting'i siler
      socket.on('timeout', () => { socket.destroy(); });

      socket.on('data', (chunk: any) => {
        buffer += decodeChunk(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        // Aktif peer'ın buffer'ını güncelle
        const tracked = this._peers.get(realRemoteId);
        if (tracked) tracked.buffer = buffer;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as PeerMessage;
            if (msg.conversationId === HANDSHAKE_CONV) {
              const remoteId = msg.senderId;
              if (remoteId === this._userId) {
                // Kendimize bağlanmışız (loopback) — kapat
                socket.destroy();
                return;
              }
              if (!userId) {
                // Tarama modu: handshake'ten gerçek userId geldi
                realRemoteId = remoteId;
                if (this._peers.has(remoteId)) {
                  // Zaten başka yoldan bağlıyız
                  socket.destroy();
                  return;
                }
                this._peers.set(remoteId, {
                  userId: remoteId,
                  userName: msg.senderName,
                  host, port, socket, buffer: '',
                });
                // Başarılı bağlantıyı cache'e yaz
                this._cacheKnownPeer(remoteId, host, port, msg.senderName);
                this._reconnectCounts.delete(remoteId);
                this._notifyPeerChange();
                console.log('[WifiLanTransport] alt ağ taramasında peer bulundu:', remoteId, host);
              } else {
                // Normal mod: userName güncelle + cache tazele
                const p = this._peers.get(userId);
                if (p) p.userName = msg.senderName;
                this._cacheKnownPeer(userId, host, port, msg.senderName);
                this._reconnectCounts.delete(userId);
              }
            } else if (msg.conversationId === HEARTBEAT_CONV) {
              // Kalp atışı — sessizce yoksay
            } else {
              const pid = realRemoteId || userId;
              if (pid) this._dispatchMessage(msg, pid);
            }
          } catch { /* ignore */ }
        }
      });

      socket.on('error', (err: any) => {
        this._connecting.delete(connectKey);
        const pid = realRemoteId || userId;
        if (pid && this._peers.has(pid)) {
          this._peers.delete(pid);
          this._scheduleReconnect(pid);
          this._notifyPeerChange();
        }
        // Tarama modunda bağlantı hatası normal (uygulama olmayan IP) — log gizle
        if (userId) console.warn('[WifiLanTransport] peer soket hatası:', userId, err?.message);
      });

      socket.on('close', () => {
        this._connecting.delete(connectKey);
        const pid = realRemoteId || userId;
        if (pid && this._peers.has(pid)) {
          this._peers.delete(pid);
          this._scheduleReconnect(pid);
          this._notifyPeerChange();
        }
        if (userId) console.log('[WifiLanTransport] peer bağlantısı kapandı:', userId);
      });
    } catch (e) {
      this._connecting.delete(connectKey);
      console.warn('[WifiLanTransport] peer bağlantısı kurulamadı:', host, (e as any)?.message);
    }
  }

  // ─── Yardımcılar ──────────────────────────────────────────────────────────

  private _dispatchMessage(msg: PeerMessage, peerId: string): void {
    for (const h of this._messageHandlers.slice()) {
      try { h(msg, peerId); } catch { /* ignore */ }
    }
  }

  private _notifyPeerChange(): void {
    const peers = this.getPeers();
    for (const h of this._peerChangeHandlers.slice()) {
      try { h(peers); } catch { /* ignore */ }
    }
  }

  // ─── Bilinen peer cache ───────────────────────────────────────────────────

  /** Başarıyla bağlanan peer bilgisini cache'e yaz. */
  private _cacheKnownPeer(userId: string, host: string, port: number, userName: string): void {
    this._knownPeers.set(userId, { host, port, userName, lastSeen: Date.now() });
  }

  /**
   * Peer bağlantısı kopunca üstel geri çekilme ile yeniden bağlan.
   * MAX_RECONNECT_ATTEMPTS'e ulaşılırsa normal subnet taramasına bırakılır.
   */
  private _scheduleReconnect(userId: string): void {
    if (!this._running || !userId) return;
    if (this._reconnectTimers.has(userId)) return;

    const attempts = this._reconnectCounts.get(userId) ?? 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      this._reconnectCounts.delete(userId);
      console.log('[WifiLanTransport] max yeniden bağlanma denemesi aşıldı, subnet taramasına bırakılıyor:', userId);
      return;
    }

    // Üstel geri çekilme: 2s, 4s, 8s, 16s, 32s
    const delay = RECONNECT_DELAY_MS * Math.pow(2, attempts);
    const timer = setTimeout(() => {
      this._reconnectTimers.delete(userId);
      if (!this._running) return;
      if (this._peers.has(userId)) { this._reconnectCounts.delete(userId); return; }

      const known = this._knownPeers.get(userId);
      if (!known || (Date.now() - known.lastSeen) > KNOWN_PEER_TTL_MS) {
        this._reconnectCounts.delete(userId);
        return;
      }

      this._reconnectCounts.set(userId, attempts + 1);
      console.log(`[WifiLanTransport] yeniden bağlanılıyor (${attempts + 1}. deneme): ${userId} → ${known.host}`);
      this._connectToPeer(known.host, known.port, userId, known.userName);
    }, delay);
    this._reconnectTimers.set(userId, timer);
  }

  // ─── Kalp atışı ───────────────────────────────────────────────────────────

  /**
   * Her HEARTBEAT_INTERVAL_MS'de bir tüm aktif peer'lara ping gönderir.
   * Android'in idle TCP bağlantılarını sessizce kapatmasını önler.
   * Yazma hatası veren soketler ölü kabul edilir; yeniden bağlanma planlanır.
   */
  private _startHeartbeat(): void {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(() => {
      if (!this._running) return;
      const ping: PeerMessage = {
        id: generateUUID(),
        senderId: this._userId,
        senderName: this._userName,
        conversationId: HEARTBEAT_CONV,
        text: '__ping__',
        timestamp: Date.now(),
      };
      const payload = JSON.stringify(ping) + '\n';
      const dead: string[] = [];
      for (const [uid, peer] of this._peers) {
        try {
          peer.socket.write(payload);
        } catch {
          dead.push(uid);
        }
      }
      for (const uid of dead) {
        console.log('[WifiLanTransport] heartbeat yazma hatası — peer ölü kabul edildi:', uid);
        this._peers.delete(uid);
        this._scheduleReconnect(uid);
        this._notifyPeerChange();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}
