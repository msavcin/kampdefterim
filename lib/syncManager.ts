// NetInfo kaldırıldı, navigator.onLine ile kontrol

function isOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true; // Mobilde her zaman true kabul et (AppState ile daha iyi kontrol için useNetworkStatus kullanılabilir)
}
// Duyuru senkronizasyonunu arka planda periyodik olarak çalıştır
let announcementSyncInterval: number | null = null;
export function startAnnouncementSyncBackground({ intervalMs = 5 * 60 * 1000 } = {}) {
  if (announcementSyncInterval) return; // Zaten başlatıldıysa tekrar başlatma
  announcementSyncInterval = setInterval(async () => {
    try {
      if (isOnline()) {
        await syncAnnouncements();
      }
    } catch (e) {
      console.warn('[syncManager] Online kontrolünde hata:', e);
    }
  }, intervalMs);
  // ...existing code...
}

export function stopAnnouncementSyncBackground() {
  if (announcementSyncInterval) {
    clearInterval(announcementSyncInterval);
    announcementSyncInterval = null;
  // ...existing code...
  }
}
// --- DUYURU SENKRONİZASYONU ---
import { API_URL } from './config';
import { emit } from './eventBus';

// Online ise API'den duyuruları çekip lokal veritabanına kaydeder
export async function syncAnnouncements() {
  const db = getDatabase();
  try {
    const inserted = await db.fetchAndStoreAnnouncementsFromAPI(API_URL + '/announcements/', true);
    if (__DEV__) console.log('[syncAnnouncements] ✅ Duyurular başarıyla senkronize edildi, inserted:', inserted);
    try {
      if (inserted && inserted > 0) {
        // Arka planda yeni duyuru bulunduğunu yayınla
        emit('announcements:new', { count: inserted });
      }
    } catch (e) {
      console.warn('[syncAnnouncements] event emit hatası:', e);
    }
    return true;
  } catch (error) {
    if (error instanceof Error) {
      const errMsg = error.message || '';
      
      // Geçici sunucu hataları (5xx)
      if (errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('504')) {
        console.warn('[syncAnnouncements] ⚠️ Geçici sunucu hatası, sonraki denemede tekrar denenecek:', errMsg);
      }
      // Ağ bağlantısı hataları
      else if (errMsg.includes('Network') || errMsg.includes('fetch')) {
        console.warn('[syncAnnouncements] 🌐 Ağ bağlantısı hatası:', errMsg);
      }
      // Diğer hatalar
      else {
        console.error('[syncAnnouncements] ❌ Duyurular senkronize edilemedi:', errMsg);
      }
    } else {
      console.error('[syncAnnouncements] ❌ Duyurular senkronize edilemedi:', error);
    }
    return false;
  }
}
import { deleteCampingAreaOnServer } from './campingAreaApi';
import { addPendingChange } from './pendingChanges';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { syncPendingChanges } from './syncPendingChanges';
// Merkezi silme fonksiyonu: online ise API'ya silme, offline ise pending'e ekle ve localden sil
export async function deleteCampingAreaSmart({ campingArea, isConnected }) {
  const db = getDatabase();
  try {
    // 1. Localden sil
    await db.deleteCampingArea(campingArea.id);
    if (isConnected) {
      // Online ise API'ya hemen gönder
      try {
        const extId = campingArea.external_id || campingArea.id;
        await deleteCampingAreaOnServer(extId, campingArea.external_id ? 'external_id' : 'id');
  // ...existing code...
      } catch (apiErr) {
        // API hatası olursa pending'e ekle
        console.warn('[deleteCampingAreaSmart] ❌ Server delete failed, adding to pending:', apiErr);
        await addPendingChange({
          type: 'delete',
          campground_id: campingArea.id?.toString() ?? undefined,
          data: { id: campingArea.id, external_id: campingArea.external_id }
        });
      }
    } else {
      // Offline ise pending'e ekle
      await addPendingChange({
        type: 'delete',
        campground_id: campingArea.id?.toString() ?? undefined,
        data: { id: campingArea.id, external_id: campingArea.external_id }
      });
    }
    return true;
  } catch (error) {
    console.error('[deleteCampingAreaSmart] ❌ Error deleting area:', error);
    return false;
  }
}
// Merkezi senkronizasyon yöneticisi
// Tüm offline/online veri (kamp alanı, fotoğraf, checklist, vs.) burada yönetilir
import * as SecureStore from 'expo-secure-store';
import { setLargeItemAsync, getLargeItemAsync } from './largeStorage';
import { getDatabase } from './database';
import { uploadCampgroundImage } from './campgroundImageApi';
import { updateCampingAreaOnServer, createCampingAreaOnServer, sanitizeCampingAreaData } from './campingAreaApi';


// Checklist senkronizasyonu için örnek fonksiyon (geliştirilebilir)
async function syncPendingChecklists() {
  // TODO: Checklist için pending kuyruğu varsa burada işlenir
}

