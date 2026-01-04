// HENÜZ SUNUCU İLE EŞİTLEME TAM OLARAK SAĞLANAMADI. + 3 SAAT EKLENEREK ZAMAN BELİRLEMESİ YAPILIYOR.
// ŞİFRE SIFIRLAMA VE EPOSTA DOĞRULAMA KODU İÇİN BU ŞEKİLDE KULLANILIYOR.
// Sunucu saatini alıp offset hesaplayan ve tekrar kullanılabilir bir fonksiyon
// Kullanım: import { getServerOffset } from './time';

import { API_URL } from './config';

/**
 * Sunucu saatini alır ve istemci saatinden farkı (ms cinsinden) döner.
 * Hata olursa 0 döner.
 */
export async function getServerOffset(): Promise<number> {
  try {
    const res = await fetch(`${API_URL}/server-time`);
    const data = await res.json();
    const serverTime = new Date(data.utc).getTime(); // veya  data.timestamp
    const clientTime = Date.now();
    return serverTime - clientTime;
  } catch (e) {
    return 0;
  }
}
