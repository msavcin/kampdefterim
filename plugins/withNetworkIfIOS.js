const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Swift implementasyonu: tüm IPv4 arayüzlerini döndürür (loopback hariç)
const SWIFT_SOURCE = `\
import Foundation

@objc(NetworkIf)
class NetworkIf: NSObject {

  @objc(getLocalIps:rejecter:)
  func getLocalIps(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    var result: [String] = []
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0 else {
      resolve(result)
      return
    }
    defer { freeifaddrs(ifaddr) }

    var ptr = ifaddr
    while let iface = ptr {
      if let addr = iface.pointee.ifa_addr,
         addr.pointee.sa_family == UInt8(AF_INET),
         (Int32(iface.pointee.ifa_flags) & IFF_LOOPBACK) == 0,
         (Int32(iface.pointee.ifa_flags) & IFF_UP) == IFF_UP {
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        getnameinfo(
          addr, socklen_t(addr.pointee.sa_len),
          &hostname, socklen_t(hostname.count),
          nil, 0, NI_NUMERICHOST
        )
        let ip = String(cString: hostname)
        if !ip.isEmpty { result.append(ip) }
      }
      ptr = iface.pointee.ifa_next
    }
    resolve(result)
  }

  /// Android /proc/net/arp karşılığı: sysctl NET_RT_FLAGS + RTF_LLINFO (0x400)
  /// ARP önbelleğindeki aktif IPv4 peer IP'lerini döndürür.
  /// Personal Hotspot sağlayan iPhone'da bağlanan cihazların IP'leri burada görünür.
  @objc(getArpTable:rejecter:)
  func getArpTable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    var result: [String] = []
    // CTL_NET=4, AF_ROUTE=17, 0, AF_INET=2, NET_RT_FLAGS=2, RTF_LLINFO=0x400
    var mib: [Int32] = [CTL_NET, Int32(AF_ROUTE), 0, Int32(AF_INET), 2, 0x400]
    var bufLen = 0
    guard sysctl(&mib, 6, nil, &bufLen, nil, 0) == 0, bufLen > 0 else {
      resolve(result); return
    }
    var buf = [UInt8](repeating: 0, count: bufLen)
    guard sysctl(&mib, 6, &buf, &bufLen, nil, 0) == 0 else {
      resolve(result); return
    }
    buf.withUnsafeBytes { raw in
      var offset = 0
      while offset < bufLen {
        guard offset + MemoryLayout<rt_msghdr>.size <= bufLen else { break }
        let rtm = raw.load(fromByteOffset: offset, as: rt_msghdr.self)
        let msgLen = Int(rtm.rtm_msglen)
        guard msgLen > MemoryLayout<rt_msghdr>.size else { break }
        // RTA_DST (0x1): header sonrasındaki ilk adres = hedef IP
        if (Int(rtm.rtm_addrs) & 0x1) != 0 {
          let sinOffset = offset + MemoryLayout<rt_msghdr>.size
          if sinOffset + MemoryLayout<sockaddr_in>.size <= bufLen {
            let sin = raw.load(fromByteOffset: sinOffset, as: sockaddr_in.self)
            if sin.sin_family == UInt8(AF_INET) {
              var addr = sin.sin_addr
              var hostname = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
              if inet_ntop(AF_INET, &addr, &hostname, socklen_t(INET_ADDRSTRLEN)) != nil {
                let ip = String(cString: hostname)
                if !ip.isEmpty && ip != "0.0.0.0" { result.append(ip) }
              }
            }
          }
        }
        offset += msgLen
      }
    }
    resolve(result)
  }

  /// Android WifiManager.getDhcpInfo().gateway karşılığı.
  /// Routing tablosunda 0.0.0.0 (default route) hedefli kaydın gateway IP'sini döndürür.
  /// Hotspot istemcisi iPhone'da bu değer hotspot sağlayıcısının IP'sidir.
  @objc(getGatewayIp:rejecter:)
  func getGatewayIp(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // NET_RT_DUMP=1: tüm routing tablosunu döküm et
    var mib: [Int32] = [CTL_NET, Int32(AF_ROUTE), 0, Int32(AF_INET), 1, 0]
    var bufLen = 0
    guard sysctl(&mib, 6, nil, &bufLen, nil, 0) == 0, bufLen > 0 else {
      resolve(nil); return
    }
    var buf = [UInt8](repeating: 0, count: bufLen)
    guard sysctl(&mib, 6, &buf, &bufLen, nil, 0) == 0 else {
      resolve(nil); return
    }
    var gatewayIp: String? = nil
    buf.withUnsafeBytes { raw in
      var offset = 0
      while offset < bufLen, gatewayIp == nil {
        guard offset + MemoryLayout<rt_msghdr>.size <= bufLen else { break }
        let rtm = raw.load(fromByteOffset: offset, as: rt_msghdr.self)
        let msgLen = Int(rtm.rtm_msglen)
        guard msgLen > MemoryLayout<rt_msghdr>.size else { break }

        var addrOffset = offset + MemoryLayout<rt_msghdr>.size
        var isDstDefault = false

        // RTA_DST (bit 0): hedef 0.0.0.0 ise bu default route'dur
        if (Int(rtm.rtm_addrs) & 0x1) != 0 {
          if addrOffset + MemoryLayout<sockaddr_in>.size <= bufLen {
            let sin = raw.load(fromByteOffset: addrOffset, as: sockaddr_in.self)
            if sin.sin_family == UInt8(AF_INET), sin.sin_addr.s_addr == 0 {
              isDstDefault = true
            }
          }
          // sockaddr boyutunu 4-byte hizalı ilerlet
          let saLen = max(Int(raw[addrOffset]), MemoryLayout<sockaddr>.size)
          addrOffset += (saLen + 3) & ~3
        }

        // RTA_GATEWAY (bit 1): default route'un gateway'i = hotspot sağlayıcısı
        if isDstDefault, (Int(rtm.rtm_addrs) & 0x2) != 0 {
          if addrOffset + MemoryLayout<sockaddr_in>.size <= bufLen {
            let sin = raw.load(fromByteOffset: addrOffset, as: sockaddr_in.self)
            if sin.sin_family == UInt8(AF_INET) {
              var addr = sin.sin_addr
              var hostname = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
              if inet_ntop(AF_INET, &addr, &hostname, socklen_t(INET_ADDRSTRLEN)) != nil {
                let ip = String(cString: hostname)
                if !ip.isEmpty && ip != "0.0.0.0" { gatewayIp = ip }
              }
            }
          }
        }

        offset += msgLen
      }
    }
    resolve(gatewayIp)
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
`;

