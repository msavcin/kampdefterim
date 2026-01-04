// pendingChanges.ts
// Offline senkronizasyon için değişiklik kuyruğu yönetimi
import { getDatabase } from '@/lib/database';

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
