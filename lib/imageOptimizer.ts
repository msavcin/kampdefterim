/**
 * imageOptimizer.ts
 *
 * "Save for Web" tarzı fotoğraf optimizasyonu.
 * Sunucuya göndermeden önce:
 *   - Uzun kenarı MAX_DIMENSION ile sınırlar (orantılı küçültme)
 *   - JPEG formatına dönüştürür
 *   - İnsan gözüne yeterince kaliteli, ağ için ekonomik sıkıştırma uygular
 */

import * as ImageManipulator from 'expo-image-manipulator';

/** Uzun kenar için izin verilen maksimum piksel boyutu */
const MAX_DIMENSION = 1920;

/** JPEG sıkıştırma kalitesi (0–1). 0.82 ≈ "Save for Web %82" */
const JPEG_QUALITY = 0.82;

/**
 * Verilen URI'daki fotoğrafı optimize eder ve optimize edilmiş URI'ı döner.
 *
 * @param uri  Kaynak fotoğrafın yerel URI'ı (file:// veya content://)
 * @returns    Optimize edilmiş fotoğrafın yerel URI'ı
 */
export async function optimizeImageForWeb(uri: string): Promise<string> {
  // Orijinal boyutları al
  const asset = await ImageManipulator.manipulateAsync(uri, [], {
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const { width, height } = asset;
  const actions: ImageManipulator.Action[] = [];

  // Uzun kenar MAX_DIMENSION'ı aşıyorsa orantılı küçült
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      actions.push({ resize: { width: MAX_DIMENSION } });
    } else {
      actions.push({ resize: { height: MAX_DIMENSION } });
    }
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}
