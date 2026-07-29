const fs = require('fs');
const path = require('path');
const { withDangerousMod, AndroidConfig } = require('@expo/config-plugins');

const MODULE_KT = `package __PACKAGE__

import android.content.Context
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedReader
import java.io.FileReader
import java.net.Inet4Address
import java.net.NetworkInterface

class NetworkIfModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun getName(): String = "NetworkIf"

  @ReactMethod
  fun getLocalIps(promise: Promise) {
    try {
      val result = com.facebook.react.bridge.Arguments.createArray()
      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces.hasMoreElements()) {
        val intf = interfaces.nextElement()
        if (!intf.isUp || intf.isLoopback) continue
        val addresses = intf.inetAddresses
        while (addresses.hasMoreElements()) {
          val addr = addresses.nextElement()
          if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
            val ip = addr.hostAddress
            if (!ip.isNullOrBlank() && ip != "0.0.0.0") result.pushString(ip)
          }
        }
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("NETWORK_IF_LOCAL_IPS", e.message, e)
    }
  }

  @ReactMethod
  fun getArpTable(promise: Promise) {
    try {
      val result = com.facebook.react.bridge.Arguments.createArray()
      BufferedReader(FileReader("/proc/net/arp")).use { reader ->
        reader.readLine() // header
        var line: String? = reader.readLine()
        while (line != null) {
          val parts = line.trim().split(Regex("\\\\s+"))
          if (parts.size >= 4) {
            val ip = parts[0]
            val flags = parts[2]
            val mac = parts[3]
            if (ip.matches(Regex("\\\\d+\\\\.\\\\d+\\\\.\\\\d+\\\\.\\\\d+")) &&
              ip != "0.0.0.0" &&
              mac != "00:00:00:00:00:00" &&
              (flags == "0x2" || flags == "0x6")) {
              result.pushString(ip)
            }
          }
          line = reader.readLine()
        }
      }
      promise.resolve(result)
    } catch (e: Exception) {
      // Bazı Android sürümleri ARP tablosuna erişimi sınırlayabilir; boş liste güvenli fallback'tir.
      promise.resolve(com.facebook.react.bridge.Arguments.createArray())
    }
  }

  @ReactMethod
  fun getGatewayIp(promise: Promise) {
    try {
      val cm = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = cm.activeNetwork
      if (network != null) {
        val props = cm.getLinkProperties(network)
        val defaultRoute = props?.routes?.firstOrNull { it.isDefaultRoute && it.gateway is Inet4Address }
        val gateway = defaultRoute?.gateway?.hostAddress
        if (!gateway.isNullOrBlank() && gateway != "0.0.0.0") {
          promise.resolve(gateway)
          return
        }
      }

      val wifi = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val dhcp = wifi.dhcpInfo
      @Suppress("DEPRECATION")
      val gw = dhcp?.gateway ?: 0
      if (gw != 0) {
        val ip = listOf(
          gw and 0xff,
          gw shr 8 and 0xff,
          gw shr 16 and 0xff,
          gw shr 24 and 0xff
        ).joinToString(".")
        promise.resolve(ip)
        return
      }

      promise.resolve(null)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun acquireMulticastLock(promise: Promise) {
    try {
      val wifi = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      if (multicastLock == null) {
        multicastLock = wifi.createMulticastLock("kampdefterim-mdns")
        multicastLock?.setReferenceCounted(true)
      }
      if (multicastLock?.isHeld != true) multicastLock?.acquire()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("NETWORK_IF_MULTICAST_LOCK", e.message, e)
    }
  }

  @ReactMethod
  fun releaseMulticastLock(promise: Promise) {
    try {
      if (multicastLock?.isHeld == true) multicastLock?.release()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }
}
`;

const PACKAGE_KT = `package __PACKAGE__

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NetworkIfPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(NetworkIfModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function packagePath(pkg) {
  return pkg.split('.').join(path.sep);
}

function ensureMainApplicationPackage(mainApplicationPath) {
  if (!fs.existsSync(mainApplicationPath)) return;
  let src = fs.readFileSync(mainApplicationPath, 'utf8');
  if (src.includes('NetworkIfPackage()')) return;

  const patterns = [
    /PackageList\(this\)\.packages\.apply\s*\{/, // RN Kotlin template
    /PackageList\(this\)\.packages\.also\s*\{/,  // alternate Kotlin template
  ];

  for (const pattern of patterns) {
    if (pattern.test(src)) {
      src = src.replace(pattern, (match) => `${match}\n          add(NetworkIfPackage())`);
      fs.writeFileSync(mainApplicationPath, src);
      return;
    }
  }

  // Fallback: append before return packages in Java/Kotlin-ish templates is risky, so leave a clear marker.
  console.warn('[withNetworkIfAndroid] MainApplication package list not patched automatically:', mainApplicationPath);
}

module.exports = function withNetworkIfAndroid(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const androidPackage = AndroidConfig.Package.getPackage(config) || config.android?.package;
    if (!androidPackage) return config;

    const appSrc = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', packagePath(androidPackage));
    fs.mkdirSync(appSrc, { recursive: true });

    fs.writeFileSync(
      path.join(appSrc, 'NetworkIfModule.kt'),
      MODULE_KT.replace(/__PACKAGE__/g, androidPackage)
    );
    fs.writeFileSync(
      path.join(appSrc, 'NetworkIfPackage.kt'),
      PACKAGE_KT.replace(/__PACKAGE__/g, androidPackage)
    );

    ensureMainApplicationPackage(path.join(appSrc, 'MainApplication.kt'));
    ensureMainApplicationPackage(path.join(appSrc, 'MainApplication.java'));

    return config;
  }]);
};