// Pending Images kuyruğunu işle
async function syncPendingImages(userId) {
  const db = getDatabase();
  const pendingImagesStr = await getLargeItemAsync('pendingImages');
  let pendingImages = pendingImagesStr ? JSON.parse(pendingImagesStr) : [];
  if (!pendingImages.length) return;
  const updatedPending = [];
  // 1. campingAreaId olanlar (mevcut alanlar)
  const grouped = pendingImages.reduce((acc, img) => {
    if (!img.campingAreaId) return acc;
    if (!acc[img.campingAreaId]) acc[img.campingAreaId] = [];
    acc[img.campingAreaId].push(img);
    return acc;
  }, {});
  for (const campingAreaIdStr of Object.keys(grouped)) {
    const campingAreaId = Number(campingAreaIdStr);
    let area = null;
    if (campingAreaId) {
      area = await db.getCampingAreaById(campingAreaId);
    }
    let imagesArr = [];
    if (area) {
      try {
        imagesArr = Array.isArray(area.images) ? area.images : JSON.parse(area.images);
      } catch { imagesArr = []; }
    }
    // Sadece file:// ile başlayan ve S3'e yüklenmemiş görselleri bul
    const fileImages = imagesArr.filter(im => typeof im === 'string' && im.startsWith('file://'));
    for (const fileUri of fileImages) {
      try {
        const uploadResult = await uploadCampgroundImage({
          campground_id: campingAreaId,
          local_uri: fileUri,
          image_id: Date.now() + '_' + Math.floor(Math.random() * 10000),
          uploaded_by: userId ? Number(userId) : undefined,
          created_by: userId ? Number(userId) : undefined,
        });
        // imagesArr'da ilk fileUri eşleşen index'i bul ve güncelle
        const idx = imagesArr.findIndex(im => im === fileUri);
        if (uploadResult && uploadResult.image_url && idx !== -1) {
          imagesArr[idx] = uploadResult.image_url;
          // Log
          // ...existing code...
        } else {
          // uploadResult yoksa veya index bulunamazsa pending'de tut
          updatedPending.push({ local_uri: fileUri, campingAreaId });
          console.warn('[syncPendingImages][S3 upload fail or index not found]', fileUri, uploadResult);
        }
      } catch (e) {
        updatedPending.push({ local_uri: fileUri, campingAreaId });
        console.warn('[syncPendingImages][S3 upload exception]', fileUri, e);
      }
    }
    // DB ve sunucuya güncelle (her zaman güncel imagesArr ile kaydet)
    if (area) {
      await db.insertOrUpdateCampingArea({ ...area, images: imagesArr, photo_links: imagesArr });
      const extId = area.external_id || area.id;
      if (extId) {
        const sanitized = sanitizeCampingAreaData({ ...area, images: imagesArr, photo_links: imagesArr });
        await updateCampingAreaOnServer(extId, sanitized);
      }
    }
  }

  // 2. campingAreaId olmayanlar (yeni eklenmiş, offline alanlar)
  let orphanImages = pendingImages.filter(img => !img.campingAreaId);
  if (orphanImages.length) {
    // Local DB'deki en son eklenen, S3 linki olmayan kamp alanını bul
    const allAreas = await db.getAllCampingAreas();
    // Sadece images dizisinde file:// olanları olanları bul
    const candidateAreas = allAreas.filter(area => {
      let imgs = [];
      try {
        imgs = Array.isArray(area.images) ? area.images : JSON.parse(area.images);
      } catch { imgs = []; }
      // En az bir görsel file:// ile başlıyorsa ve https:// ile başlamıyorsa, bu alan adaydır
      return imgs.some(im => typeof im === 'string' && im.startsWith('file://'));
    });
    for (const orphan of orphanImages) {
      // En uygun alanı bul (ilk bulduğuna ekle)
      const area = candidateAreas[0];
      if (!area) {
        updatedPending.push(orphan);
        continue;
      }
      let imagesArr = [];
      try {
        imagesArr = Array.isArray(area.images) ? area.images : JSON.parse(area.images);
      } catch { imagesArr = []; }
      // file:// ile başlayan ve orphan.local_uri ile dosya adı aynı olan görseli bul
      const orphanFileName = orphan.local_uri?.split('/').pop();
      // Debug log
  // ...existing code...
      const idx = imagesArr.findIndex(im => {
        if (typeof im !== 'string' || !im.startsWith('file://')) return false;
        const imFileName = im.split('/').pop();
  // ...existing code...
        return imFileName === orphanFileName;
      });
  // ...existing code...
      if (idx === -1) {
        updatedPending.push(orphan);
        continue;
      }
      // Orphan kaydına campingAreaId ekle (artık orphan değil)
      orphan.campingAreaId = area.id;
      // PendingImages kuyruğunu güncelle
      const piStr = await getLargeItemAsync('pendingImages');
      let piArr = piStr ? JSON.parse(piStr) : [];
      piArr = piArr.map(p => (p.local_uri === orphan.local_uri && !p.campingAreaId) ? { ...p, campingAreaId: area.id } : p);
      await setLargeItemAsync('pendingImages', JSON.stringify(piArr));
      // Sonraki sync'te bu görsel doğrudan campingAreaId ile işlenecek
      updatedPending.push({ ...orphan, campingAreaId: area.id });
    }
    // Bu sync'te S3 upload denenmez, bir sonraki sync'te campingAreaId ile işlenir
  }
  // Sadece yüklenemeyenleri pending'de tut
  await setLargeItemAsync('pendingImages', JSON.stringify(updatedPending));
}



// Tüm senkronizasyonu başlatan ana fonksiyon
export async function syncAll({ userId, onProgress }: { userId?: number; onProgress?: (current: number, total: number) => void } = {}) {
  // 1. Fotoğraflar
  await syncPendingImages(userId);
  // 2. Checklist
  await syncPendingChecklists();
  // 3. Diğer değişiklikler
  await syncPendingChanges(userId, onProgress);
  // 4. Duyuru delta sync
  await syncAnnouncements();
}

// Geliştirilebilir: isConnected değiştiğinde veya uygulama açıldığında bu fonksiyon çağrılır
