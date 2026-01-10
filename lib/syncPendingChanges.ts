// syncPendingChanges.ts
import { getPendingChanges, markChangeAsSynced, markChangeAsError } from '@/lib/pendingChanges';
import { Alert } from 'react-native';
import { getToken } from '@/lib/auth';
import { createCampingAreaOnServer, deleteCampingAreaOnServer, updateCampingAreaOnServer } from '@/lib/campingAreaApi';
import { Platform } from 'react-native';
import { getDatabase } from '@/lib/database';

// currentUserId parametresi eklendi
export async function syncPendingChanges(currentUserId?: string | number) {
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
            if (newId && newUuid) {
              try {
                const db = getDatabase();
                await db.updateCampingAreaIdByUuid(newUuid, newId);
                // ...existing code...
              } catch (e) {
                // ...existing code...
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
            let deleteKey = externalId || localId;
            let by: 'external_id' | 'id' = externalId ? 'external_id' : 'id';
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
            // Local id'den external_id'yi bul
            if (updateId) {
              const db = getDatabase();
              const allAreas = await db.getAllCampingAreas();
              const found = allAreas.find(area => (area as any).id === updateId || String((area as any).id) === String(updateId));
              if (found?.external_id) {
                updateId = found.external_id;
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
  
  if (syncedCount > 0) {
    try {
      // Sync sonrası local veritabanını güncelle (Delta Sync ile sadece değişenleri çek)
      console.log('[syncPendingChanges] Tüm değişiklikler işlendi, local veritabanı güncelleniyor...');
      await getDatabase().fetchAndStoreCampingAreasFromAPI(undefined, { forceFull: false });
      console.log('[syncPendingChanges] tamamlandı.');
    } catch (e) {
      console.log('[syncPendingChanges] SONDA HATA:', e);
      throw e;
    }
  }
  } // pending.length > 0 bloğunun sonu
  
  // Her durumda Delta Sync çağrısı (pending değişiklik olmasa da)
  try {
    console.log('[syncPendingChanges] Local değişiklik olmasa da Delta Sync başlatılıyor...');
    await getDatabase().fetchAndStoreCampingAreasFromAPI(undefined, { forceFull: false });
    console.log('[syncPendingChanges] Delta Sync tamamlandı.');
  } catch (e) {
    console.log('[syncPendingChanges] Delta Sync HATASI:', e);
    throw e;
  }
}
