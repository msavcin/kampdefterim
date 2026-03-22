import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';

/**
 * S3 görselini image_id ile localde cache'ler ve local path döner.
 * Eğer localde varsa doğrudan local path döner.
 * @param image_id string - Benzersiz görsel id'si
 * @param image_url string - S3 public url
 * @param forceRefresh boolean - Online modda cache'i yeniden indir (varsayılan: false)
 * @param isOnlineHint boolean - Parent component'ten gelen network durumu (opsiyonel)
 * @returns local dosya yolu (expo-file-system uyumlu)
 */
export async function getCachedImagePath(
  image_id: string, 
  image_url: string,
  forceRefresh: boolean = false,
  isOnlineHint?: boolean
): Promise<string> {
  const dir = FileSystem.documentDirectory + 'camp_images/';
  const localPath = dir + image_id + '.jpg';
  
  try {
    // Network durumunu kontrol et (isOnlineHint varsa onu kullan)
    let isOnline: boolean;
    if (isOnlineHint !== undefined) {
      isOnline = isOnlineHint;
      console.log(`[imageCache] 📌 isOnlineHint kullanılıyor: ${isOnline}`);
    } else {
      const netInfo = await Network.getNetworkStateAsync();
      isOnline = !!netInfo.isConnected && !!netInfo.isInternetReachable;
    }
    
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    let fileExists = fileInfo.exists;

    // Debug log
    if (forceRefresh) {
      console.log(`[imageCache] 🔄 forceRefresh aktif - ${image_id}, online:${isOnline}, mevcut:${fileExists}`);
    }

    // Online ve forceRefresh true ise cache'i sil ve yeniden indir
    if (isOnline && forceRefresh && fileExists) {
      console.log(`[imageCache] 🗑️ Cache siliniyor: ${image_id}`);
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      fileExists = false;
    }

    // Dosya yoksa veya yenilenmesi talep edildiyse indir
    const shouldDownload = !fileExists || (isOnline && forceRefresh);
    
    if (shouldDownload && isOnline) {
      console.log(`[imageCache] 📥 İndiriliyor: ${image_id}`);
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.downloadAsync(image_url, localPath);
      console.log(`[imageCache] ✅ İndirildi: ${image_id}`);
      return localPath;
    } else if (fileInfo.exists) {
      // Offline modda veya cache mevcut
      console.log(`[imageCache] 💾 Cache'den yüklendi: ${image_id}`);
      return localPath;
    } else {
      // Offline ve cache yok, remote URL döndür
      console.log(`[imageCache] ⚠️ Offline & cache yok, remote URL: ${image_id}`);
      return image_url;
    }
  } catch (e) {
    // Hata durumunda image_url döndür
    console.warn('[imageCache] ❌ Hata:', e);
    return image_url;
  }
}

/**
 * Local cache'den görseli siler (örn. sunucudan silindiğinde veya güncellendiğinde)
 */
export async function removeCachedImage(image_id: string) {
  const localPath = FileSystem.documentDirectory + 'camp_images/' + image_id + '.jpg';
  try {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
  } catch {}
}