// Objective-C köprüsü: Swift modülünü React Native'e kayıt eder
const OBJC_SOURCE = `\
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NetworkIf, NSObject)
RCT_EXTERN_METHOD(
  getLocalIps:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
RCT_EXTERN_METHOD(
  getArpTable:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
RCT_EXTERN_METHOD(
  getGatewayIp:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
@end
`;

/**
 * iOS için NetworkIf native modülü ekler.
 * Android'deki NetworkIfModule.kt'nin iOS karşılığı.
 * WifiLanTransport, NativeModules.NetworkIf.getLocalIps() ile
 * tüm IPv4 adreslerini alır (iPhone hotspot ap arayüzü dahil).
 */
function withNetworkIfIOS(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const iosDir = mod.modRequest.platformProjectRoot;
    const appName = mod.modRequest.projectName;
    const targetDir = path.join(iosDir, appName);

    // Fiziksel dosyaları oluştur
    const swiftFile = 'NetworkIfModule.swift';
    const objcFile = 'NetworkIfModule.m';
    const swiftPath = path.join(targetDir, swiftFile);
    const objcPath = path.join(targetDir, objcFile);

    // Her zaman yaz: plugin güncellendiğinde Swift kaynak otomatik yenilenir
    const existingSwift = fs.existsSync(swiftPath) ? fs.readFileSync(swiftPath, 'utf8') : '';
    if (existingSwift !== SWIFT_SOURCE) {
      fs.writeFileSync(swiftPath, SWIFT_SOURCE, 'utf8');
    }
    const existingObjc = fs.existsSync(objcPath) ? fs.readFileSync(objcPath, 'utf8') : '';
    if (existingObjc !== OBJC_SOURCE) {
      fs.writeFileSync(objcPath, OBJC_SOURCE, 'utf8');
    }

    // Xcode projesine kaydet
    const groupKey = project.findPBXGroupKey({ name: appName });
    const targetUUID = project.getFirstTarget().uuid;
    const opt = { target: targetUUID };

    // Zaten ekli mi kontrol et
    const buildPhase = project.pbxSourcesBuildPhaseObj(targetUUID);
    const existingFiles = (buildPhase?.files || []).map((f) => f.comment || '');

    if (!existingFiles.some((f) => f.includes(swiftFile))) {
      project.addSourceFile(`${appName}/${swiftFile}`, opt, groupKey);
    }
    if (!existingFiles.some((f) => f.includes(objcFile))) {
      project.addSourceFile(`${appName}/${objcFile}`, opt, groupKey);
    }

    return mod;
  });
}

module.exports = withNetworkIfIOS;
