import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';

/**
 * S3 görselini image_id ile localde cache'ler ve local path döner.
 * Eğer localde varsa doğrudan local path döner.
 * @param image_id string - Benzersiz görsel id'si
 * @param image_url string - S3 public url
 * @param forceRefresh boolean - Online modda cache'i yeniden indir (varsayılan: false)
 * @returns local dosya yolu (expo-file-system uyumlu)
 */
export async function getCachedImagePath(
  image_id: string, 
  image_url: string,
  forceRefresh: boolean = false
): Promise<string> {
  const dir = FileSystem.documentDirectory + 'camp_images/';
  const localPath = dir + image_id + '.jpg';
  
  try {
    // Network durumunu kontrol et
    const netInfo = await Network.getNetworkStateAsync();
    const isOnline = !!netInfo.isConnected && !!netInfo.isInternetReachable;
    
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    
    // Online ve forceRefresh true ise cache'i sil ve yeniden indir
    if (isOnline && forceRefresh && fileInfo.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
    
    // Dosya yoksa veya yenilenmesi talep edildiyse indir
    const shouldDownload = !fileInfo.exists || (isOnline && forceRefresh);
    
    if (shouldDownload && isOnline) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.downloadAsync(image_url, localPath);
      return localPath;
    } else if (fileInfo.exists) {
      // Offline modda veya cache mevcut
      return localPath;
    } else {
      // Offline ve cache yok, remote URL döndür
      return image_url;
    }
  } catch (e) {
    // Hata durumunda image_url döndür
    console.warn('[imageCache] Hata:', e);
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
