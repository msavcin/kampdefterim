/**
 * offlineChatQueue.ts
 * Çevrimdışı gönderilen mesajları SQLite'ta saklar.
 * İnternet gelince syncPendingToServer() ile sunucuya iletilir.
 */
import * as SQLite from 'expo-sqlite';
import { generateUUID } from './uuid';

export interface OfflineQueueMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  recipientId?: number | string | null;
  text: string;
  timestamp: number;
  /** 0 = bekliyor, 1 = sunucuya iletildi */
  synced: number;
  /** 0 = iletilmedi, 1 = en az bir peer'a iletildi */
  peerDelivered: number;
}

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('offline_chat.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_messages (
      id            TEXT    PRIMARY KEY,
      conversationId TEXT   NOT NULL,
      senderId      TEXT    NOT NULL,
      senderName    TEXT    NOT NULL,
      text          TEXT    NOT NULL,
      timestamp     INTEGER NOT NULL,
      synced        INTEGER NOT NULL DEFAULT 0,
      peerDelivered INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_offline_conv ON offline_messages(conversationId);
    CREATE INDEX IF NOT EXISTS idx_offline_synced ON offline_messages(synced);
  `);
  // Migration: mevcut veritabanlarına recipient_id kolonu ekle (yoksa)
  try {
    await _db.execAsync('ALTER TABLE offline_messages ADD COLUMN recipientId INTEGER');
  } catch { /* kolon zaten varsa hata fırlatır — yoksay */ }
  return _db;
}

/** Yeni bir offline mesajı kuyruğa ekle. Oluşturulan id'yi döner. */
export async function enqueueMessage(
  msg: Omit<OfflineQueueMessage, 'id' | 'synced' | 'peerDelivered'>,
): Promise<string> {
  const db = await getDb();
  const id = generateUUID();
  const recipientId = msg.recipientId != null ? Number(msg.recipientId) : null;
  await db.runAsync(
    `INSERT OR IGNORE INTO offline_messages
       (id, conversationId, senderId, senderName, text, timestamp, synced, peerDelivered, recipientId)
     VALUES (?,?,?,?,?,?,0,0,?)`,
    [id, msg.conversationId, msg.senderId, msg.senderName, msg.text, msg.timestamp, recipientId],
  );
  return id;
}

/** Henüz sunucuya iletilmemiş mesajları döner (en eskiden yeniye). */
export async function getPendingMessages(): Promise<OfflineQueueMessage[]> {
  const db = await getDb();
  return db.getAllAsync<OfflineQueueMessage>(
    'SELECT * FROM offline_messages WHERE synced = 0 ORDER BY timestamp ASC',
  );
}

/** Konuşmaya ait tüm offline mesajları döner (en yeniden eskiye). 
 * NOT: Sadece henüz senkronize edilmemiş (synced = 0) mesajlar döndürülür.
 * Senkronize edilen mesajlar artık sunucuda olduğu için tekrar gösterilmesine gerek yoktur.
 */
export async function getLocalMessages(conversationId: string): Promise<OfflineQueueMessage[]> {
  const db = await getDb();
  return db.getAllAsync<OfflineQueueMessage>(
    'SELECT * FROM offline_messages WHERE conversationId = ? AND synced = 0 ORDER BY timestamp DESC',
    [conversationId],
  );
}

/** Mesaj sunucuya iletildi olarak işaretle. */
export async function markMessageSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE offline_messages SET synced = 1 WHERE id = ?', [id]);
}

/** Mesaj en az bir peer'a iletildi olarak işaretle. */
export async function markPeerDelivered(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE offline_messages SET peerDelivered = 1 WHERE id = ?', [id]);
}

/** Sunucuya senkronize edilen mesajları sil (artık gerek yok). */
export async function deleteSyncedMessages(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM offline_messages WHERE synced = 1');
}

/** Belirli bir mesajı sil. */
export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM offline_messages WHERE id = ?', [id]);
}

/** Konuşmaya ait tüm offline mesajları temizle (senkronizasyon sonrası). */
export async function clearConversationMessages(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM offline_messages WHERE conversationId = ? AND synced = 1', [conversationId]);
}
