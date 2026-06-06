const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Bridging header: yalnızca iOS SDK'da var olan standart POSIX/network başlıkları.
// NOT: net/route.h iOS 26 SDK'dan kaldırıldı; rt_msghdr artık kullanılamaz.
const BRIDGING_HEADER_SOURCE = `\
#ifndef NetworkIfBridgingHeader_h
#define NetworkIfBridgingHeader_h

#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>
#import <ifaddrs.h>
#import <net/if.h>

#endif /* NetworkIfBridgingHeader_h */
`;

// Swift implementasyonu
// - getLocalIps : getifaddrs üzerinden tüm IPv4 adreslerini döndürür
// - getArpTable : iOS SDK'da ARP tablo erişimi kaldırıldı → boş dizi döner
//   (WifiLanTransport zaten boş dizi durumunu handle eder)
// - getGatewayIp: SCDynamicStore üzerinden varsayılan ağ geçidini döndürür
const SWIFT_SOURCE = `\
import Foundation
import SystemConfiguration

// RCT tip tanımları: ObjC bridge üzerinden otomatik gelir ancak
// bazı toolchain versiyonlarında Swift'e görünür olmayabilir.
typealias RCTPromiseResolveBlock = (Any?) -> Void
typealias RCTPromiseRejectBlock = (String?, String?, Error?) -> Void

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

  /// iOS 26 SDK'da net/route.h kaldırıldığı için ARP tablosuna erişilemiyor.
  /// WifiLanTransport boş dizi durumunu zaten handle ediyor.
  @objc(getArpTable:rejecter:)
  func getArpTable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve([])
  }

  /// SCDynamicStore üzerinden varsayılan ağ geçidi (router) IP'sini döndürür.
  /// net/route.h gerektiren eski sysctl yaklaşımının iOS-uyumlu alternatifi.
  @objc(getGatewayIp:rejecter:)
  func getGatewayIp(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let store = SCDynamicStoreCreate(nil, "KampDefterim" as CFString, nil, nil),
      let globalIPv4 = SCDynamicStoreCopyValue(store, "State:/Network/Global/IPv4" as CFString) as? [String: Any],
      let router = globalIPv4["Router"] as? String
    else {
      resolve(nil)
      return
    }
    resolve(router)
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
    const bridgingHeaderFile = 'NetworkIfBridgingHeader.h';
    const swiftPath = path.join(targetDir, swiftFile);
    const objcPath = path.join(targetDir, objcFile);
    const bridgingHeaderPath = path.join(targetDir, bridgingHeaderFile);

    // Her zaman yaz: plugin güncellendiğinde Swift kaynak otomatik yenilenir
    const existingSwift = fs.existsSync(swiftPath) ? fs.readFileSync(swiftPath, 'utf8') : '';
    if (existingSwift !== SWIFT_SOURCE) {
      fs.writeFileSync(swiftPath, SWIFT_SOURCE, 'utf8');
    }
    const existingObjc = fs.existsSync(objcPath) ? fs.readFileSync(objcPath, 'utf8') : '';
    if (existingObjc !== OBJC_SOURCE) {
      fs.writeFileSync(objcPath, OBJC_SOURCE, 'utf8');
    }
    // Bridging header: rt_msghdr gibi C tiplerini Swift'e expose eder
    const existingBridging = fs.existsSync(bridgingHeaderPath) ? fs.readFileSync(bridgingHeaderPath, 'utf8') : '';
    if (existingBridging !== BRIDGING_HEADER_SOURCE) {
      fs.writeFileSync(bridgingHeaderPath, BRIDGING_HEADER_SOURCE, 'utf8');
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

    // SWIFT_OBJC_BRIDGING_HEADER build ayarını tüm konfigürasyonlara ekle
    // (Xcode 26'da rt_msghdr gibi BSD C tiplerini Swift'e açar)
    // addBuildProperty tüm build konfigürasyonlarına property ekler
    const bridgingHeaderValue = `"${appName}/${bridgingHeaderFile}"`;
    project.addBuildProperty('SWIFT_OBJC_BRIDGING_HEADER', bridgingHeaderValue);

    return mod;
  });
}

module.exports = withNetworkIfIOS;
