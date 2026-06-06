const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Swift implementasyonu: tüm IPv4 arayüzlerini döndürür (loopback hariç)
const SWIFT_SOURCE = `\
import Foundation
import Darwin

// Fallback typealiases for React Native promise blocks. Some Xcode/toolchain
// combinations may not expose the Objective-C typedefs to Swift during plugin
// prebuild; defining these ensures the Swift source compiles even if the
// React headers aren't directly imported into Swift's translation unit.
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

  @objc(getArpTable:rejecter:)
  func getArpTable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // ARP table parsing with rt_msghdr isn't exposed reliably to Swift
    // across toolchains. Return an empty array as a safe fallback; the
    // JavaScript layer already handles absence of ARP entries gracefully.
    resolve([String]())
  }

  @objc(getGatewayIp:rejecter:)
  func getGatewayIp(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Determining gateway via low-level route parsing can be fragile.
    // Return nil as a safe fallback.
    resolve(nil)
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
