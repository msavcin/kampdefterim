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
import { getRefreshToken, saveToken, saveRefreshToken } from './auth';
// Merkezi silme fonksiyonu: online ise API'ya silme, offline ise pending'e ekle ve localden sil
export async function deleteCampingAreaSmart({ campingArea, isConnected }) {
  const db = getDatabase();
  try {
    // 1. Localden sil
    await db.deleteCampingArea(campingArea.id);
    if (isConnected) {
      // Online ise API'ya hemen gönder — önce token yenilemeyi dene
      try {
        // Token'ın güncel olduğundan emin olmak için önce yenileme denenir
        const storedRefreshToken = await getRefreshToken();
        if (storedRefreshToken) {
          const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedRefreshToken }),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            const newToken = data?.token ?? null;
            if (newToken) await saveToken(newToken);
            const newRefresh = data?.refreshToken ?? data?.refresh_token ?? null;
            if (newRefresh) await saveRefreshToken(newRefresh);
            console.log('[deleteCampingAreaSmart] Token silme öncesi yenilendi.');
          }
        }
        // external_id geçerli mi? Sadece numeric ise (lokal id ile aynı) by=external_id kullanma
        // Örn: "user_1_2077" → geçerli, "2077" → geçersiz (lokal id'nin string hali)
        const hasValidExternalId =
          !!campingArea.external_id &&
          isNaN(Number(campingArea.external_id)) && // pure numeric ise geçersiz
          String(campingArea.external_id) !== String(campingArea.id);

        let extId: string | number;
        let byParam: 'external_id' | 'id';

        if (hasValidExternalId) {
          extId = campingArea.external_id;
          byParam = 'external_id';
        } else if (campingArea.owner_id) {
          // Kullanıcının oluşturduğu alan: create sırasında gönderilen formatı yeniden oluştur
          extId = `user_${campingArea.owner_id}_${campingArea.id}`;
          byParam = 'external_id';
          // Local DB'yi de güncelle (sonraki işlemler için)
          try {
            await db.updateCampingAreaExternalIdByLocalId(Number(campingArea.id), extId as string);
          } catch {}
          console.log(`[deleteCampingAreaSmart] external_id yeniden oluşturuldu: ${extId}`);
        } else {
          extId = campingArea.id;
          byParam = 'id';
        }
        console.log(`[deleteCampingAreaSmart] extId=${extId}, byParam=${byParam}, raw external_id=${campingArea.external_id}`);
        const delRes: any = await deleteCampingAreaOnServer(extId, byParam);
        // Eğer sunucu 404 döndüyse, idempotent olarak kabul et ve devam et
        if (delRes && delRes.notFound) {
          console.warn('[deleteCampingAreaSmart] Sunucu kaynak bulunamadı (404), lokal silme korunuyor.');
        }
      } catch (apiErr) {
        // API hatası olursa: DB.deleteCampingArea zaten pending değişiklik ekliyor,
        // bu yüzden burada duplicate pending eklemeyelim. Sadece logla.
        console.warn('[deleteCampingAreaSmart] ❌ Server delete failed (will remain pending):', apiErr);
      }
    } else {
      // Offline ise pending'e ekle (owner_id de dahil)
      await addPendingChange({
        type: 'delete',
        campground_id: campingArea.id?.toString() ?? undefined,
        data: { id: campingArea.id, external_id: campingArea.external_id, owner_id: campingArea.owner_id }
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
import { getRatingsSummary, postRatingForCampground, deleteMyRating, patchRating } from './ratingApi';
import { evaluateCampingAreaReviews } from './aiReviewApi';

// Yorum değerlendirmesi senkronizasyonu
export async function syncRatings(): Promise<boolean> {
  const db = getDatabase();
  try {
    // Pending rating değişikliklerini al
    const changes = await db.getPendingChanges();
    const ratingChanges = changes.filter((ch: any) => 
      ['rating_create', 'rating_update', 'rating_delete'].includes(ch.type)
    );

    if (ratingChanges.length === 0) {
      if (__DEV__) console.log('[syncRatings] Senkronize edilecek rating değişikliği yok');
      return true;
    }

    // AI review tetiklenecek kamp alanlarını topla
    const campgroundsToEvaluate = new Set<number>();

    // Her bir rating değişikliğini işle
    for (const change of ratingChanges) {
      const ch = change as any;
      try {
        const data = typeof ch.data === 'string' ? JSON.parse(ch.data) : ch.data;
        const campgroundId = data.campground_id || ch.campground_id;

        if (!campgroundId) {
          console.warn('[syncRatings] campground_id bulunamadı, atlanıyor:', ch);
          await db.markPendingChangeSynced(ch.id);
          continue;
        }

        if (ch.type === 'rating_create' || ch.type === 'rating_update') {
          // Yorum ekle veya güncelle
          const payload = {
            rating: data.rating,
            comment: data.comment,
            anon_name: data.anon_name,
            hide_user: data.hide_user
          };

          if (ch.type === 'rating_create') {
            await postRatingForCampground(campgroundId, payload);
          } else if (data.rating_id) {
            await patchRating(campgroundId, data.rating_id, payload);
          }

          // AI review için işaretle
          campgroundsToEvaluate.add(Number(campgroundId));
        } else if (ch.type === 'rating_delete') {
          // Yorumu sil
          await deleteMyRating(campgroundId);
          
          // AI review için işaretle
          campgroundsToEvaluate.add(Number(campgroundId));
        }

        // Başarılı işlem sonrası pending'i işaretle
        await db.markPendingChangeSynced(ch.id);

        // Güncellenmiş rating bilgilerini çek ve local database'i güncelle
        try {
          const summary = await getRatingsSummary(campgroundId);
          if (summary) {
            const area = await db.getCampingAreaById(Number(campgroundId));
            if (area) {
              await db.insertOrUpdateCampingArea({
                ...area,
                rating: summary.average_rating || summary.avg_rating || area.rating,
                review_count: summary.total_count || summary.count || area.review_count
              } as any);
            }
          }
        } catch (summaryErr) {
          console.warn('[syncRatings] Rating summary alınamadı:', summaryErr);
        }

        if (__DEV__) console.log(`[syncRatings] ✅ Rating değişikliği senkronize edildi: ${ch.type}`);
      } catch (err) {
        console.error('[syncRatings] Rating değişikliği işlenirken hata:', err, ch);
        await db.markPendingChangeError(ch.id);
      }
    }

    // Yorumları değişen kamp alanları için AI review tetikle
    if (campgroundsToEvaluate.size > 0) {
      if (__DEV__) console.log(`[syncRatings] 🤖 AI review tetikleniyor: ${campgroundsToEvaluate.size} kamp alanı`);

      const MIN_REVIEWS_THRESHOLD = 3;
      const genericPattern = /google\s*places|detaylı bilgi|kullan[ıi]cı yorumu|detayl[ıi] bilgi/i;

      for (const campgroundId of campgroundsToEvaluate) {
        try {
          // Önce normal değerlendirmeyi dene
          let aiResult = await evaluateCampingAreaReviews(campgroundId, false);
          const area = await db.getCampingAreaById(campgroundId);

          const applyEvaluationToDb = async (evaluation: any) => {
            if (!evaluation) return;
            const evalText = evaluation.ai_review_evaluation ?? '';
            const genAt = evaluation.ai_review_generated_at ?? new Date().toISOString();
            const updatedFields = evaluation.updated_fields || {};

            await db.insertOrUpdateCampingArea({
              ...(area || {}),
              ai_review_evaluation: evalText,
              ai_review_generated_at: genAt,
              rating: updatedFields.rating || (area ? area.rating : undefined),
              review_count: updatedFields.review_count || (area ? area.review_count : undefined),
              facilities: updatedFields.facilities || (area ? area.facilities : undefined),
              price_range: updatedFields.price_range || (area ? area.price_range : undefined),
              website: updatedFields.website || (area ? area.website : undefined),
              phone: updatedFields.phone || (area ? area.phone : undefined)
            } as any);
          };

          // Eğer sunucu cooldown bildiriyorsa, logla ve devam et
          if (aiResult && (aiResult as any).cooldown_remaining) {
            if (__DEV__) console.log(`[syncRatings] ⏳ AI review cooldown: ${campgroundId} (${(aiResult as any).cooldown_remaining}s kaldı)`);
            continue;
          }

          // Eğer başarıyla bir değerlendirme geldiyse, incele
          if (aiResult && aiResult.success && aiResult.evaluation) {
            let evalText: string = aiResult.evaluation.ai_review_evaluation ?? '';
            // review sayısını tespit et (AI'dan gelmişse updated_fields, yoksa local)
            let reviewCount: number | undefined = aiResult.evaluation.updated_fields?.review_count;
            if (reviewCount === undefined && area) reviewCount = area.review_count;

            const looksGeneric = typeof evalText === 'string' && genericPattern.test(evalText);
            const isFew = typeof reviewCount === 'number' && reviewCount < MIN_REVIEWS_THRESHOLD;

            // Eğer sunucu generic mesaj döndüyse veya yorum sayısı azsa, force ile yeniden dene
            if (looksGeneric || isFew) {
              try {
                if (__DEV__) console.log(`[syncRatings] ⚙️ Az yorum algılandı veya generic mesaj var, force=true denenecek: ${campgroundId}`);
                const forced = await evaluateCampingAreaReviews(campgroundId, true);
                if (forced && forced.success && forced.evaluation && !(forced.evaluation.ai_review_evaluation && genericPattern.test(forced.evaluation.ai_review_evaluation))) {
                  // Force ile daha anlamlı bir değerlendirme geldiyse bunu kullan
                  await applyEvaluationToDb(forced.evaluation);
                  if (__DEV__) console.log(`[syncRatings] 🤖 AI (forced) review güncellendi: ${campgroundId}`);
                  continue;
                }
              } catch (e) {
                if (__DEV__) console.warn('[syncRatings] Force AI değerlendirme hata:', e);
              }

              // Force başarısızsa veya hala generic ise, mevcut metni low-count notu ile kaydet
              try {
                // Eğer reviewCount bilinmiyorsa API'den summary al
                if (reviewCount === undefined) {
                  try {
                    const summary = await getRatingsSummary(campgroundId);
                    reviewCount = summary?.total_count ?? summary?.count ?? reviewCount;
                  } catch {}
                }

                const countLabel = typeof reviewCount === 'number' ? String(reviewCount) : 'az sayıda';
                const note = `\n\nNot: Bu kamp alanı için yalnızca ${countLabel} kullanıcı yorumu bulunduğu için değerlendirme sınırlı olabilir.`;
                const finalText = (evalText || `Bu kamp alanı hakkında ${countLabel} kullanıcı yorumu bulunmaktadır. Detaylı bilgi için Google Places'i ziyaret edebilirsiniz.`) + note;

                const genAt = (aiResult && aiResult.evaluation && aiResult.evaluation.ai_review_generated_at) ? aiResult.evaluation.ai_review_generated_at : new Date().toISOString();
                await db.insertOrUpdateCampingArea({
                  ...(area || {}),
                  ai_review_evaluation: finalText,
                  ai_review_generated_at: genAt
                } as any);
                if (__DEV__) console.log(`[syncRatings] 🤖 AI review (fallback with note) kaydedildi: ${campgroundId}`);
              } catch (saveErr) {
                console.warn('[syncRatings] AI fallback kaydetme hatası:', saveErr);
              }
            } else {
              // Normal, anlamlı değerlendirme geldi
              await applyEvaluationToDb(aiResult.evaluation);
              if (__DEV__) console.log(`[syncRatings] 🤖 AI review güncellendi: ${campgroundId}`);
            }
          } else if (aiResult && !aiResult.success) {
            // Başarısız olduysa (ör: sunucu az yorum nedeniyle atladı) force ile dene, yoksa fallback mesaj yaz
            try {
              const forced = await evaluateCampingAreaReviews(campgroundId, true);
              if (forced && forced.success && forced.evaluation) {
                await applyEvaluationToDb(forced.evaluation);
                if (__DEV__) console.log(`[syncRatings] 🤖 AI (forced) review güncellendi: ${campgroundId}`);
                continue;
              }
            } catch (e) {
              if (__DEV__) console.warn('[syncRatings] Force AI değerlendirme hata:', e);
            }

            // Fallback: kısa bilgilendirme metni ve low-count notu
            try {
              let reviewCount: number | undefined = area?.review_count;
              if (reviewCount === undefined) {
                try { const summary = await getRatingsSummary(campgroundId); reviewCount = summary?.total_count ?? summary?.count ?? reviewCount; } catch {}
              }
              const countLabel = typeof reviewCount === 'number' ? String(reviewCount) : 'az sayıda';
              const fallbackText = `Bu kamp alanı hakkında ${countLabel} kullanıcı yorumu bulunmaktadır. Detaylı bilgi için Google Places'i ziyaret edebilirsiniz.\n\nNot: Yorum sayısı az olduğu için değerlendirme sınırlı olabilir.`;
              await db.insertOrUpdateCampingArea({ ...(area || {}), ai_review_evaluation: fallbackText, ai_review_generated_at: new Date().toISOString() } as any);
              if (__DEV__) console.log(`[syncRatings] 🤖 AI review (error fallback) kaydedildi: ${campgroundId}`);
            } catch (saveErr) {
              console.warn('[syncRatings] AI error fallback kaydetme hatası:', saveErr);
            }
          }
        } catch (aiErr) {
          // AI review hatası senkronizasyonu engellemez
          console.warn(`[syncRatings] AI review hatası (${campgroundId}):`, aiErr);
        }
      }
    }

    return true;
  } catch (error) {
    if (error instanceof Error) {
      const errMsg = error.message || '';
      if (errMsg.includes('Network') || errMsg.includes('fetch')) {
        console.warn('[syncRatings] 🌐 Ağ bağlantısı hatası:', errMsg);
      } else {
        console.error('[syncRatings] ❌ Rating değişiklikleri senkronize edilemedi:', errMsg);
      }
    } else {
      console.error('[syncRatings] ❌ Rating değişiklikleri senkronize edilemedi:', error);
    }
    return false;
  }
}

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



// Kamp alanı delta senkronizasyonu
export async function syncCampingAreas(userId?: string): Promise<boolean> {
  const db = getDatabase();
  try {
    const count = await db.fetchAndStoreCampingAreasFromAPI(undefined, { forceFull: false, userId });
    if (__DEV__) console.log('[syncCampingAreas] ✅ Kamp alanları senkronize edildi, güncellenen:', count);
    if (count && count > 0) {
      emit('campingAreas:updated', { count });
    }
    // Arkadaş paylaşımından çıkartılan alanları temizle
    if (userId) {
      await db.cleanupRevokedFriendAreas(userId);
    }
    return true;
  } catch (error) {
    if (error instanceof Error) {
      const errMsg = error.message || '';
      if (errMsg.includes('Network') || errMsg.includes('fetch')) {
        console.warn('[syncCampingAreas] 🌐 Ağ bağlantısı hatası:', errMsg);
      } else {
        console.error('[syncCampingAreas] ❌ Kamp alanları senkronize edilemedi:', errMsg);
      }
    } else {
      console.error('[syncCampingAreas] ❌ Kamp alanları senkronize edilemedi:', error);
    }
    return false;
  }
}

// Tüm senkronizasyonu başlatan ana fonksiyon
export async function syncAll({ userId, onProgress }: { userId?: number; onProgress?: (current: number, total: number) => void } = {}) {
  // 1. Fotoğraflar
  await syncPendingImages(userId);
  // 2. Checklist
  await syncPendingChecklists();
  // 3. Diğer değişiklikler
  await syncPendingChanges(userId, onProgress);
  // 4. Yorum değerlendirmeleri
  await syncRatings();
  // 5. Duyuru delta sync
  await syncAnnouncements();
  // 6. Kamp alanı delta sync (userId ile birlikte arkadaş erişim temizliği)
  await syncCampingAreas(userId !== undefined ? String(userId) : undefined);
}

// Geliştirilebilir: isConnected değiştiğinde veya uygulama açıldığında bu fonksiyon çağrılır
