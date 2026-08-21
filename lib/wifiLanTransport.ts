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
  /** WiFi MAC adresi (opsiyonel - ARP tablosundan veya handshake'ten) */
  macAddress?: string;
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
  /**
   * Gönderen cihazın WiFi MAC adresi (opsiyonel).
   * IP değişikliklerinde cihazı tanımak için kullanılır.
   */
  macAddress?: string;
}

type MessageHandler = (msg: PeerMessage, peerId: string) => void;
type PeerChangeHandler = (peers: PeerInfo[]) => void;

// ─── Sabitler ────────────────────────────────────────────────────────────────

const KAMP_TCP_PORT = 5678;
/** Hotspot alt ağ taraması: her IP için TCP bağlantı zaman aşımı (ms) */
const SCAN_TIMEOUT_MS = 350;
/** Hotspot alt ağ taraması: periyodik tekrar aralığı (ms) */
const SUBNET_SCAN_MS = 12_000;
/** Hotspot alt ağ taraması: taranacak son octet aralığı (.1 – .254, tüm /24) */
const SUBNET_SCAN_RANGE = 254;
/** İlk öncelikli tarama aralığı — Android hotspot istemcileri genellikle bu aralıkta atanır */
const SCAN_PRIORITY_END = 40;
/** Bir tarama turunda aynı anda açılan maksimum TCP soket sayısı */
const MAX_CONCURRENT_SCANS = 40;
/** ARP tablosu sürekli izleme aralığı (ms) — IP değişikliklerini yakalamak için */
const ARP_MONITOR_INTERVAL_MS = 5_000;
/** ARP cache geçerlilik süresi (ms) — eski cache'i temizlemek için */
const ARP_CACHE_TTL_MS = 30_000;
/** Hotspot istemcileri farklı üreticilerde .2, .100 veya .200+ aralıklarından IP alabiliyor. */
const SCAN_PRIORITY_RANGES: Array<[number, number]> = [
  [1, SCAN_PRIORITY_END],
  [100, 130],
  [200, 254],
];
const SERVICE_TYPE = 'kampdefterim';
const SERVICE_PROTO = 'tcp';
const SERVICE_DOMAIN = 'local.';
const HANDSHAKE_CONV = '__handshake__';
const CONNECT_TIMEOUT_MS = 6000;
/** Uygulama seviyesi kalp atışı: ping gönderme aralığı (ms) */
const HEARTBEAT_INTERVAL_MS = 8_000;
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
  /** Son görülme zamanı (ms) - IP değişikliği tespiti için */
  lastSeen?: number;
}

// ─── Ana sınıf ───────────────────────────────────────────────────────────────

export class WifiLanTransport {
  private _userId = '';
  private _userName = '';
  private _ownMacAddress = '';
  /** Önceki MAC adresi — MAC randomization tespiti için */
  private _previousMacAddress = '';
  private _server: any = null;
  private _zeroconf: any = null;
  /** Hotspot alt ağ taraması zamanlayıcısı (mDNS'e ek fallback) */
  private _subnetScanTimer: ReturnType<typeof setInterval> | null = null;
  /** ARP tablosu sürekli izleme zamanlayıcısı — IP değişikliklerini yakalamak için */
  private _arpMonitorTimer: ReturnType<typeof setInterval> | null = null;
  /** Her subnet base'in en son tarandığı zaman (ms). Tekrar taramayı önler. */
  private _lastSubnetScanAt = new Map<string, number>();
  /** Uygulama seviyesi kalp atışı zamanlayıcısı */
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _peers = new Map<string, ConnectedPeer>();
  /** Henüz tamamlanmamış TCP bağlantıları — çift bağlantıyı önler */
  private _connecting = new Set<string>();
  /**
   * PRİMARY CACHE: userId bazlı peer tracking.
   * MAC randomization'dan etkilenmez — her zaman userId ile eşleşir.
   */
  private _knownPeers = new Map<string, { host: string; port: number; userName: string; lastSeen: number; macAddress?: string }>();
  /**
   * SECONDARY CACHE: MAC adresi ile indeksleme (opsiyonel).
   * Sadece IP değişikliklerinde yardımcı anahtar olarak kullanılır.
   * MAC randomization durumunda güvenilmez — userId primary key'dir.
   */
  private _knownPeersByMac = new Map<string, { userId: string; userName: string; lastHost: string; lastPort: number; lastSeen: number }>();
  /** ARP tablosu cache — son tarama zamanı */
  private _lastArpScanAt = 0;
  /** ARP tablosu cache — IP → MAC eşleştirmesi */
  private _arpCache = new Map<string, string>();
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

