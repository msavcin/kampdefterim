import * as FileSystem from 'expo-file-system';

/**
 * S3 görselini image_id ile localde cache'ler ve local path döner.
 * Eğer localde varsa doğrudan local path döner.
 * @param image_id string - Benzersiz görsel id'si
 * @param image_url string - S3 public url
 * @returns local dosya yolu (expo-file-system uyumlu)
 */
export async function getCachedImagePath(image_id: string, image_url: string): Promise<string> {
  const dir = FileSystem.documentDirectory + 'camp_images/';
  const localPath = dir + image_id + '.jpg';
  try {
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      return localPath;
    } else {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.downloadAsync(image_url, localPath);
      return localPath;
    }
  } catch (e) {
    // Eğer indirme başarısızsa yine image_url döndür (en azından online gösterilsin)
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
