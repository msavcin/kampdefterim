// pendingChanges.ts
// Offline senkronizasyon için değişiklik kuyruğu yönetimi
import { getDatabase } from '@/lib/database';
import { getDeviceId } from '@/lib/deviceId';
import { generateUUID } from '@/lib/uuid';

export type PendingChangeType = 'create' | 'update' | 'delete';

export interface PendingChange {
  id?: number;
  type: PendingChangeType;
  campground_id?: string;
  data: any;
  created_at: string;
  status: 'pending' | 'synced' | 'error';
}

export async function addPendingChange(change: { type: PendingChangeType; campground_id?: string | null; data: any }) {
  const db = getDatabase();

  // If this is a CREATE and external_id is missing, generate a device-scoped external_id
  if (change.type === 'create') {
    try {
      const dataObj = typeof change.data === 'string' ? JSON.parse(change.data) : change.data;
      if (!dataObj.external_id) {
        try {
          const deviceId = await getDeviceId();
          const ext = `${deviceId}:${generateUUID()}`;
          dataObj.external_id = ext;
        } catch (e) {
          // Fallback: if device id retrieval failed, try to keep existing patterns
          dataObj.external_id = dataObj.external_id || undefined;
        }
      }
      // Ensure change.data uses the possibly-updated object
      change.data = dataObj;

      // If we have a local campground id, also write the external_id into local DB for consistency
      if (change.campground_id) {
        const localId = Number(change.campground_id);
        if (!isNaN(localId) && dataObj.external_id) {
          try {
            await db.updateCampingAreaExternalIdByLocalId(localId, dataObj.external_id);
          } catch (e) {
            console.warn('[pendingChanges] local external_id güncellenemedi:', e);
          }
        }
      }
    } catch (e) {
      // If parsing/updating fails, continue and insert the original change
      console.warn('[pendingChanges] addPendingChange create-side processing failed:', e);
    }
  }

  await db.insertPendingChange(change.type, change.campground_id ?? null, change.data);
}

export async function getPendingChanges() {
  const db = getDatabase();
  return db.getPendingChanges();
}

export async function markChangeAsSynced(id: number) {
  const db = getDatabase();
  await db.markPendingChangeSynced(id);
}

export async function markChangeAsError(id: number) {
  const db = getDatabase();
  await db.markPendingChangeError(id);
}