    // Kendi MAC adresimizi al ve randomization kontrolü yap
    try {
      if (NativeModules?.NetworkIf?.getWifiMacAddress) {
        const newMac = await NativeModules.NetworkIf.getWifiMacAddress() || '';
        
        // MAC değişikliği tespiti (randomization veya ağ değişimi)
        if (this._previousMacAddress && this._previousMacAddress !== newMac) {
          console.warn('[WifiLanTransport] ⚠️ MAC adresi değişti:', this._previousMacAddress, '→', newMac);
          console.warn('[WifiLanTransport] Not: Rastgele MAC kullanımı peer tracking\'i etkileyebilir');
          // Eski MAC cache'ini temizle (artık geçersiz)
          for (const [mac, peer] of this._knownPeersByMac) {
            if (mac === this._previousMacAddress) {
              // Eski MAC'i sil ama userId cache'i koru (primary)
              this._knownPeersByMac.delete(mac);
              console.log('[WifiLanTransport] Eski MAC cache temizlendi:', mac);
            }
          }
        }
        
        this._ownMacAddress = newMac;
        this._previousMacAddress = newMac;
        
        if (this._ownMacAddress) {
          console.log('[WifiLanTransport] kendi MAC adresi:', this._ownMacAddress);
        } else {
          console.warn('[WifiLanTransport] ⚠️ MAC adresi alınamadı - randomization aktif olabilir');
        }
      }
    } catch (e) {
      console.warn('[WifiLanTransport] MAC adresi alınamadı:', (e as any)?.message);
    }

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
    // ARP tablosu sürekli izleme — IP değişikliklerini yakalamak için
    this._startArpMonitoring();
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
    if (this._arpMonitorTimer) {
      clearInterval(this._arpMonitorTimer);
      this._arpMonitorTimer = null;
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
    this._arpCache.clear();
    this._lastArpScanAt = 0;

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

  /**
   * Tüm subnet tarama ve peer keşif mekanizmalarını başlatan ana fonksiyon.
   * Öncelik sırasına göre:
   * 1. Bilinen peer'lar (userId ve MAC cache'lerinden)
   * 2. ARP tablosu
   * 3. DHCP gateway
   * 4. Subnet taraması
   */
  private async _doSubnetScan(): Promise<void> {
    try {
      // ── Öncelik 1: PRIMARY - userId bazlı cache (MAC randomization'dan bağımsız) ──────
      const now = Date.now();
      
      // userId bazlı cache'ten bilinen peer'lara doğrudan bağlan
      for (const [uid, known] of this._knownPeers) {
        if (this._peers.has(uid) || this._connecting.has(uid)) continue;
        if ((now - known.lastSeen) > KNOWN_PEER_TTL_MS) continue;
        if (this._reconnectTimers.has(uid)) continue;
        
        // ARP cache'te bu peer'ın MAC'i varsa yeni IP'yi kontrol et
        let targetIp = known.host;
        if (known.macAddress) {
          const cachedIp = this._arpCache.get(known.macAddress);
          if (cachedIp) targetIp = cachedIp;
        }
        
        console.log('[WifiLanTransport] bilinen peer hızlı tarama (userId):', uid, targetIp, known.macAddress ? `(MAC: ${known.macAddress})` : '(MAC yok)');
        this._connectToPeer(targetIp, known.port, uid, known.userName);
      }
      
      // ── Öncelik 2: SECONDARY - MAC cache (opsiyonel, userId cache'te yoksa) ──────
      // MAC randomization durumunda güvenilmez, ama IP değişikliklerinde yardımcı
      for (const [mac, knownPeer] of this._knownPeersByMac) {
        const userId = knownPeer.userId;
        if (this._peers.has(userId) || this._connecting.has(userId)) continue;
        if ((now - knownPeer.lastSeen) > KNOWN_PEER_TTL_MS) continue;
        if (this._reconnectTimers.has(userId)) continue;
        
        // userId cache'te zaten varsa atla (duplicate)
        if (this._knownPeers.has(userId)) continue;
        
        // ARP cache'te bu MAC'in yeni IP'si var mı?
        const cachedIp = this._arpCache.get(mac);
        const targetIp = cachedIp || knownPeer.lastHost;
        
        console.log('[WifiLanTransport] bilinen peer hızlı tarama (MAC fallback):', userId, targetIp, `(${mac})`);
        this._connectToPeer(targetIp, knownPeer.lastPort, userId, knownPeer.userName);
      }

      // ── Öncelik 3: ARP tablosu (hotspot sağlayıcı tarafı) ────────────
      // Android, bağlanan her WiFi istemcisini /proc/net/arp tablosuna yazar.
      // Root gerekmez. Subnet taraması yapılmadan anlık bağlı cihaz listesi elde edilir.
      const arpEntries = await this._getArpTableWithMac();
      if (arpEntries.length > 0) {
        console.log('[WifiLanTransport] ARP tablosundan peer keşfi:', arpEntries.length, 'cihaz');
        
        // ARP cache'i güncelle
        for (const { ip, mac } of arpEntries) {
          this._arpCache.set(mac, ip);
        }
        this._lastArpScanAt = Date.now();
        
        const stampNow = Date.now();
        const connectedMacs = new Set<string>();
        
        for (const { ip, mac } of arpEntries) {
          
          // Bu MAC'i tanıyoruz mu?
          const knownByMac = this._knownPeersByMac.get(mac);
          if (knownByMac) {
            // Bilinen MAC - IP değişmiş olabilir
            const userId = knownByMac.userId;
            if (!this._peers.has(userId) && !this._connecting.has(userId)) {
              console.log(`[WifiLanTransport] ARP: bilinen MAC bulundu: ${userId} → ${ip} (${mac})`);
              knownByMac.lastHost = ip;
              knownByMac.lastSeen = stampNow;
              this._connectToPeer(ip, KAMP_TCP_PORT, userId, knownByMac.userName, SCAN_TIMEOUT_MS);
              connectedMacs.add(mac);
            }
          } else {
            // Bilinmeyen cihaz - tarama yap
            this._connectToPeer(ip, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
          }
        }
        
        // Gateway'i de dene (istemci tarafında hotspot sağlayıcısını bulmak için)
        const gw = await this._getGatewayIp();
        if (gw && !arpEntries.some(e => e.ip === gw)) {
          console.log('[WifiLanTransport] ARP + gateway bağlantısı:', gw);
          this._connectToPeer(gw, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        }
        // ARP sadece "şu an görünen" IP'leri verir. İnternetsiz router / AP isolation
        // olmayan LAN'da diğer istemciler ARP'ta henüz yoksa taramayı kesmeyelim.
        const bases = new Set<string>();
        for (const { ip } of arpEntries) bases.add(ip.split('.').slice(0, 3).join('.') + '.');
        if (gw) bases.add(gw.split('.').slice(0, 3).join('.') + '.');
        for (const base of bases) {
          this._doSubnetScanOnBase(base + '1', -1);
        }
        return;
      }

      // ── Öncelik 4: DHCP gateway (hotspot istemci tarafı) ─────────────
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

      // ── Öncelik 5: Kendi IP'lerinden subnet taraması (fallback) ──────
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
        let registeredThisSocket = false;
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
          macAddress: this._ownMacAddress || undefined,
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
                const remoteMac = msg.macAddress || '';
                resolvedUserId = uid;
                if (!this._peers.has(uid)) {
                  this._peers.set(uid, {
                    userId: uid,
                    userName: msg.senderName,
                    host: remoteAddr,
                    port: KAMP_TCP_PORT,
                    macAddress: remoteMac,
                    socket,
                    buffer: '',
                    lastSeen: Date.now(),
                  });
                  registeredThisSocket = true;
                  // Başarılı bağlantıyı cache'e yaz (hem IP hem MAC bazlı)
                  this._cacheKnownPeer(uid, remoteAddr, KAMP_TCP_PORT, msg.senderName, remoteMac);
                  this._reconnectCounts.delete(uid);
                  this._notifyPeerChange();
                  console.log('[WifiLanTransport] gelen peer tanındı:', uid, remoteAddr, remoteMac ? `(MAC: ${remoteMac})` : '');
                  // Bu peer'ın subnet'ini öğrendik — aynı ağdaki diğer cihazları tara
                  // remoteAddr peer'ın IP'sidir, kendi IP'miz değil → -1 (no self-skip)
                  this._doSubnetScanOnBase(remoteAddr, -1);
                } else {
                  // Aynı peer için ikinci/duplicate bağlantı geldi. Mevcut aktif soketi
                  // koru; bu soketin kapanması mevcut peer'ı listeden silmemeli.
                  console.log('[WifiLanTransport] duplicate gelen peer bağlantısı kapatılıyor:', uid, remoteAddr);
                  try { socket.destroy(); } catch { /* ignore */ }
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
          if (resolvedUserId && registeredThisSocket && this._peers.get(resolvedUserId)?.socket === socket) {
            this._peers.delete(resolvedUserId);
            this._scheduleReconnect(resolvedUserId);
            this._notifyPeerChange();
          }
        });
        socket.on('close', () => {
          if (resolvedUserId && registeredThisSocket && this._peers.get(resolvedUserId)?.socket === socket) {
            this._peers.delete(resolvedUserId);
            this._scheduleReconnect(resolvedUserId);
            this._notifyPeerChange();
          }
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

  // ─── ARP tablosu ve yardımcı fonksiyonlar ────────────────────────────────

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

    const orderedLastOctets: number[] = [];
    const seen = new Set<number>();
    const addLast = (last: number) => {
      if (last < 1 || last > SUBNET_SCAN_RANGE) return;
      if (skipLast >= 0 && last === skipLast) return;
      if (seen.has(last)) return;
      seen.add(last);
      orderedLastOctets.push(last);
    };

    // ── 1. Öncelikli aralıklar: hotspot gateway ve yaygın DHCP aralıkları ───
    for (const [start, end] of SCAN_PRIORITY_RANGES) {
      for (let last = start; last <= end; last++) addLast(last);
    }
    // ── 2. Geri kalan tüm /24 aralığı ───────────────────────────────────────
    for (let last = 1; last <= SUBNET_SCAN_RANGE; last++) addLast(last);

    let batchDelay = 0;
    for (let i = 0; i < orderedLastOctets.length; i += MAX_CONCURRENT_SCANS) {
      const batch = orderedLastOctets.slice(i, i + MAX_CONCURRENT_SCANS);
      setTimeout(() => {
        if (!this._running) return;
        for (const last of batch) {
          this._connectToPeer(base + last, KAMP_TCP_PORT, '', '', SCAN_TIMEOUT_MS);
        }
      }, batchDelay);
      batchDelay += SCAN_TIMEOUT_MS + 50;
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
        const remoteUserId: string = String(service?.txt?.userId ?? (serviceName.replace('KampDefterim-', '') || serviceName));
        const remoteUserName: string = String(service?.txt?.userName ?? serviceName);

        if (!host) return;
        if (this._peers.has(remoteUserId)) return; // zaten bağlı

        console.log('[WifiLanTransport] peer keşfedildi:', remoteUserId, host, port);
        this._connectToPeer(host, port, remoteUserId, remoteUserName);
      });

      // Uzak cihaz ağdan ayrıldı.
      // Android hotspot üzerinde mDNS "removed" event'i güvenilir değil; cihazlar hâlâ TCP ile
      // bağlıyken geçici multicast kaybı nedeniyle gelebiliyor. Bu yüzden peer'ı burada silmeyip
      // gerçek socket close/heartbeat hatasına bırakıyoruz.
      this._zeroconf.on('removed', (service: any) => {
        const serviceName: string = service?.name ?? '';
        const removedUserId = service?.txt?.userId ?? serviceName.replace('KampDefterim-', '');
        console.log('[WifiLanTransport] mDNS removed yoksayıldı, TCP durumu korunuyor:', removedUserId);
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
    let registeredThisSocket = false;

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
            registeredThisSocket = true;
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
            macAddress: this._ownMacAddress || undefined,
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
              const remoteMac = msg.macAddress || '';
              if (remoteId === this._userId) {
                // Kendimize bağlanmışız (loopback) — kapat
                socket.destroy();
                return;
              }
              if (!userId) {
                // Tarama modu: handshake'ten gerçek userId geldi
                realRemoteId = remoteId;
                if (this._peers.has(remoteId)) {
                  // Zaten başka yoldan bağlıyız. Bu duplicate soketin kapanması
                  // mevcut peer'ı listeden silmemeli.
                  socket.destroy();
                  return;
                }
                this._peers.set(remoteId, {
                  userId: remoteId,
                  userName: msg.senderName,
                  host, port, 
                  macAddress: remoteMac,
                  socket, 
                  buffer: '',
                  lastSeen: Date.now(),
                });
                registeredThisSocket = true;
                // Başarılı bağlantıyı cache'e yaz (hem IP hem MAC bazlı)
                this._cacheKnownPeer(remoteId, host, port, msg.senderName, remoteMac);
                this._reconnectCounts.delete(remoteId);
                this._notifyPeerChange();
                console.log('[WifiLanTransport] alt ağ taramasında peer bulundu:', remoteId, host, remoteMac ? `(MAC: ${remoteMac})` : '');
              } else {
                // Normal mod: userId mDNS TXT'ten beklenir. Bazı cihazlarda TXT gelmez ve
                // serviceName (KampDefterim-123) anahtar olarak kullanılır. Handshake gerçek
                // senderId'yi verince peer kaydını gerçek userId'ye taşırız.
                const remoteId = msg.senderId;
                if (remoteId && remoteId !== userId) {
                  const existing = this._peers.get(userId);
                  if (existing?.socket === socket) {
                    this._peers.delete(userId);
                    if (this._peers.has(remoteId)) {
                      registeredThisSocket = false;
                      try { socket.destroy(); } catch { /* ignore */ }
                      return;
                    }
                    existing.userId = remoteId;
                    existing.userName = msg.senderName;
                    existing.macAddress = remoteMac;
                    existing.lastSeen = Date.now();
                    this._peers.set(remoteId, existing);
                    realRemoteId = remoteId;
                    this._notifyPeerChange();
                  }
                }
                const pidForCache = realRemoteId || remoteId || userId;
                const p = this._peers.get(pidForCache);
                if (p) {
                  p.userName = msg.senderName;
                  p.macAddress = remoteMac;
                  p.lastSeen = Date.now();
                }
                this._cacheKnownPeer(pidForCache, host, port, msg.senderName, remoteMac);
                this._reconnectCounts.delete(pidForCache);
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
        if (pid && registeredThisSocket && this._peers.get(pid)?.socket === socket) {
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
        if (pid && registeredThisSocket && this._peers.get(pid)?.socket === socket) {
          this._peers.delete(pid);
          this._scheduleReconnect(pid);
          this._notifyPeerChange();
        }
      });
    } catch (e) {
      this._connecting.delete(connectKey);
      console.warn('[WifiLanTransport] peer bağlantı hatası:', (e as any)?.message);
    }
  }

  // ─── Mesaj gönderme yardımcısı ────────────────────────────────────────────

  private _dispatchMessage(msg: PeerMessage, peerId: string): void {
    // Mesh relay: mesaj TTL'i varsa ve 0'dan büyükse relay yap
    if (msg.ttl != null && msg.ttl > 0 && msg.relayPath) {
      // Döngü kontrolü: bu mesajı daha önce relay yaptık mı?
      if (msg.relayPath.includes(this._userId)) {
        return; // Döngü tespit edildi, relay yapma
      }
      // Relay: mesajı gönderende başka herkese ilet
      const relayedMsg: PeerMessage = {
        ...msg,
        ttl: msg.ttl - 1,
        relayPath: [...(msg.relayPath || []), this._userId],
      };
      this.sendMessageExcept(relayedMsg, peerId).catch(() => {});
    }

    // Mesaj handler'larını tetikle
    for (const handler of this._messageHandlers.slice()) {
      try { handler(msg, peerId); } catch { /* ignore */ }
    }
  }

  private _notifyPeerChange(): void {
    const peers = this.getPeers();
    for (const h of this._peerChangeHandlers.slice()) {
      try { h(peers); } catch { /* ignore */ }
    }
  }

  // ─── Bilinen peer cache ───────────────────────────────────────────────────

  /**
   * Başarıyla bağlanan peer bilgisini cache'e yaz.
   * PRIMARY: userId bazlı cache (MAC randomization'dan bağımsız)
   * SECONDARY: MAC bazlı cache (opsiyonel, IP değişikliği desteği için)
   */
  private _cacheKnownPeer(userId: string, host: string, port: number, userName: string, macAddress?: string): void {
    const now = Date.now();
    
    // PRIMARY CACHE: userId bazlı (her zaman güvenilir)
    this._knownPeers.set(userId, { host, port, userName, lastSeen: now, macAddress });
    
    // SECONDARY CACHE: MAC bazlı (opsiyonel - MAC randomization durumunda güvenilmez)
    if (macAddress && macAddress !== '02:00:00:00:00:00') {
      // Eğer eski bir MAC varsa ve değiştiyse, eski MAC'i temizle
      const existingPeer = this._knownPeers.get(userId);
      if (existingPeer?.macAddress && existingPeer.macAddress !== macAddress) {
        console.log('[WifiLanTransport] ⚠️ Peer MAC değişti:', userId, existingPeer.macAddress, '→', macAddress);
        this._knownPeersByMac.delete(existingPeer.macAddress);
      }
      
      this._knownPeersByMac.set(macAddress, { 
        userId, 
        userName, 
        lastHost: host, 
        lastPort: port, 
        lastSeen: now 
      });
      console.log('[WifiLanTransport] peer cache güncellendi:', userId, '(MAC:', macAddress, ') IP:', host);
    } else {
      console.log('[WifiLanTransport] peer cache güncellendi:', userId, '(MAC yok) IP:', host);
    }
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

  // ─── ARP tablosu sürekli izleme ──────────────────────────────────────────

  /**
   * ARP tablosunu periyodik olarak izler ve IP değişikliklerini tespit eder.
   * Bilinen peer'ların MAC adresleri değişmeden IP'leri değişirse (DHCP renewal),
   * otomatik olarak yeni IP'ye bağlanır.
   */
  private _startArpMonitoring(): void {
    if (this._arpMonitorTimer) return;
    
    this._arpMonitorTimer = setInterval(async () => {
      if (!this._running) return;
      
      try {
        const now = Date.now();
        const arpEntries = await this._getArpTableWithMac();
        
        if (arpEntries.length === 0) return;
        
        // ARP cache'i güncelle
        for (const { ip, mac } of arpEntries) {
          this._arpCache.set(mac, ip);
        }
        this._lastArpScanAt = now;
        
        // PRIMARY: userId bazlı peer'ların IP değişikliklerini kontrol et
        for (const [userId, knownPeer] of this._knownPeers) {
          // Bu peer'ın MAC'i varsa ARP cache'te yeni IP'yi kontrol et
          if (knownPeer.macAddress) {
            const newIp = this._arpCache.get(knownPeer.macAddress);
            
            // Bu MAC'in yeni IP'si var ve eskisinden farklı
            if (newIp && newIp !== knownPeer.host) {
              // Bu peer şu anda aktif değilse ve yeniden bağlanma zamanlayıcısı yoksa
              if (!this._peers.has(userId) && !this._reconnectTimers.has(userId)) {
                console.log(`[WifiLanTransport] IP değişikliği tespit edildi: ${userId} (${knownPeer.host} → ${newIp}, MAC: ${knownPeer.macAddress})`);
                
                // PRIMARY cache'i güncelle
                knownPeer.host = newIp;
                knownPeer.lastSeen = now;
                
                // SECONDARY cache'i de güncelle
                const macCached = this._knownPeersByMac.get(knownPeer.macAddress);
                if (macCached) {
                  macCached.lastHost = newIp;
                  macCached.lastSeen = now;
                }
                
                // Yeni IP'ye bağlanmayı dene
                this._connectToPeer(newIp, knownPeer.port, userId, knownPeer.userName, SCAN_TIMEOUT_MS);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[WifiLanTransport] ARP monitoring hatası:', (e as any)?.message);
      }
    }, ARP_MONITOR_INTERVAL_MS);
  }

  /**
   * Native modülden ARP tablosunu MAC adresleriyle al.
   */
  private async _getArpTableWithMac(): Promise<Array<{ ip: string; mac: string }>> {
    if (!NativeModules?.NetworkIf?.getArpTableWithMac) {
      return [];
    }
    try {
      const result = await NativeModules.NetworkIf.getArpTableWithMac();
      return Array.isArray(result) ? result : [];
    } catch (e) {
      return [];
    }
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
