// syncPendingChanges.ts
import { getPendingChanges, markChangeAsSynced, markChangeAsError } from '@/lib/pendingChanges';
import { Alert } from 'react-native';
import { getToken } from '@/lib/auth';
import { createCampingAreaOnServer, deleteCampingAreaOnServer, updateCampingAreaOnServer } from '@/lib/campingAreaApi';
import { Platform } from 'react-native';
import { getDatabase } from '@/lib/database';

// Paralel sync çağrılarını önlemek için flag
let isSyncing = false;

// currentUserId parametresi eklendi
export async function syncPendingChanges(currentUserId?: string | number, onProgress?: (current: number, total: number) => void, options?: { skipDeltaSync?: boolean }) {
  // Eğer zaten bir sync çalışıyorsa, yeni çağrıyı atla
  if (isSyncing) {
    console.log('[syncPendingChanges] Zaten bir sync çalışıyor, yeni çağrı atlandı.');
    return;
  }
  
  isSyncing = true;
  try {
    await _syncPendingChanges(currentUserId, onProgress, options);
  } finally {
    isSyncing = false;
  }
}

async function _syncPendingChanges(currentUserId?: string | number, onProgress?: (current: number, total: number) => void, options?: { skipDeltaSync?: boolean }) {
  console.log('[syncPendingChanges] başlatıldı');
  
  // DEBUG: Localde adı 'B7' geçen kamp alanı var mı?
  try {
    const allAreas = await getDatabase().getAllCampingAreas();
    const b7Areas = allAreas.filter(area => area.name && area.name.includes('B7'));
    // ...existing code...
  } catch (e) {
    // ...existing code...
  }
  const pending = await getPendingChanges();
  console.log('[syncPendingChanges] pending değişiklikler:', pending.length);
  // ...existing code...
  
  let syncedCount = 0; // Değişkeni dışarı taşı
  
  if (pending.length === 0) {
    console.log('[syncPendingChanges] Senkronize edilecek değişiklik yok.');
    // Pending değişiklik olmasa da Delta Sync yapılacak, return etme!
    // ...existing code...
  }
  
  // Pending değişiklik işleme - sadece pending.length > 0 ise
  if (pending.length > 0) {
    for (const change of pending) {
    console.log('[syncPendingChanges] İşleniyor:', (change as any).id, (change as any).type);
    if (
      typeof change === 'object' &&
      change !== null &&
      'id' in change &&
      'type' in change &&
      'data' in change
    ) {
      console.log(`[syncPendingChanges] Değişiklik: id=${change.id}, type=${change.type}`);
      try {
        if ((change as any).type === 'create') {
          console.log(`[syncPendingChanges] CREATE başlatıldı: id=${change.id}`);
          try {
            let dataToSend = (typeof (change as any).data === 'string') ? JSON.parse((change as any).data) : (change as any).data;
            // ...existing code...
            const serverResult = await createCampingAreaOnServer(dataToSend);
            // ...existing code...
            const newId = serverResult?.id;
            const newUuid = serverResult?.uuid || (change as any).data.uuid;
            const newExternalId = serverResult?.external_id;
            if (newId && newUuid) {
              try {
                const db = getDatabase();
                await db.updateCampingAreaIdByUuid(newUuid, newId, newExternalId || undefined);
                console.log(`[syncPendingChanges] CREATE: local id=${newId}, external_id=${newExternalId} güncellendi.`);
              } catch (e) {
                console.warn('[syncPendingChanges] CREATE: id/external_id güncellenemedi:', e);
              }
            }
            await markChangeAsSynced((change as any).id);
            syncedCount++;
          } catch (createErr) {
            console.log(`[syncPendingChanges] CREATE hata: id=${change.id}`, createErr);
            await markChangeAsError((change as any).id);
          }
        } else if ((change as any).type === 'delete') {
          console.log(`[syncPendingChanges] DELETE başlatıldı: id=${change.id}`);
          try {
            // Topluluk üyesi silme işlemi mi?
            if ((change as any).data?.entity === 'community_member') {
              const { communityId, userId, url } = (change as any).data;
              console.log(`[syncPendingChanges] Topluluk üyesi silme: communityId=${communityId}, userId=${userId}, url=${url}`);
              const token = await getToken();
              const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.status === 204) {
                console.log('[syncPendingChanges] Topluluk üyesi başarıyla sunucudan silindi.');
                await markChangeAsSynced((change as any).id);
                syncedCount++;
              } else {
                let errText = '';
                try { errText = await res.text(); } catch {}
                console.log('[syncPendingChanges] Topluluk üyesi silme başarısız:', res.status, errText);
                await markChangeAsError((change as any).id);
              }
              return;
            }
            // ...kamp alanı silme işlemi (mevcut kod)...
            let localId = (change as any).data?.id;
            let externalId = (change as any).data?.external_id;
            if (!localId && typeof (change as any).data === 'string') {
              try {
                const parsed = JSON.parse((change as any).data);
                localId = parsed.id;
                externalId = parsed.external_id;
              } catch (e) {}
            }
            if (localId && currentUserId !== undefined && currentUserId !== null) {
              let ownerIdFromPending = (change as any).data?.owner_id;
              if (!ownerIdFromPending && typeof (change as any).data === 'string') {
                try {
                  const parsed = JSON.parse((change as any).data);
                  ownerIdFromPending = parsed.owner_id;
                } catch {}
              }
              if (ownerIdFromPending) {
                  if (String(ownerIdFromPending) !== String(currentUserId)) {
                    await markChangeAsError((change as any).id);
                    continue;
                  }
                } else {
                  const db = getDatabase();
                  const allAreas = await db.getAllCampingAreas();
                  const found = allAreas.find(area => String((area as any).id) === String(localId));
                  if (found && (found as any).owner_id && String((found as any).owner_id) !== String(currentUserId)) {
                    await markChangeAsError((change as any).id);
                    continue;
                  }
                  if (found && !externalId) {
                    externalId = (found as any).external_id;
                  }
                }
            }
            // external_id geçerli mi? Sadece numeric ise (lokal id ile aynı) by=external_id kullanma
            const hasValidExternalId =
              !!externalId &&
              isNaN(Number(externalId)) &&
              String(externalId) !== String(localId);

            let deleteKey: string | number;
            let by: 'external_id' | 'id';

            if (hasValidExternalId) {
              deleteKey = externalId;
              by = 'external_id';
            } else {
              // owner_id varsa user_{owner_id}_{localId} formatini dene
              const ownerIdForKey = (change as any).data?.owner_id;
              if (ownerIdForKey && localId) {
                deleteKey = `user_${ownerIdForKey}_${localId}`;
                by = 'external_id';
                console.log(`[syncPendingChanges] DELETE: external_id yeniden oluşturuldu: ${deleteKey}`);
              } else {
                deleteKey = localId;
                by = 'id';
              }
            }
            console.log(`[syncPendingChanges] DELETE: deleteKey=${deleteKey}, by=${by}, raw externalId=${externalId}`);
            if (!deleteKey) {
              await markChangeAsError((change as any).id);
              return;
            }
            const result = await deleteCampingAreaOnServer(deleteKey, by);
            await markChangeAsSynced((change as any).id);
            syncedCount++;
          } catch (deleteErr) {
            console.log(`[syncPendingChanges] DELETE hata: id=${change.id}`, deleteErr);
            await markChangeAsError((change as any).id);
          }
        }
        else if ((change as any).type === 'update') {
          console.log(`[syncPendingChanges] UPDATE başlatıldı: id=${change.id}`);
          try {
            let updateData = (change as any).data;
            if (typeof updateData === 'string') {
              try {
                updateData = JSON.parse(updateData);
              } catch (e) {
                throw new Error('Güncelleme datası JSON parse edilemedi!');
              }
            }
            let updateId = updateData?.external_id || updateData?.id;
            // Önce: pending change'in campground_id'siyle local DB'den güncel external_id'yi bul.
            // Bu, offline eklenen bir alan senkronize edildiğinde localId sunucu ID'sine
            // güncellenebileceğinden updateData.external_id'nin eskimiş/yanlış olabileceği
            // durumu düzeltiyor.
            const campgroundIdInChange = (change as any).campground_id;
            if (campgroundIdInChange) {
              try {
                const db = getDatabase();
                const allAreas = await db.getAllCampingAreas();
                const foundByCampId = allAreas.find(area =>
                  String((area as any).id) === String(campgroundIdInChange)
                );
                if (foundByCampId?.external_id) {
                  const extId = foundByCampId.external_id;
                  // Sayısal external_id (örn. "2081") geçerli format değil — source_id=0
                  // alanlarda user_{ownerId}_{id} formatı üret
                  const isNumericExtId = !isNaN(Number(extId));
                  const ownerIdForUpdate = updateData?.owner_id || (foundByCampId as any).owner_id;
                  const resolvedForUpdate =
                    isNumericExtId && ownerIdForUpdate
                      ? `user_${ownerIdForUpdate}_${extId}`
                      : extId;
                  updateId = resolvedForUpdate;
                  updateData = { ...updateData, external_id: resolvedForUpdate };
                  console.log(`[syncPendingChanges] UPDATE: campground_id=${campgroundIdInChange} üzerinden external_id düzeltildi: ${updateId}`);
                } else if (updateId) {
                  // campground_id ile bulunamazsa external_id string ile ara (sayısal olmayan)
                  const foundByExtId = isNaN(Number(updateId))
                    ? allAreas.find(area => (area as any).external_id === updateId)
                    : allAreas.find(area => String((area as any).id) === String(updateId));
                  if (foundByExtId?.external_id) {
                    updateId = foundByExtId.external_id;
                    updateData = { ...updateData, external_id: foundByExtId.external_id };
                  }
                }
              } catch (lookupErr) {
                console.warn('[syncPendingChanges] UPDATE: local DB external_id araması başarısız:', lookupErr);
              }
            }
            if (!updateId) throw new Error('Güncellenecek kaydın id/external_id alanı yok!');
            // Token kontrolü
            const token = await getToken();
            if (!token) {
              console.error('[SYNC][UPDATE] Token alınamadı! Güncelleme işlemi başlatılmayacak. updateId:', updateId);
              await markChangeAsError((change as any).id);
              continue;
            }
            // ...existing code...
            const result = await updateCampingAreaOnServer(updateId, updateData);
            // ...existing code...
            // Sunucu yanıtında gerçekten güncelleme oldu mu kontrol et
            // updated, updatedRows, affected, success gibi bir alan beklenir
            const updated = (
              typeof result === 'object' && result !== null && (
                result.updated === true ||
                result.updatedRows > 0 ||
                result.affected > 0 ||
                result.success === true ||
                result.status === 'ok' ||
                result.status === 'success'
              )
            );
            if (updated) {
              await markChangeAsSynced((change as any).id);
              syncedCount++;
            } else {
              // ...existing code...
              await markChangeAsError((change as any).id);
            }
          } catch (updateErr) {
            console.log(`[syncPendingChanges] UPDATE hata: id=${change.id}`, updateErr);
            await markChangeAsError((change as any).id);
          }
        }
      } catch (err) {
        console.log(`[syncPendingChanges] Genel hata: id=${change.id}`, err);
        await markChangeAsError((change as any).id);
      }
    }
    console.log('[syncPendingChanges] Döngü sonu:', (change as any).id);
  }
  
  if (syncedCount > 0 && !options?.skipDeltaSync) {
    try {
      // Sync sonrası local veritabanını güncelle (Delta Sync ile sadece değişenleri çek)
      // NOT: syncAll üzerinden çağrıldığında skipDeltaSync=true olur, çünkü syncAll zaten syncCampingAreas çağırır
      console.log('[syncPendingChanges] Tüm değişiklikler işlendi, local veritabanı güncelleniyor...');
      const db = getDatabase();
      await db.fetchAndStoreCampingAreasFromAPI(undefined, { forceFull: false, onProgress, userId: currentUserId !== undefined ? String(currentUserId) : undefined });
      if (currentUserId) {
        await db.cleanupRevokedFriendAreas(String(currentUserId));
      }
      console.log('[syncPendingChanges] tamamlandı.');
    } catch (e) {
      console.log('[syncPendingChanges] SONDA HATA:', e);
      throw e;
    }
  }
  } // pending.length > 0 bloğunun sonu
  
  // Pending değişiklik olmadığında gereksiz Delta Sync yapma
  // Delta Sync zaten uygun yerlerde (uygulama başlangıcı, manuel yenileme vs.) çağrılıyor
  if (pending.length === 0) {
    console.log('[syncPendingChanges] Pending değişiklik yok, Delta Sync atlandı.');
  }
}
