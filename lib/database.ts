import { API_URL } from './config';
import { apiFetch } from './apiFetch';
import { getToken } from './auth';
import { generateUUID } from './uuid';
import { getLastCampingAreaSync, setLastCampingAreaSync } from './deltaSyncStorage';
import * as SQLite from 'expo-sqlite';

import type { CampingTypeId } from './categories';

export interface CampingArea {
  id?: number;
  type: CampingTypeId;
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
  website?: string;
  phone?: string;
  opening_hours?: string | any[];
  capacity?: number;
  fee: boolean | null;
  status: string;
  rating?: number;
  review_count?: number;
  price_range?: string;
  facilities?: string[];
  accessibility?: string[];
  social_media?: Record<string, string>;
  booking_url?: string;
  contact_email?: string;
  last_verified?: string;
  visibility?: string;
  owner_id?: string;
  owner_username?: string;
  community_id?: string | number;
  created_at: string;
  updated_at: string;
  uuid?: string; // Local ve sunucu eşleştirme için
  external_id?: string;
  source_id?: string;
  photo_links?: string[];
  amenities?: string[];
  tags?: Record<string, any>;
  images?: string[];
  distance_km?: number;
  friend_user_ids?: string[];
}

export interface Favorite {
  id: number;
  camping_area_id: number;
  created_at: string;
}

export class DatabaseManager {
    // Singleton instance
    private static instance: DatabaseManager | null = null;
    private initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
    
    // Singleton getter
    static getInstance(): DatabaseManager {
      if (!DatabaseManager.instance) {
        DatabaseManager.instance = new DatabaseManager();
      }
      return DatabaseManager.instance;
    }
    
    // Tüm tabloları drop eden yardımcı fonksiyon (public)
    async dropAllTables() {
      if (!this.db) await this.init();
      const dropQueries = [
        'DROP TABLE IF EXISTS announcements;',
        'DROP TABLE IF EXISTS camping_areas;',
        'DROP TABLE IF EXISTS friends;',
        'DROP TABLE IF EXISTS checklist;',
        'DROP TABLE IF EXISTS images;',
        'DROP TABLE IF EXISTS pending_changes;',
        'DROP TABLE IF EXISTS categories;',
        'DROP TABLE IF EXISTS user_membership;', // ihtiyaca göre ekleyin
      ];
      for (const q of dropQueries) {
        try {
          await this.db!.runAsync(q);
        } catch (err) {
          console.warn('[DB][dropAllTables] Drop error:', err);
        }
      }
      console.log('[DB][dropAllTables] Tüm tablolar drop edildi.');
    }
  // Tüm kamp alanlarını döndürür
  async listCampingAreas() {
    if (!this.db) await this.init();
    const rows = await this.db!.getAllAsync('SELECT * FROM camping_areas WHERE deleted = 0 ORDER BY name ASC');
    return rows;
  }


  async getCampingAreaById(id: number): Promise<CampingArea | null> {
    if (!this.db) await this.init();
    const row = await this.db!.getFirstAsync('SELECT * FROM camping_areas WHERE id = ?', [id]);
    if (!row) return null;
    const r = row as any;
    const obj: any = { ...r };
    try { obj.amenities = typeof r.amenities === 'string' ? JSON.parse(r.amenities || '[]') : r.amenities; } catch { obj.amenities = []; }
    try { obj.tags = typeof r.tags === 'string' ? JSON.parse(r.tags || '{}') : r.tags; } catch { obj.tags = {}; }
    try { obj.images = typeof r.images === 'string' ? JSON.parse(r.images || '[]') : (r.images || []); } catch { obj.images = []; }
    try { obj.facilities = typeof r.facilities === 'string' ? JSON.parse(r.facilities || '[]') : (r.facilities || []); } catch { obj.facilities = []; }
    try { obj.accessibility = typeof r.accessibility === 'string' ? JSON.parse(r.accessibility || '[]') : (r.accessibility || []); } catch { obj.accessibility = []; }
    try { obj.social_media = typeof r.social_media === 'string' ? JSON.parse(r.social_media || '{}') : (r.social_media || {}); } catch { obj.social_media = {}; }
    try { obj.photo_links = typeof r.photo_links === 'string' ? JSON.parse(r.photo_links || '[]') : (r.photo_links || []); } catch { obj.photo_links = []; }
    try { obj.friend_user_ids = typeof r.friend_user_ids === 'string' ? JSON.parse(r.friend_user_ids || '[]') : r.friend_user_ids; } catch { obj.friend_user_ids = []; }
    
    console.log('[DB][getCampingAreaById] Raw opening_hours from database:', r.opening_hours, typeof r.opening_hours);
    try { 
      if (typeof r.opening_hours === 'string' && r.opening_hours.trim().length > 0 && (r.opening_hours.trim().startsWith('{') || r.opening_hours.trim().startsWith('['))) {
        obj.opening_hours = JSON.parse(r.opening_hours);
        console.log('[DB][getCampingAreaById] Parsed opening_hours:', obj.opening_hours);
      } else {
        obj.opening_hours = r.opening_hours;
        console.log('[DB][getCampingAreaById] Using raw opening_hours (not JSON):', obj.opening_hours);
      }
    } catch (err) { 
      console.error('[DB][getCampingAreaById] Parse error:', err, 'Raw value:', r.opening_hours);
      obj.opening_hours = r.opening_hours; 
    }
    obj.owner_id = r.owner_id !== undefined && r.owner_id !== null ? String(r.owner_id) : '';
    obj.fee = r.fee === null ? null : Boolean(r.fee);
    obj.owner_username = r.owner_username ?? '';
    return obj as CampingArea;
  }
  // Lokal veritabanı dosyasını sil (tamamen sıfırlar)
  async deleteDatabaseFile() {
    // expo-file-system ile dosya sil
    try {
      const FileSystem = require('expo-file-system');
      const dbPath = FileSystem.documentDirectory + 'SQLite/camping_areas.db';
      // Eğer dosya varsa sil
      const info = await FileSystem.getInfoAsync(dbPath);
      if (info.exists) {
        await FileSystem.deleteAsync(dbPath, { idempotent: true });
        this.db = null;
        return true;
      }
      return false;
    } catch (e) {
      console.error('Veritabanı silme hatası:', e);
      return false;
    }
  }
  /**
   * Kamp alanı için local soft delete: deleted=1, status='deleted', updated_at güncelle
   */
  async deleteCampingAreaLocal(id: number) {
    if (!this.db) await this.init();
    const now = new Date().toISOString();
    return this.db!.runAsync(
      `UPDATE camping_areas SET deleted = 1, status = 'deleted', updated_at = ? WHERE id = ?`,
      [now, id]
    );
  }
  /**
   * Duyurular için offline ekleme: Hem local tabloya ekler hem pending_changes'a yazar
   */
  async insertAnnouncementOffline(announcement: any) {
  // ...existing code...
    await this.insertAnnouncement({ ...announcement, synced: 0 });
  await this.insertAnnouncementPendingChange('announcement_create', announcement.id ? String(announcement.id) : null, announcement);
  // ...existing code...
  }

  /**
   * Duyurular için offline güncelleme: Hem local tabloyu günceller hem pending_changes'a yazar
   */
  async updateAnnouncementOffline(id: number, updates: any) {
  // ...existing code...
    await this.updateAnnouncementLocal(id, { ...updates, synced: 0 });
  await this.insertAnnouncementPendingChange('announcement_update', String(id), updates);
  // ...existing code...
  }

  /**
   * Duyurular için offline silme: Hem local tabloyu soft delete yapar hem pending_changes'a yazar
   */
  async deleteAnnouncementOffline(id: number) {
  // ...existing code...
    await this.deleteAnnouncementLocal(id);
  await this.insertAnnouncementPendingChange('announcement_delete', String(id), { id });
  // ...existing code...
  }

  /**
   * Duyurular için tam senkronizasyon: pending_changes kuyruğunu sunucuya gönderir, ardından sunucudan güncel duyuruları çeker ve local ile eşitler.
   * @param apiUrl API endpointi (varsayılan: /node/announcements/)
   */
  async syncAnnouncements(apiUrl: string = API_URL + '/announcements/') {
  // ...existing code...
    if (!this.db) await this.init();
    const changes = await this.getPendingChanges();
    let foundAnnouncementPending = false;
    for (const ch of changes) {
      const change = ch as any;
      // Sadece announcement tipindeki pending_changes kayıtlarını işle
      if (!['announcement_create', 'announcement_update', 'announcement_delete'].includes(change.type)) {
        continue;
      }
      try {
        const data = JSON.parse(change.data || '{}');
        foundAnnouncementPending = true;
        let response;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (change.type === 'announcement_create') {
          // ...existing code...
          response = await apiFetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(data) });
        } else if (change.type === 'announcement_update') {
          // Query string varsa at, sadece ana endpoint + /id kullan
          const baseUrl = apiUrl.split('?')[0].replace(/\/?$/, '/');
          const url = baseUrl + (data.id || '');
          // ...existing code...
          response = await apiFetch(url, { method: 'PUT', headers, body: JSON.stringify(data) });
        } else if (change.type === 'announcement_delete') {
          const baseUrl = apiUrl.split('?')[0].replace(/\/?$/, '/');
          const url = baseUrl + (data.id || '');
          // ...existing code...
          response = await apiFetch(url, { method: 'DELETE', headers });
        }
        if (response) {
          let respText = '';
          let status = response.status;
          try { respText = await response.text(); } catch {}
    // ...existing code...
        }
        if (response && response.ok) {
          await this.markPendingChangeSynced(change.id);
          // ...existing code...
        } else {
          await this.markPendingChangeError(change.id);
          let errorText = '';
          try { errorText = await response.text(); } catch {}
          console.warn('[ANNOUNCEMENT][SYNC][PENDING] Hata, senkronize edilemedi:', change.id, { status: response?.status, errorText });
        }
      } catch (err) {
        console.error('Duyuru pending change işleme hatası:', err, change);
        await this.markPendingChangeError(change.id);
      }
    }
    if (!foundAnnouncementPending) {
  // ...existing code...
    }
  // ...existing code...
    await this.fetchAndStoreAnnouncementsFromAPI(apiUrl);
  // ...existing code...
  }
  // --- ANNOUNCEMENTS SYNC ---
  /**
   * Sunucudan duyuruları çekip local veritabanına kaydeder. (Delta Sync destekli)
   * @param apiUrl API endpointi (varsayılan: /node/announcements/)
   * @param useDeltaSync Delta sync kullanılsın mı (varsayılan: true)
   * @returns Eklenen/güncellenen duyuru sayısı
   */
  async fetchAndStoreAnnouncementsFromAPI(apiUrl: string = API_URL + '/announcements/', useDeltaSync: boolean = true) {
    return DatabaseManager.enqueue(async () => {
      try {
        const headers: Record<string, string> = {};
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Delta sync: Son sync zamanını al
        let lastSync: string | null = null;
        if (useDeltaSync) {
          const { getLastAnnouncementSync } = await import('./deltaSyncStorage');
          lastSync = await getLastAnnouncementSync();
        }

        // URL'yi parametrelerle hazırla
        let finalUrl = apiUrl;
        const params = new URLSearchParams();
        
        if (lastSync) {
          params.append('updated_after', lastSync);
          params.append('include_deleted', 'true'); // Silinenleri de çek
          console.log('[ANNOUNCEMENT][DELTA-SYNC] Son sync zamanı:', lastSync);
        }

        if (params.toString()) {
          finalUrl += (finalUrl.includes('?') ? '&' : '?') + params.toString();
        }

        console.log('[ANNOUNCEMENT][DELTA-SYNC] ===== SYNC BAŞLADI =====');
        console.log('[ANNOUNCEMENT][DELTA-SYNC] Request URL:', finalUrl);
        
        const response = await apiFetch(finalUrl, { headers });
        if (!response.ok) throw new Error('API yanıtı başarısız: ' + response.status);
        const data = await response.json();
        
        if (!Array.isArray(data)) throw new Error('API beklenen formatta veri döndürmedi');

        console.log('[ANNOUNCEMENT][DELTA-SYNC] API\'den gelen toplam kayıt sayısı:', data.length);

        let insertCount = 0;
        let deleteCount = 0;
        if (!this.db) await this.init();

        // Transaction başlat - tüm operasyonları toplu yap
        await this.db!.execAsync('BEGIN TRANSACTION');
        
        try {
          // Önce silinecekleri topla
          const toDelete: number[] = [];
          const toUpsert: any[] = [];
          
          for (const item of data) {
            const isDeleted = item.deleted === true || item.deleted === 1 || item.deleted === '1';
            const isInactive = item.aktif === false || item.aktif === 0 || item.aktif === '0' || item.aktif === null;
            
            if (isDeleted || isInactive) {
              toDelete.push(item.id);
            } else {
              toUpsert.push(item);
            }
          }
          
          // Batch delete - tek sorguda tüm silmeleri yap
          if (toDelete.length > 0) {
            const placeholders = toDelete.map(() => '?').join(',');
            await this.db!.runAsync(
              `DELETE FROM announcements WHERE id IN (${placeholders})`,
              toDelete
            );
            deleteCount = toDelete.length;
            if (__DEV__) console.log('[ANNOUNCEMENT][DELTA-SYNC] Toplu silme:', deleteCount, 'duyuru');
          }
          
          // Batch upsert
          for (const item of toUpsert) {
            const keywordsStr = Array.isArray(item.keywords) ? JSON.stringify(item.keywords) : (item.keywords ?? '');
            const aktifValue = (typeof item.aktif === 'boolean') ? (item.aktif ? 1 : 0) : (item.aktif === undefined ? 1 : Number(item.aktif));
            
            // Görselleri normalize et
            let photoData: string[] = [];
            const photoSources = [item.event_photos, item.images, item.photo_links];
            
            for (const source of photoSources) {
              if (!source) continue;
              
              if (Array.isArray(source)) {
                photoData = source.filter((p: any) => typeof p === 'string' && p.trim() !== '');
                if (photoData.length > 0) break;
              } else if (typeof source === 'string' && source.trim() !== '' && source !== '[]') {
                try {
                  const parsed = JSON.parse(source);
                  if (Array.isArray(parsed)) {
                    photoData = parsed.filter((p: any) => typeof p === 'string' && p.trim() !== '');
                    if (photoData.length > 0) break;
                  }
                } catch (e) {
                  // JSON parse hatası, devam et
                }
              }
            }
            
            const photoString = photoData.length > 0 ? JSON.stringify(photoData) : '';
            
            // Orijinal alanları da sakla (backward compatibility için)
            const imagesStr = item.images ? (Array.isArray(item.images) ? JSON.stringify(item.images) : item.images) : '';
            const photoLinksStr = item.photo_links ? (Array.isArray(item.photo_links) ? JSON.stringify(item.photo_links) : item.photo_links) : '';
            
            await this.db!.runAsync(
              `INSERT OR REPLACE INTO announcements (id, community_id, title, message, created_by, created_at, valilik_id, keywords, source_url, islenme_tarihi, link, date, updated_at, status, synced, deleted, aktif, baslama_zamani, bitis_zamani, event_photos, images, photo_links, etkinlik_turu, zorluk_seviyesi, etkinlik_tarihi, etkinlik_suresi, etkinlik_yeri, etkinlik_yeri_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id ?? null,
                item.community_id ?? null,
                item.title ?? '',
                item.message ?? '',
                item.created_by ?? null,
                item.created_at ?? '',
                item.valilik_id ?? null,
                keywordsStr,
                item.source_url ?? '',
                item.islenme_tarihi ?? '',
                item.link ?? '',
                item.date ?? '',
                item.updated_at ?? item.created_at ?? '',
                item.status ?? 'active',
                aktifValue,
                item.baslama_zamani ?? '',
                item.bitis_zamani ?? '',
                photoString,
                imagesStr,
                photoLinksStr,
                item.etkinlik_turu ?? '',
                item.zorluk_seviyesi ?? '',
                item.etkinlik_tarihi ?? '',
                item.etkinlik_suresi ?? '',
                item.etkinlik_yeri ?? '',
                item.etkinlik_yeri_id ?? null
              ]
            );
            insertCount++;
          }
          
          // Transaction commit
          await this.db!.execAsync('COMMIT');
        } catch (err) {
          // Hata olursa rollback
          await this.db!.execAsync('ROLLBACK');
          console.error('[ANNOUNCEMENT][DELTA-SYNC] Transaction hatası, rollback yapıldı:', err);
          throw err;
        }

        // Sync zamanını güncelle
        if (useDeltaSync) {
          const { setLastAnnouncementSync } = await import('./deltaSyncStorage');
          const now = new Date().toISOString();
          await setLastAnnouncementSync(now);
          console.log('[ANNOUNCEMENT][DELTA-SYNC] Yeni sync zamanı kaydedildi:', now);
        }

        console.log(`[ANNOUNCEMENT][DELTA-SYNC] ${insertCount} eklendi/güncellendi, ${deleteCount} silindi`);
        
        // Delta sync'te silinen kayıtları kontrol et
        // API deleted: true ile işaretlenmiş kayıtları döndürmüyorsa, bu kontrol gerekli
        if (lastSync && data.length > 0) {
          console.log('[ANNOUNCEMENT][DELTA-SYNC] Delta Sync - silinen kayıtlar kontrol ediliyor...');
          
          // API'den gelen güncellenmiş kayıtların ID'leri
          const updatedIds = new Set<number>();
          for (const item of data) {
            if (item.id) {
              updatedIds.add(Number(item.id));
            }
          }
          
          // Son sync zamanından sonra güncellenen local kayıtları al
          const localUpdated = await this.db!.getAllAsync(
            'SELECT id FROM announcements WHERE updated_at >= ?',
            [lastSync]
          ) as { id: number }[];
          
          // Local'de güncellenmişçe gözüken ama API'den gelmeyen kayıtlar silinmiş demektir
          let removedCount = 0;
          for (const local of localUpdated) {
            if (!updatedIds.has(local.id)) {
              // Bu kayıt API'den gelmedi, silinmiş olabilir
              await this.db!.runAsync('DELETE FROM announcements WHERE id = ?', [local.id]);
              removedCount++;
              console.log('[ANNOUNCEMENT][DELTA-SYNC] Sunucuda silinmiş kayıt local\'den kaldırıldı: id=', local.id);
            }
          }
          
          if (removedCount > 0) {
            deleteCount += removedCount;
            console.log(`[ANNOUNCEMENT][DELTA-SYNC] ${removedCount} sunucuda silinmiş kayıt local'den kaldırıldı.`);
          }
        }
        
        // Periyodik Full ID Check: Her 10 delta sync'de bir sunucudan tüm ID'leri al ve local'i temizle
        if (lastSync) {
          const { incrementAnnouncementSyncCounter } = await import('./deltaSyncStorage');
          const needsFullCheck = await incrementAnnouncementSyncCounter();
          
          if (needsFullCheck) {
            console.log('[ANNOUNCEMENT][FULL-CHECK] ===== PERİYODİK FULL CHECK BAŞLADI =====');
            
            try {
              // Sunucudan sadece ID'leri çek (hafif istek)
              const idCheckUrl = API_URL + '/announcements/?fields=id';
              const idResponse = await apiFetch(idCheckUrl, { headers });
              
              if (idResponse.ok) {
                const allServerData = await idResponse.json();
                
                if (Array.isArray(allServerData)) {
                  const serverIds = new Set<number>();
                  for (const item of allServerData) {
                    if (item.id) {
                      serverIds.add(Number(item.id));
                    }
                  }
                  
                  console.log(`[ANNOUNCEMENT][FULL-CHECK] Sunucuda ${serverIds.size} duyuru var`);
                  
                  // Local'deki tüm ID'leri al
                  const localAnnouncements = await this.db!.getAllAsync('SELECT id FROM announcements') as { id: number }[];
                  console.log(`[ANNOUNCEMENT][FULL-CHECK] Local'de ${localAnnouncements.length} duyuru var`);
                  
                  // Sunucuda olmayan local kayıtları sil
                  let cleanedCount = 0;
                  for (const local of localAnnouncements) {
                    if (!serverIds.has(local.id)) {
                      await this.db!.runAsync('DELETE FROM announcements WHERE id = ?', [local.id]);
                      cleanedCount++;
                      if (__DEV__) console.log('[ANNOUNCEMENT][FULL-CHECK] Sunucuda olmayan kayıt silindi: id=', local.id);
                    }
                  }
                  
                  if (cleanedCount > 0) {
                    deleteCount += cleanedCount;
                    console.log(`[ANNOUNCEMENT][FULL-CHECK] ✅ ${cleanedCount} eski kayıt temizlendi`);
                  } else {
                    console.log('[ANNOUNCEMENT][FULL-CHECK] ✅ Temizlenecek kayıt yok, local DB senkron');
                  }
                } else {
                  console.warn('[ANNOUNCEMENT][FULL-CHECK] ⚠️ API beklenen formatta veri döndürmedi');
                }
              } else {
                console.warn('[ANNOUNCEMENT][FULL-CHECK] ⚠️ ID check API hatası:', idResponse.status);
              }
            } catch (fullCheckErr) {
              console.error('[ANNOUNCEMENT][FULL-CHECK] ❌ Full check hatası:', fullCheckErr);
            }
            
            console.log('[ANNOUNCEMENT][FULL-CHECK] ===== PERİYODİK FULL CHECK TAMAMLANDI =====');
          }
        }
        
        // Full Sync ise: Sunucuda olmayan local kayıtları sil
        if (!lastSync) {
          console.log('[ANNOUNCEMENT][DELTA-SYNC] Full Sync - sunucuda olmayan local kayıtlar kontrol ediliyor...');
          
          // API'den gelen id listesi
          const serverIds = new Set<number>();
          for (const item of data) {
            if (item.id) {
              serverIds.add(Number(item.id));
            }
          }
          
          // Local'deki tüm announcement id'lerini al
          const localAnnouncements = await this.db!.getAllAsync('SELECT id FROM announcements') as { id: number }[];
          
          let removedCount = 0;
          for (const local of localAnnouncements) {
            // Sunucuda yoksa local'den sil
            if (!serverIds.has(local.id)) {
              await this.db!.runAsync('DELETE FROM announcements WHERE id = ?', [local.id]);
              removedCount++;
              console.log('[ANNOUNCEMENT][DELTA-SYNC] Sunucuda olmayan local kayıt silindi: id=', local.id);
            }
          }
          
          if (removedCount > 0) {
            console.log(`[ANNOUNCEMENT][DELTA-SYNC] Toplam ${removedCount} sunucuda olmayan local kayıt silindi.`);
          }
        }
        
        console.log('[ANNOUNCEMENT][DELTA-SYNC] ===== SYNC TAMAMLANDI =====');
        
        return insertCount;
      } catch (error) {
        // Network hatası durumunda sessizce pas geç
        if (error instanceof Error && (error.message.includes('Network') || error.message.includes('fetch failed'))) {
          console.warn('[fetchAndStoreAnnouncementsFromAPI] ⚠️ Network hatası (offline olabilir), API senkronizasyonu atlandı.');
          return 0; // Offline mod, hata vermeden 0 döndür
        }
        console.error('API duyuru veri çekme/ekleme hatası:', error);
        throw error;
      }
    });
  }

  /**
   * Pending changes'a duyuru ekle (offline ekleme/güncelleme/silme için)
   * @param type 'create' | 'update' | 'delete'
   * @param announcement_id Duyuru id'si (string veya null)
   * @param data Duyuru verisi
   */
  async insertAnnouncementPendingChange(type: string, announcement_id: string | null, data: any) {
    if (!this.db) await this.init();
    const now = new Date().toISOString();
    await this.db!.runAsync(
      `INSERT INTO pending_changes (type, campground_id, data, created_at, status) VALUES (?, ?, ?, ?, 'pending')`,
      [type, announcement_id, JSON.stringify(data), now]
    );
  }
  // --- ANNOUNCEMENTS LOCAL CRUD ---
  async insertAnnouncement(announcement: any) {
    if (!this.db) await this.init();
    const now = new Date().toISOString();
    const aktifValue = (typeof announcement.aktif === 'boolean') ? (announcement.aktif ? 1 : 0) : (announcement.aktif === undefined ? 1 : Number(announcement.aktif));
    
    // Görselleri normalize et - event_photos, images veya photo_links alanlarından al
    let photoData: string[] = [];
    const photoSources = [announcement.event_photos, announcement.images, announcement.photo_links];
    
    for (const source of photoSources) {
      if (!source) continue;
      
      if (Array.isArray(source)) {
        photoData = source.filter((p: any) => typeof p === 'string' && p.trim() !== '');
        if (photoData.length > 0) break;
      } else if (typeof source === 'string' && source.trim() !== '' && source !== '[]') {
        try {
          const parsed = JSON.parse(source);
          if (Array.isArray(parsed)) {
            photoData = parsed.filter((p: any) => typeof p === 'string' && p.trim() !== '');
            if (photoData.length > 0) break;
          }
        } catch (e) {
          // JSON parse hatası, devam et
        }
      }
    }
    
    const photoString = photoData.length > 0 ? JSON.stringify(photoData) : '';
    
    // Log: Veritabanına yazılacak etkinlik alanları
    // ...existing code...
    const result = await this.db!.runAsync(
      `INSERT OR REPLACE INTO announcements (
        id, community_id, title, message, created_by, created_at, valilik_id, keywords, source_url, islenme_tarihi, link, date, updated_at, status, synced, deleted, aktif,
        etkinlik_turu, zorluk_seviyesi, etkinlik_tarihi, etkinlik_suresi, etkinlik_yeri, etkinlik_yeri_id, baslama_zamani, bitis_zamani, event_photos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        announcement.id ?? null,
        announcement.community_id ?? null,
        announcement.title ?? '',
        announcement.message ?? '',
        announcement.created_by ?? null,
        announcement.created_at ?? now,
        announcement.valilik_id ?? null,
        Array.isArray(announcement.keywords) ? JSON.stringify(announcement.keywords) : (announcement.keywords ?? ''),
        announcement.source_url ?? '',
        announcement.islenme_tarihi ?? '',
        announcement.link ?? '',
        announcement.date ?? '',
        announcement.updated_at ?? now,
        announcement.status ?? 'active',
        announcement.synced ?? 0,
        announcement.deleted ?? 0,
        aktifValue,
        announcement.etkinlik_turu ?? '',
        announcement.zorluk_seviyesi ?? '',
        announcement.etkinlik_tarihi ?? '',
        announcement.etkinlik_suresi ?? '',
        announcement.etkinlik_yeri ?? '',
        announcement.etkinlik_yeri_id ?? null,
        announcement.baslama_zamani ?? '',
        announcement.bitis_zamani ?? '',
        photoString
      ]
    );
    return result;
  }

  async updateAnnouncementLocal(id: number, updates: any) {
    if (!this.db) await this.init();
    const now = new Date().toISOString();
    
    // Görselleri normalize et - event_photos, images veya photo_links güncellenmişse
    if (updates.event_photos || updates.images || updates.photo_links) {
      let photoData: string[] = [];
      const photoSources = [updates.event_photos, updates.images, updates.photo_links];
      
      for (const source of photoSources) {
        if (!source) continue;
        
        if (Array.isArray(source)) {
          photoData = source.filter((p: any) => typeof p === 'string' && p.trim() !== '');
          if (photoData.length > 0) break;
        } else if (typeof source === 'string' && source.trim() !== '' && source !== '[]') {
          try {
            const parsed = JSON.parse(source);
            if (Array.isArray(parsed)) {
              photoData = parsed.filter((p: any) => typeof p === 'string' && p.trim() !== '');
              if (photoData.length > 0) break;
            }
          } catch (e) {
            // JSON parse hatası, devam et
          }
        }
      }
      
      // event_photos olarak kaydet, diğerlerini sil
      updates.event_photos = photoData.length > 0 ? JSON.stringify(photoData) : '';
      delete updates.images;
      delete updates.photo_links;
    }
    
    const fields = [];
    const values = [];
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'keywords' && Array.isArray(updates[key]) ? JSON.stringify(updates[key]) : updates[key]);
      }
    }
    fields.push('updated_at = ?');
    values.push(now);
    const sql = `UPDATE announcements SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    return this.db!.runAsync(sql, values);
  }

  async deleteAnnouncementLocal(id: number) {
    if (!this.db) await this.init();
    // Soft delete: deleted=1, status='deleted', updated_at güncelle
    const now = new Date().toISOString();
    return this.db!.runAsync(
      `UPDATE announcements SET deleted = 1, status = 'deleted', updated_at = ? WHERE id = ?`,
      [now, id]
    );
  }

  async getAnnouncementLocal(id: number) {
    if (!this.db) await this.init();
  const row = await this.db!.getFirstAsync(`SELECT * FROM announcements WHERE id = ? AND deleted = 0 AND aktif = 1`, [id]);
  if (!row) return null;
  const ann = row as any;
  try { ann.keywords = typeof ann.keywords === 'string' ? JSON.parse(ann.keywords || '[]') : (ann.keywords || []); } catch { ann.keywords = []; }
  
  // event_photos parse et - null/undefined/empty string kontrolü
  try {
    if (ann.event_photos === null || ann.event_photos === undefined || ann.event_photos === '') {
      ann.event_photos = [];
    } else if (typeof ann.event_photos === 'string') {
      const parsed = JSON.parse(ann.event_photos);
      ann.event_photos = Array.isArray(parsed) ? parsed : [];
    } else if (!Array.isArray(ann.event_photos)) {
      ann.event_photos = [];
    }
  } catch { 
    ann.event_photos = []; 
  }
  
  // images parse et
  try {
    if (ann.images === null || ann.images === undefined || ann.images === '') {
      ann.images = [];
    } else if (typeof ann.images === 'string') {
      const parsed = JSON.parse(ann.images);
      ann.images = Array.isArray(parsed) ? parsed : [];
    } else if (!Array.isArray(ann.images)) {
      ann.images = [];
    }
  } catch { 
    ann.images = []; 
  }
  
  // photo_links parse et
  try {
    if (ann.photo_links === null || ann.photo_links === undefined || ann.photo_links === '') {
      ann.photo_links = [];
    } else if (typeof ann.photo_links === 'string') {
      const parsed = JSON.parse(ann.photo_links);
      ann.photo_links = Array.isArray(parsed) ? parsed : [];
    } else if (!Array.isArray(ann.photo_links)) {
      ann.photo_links = [];
    }
  } catch { 
    ann.photo_links = []; 
  }
  
  return ann;
  }

  async listAnnouncementsLocal({ community_id, valilik_id, onlyActive = true }: { community_id?: number; valilik_id?: number; onlyActive?: boolean } = {}) {
    if (!this.db) await this.init();
  let where = 'deleted = 0 AND aktif = 1';
    const params: any[] = [];
    if (onlyActive) {
      where += ` AND status = 'active'`;
    }
    if (community_id !== undefined) {
      where += ' AND community_id = ?';
      params.push(community_id);
    }
    if (valilik_id !== undefined) {
      where += ' AND valilik_id = ?';
      params.push(valilik_id);
    }
    const rows = await this.db!.getAllAsync(`SELECT * FROM announcements WHERE ${where} ORDER BY created_at DESC`, params);
    return rows.map((row: any) => {
      try { row.keywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords || '[]') : (row.keywords || []); } catch { row.keywords = []; }
      
      // event_photos parse et - null/undefined/empty string kontrolü
      try {
        if (row.event_photos === null || row.event_photos === undefined || row.event_photos === '') {
          row.event_photos = [];
        } else if (typeof row.event_photos === 'string') {
          const parsed = JSON.parse(row.event_photos);
          row.event_photos = Array.isArray(parsed) ? parsed : [];
        } else if (!Array.isArray(row.event_photos)) {
          row.event_photos = [];
        }
      } catch { 
        row.event_photos = []; 
      }
      
      // images parse et
      try {
        if (row.images === null || row.images === undefined || row.images === '') {
          row.images = [];
        } else if (typeof row.images === 'string') {
          const parsed = JSON.parse(row.images);
          row.images = Array.isArray(parsed) ? parsed : [];
        } else if (!Array.isArray(row.images)) {
          row.images = [];
        }
      } catch { 
        row.images = []; 
      }
      
      // photo_links parse et
      try {
        if (row.photo_links === null || row.photo_links === undefined || row.photo_links === '') {
          row.photo_links = [];
        } else if (typeof row.photo_links === 'string') {
          const parsed = JSON.parse(row.photo_links);
          row.photo_links = Array.isArray(parsed) ? parsed : [];
        } else if (!Array.isArray(row.photo_links)) {
          row.photo_links = [];
        }
      } catch { 
        row.photo_links = []; 
      }
      
      return row;
    });
  }
  // uuid ile local id güncelle
  async updateCampingAreaIdByUuid(uuid: string, newId: number) {
    if (!this.db) await this.init();
    await this.db!.runAsync(
      `UPDATE camping_areas SET id = ? WHERE uuid = ?`,
      [newId, uuid]
    );
  }
  // --- PENDING CHANGES ---
  async insertPendingChange(type: string, campground_id: string | null, data: any) {
    if (!this.db) await this.init();
    // Duplicate silme kaydını engelle
    if (type === 'delete' && campground_id) {
      const existing = await this.db!.getFirstAsync(
        `SELECT id FROM pending_changes WHERE type = 'delete' AND campground_id = ? AND status = 'pending'`,
        [campground_id]
      );
      if (existing) {
        // ...existing code...
        return;
      }
    }
    const now = new Date().toISOString();
    try {
      const result = await this.db!.runAsync(
        `INSERT INTO pending_changes (type, campground_id, data, created_at, status) VALUES (?, ?, ?, ?, 'pending')`,
        [type, campground_id, JSON.stringify(data), now]
      );
      return result;
    } catch (err) {
      // [DEBUG] runAsync error log
      console.error('[DB][insertPendingChange] runAsync error:', err, {
        type,
        campground_id,
        data,
        dataString: (() => { try { return JSON.stringify(data); } catch (e) { return '[stringify error]'; } })(),
        now
      });
      throw err;
    }
  }

  async getPendingChanges() {
    if (!this.db) await this.init();
    const changes = await this.db!.getAllAsync(`SELECT * FROM pending_changes WHERE status = 'pending' ORDER BY created_at ASC`);
  // ...existing code...
    return changes;
  }

  async markPendingChangeSynced(id: number) {
    if (!this.db) await this.init();
    await this.db!.runAsync(`UPDATE pending_changes SET status = 'synced' WHERE id = ?`, [id]);
  }

  async markPendingChangeError(id: number) {
    if (!this.db) await this.init();
    await this.db!.runAsync(`UPDATE pending_changes SET status = 'error' WHERE id = ?`, [id]);
  }
  // Merkezi async queue
  private static _queue: Promise<any> = Promise.resolve();
  private static enqueue<T>(fn: () => Promise<T>): Promise<T> {
    DatabaseManager._queue = DatabaseManager._queue.then(fn, fn);
    return DatabaseManager._queue;
  }
  // fetchAndStoreCampingAreasFromAPI fonksiyonu statement/connection hatalarını önleyecek şekilde güncellendi
  async fetchAndStoreCampingAreasFromAPI(
    apiUrl: string = API_URL + '/campgrounds',
    options: { forceFull?: boolean; onProgress?: (current: number, total: number) => void } = {}
  ): Promise<number> {
    // Merkezi queue ile tüm yazma işlemleri sıraya alınır
    return DatabaseManager.enqueue(async () => {
      try {
        // Delta Sync: Son senkronizasyon zamanını al
        const lastSync = options.forceFull ? null : await getLastCampingAreaSync();
        const isDeltaSync = !!lastSync;
        
        // updated_after parametresi varsa ekle
        let url = apiUrl;
        if (lastSync) {
          const separator = apiUrl.includes('?') ? '&' : '?';
          // Delta Sync'te silinen kayıtları da dahil et
          url = `${apiUrl}${separator}updated_after=${encodeURIComponent(lastSync)}&include_deleted=true`;
          console.log('[fetchAndStoreCampingAreasFromAPI] 🔄 Delta Sync aktif, son sync:', lastSync);
        } else {
          console.log('[fetchAndStoreCampingAreasFromAPI] 📥 Full Sync (ilk senkronizasyon veya force)');
        }
        
        console.log('[fetchAndStoreCampingAreasFromAPI] BAŞLANGIÇ - URL:', url);
        const headers: Record<string, string> = {};
        const token = await getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await apiFetch(url, { headers });
        if (!response.ok) throw new Error('API yanıtı başarısız: ' + response.status);
        const data = await response.json();
        console.log('[fetchAndStoreCampingAreasFromAPI] API response örnek:', Array.isArray(data) && data.length > 0 ? data[0] : data);
        if (Array.isArray(data)) {
          const found1472 = data.find((item) => String(item.id) === '1472' || String(item.external_id) === '1472');
          if (found1472) {
            console.log('[fetchAndStoreCampingAreasFromAPI] external_id:1472 API\'den gelen fee:', found1472.fee, 'tipi:', typeof found1472.fee);
          }
        }
        console.log('[fetchAndStoreCampingAreasFromAPI] API veri boyutu:', Array.isArray(data) ? data.length : typeof data);
        if (!Array.isArray(data)) throw new Error('API beklenen formatta veri döndürmedi');

        // Progress callback - başlangıç
        if (options.onProgress && data.length > 0) {
          if (__DEV__) console.log('[DB][PROGRESS] Başlangıç callback:', 0, '/', data.length);
          options.onProgress(0, data.length);
        }

        let insertCount = 0;
        let updateCount = 0;
        if (!this.db) await this.init();

        // Pending işlemleri al (delete, insert, update)
        const pendingChanges = await this.db!.getAllAsync(
          "SELECT type, campground_id, data FROM pending_changes WHERE status = 'pending'"
        ) as { type: string; campground_id?: string; data?: string }[];
        
        // Pending delete: Silinmeyi bekleyen id'leri topla
        const deletedIds = new Set<string>();
        // Pending insert/update: Üstüne yazılmaması gereken id'leri topla
        const protectedIds = new Set<string>();
        
        for (const change of pendingChanges) {
          if (change.type === 'delete') {
            // Delete pending: Bu kayıtları API'den gelse bile ekleme
            if (change.campground_id) deletedIds.add(String(change.campground_id));
            try {
              const data = change.data ? JSON.parse(change.data) : {};
              if (data.external_id) deletedIds.add(String(data.external_id));
              if (data.id) deletedIds.add(String(data.id));
            } catch {}
          } else if (change.type === 'insert' || change.type === 'update') {
            // Insert/Update pending: Bu kayıtların lokal versiyonunu koru (sunucudan gelen ile üstüne yazma)
            if (change.campground_id) protectedIds.add(String(change.campground_id));
            try {
              const data = change.data ? JSON.parse(change.data) : {};
              if (data.external_id) protectedIds.add(String(data.external_id));
              if (data.id) protectedIds.add(String(data.id));
            } catch {}
          }
        }
        
        if (__DEV__) {
          console.log('[PENDING_PROTECTION] Protected IDs (pending insert/update):', Array.from(protectedIds));
          console.log('[PENDING_PROTECTION] Deleted IDs (pending delete):', Array.from(deletedIds));
        }

        // Önce local veritabanındaki tüm kayıtları bir Map'e al (external_id veya koordinat bazlı karşılaştırma için)
        const existingAreas = await this.db!.getAllAsync('SELECT external_id, latitude, longitude, updated_at FROM camping_areas');
        const existingMap = new Map();
        existingAreas.forEach((area: any) => {
          if (area.external_id) {
            existingMap.set(area.external_id, area);
          } else {
            // Koordinat bazlı key oluştur
            const coordKey = `${area.latitude.toFixed(6)},${area.longitude.toFixed(6)}`;
            existingMap.set(coordKey, area);
          }
        });

        let processed = 0;
        let deletedByServerCount = 0;
        for (const item of data) {
          processed++;
          
          // Progress callback - her 10 kayıtta bir güncelle (performans için)
          if (options.onProgress && (processed % 10 === 0 || processed === data.length)) {
            if (__DEV__ && processed % 100 === 0) console.log('[DB][PROGRESS] Callback güncellendi:', processed, '/', data.length);
            options.onProgress(processed, data.length);
          }
          
          if (processed % 100 === 0) {
            console.log(`[fetchAndStoreCampingAreasFromAPI] ${processed} kayıt işlendi...`);
          }
          
          // Sunucuda silinen kayıt kontrolü (Delta Sync için)
          if (item.deleted === true || item.deleted === 1 || item.deleted === '1') {
            // Sunucuda silinmiş, lokal veritabanından da sil
            if (item.external_id) {
              await this.db!.runAsync('DELETE FROM camping_areas WHERE external_id = ?', [item.external_id]);
              deletedByServerCount++;
              console.log(`[fetchAndStoreCampingAreasFromAPI] Sunucuda silinen kayıt lokal veritabanından silindi: external_id=${item.external_id}`);
            }
            continue; // Bu kaydı ekleme/güncelleme
          }
          
          // Silinmeyi bekleyenler listesinde ise atla (pending delete)
          if (item.id && deletedIds.has(String(item.id))) continue;
          if (item.external_id && deletedIds.has(String(item.external_id))) continue;
          
          // Pending insert/update varsa atla (lokal versiyonu koru)
          if (item.id && protectedIds.has(String(item.id))) {
            if (__DEV__) console.log(`[PENDING_PROTECTION] Kayıt atlandı (pending insert/update var): id=${item.id}`);
            continue;
          }
          if (item.external_id && protectedIds.has(String(item.external_id))) {
            if (__DEV__) console.log(`[PENDING_PROTECTION] Kayıt atlandı (pending insert/update var): external_id=${item.external_id}`);
            continue;
          }
          // Her kaydı tek tek ve sırayla işle
          try {
            const typeValue = (item.type ?? '').toString();
                const images = (item.images && item.images.length > 0)
            ? item.images
            : (item.photo_links && item.photo_links.length > 0 ? item.photo_links : []);
          // JSON alanları stringe çevir
          const facilitiesStr = Array.isArray(item.facilities) ? JSON.stringify(item.facilities) : (item.facilities || '[]');
          const accessibilityStr = Array.isArray(item.accessibility) ? JSON.stringify(item.accessibility) : (item.accessibility || '[]');
          const socialMediaStr = typeof item.social_media === 'object' ? JSON.stringify(item.social_media) : (item.social_media || '{}');
          const photoLinksStr = Array.isArray(item.photo_links) ? JSON.stringify(item.photo_links) : (item.photo_links || '[]');
          const amenitiesStr = Array.isArray(item.amenities) ? JSON.stringify(item.amenities) : (item.amenities || '[]');
          const tagsStr = typeof item.tags === 'object' ? JSON.stringify(item.tags) : (item.tags || '{}');
          const imagesStr = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
          // opening_hours string'e çevir
          const openingHoursStr = typeof item.opening_hours === 'object' && item.opening_hours !== null
            ? JSON.stringify(item.opening_hours)
            : (item.opening_hours || '');
          // owner_id string'e çevir
          const ownerIdStr = item.owner_id !== undefined && item.owner_id !== null ? String(item.owner_id) : '';
          
          // Fee değerini loglayalım
          if (item.external_id === '1472' || item.id === 1472) {
            console.log('[fetchAndStoreCampingAreasFromAPI] external_id:1472 fee işleme öncesi:', item.fee, 'tipi:', typeof item.fee);
            const feeValue = item.fee === null || item.fee === undefined ? null : (item.fee ? 1 : 0);
            console.log('[fetchAndStoreCampingAreasFromAPI] external_id:1472 fee işleme sonrası:', feeValue);
          }

          let updateResult = { changes: 0 };
          if (item.external_id) {
            // Delta Sync'te backend zaten sadece değişenleri gönderiyor, bu kontrolü atlayalım
            // Full Sync'te ise gereksiz UPDATE'lerden kaçınmak için kontrol edelim
            if (!isDeltaSync) {
              const existing = existingMap.get(item.external_id);
              if (existing && existing.updated_at === item.updated_at) {
                // Kayıt zaten güncel, güncelleme yapma
                continue;
              }
            }
            // [DEBUG][API->LOCAL] Güncellenen alan owner_id: logu kaldırıldı
            updateResult = await this.db!.runAsync(
              `UPDATE camping_areas SET 
                name = ?, latitude = ?, longitude = ?, type = ?, description = ?, website = ?, phone = ?, opening_hours = ?,
                capacity = ?, fee = ?, status = ?, rating = ?, review_count = ?, price_range = ?, facilities = ?, accessibility = ?,
                social_media = ?, booking_url = ?, contact_email = ?, last_verified = ?, visibility = ?, owner_id = ?, updated_at = CURRENT_TIMESTAMP,
                source_id = ?, photo_links = ?, amenities = ?, tags = ?, images = ?
               WHERE external_id = ?`,
              [
                item.name ?? '',
                item.latitude ?? 0,
                item.longitude ?? 0,
                typeValue,
                item.description ?? '',
                item.website ?? '',
                item.phone ?? '',
                openingHoursStr,
                item.capacity ?? 0,
                item.fee === null || item.fee === undefined ? null : (item.fee ? 1 : 0),
                item.status ?? 'active',
                item.rating ?? 0,
                item.review_count ?? 0,
                item.price_range ?? '',
                facilitiesStr,
                accessibilityStr,
                socialMediaStr,
                item.booking_url ?? '',
                item.contact_email ?? '',
                item.last_verified ?? '',
                item.visibility ?? '',
                ownerIdStr,
                item.source_id ?? '',
                photoLinksStr,
                amenitiesStr,
                tagsStr,
                imagesStr,
                item.external_id ?? ''
              ]
            );

            // Eğer update başarısızsa ve external_id mevcutsa, aynı koordinatlara veya name'e sahip ve external_id'si boş olan kaydın external_id'sini güncelle
            if (updateResult.changes === 0) {
              // Önce latitude/longitude ile dene, yoksa name ile dene
              const existingRow = await this.db!.getFirstAsync(
                'SELECT id FROM camping_areas WHERE external_id IS NULL AND ABS(latitude - ?) < 0.0001 AND ABS(longitude - ?) < 0.0001',
                [item.latitude ?? 0, item.longitude ?? 0]
              ) as any;
              if (existingRow && existingRow.id) {
                await this.db!.runAsync(
                  'UPDATE camping_areas SET external_id = ? WHERE id = ?',
                  [item.external_id, existingRow.id]
                );
                // Tekrar update dene
                updateResult = await this.db!.runAsync(
                  `UPDATE camping_areas SET 
                    name = ?, latitude = ?, longitude = ?, type = ?, description = ?, website = ?, phone = ?, opening_hours = ?,
                    capacity = ?, fee = ?, status = ?, rating = ?, review_count = ?, price_range = ?, facilities = ?, accessibility = ?,
                    social_media = ?, booking_url = ?, contact_email = ?, last_verified = ?, visibility = ?, owner_id = ?, updated_at = CURRENT_TIMESTAMP,
                    source_id = ?, photo_links = ?, amenities = ?, tags = ?, images = ?
                   WHERE external_id = ?`,
                  [
                    item.name ?? '',
                    item.latitude ?? 0,
                    item.longitude ?? 0,
                    typeValue,
                    item.description ?? '',
                    item.website ?? '',
                    item.phone ?? '',
                    openingHoursStr,
                    item.capacity ?? 0,
                    item.fee === null || item.fee === undefined ? null : (item.fee ? 1 : 0),
                    item.status ?? 'active',
                    item.rating ?? 0,
                    item.review_count ?? 0,
                    item.price_range ?? '',
                    facilitiesStr,
                    accessibilityStr,
                    socialMediaStr,
                    item.booking_url ?? '',
                    item.contact_email ?? '',
                    item.last_verified ?? '',
                    item.visibility ?? '',
                    ownerIdStr,
                    item.source_id ?? '',
                    photoLinksStr,
                    amenitiesStr,
                    tagsStr,
                    imagesStr,
                    item.external_id ?? ''
                  ]
                );
              } else {
                // Name ile de dene (daha düşük öncelik)
                const existingByName = await this.db!.getFirstAsync(
                  'SELECT id FROM camping_areas WHERE external_id IS NULL AND name = ?',
                  [item.name ?? '']
                ) as any;
                if (existingByName && existingByName.id) {
                  await this.db!.runAsync(
                    'UPDATE camping_areas SET external_id = ? WHERE id = ?',
                    [item.external_id, existingByName.id]
                  );
                  updateResult = await this.db!.runAsync(
                    `UPDATE camping_areas SET 
                      name = ?, latitude = ?, longitude = ?, type = ?, description = ?, website = ?, phone = ?, opening_hours = ?,
                      capacity = ?, fee = ?, status = ?, rating = ?, review_count = ?, price_range = ?, facilities = ?, accessibility = ?,
                      social_media = ?, booking_url = ?, contact_email = ?, last_verified = ?, visibility = ?, owner_id = ?, updated_at = CURRENT_TIMESTAMP,
                      source_id = ?, photo_links = ?, amenities = ?, tags = ?, images = ?
                     WHERE external_id = ?`,
                    [
                      item.name ?? '',
                      item.latitude ?? 0,
                      item.longitude ?? 0,
                      typeValue,
                      item.description ?? '',
                      item.website ?? '',
                      item.phone ?? '',
                      openingHoursStr,
                      item.capacity ?? 0,
                      item.fee === null || item.fee === undefined ? null : (item.fee ? 1 : 0),
                      item.status ?? 'active',
                      item.rating ?? 0,
                      item.review_count ?? 0,
                      item.price_range ?? '',
                      facilitiesStr,
                      accessibilityStr,
                      socialMediaStr,
                      item.booking_url ?? '',
                      item.contact_email ?? '',
                      item.last_verified ?? '',
                      item.visibility ?? '',
                      ownerIdStr,
                      item.source_id ?? '',
                      photoLinksStr,
                      amenitiesStr,
                      tagsStr,
                      imagesStr,
                      item.external_id ?? ''
                    ]
                  );
                }
              }
            }
          }
          if (!item.external_id || updateResult.changes === 0) {
            const insertResult = await this.db!.runAsync(
              `INSERT INTO camping_areas (
                name, latitude, longitude, type, description, website, phone, opening_hours, capacity, fee, status, rating, review_count, price_range,
                facilities, accessibility, social_media, booking_url, contact_email, last_verified, visibility, owner_id, owner_username, created_at, updated_at, external_id, source_id, photo_links, amenities, tags, images
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`,
              [
                item.name ?? '',
                item.latitude ?? 0,
                item.longitude ?? 0,
                typeValue,
                item.description ?? '',
                item.website ?? '',
                item.phone ?? '',
                openingHoursStr,
                item.capacity ?? 0,
                item.fee === null || item.fee === undefined ? null : (item.fee ? 1 : 0),
                item.status ?? 'active',
                item.rating ?? 0,
                item.review_count ?? 0,
                item.price_range ?? '',
                facilitiesStr,
                accessibilityStr,
                socialMediaStr,
                item.booking_url ?? '',
                item.contact_email ?? '',
                item.last_verified ?? '',
                item.visibility ?? '',
                ownerIdStr,
                item.owner_username ?? '',
                item.external_id ?? '',
                item.source_id ?? '',
                photoLinksStr,
                amenitiesStr,
                tagsStr,
                imagesStr
              ]
            );
            if (item.source_id === 0 || item.source_id === '0') {
              // ...existing code...
            }
            if (updateResult.changes > 0) {
              updateCount++;
            } else {
              insertCount++;
            }
          }
        } catch (err) {
          // Her kayıtta hata olursa logla ama işlemi durdurma
          console.error('Kamp alanı ekleme/güncelleme hatası:', err, item);
        }
      }
  // ...existing code...
      
      // Sunucuda olmayan lokal kamp alanlarını sil (çoklu cihaz senkronizasyonu için)
      // Sadece Full Sync'te yapılır, Delta Sync'te yapılmaz
      // ANCAK: Pending insert/update olanları SILME (kullanıcının değişiklikleri kaybolmasın)
      if (!isDeltaSync) {
        // API'den gelen external_id listesi
        const serverExternalIds = new Set<string>();
        for (const item of data) {
          if (item.external_id) {
            serverExternalIds.add(String(item.external_id));
          }
        }
        
        // Lokal veritabanındaki tüm external_id'li kayıtları al
        const localAreasWithExtId = await this.db!.getAllAsync(
          'SELECT id, external_id, tags FROM camping_areas WHERE external_id IS NOT NULL AND external_id != ""'
        ) as { id: number; external_id: string; tags?: string }[];
        
        let deletedCount = 0;
        for (const localArea of localAreasWithExtId) {
          // User submitted alanları SILME (kullanıcıya özel yerler)
          if (localArea.tags && localArea.tags.includes('user_submitted')) {
            if (__DEV__) console.log(`[USER_SUBMITTED_PROTECTION] Full sync silme atlandı (user_submitted): external_id=${localArea.external_id}`);
            continue;
          }
          
          // Pending insert/update varsa SILME (kullanıcının değişikliği kaybolmasın)
          if (protectedIds.has(String(localArea.external_id)) || protectedIds.has(String(localArea.id))) {
            if (__DEV__) console.log(`[PENDING_PROTECTION] Full sync silme atlandı (pending var): external_id=${localArea.external_id}`);
            continue;
          }
          
          // Eğer sunucuda yoksa lokal veritabanından sil
          if (!serverExternalIds.has(String(localArea.external_id))) {
            await this.db!.runAsync('DELETE FROM camping_areas WHERE id = ?', [localArea.id]);
            deletedCount++;
            console.log(`[fetchAndStoreCampingAreasFromAPI] Sunucuda olmayan lokal alan silindi: external_id=${localArea.external_id}, id=${localArea.id}`);
          }
        }
        
        if (deletedCount > 0) {
          console.log(`[fetchAndStoreCampingAreasFromAPI] Toplam ${deletedCount} sunucuda olmayan lokal alan silindi.`);
        }
      }
      
      // Son senkronizasyon zamanını kaydet
      const currentTime = new Date().toISOString();
      await setLastCampingAreaSync(currentTime);
      console.log('[fetchAndStoreCampingAreasFromAPI] Senkronizasyon tamamlandı. İşlenen:', insertCount + updateCount, 'Eklenen:', insertCount, 'Güncellenen:', updateCount, 'Sunucuda Silinen:', deletedByServerCount);
      
      // Ekledikten sonra toplam kayıt sayısını logla
      const allAreas = await this.getAllCampingAreas();
  // ...existing code...
        return insertCount;
      } catch (error) {
        // Network hatası durumunda sessizce pas geç
        if (error instanceof Error && (error.message.includes('Network') || error.message.includes('fetch failed'))) {
          console.warn('[fetchAndStoreCampingAreasFromAPI] ⚠️ Network hatası (offline olabilir), API senkronizasyonu atlandı.');
          return 0; // Offline mod, hata vermeden 0 döndür
        }
        console.error('API veri çekme/ekleme hatası:', error);
        throw error;
      }
    });
  }
  private db: SQLite.SQLiteDatabase | null = null;

  async init() {
    // Eğer zaten bir init işlemi devam ediyorsa, onu bekle
    if (this.initPromise) {
      return this.initPromise;
    }
    
    // Eğer database zaten başlatılmışsa, onu döndür
    if (this.db) {
      return this.db;
    }
    
    // Yeni init promise oluştur ve sakla
    this.initPromise = (async () => {
      this.db = await SQLite.openDatabaseAsync('camping_areas.db');
      await this.createTables();
      return this.db;
    })();
    
    try {
      const db = await this.initPromise;
      return db;
    } finally {
      // Init tamamlandıktan sonra promise'i temizle
      this.initPromise = null;
    }
  }

  private async createTables() {
  // Create pending_changes table if it doesn't exist
  if (!this.db) throw new Error('Database not initialized');
  await this.db.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      campground_id TEXT,
      data TEXT,
      created_at TEXT,
      status TEXT
    );
  `);

    // Create announcements table if it doesn't exist
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  message TEXT,
  created_by INTEGER,
  created_at TEXT,
  valilik_id TEXT,
  keywords TEXT,
  source_url TEXT,
  islenme_tarihi TEXT,
  link TEXT,
  date TEXT,
  baslama_zamani TEXT,
  bitis_zamani TEXT,
  updated_at TEXT,
  status TEXT DEFAULT 'active',
  synced INTEGER DEFAULT 1,
  deleted INTEGER DEFAULT 0,
  aktif INTEGER DEFAULT 1,
  etkinlik_turu TEXT,
  zorluk_seviyesi TEXT,
  etkinlik_tarihi TEXT,
  etkinlik_suresi TEXT,
  etkinlik_yeri TEXT,
  etkinlik_yeri_id INTEGER,
  event_photos TEXT,
  images TEXT,
  photo_links TEXT
    );
    `);

    // Mevcut tabloya images ve photo_links kolonlarını ekle (varsa hata vermez)
    try {
      await this.db.execAsync(`ALTER TABLE announcements ADD COLUMN images TEXT;`);
      console.log('[DB][MIGRATION] images kolonu eklendi');
    } catch (e) {
      // Kolon zaten varsa hata verir, görmezden gel
    }
    
    try {
      await this.db.execAsync(`ALTER TABLE announcements ADD COLUMN photo_links TEXT;`);
      console.log('[DB][MIGRATION] photo_links kolonu eklendi');
    } catch (e) {
      // Kolon zaten varsa hata verir, görmezden gel
    }

    // Create index for fast lookup
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_announcements_community_id ON announcements(community_id);
      CREATE INDEX IF NOT EXISTS idx_announcements_valilik_id ON announcements(valilik_id);
      CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
      CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at);
    `);

    // Create community_members table if it doesn't exist
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS community_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        community_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'active',
        joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index for fast lookup
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_community_members_community_user ON community_members(community_id, user_id);
    `);

    // Check if table exists and has the required columns
    const tableInfo = await this.db.getAllAsync(`PRAGMA table_info(camping_areas);`);
    const hasNewColumns = tableInfo.some((col: any) => col.name === 'price_range');
    const hasVisibility = tableInfo.some((col: any) => col.name === 'visibility');

    if (tableInfo.length > 0) {
      // Table exists, check and add missing columns
      const alterStatements: string[] = [];
      if (!tableInfo.some((col: any) => col.name === 'images')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN images TEXT DEFAULT '[]';`);
      if (!tableInfo.some((col: any) => col.name === 'rating')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN rating REAL DEFAULT 0.0;`);
      if (!tableInfo.some((col: any) => col.name === 'review_count')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN review_count INTEGER DEFAULT 0;`);
      if (!tableInfo.some((col: any) => col.name === 'price_range')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN price_range TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'facilities')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN facilities TEXT DEFAULT '[]';`);

      // Duyurular tablosu için eksik kolonları ekle
      const tableInfoAnnouncements = await this.db.getAllAsync(`PRAGMA table_info(announcements);`);
      if (!tableInfoAnnouncements.some((col: any) => col.name === 'event_photos')) {
        alterStatements.push(`ALTER TABLE announcements ADD COLUMN event_photos TEXT DEFAULT '[]';`);
      }
      if (!tableInfoAnnouncements.some((col: any) => col.name === 'bitis_zamani')) {
        alterStatements.push(`ALTER TABLE announcements ADD COLUMN bitis_zamani TEXT;`);
      }
      if (!tableInfoAnnouncements.some((col: any) => col.name === 'baslama_zamani')) {
        alterStatements.push(`ALTER TABLE announcements ADD COLUMN baslama_zamani TEXT;`);
      }
      if (!tableInfo.some((col: any) => col.name === 'accessibility')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN accessibility TEXT DEFAULT '[]';`);
      if (!tableInfo.some((col: any) => col.name === 'booking_url')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN booking_url TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'contact_email')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN contact_email TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'social_media')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN social_media TEXT DEFAULT '{}';`);
      if (!tableInfo.some((col: any) => col.name === 'last_verified')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN last_verified TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'visibility')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN visibility TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'owner_id')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN owner_id TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'owner_username')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN owner_username TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'external_id')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN external_id TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'source_id')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN source_id TEXT;`);
      if (!tableInfo.some((col: any) => col.name === 'photo_links')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN photo_links TEXT DEFAULT '[]';`);
      // Eski alanlar
      if (!tableInfo.some((col: any) => col.name === 'amenities')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN amenities TEXT DEFAULT '[]';`);
      if (!tableInfo.some((col: any) => col.name === 'tags')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN tags TEXT DEFAULT '{}';`);
      if (!tableInfo.some((col: any) => col.name === 'deleted')) alterStatements.push(`ALTER TABLE camping_areas ADD COLUMN deleted INTEGER DEFAULT 0;`);
      // Uygula (duplicate column hatasını yut)
      for (const stmt of alterStatements) {
        try {
          await this.db.execAsync(stmt);
        } catch (e: any) {
          if (typeof e?.message === 'string' && e.message.includes('duplicate column name')) {
            // ignore
          } else {
            throw e;
          }
        }
      }
    } else {
      // Table doesn't exist - create it
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS camping_areas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT,
          name TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          website TEXT,
          phone TEXT,
          opening_hours TEXT,
          capacity INTEGER,
          fee INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          rating REAL DEFAULT 0.0,
          review_count INTEGER DEFAULT 0,
          price_range TEXT,
          facilities TEXT DEFAULT '[]',
          accessibility TEXT DEFAULT '[]',
          social_media TEXT DEFAULT '{}',
          booking_url TEXT,
          contact_email TEXT,
          last_verified TEXT,
          visibility TEXT,
          owner_id TEXT,
          owner_username TEXT,
          friend_user_ids TEXT DEFAULT '[]',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          external_id TEXT,
          source_id TEXT,
          photo_links TEXT DEFAULT '[]',
          -- Eski alanlar uyumluluk için
          amenities TEXT DEFAULT '[]',
          tags TEXT DEFAULT '{}',
          images TEXT DEFAULT '[]',
          deleted INTEGER DEFAULT 0
        );
      `);
    }

    // Create indexes if they don't exist
    // Migration: friend_user_ids kolonu yoksa ekle
    const tableInfo2 = await this.db!.getAllAsync("PRAGMA table_info(camping_areas)");
    if (!tableInfo2.some((col: any) => col.name === 'friend_user_ids')) {
      await this.db!.execAsync("ALTER TABLE camping_areas ADD COLUMN friend_user_ids TEXT DEFAULT '[]';");
    }
    // Migration: community_id kolonu yoksa ekle
    if (!tableInfo2.some((col: any) => col.name === 'community_id')) {
      await this.db!.execAsync("ALTER TABLE camping_areas ADD COLUMN community_id INTEGER;");
    }
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_camping_areas_location ON camping_areas(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_camping_areas_type ON camping_areas(type);
      CREATE INDEX IF NOT EXISTS idx_camping_areas_status ON camping_areas(status);
      CREATE INDEX IF NOT EXISTS idx_camping_areas_rating ON camping_areas(rating);
    `);

    // Create favorites table if it doesn't exist
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camping_area_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (camping_area_id) REFERENCES camping_areas (id) ON DELETE CASCADE,
        UNIQUE(camping_area_id)
      );
    `);

    // Create index for favorites
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_favorites_camping_area_id ON favorites(camping_area_id);
    `);
  }

  async insertOrUpdateCampingArea(area: Omit<CampingArea, 'id' | 'created_at' | 'updated_at'>) {

    if (!this.db) await this.init();

    // owner_id zorunlu kontrolü
    if (area.owner_id === undefined || area.owner_id === null || area.owner_id === '') {
      throw new Error('owner_id zorunlu ve boş olamaz!');
    }

    // Zorunlu alan kontrolü
    if (!area.name || !area.type || area.longitude === undefined || area.longitude === null || (area as any).latitude === undefined || (area as any).latitude === null) {
      throw new Error('Zorunlu alanlar eksik: name, type, latitude, longitude gerekli');
    }

      // Sayısal alanların kontrolü
      const latitude = Number((area as any).latitude);
      const longitude = Number(area.longitude);
      const capacity = area.capacity ? Number(area.capacity) : null;
      const rating = area.rating ? Number(area.rating) : 0;
      const review_count = area.review_count ? Number(area.review_count) : 0;

      if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error('Geçersiz koordinat değerleri');
      }

    // JSON alanlar
  const facilitiesStr = Array.isArray(area.facilities) ? JSON.stringify(area.facilities) : (area.facilities || '[]');
  const accessibilityStr = Array.isArray(area.accessibility) ? JSON.stringify(area.accessibility) : (area.accessibility || '[]');
  const socialMediaStr = typeof area.social_media === 'object' ? JSON.stringify(area.social_media || {}) : (area.social_media || '{}');
  const photoLinksStr = Array.isArray(area.photo_links) ? JSON.stringify(area.photo_links) : (area.photo_links || '[]');
  const amenitiesStr = Array.isArray(area.amenities) ? JSON.stringify(area.amenities) : (area.amenities || '[]');
  // tags alanı: type güncellendiğinde tags içindeki type da güncellenmeli
  let tagsObj: any = {};
  if (area.tags && typeof area.tags === 'string') {
    try { tagsObj = JSON.parse(area.tags); } catch { tagsObj = {}; }
  } else if (area.tags && typeof area.tags === 'object') {
    tagsObj = { ...area.tags };
  }
  if (area.type) {
    tagsObj.type = area.type;
  }
  const tagsStr = JSON.stringify(tagsObj);
  const imagesStr = Array.isArray(area.images) ? JSON.stringify(area.images) : (area.images || '[]');
  const feeValue = area.fee === true ? 1 : (area.fee === false ? 0 : null);
  // friend_user_ids JSON olarak saklanacak
  const friendUserIdsStr = Array.isArray((area as any).friend_user_ids)
    ? JSON.stringify((area as any).friend_user_ids)
    : (typeof (area as any).friend_user_ids === 'string' ? (area as any).friend_user_ids : '[]');
  if ((area as any).friend_user_ids && ((Array.isArray((area as any).friend_user_ids) && (area as any).friend_user_ids.length > 0) || (typeof (area as any).friend_user_ids === 'string' && (area as any).friend_user_ids !== '[]'))) {
          // ...existing code...
  }

      try {
        // Update by external_id if exists, else insert
        let updateQuery = '';
        let updateParams: any[] = [];
        
        // opening_hours için string hazırla (object veya array ise stringify)
        let openingHoursStr = '';
        if (area.opening_hours) {
          if (typeof area.opening_hours === 'string') {
            openingHoursStr = area.opening_hours;
          } else if (typeof area.opening_hours === 'object' && !Array.isArray(area.opening_hours)) {
            // Object tipinde - weekday/weekend kontrolü yap
            const hoursObj = area.opening_hours as any;
            // Eğer hem weekday hem weekend tamamen kapalıysa (open ve close boş), hiç kaydetme
            if (
              hoursObj.weekday && hoursObj.weekend &&
              !hoursObj.weekday.open && !hoursObj.weekday.close &&
              !hoursObj.weekend.open && !hoursObj.weekend.close
            ) {
              openingHoursStr = '';
            } else {
              openingHoursStr = JSON.stringify(area.opening_hours);
            }
          } else if (typeof area.opening_hours === 'object') {
            openingHoursStr = JSON.stringify(area.opening_hours);
          }
        }
        console.log('[DB][insertOrUpdateCampingArea] opening_hours:', { raw: area.opening_hours, stringified: openingHoursStr });
        
        if (area.external_id) {
          updateQuery = `UPDATE camping_areas SET 
            uuid = ?,
            name = ?, latitude = ?, longitude = ?, type = ?, description = ?, website = ?, phone = ?, opening_hours = ?,
            capacity = ?, fee = ?, status = ?, rating = ?, review_count = ?, price_range = ?, facilities = ?, accessibility = ?,
            social_media = ?, booking_url = ?, contact_email = ?, last_verified = ?, visibility = ?, owner_id = ?, updated_at = CURRENT_TIMESTAMP,
            source_id = ?, photo_links = ?, amenities = ?, tags = ?, images = ?, friend_user_ids = ?, community_id = ?
           WHERE external_id = ?`;
          updateParams = [
            area.uuid ?? null,
            area.name,
            latitude,
            longitude,
            area.type,
            area.description ?? '',
            area.website ?? '',
            area.phone ?? '',
            openingHoursStr,
            area.capacity ?? 0,
            feeValue,
            area.status ?? 'active',
            area.rating ?? 0,
            area.review_count ?? 0,
            area.price_range ?? '',
            facilitiesStr,
            accessibilityStr,
            socialMediaStr,
            area.booking_url ?? '',
            area.contact_email ?? '',
            area.last_verified ?? '',
            area.visibility ?? '',
            area.owner_id ?? '',
            area.source_id ?? '',
            photoLinksStr,
            amenitiesStr,
            tagsStr,
            imagesStr,
            friendUserIdsStr,
            area.community_id ?? null,
            area.external_id ?? ''
          ];
        }

        let result = { changes: 0 };
        if (updateQuery) {
          result = await this.db!.runAsync(updateQuery, updateParams);
          // ...existing code...
        }

        if (result.changes === 0) {
          // Insert if update didn't affect any rows
          // uuid üret
          let uuid = area.uuid;
          if (!uuid) {
            uuid = generateUUID();
          }
          const insertResult = await this.db!.runAsync(
            `INSERT INTO camping_areas (
              uuid, name, latitude, longitude, type, description, website, phone, opening_hours, capacity, fee, status, rating, review_count, price_range,
              facilities, accessibility, social_media, booking_url, contact_email, last_verified, visibility, owner_id, friend_user_ids, community_id, created_at, updated_at, external_id, source_id, photo_links, amenities, tags, images
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`
            , [
              uuid,
              area.name ?? '',
              (area as any).latitude ?? 0,
              area.longitude ?? 0,
              area.type ?? '',
              area.description ?? '',
              area.website ?? '',
              area.phone ?? '',
              openingHoursStr,
              area.capacity ?? 0,
              feeValue,
              area.status ?? 'active',
              area.rating ?? 0,
              area.review_count ?? 0,
              area.price_range ?? '',
              facilitiesStr,
              accessibilityStr,
              socialMediaStr,
              area.booking_url ?? '',
              area.contact_email ?? '',
              area.last_verified ?? '',
              area.visibility ?? '',
              area.owner_id ?? '',
              friendUserIdsStr,
              area.community_id ?? null,
              // created_at ve updated_at için parametre yok!
              '', // external_id
              area.source_id ?? '',
              photoLinksStr,
              amenitiesStr,
              tagsStr,
              imagesStr
            ]
          );
          // ...existing code...
          // INSERT sonrası external_id'yi local id ile güncelle
          if (insertResult && insertResult.lastInsertRowId) {
            await this.db!.runAsync(
              'UPDATE camping_areas SET external_id = ? WHERE id = ?',
              [String(insertResult.lastInsertRowId), insertResult.lastInsertRowId]
            );
          }
          return 'inserted';
        }
        return 'updated';
      } catch (error) {
        console.error('Error inserting/updating camping area:', { error, area });
        throw error;
      }
  }

  async searchCampingAreasByLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 50,
    types: string[] = ['camping', 'caravan_site', 'recreation', 'picnic'],
    includeUserAreas: boolean = true,
    currentUserId?: string | number,
    isSuperAdmin?: boolean
  ): Promise<CampingArea[]> {
    if (!this.db) await this.init();

    // Build WHERE clause - show areas that match type filter AND other conditions
    let whereClause = `status = 'active' AND deleted = 0`;
    let params: any[] = [];
    const mainConditions: string[] = [];
    // Superadmin ise visibility filtresi uygulanmaz
    if (!isSuperAdmin) {
      if (currentUserId !== undefined && currentUserId !== null && currentUserId !== '') {
        whereClause += ` AND ((visibility = 'private' AND owner_id = ?) OR (visibility IS NULL OR visibility != 'private'))`;
        params.push(String(currentUserId));
      } else {
        whereClause += ` AND (visibility IS NULL OR visibility != 'private')`;
      }
    }

    // Eğer types boşsa sadece user_submitted olanları göster
    if (!types || types.length === 0) {
      if (includeUserAreas) {
        mainConditions.push(`tags LIKE '%user_submitted%'`);
      } else {
        // Hiçbir alan gösterilmesin
        whereClause += ' AND 1=0';
      }
    } else {
      // Sadece tags LIKE '%type%' ...
      let orConditions = types.map(type => {
        params.push(`%${type}%`);
        return `(tags LIKE ?)`;
      });
      if (includeUserAreas) {
        orConditions.push(`tags LIKE '%user_submitted%'`);
      }
      mainConditions.push(`(${orConditions.join(' OR ')})`);
    }
    // Koşulları AND ile birleştir
    if (mainConditions.length > 0) {
      whereClause += ` AND (${mainConditions.join(' AND ')})`;
    }
    const query = `
      SELECT *
      FROM camping_areas 
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN tags LIKE '%user_submitted%' THEN 0
          ELSE 1
        END,
        name
    `;
  // ...existing code...

    // LOG EKLENDİ
    console.log('[DB][searchCampingAreasByLocation] Query:', query);
    console.log('[DB][searchCampingAreasByLocation] Params:', params);
    try {
      const result = await this.db!.getAllAsync(query, params);
      console.log('[DB][searchCampingAreasByLocation] Result count:', result.length);
      // Kullanıcı tarafından eklenen alanları ayrıca logla
      const userSubmitted = (result as any[]).filter(row => {
        let tagsObj = row.tags;
        if (typeof tagsObj === 'string') {
          try { tagsObj = JSON.parse(tagsObj); } catch { tagsObj = {}; }
        }
        return tagsObj && tagsObj.user_submitted === 'yes';
      });
      console.log('[DB][searchCampingAreasByLocation] User submitted count:', userSubmitted.length, userSubmitted.map(r => r.id || r.name));
      // Calculate distance in JavaScript using Haversine formula
      const areasWithDistance = (result as any[]).map(row => {
        const distance = this.calculateDistance(latitude, longitude, row.latitude, row.longitude);
        return {
          ...row,
          owner_id: row.owner_id !== undefined && row.owner_id !== null ? String(row.owner_id) : '',
          community_id: row.community_id !== undefined && row.community_id !== null ? row.community_id : undefined,
          distance_km: distance,
          amenities: (() => {
            if (typeof row.amenities === 'string') {
              try { return JSON.parse(row.amenities || '[]'); } catch { return []; }
            }
            return row.amenities;
          })(),
          tags: (() => {
            if (typeof row.tags === 'string') {
              const str = row.tags.trim();
              if (str.startsWith('{') || str.startsWith('[')) {
                try {
                  return JSON.parse(str);
                } catch (e) {
                  console.warn('JSON parse error for tags:', str, e);
                  return {};
                }
              } else {
                // Not a JSON string, treat as empty object
                return {};
              }
            }
            return row.tags;
          })(),
          images: (() => {
            if (typeof row.images === 'string') {
              try { return JSON.parse(row.images || '[]'); } catch { return []; }
            }
            return row.images || [];
          })(),
          facilities: (() => {
            if (typeof row.facilities === 'string') {
              try { return JSON.parse(row.facilities || '[]'); } catch { return []; }
            }
            return row.facilities || [];
          })(),
          accessibility: (() => {
            if (typeof row.accessibility === 'string') {
              try { return JSON.parse(row.accessibility || '[]'); } catch { return []; }
            }
            return row.accessibility || [];
          })(),
          social_media: (() => {
            if (typeof row.social_media === 'string') {
              try { return JSON.parse(row.social_media || '{}'); } catch { return {}; }
            }
            return row.social_media || {};
          })(),
          photo_links: (() => {
            if (typeof row.photo_links === 'string') {
              try { return JSON.parse(row.photo_links || '[]'); } catch { return []; }
            }
            return row.photo_links || [];
          })(),
          friend_user_ids: (() => {
            if (typeof row.friend_user_ids === 'string') {
              try { return JSON.parse(row.friend_user_ids || '[]'); } catch { return []; }
            }
            return row.friend_user_ids;
          })(),
          opening_hours: (() => {
            if (typeof row.opening_hours === 'string' && row.opening_hours.trim().length > 0 && (row.opening_hours.trim().startsWith('{') || row.opening_hours.trim().startsWith('['))) {
              try { return JSON.parse(row.opening_hours); } catch { return row.opening_hours; }
            }
            return row.opening_hours;
          })(),
          fee: row.fee === null ? null : Boolean(row.fee),
        };
      });

      // Filter by radius and sort by distance
      const filteredAreas = areasWithDistance
        .filter(area => area.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, 250) as CampingArea[];
      
      // ...existing code...
      
      return filteredAreas;
    } catch (error) {
      console.error('Error searching camping areas:', error);
      throw error;
    }
  }

  async deleteCampingArea(id: number) {
    if (!this.db) await this.init();
    try {
      // external_id ve owner_id'yi bul
      const row = await this.db!.getFirstAsync('SELECT external_id, owner_id FROM camping_areas WHERE id = ?', [id]) as any;
      const external_id = row ? row.external_id : null;
      const owner_id = row ? (row.owner_id !== undefined && row.owner_id !== null ? String(row.owner_id) : '') : '';

      // Pending change ekle (arka planda sync için)
      this.insertPendingChange('delete', id.toString(), { id, external_id, owner_id }).catch(() => {});

      // Local veritabanında soft delete uygula
      const result = await this.deleteCampingAreaLocal(id);
      if (!result || (result.changes !== undefined && result.changes === 0)) {
        throw new Error('Kamp alanı bulunamadı');
      }
      // Başarıyla silindi, hemen resolve et
      return true;
    } catch (error) {
      // Hata durumunda hızlıca hata fırlat
      throw error;
    }
  }

  async addToFavorites(campingAreaId: number): Promise<boolean> {
    if (!this.db) await this.init();
    try {
      await this.db!.runAsync(
        'INSERT OR IGNORE INTO favorites (camping_area_id) VALUES (?)',
        [campingAreaId]
      );
      return true;
    } catch (error) {
      console.error('Error adding to favorites:', error);
      return false;
    }
  }

  async removeFromFavorites(campingAreaId: number): Promise<boolean> {
    if (!this.db) await this.init();
    try {
      await this.db!.runAsync(
        'DELETE FROM favorites WHERE camping_area_id = ?',
        [campingAreaId]
      );
      return true;
    } catch (error) {
      console.error('Error removing from favorites:', error);
      return false;
    }
  }

  async isFavorite(campingAreaId: number): Promise<boolean> {
    if (!this.db) await this.init();

    try {
      const result = await this.db!.getFirstAsync(
        'SELECT id FROM favorites WHERE camping_area_id = ?',
        [campingAreaId]
      );
      return !!result;
    } catch (error) {
      console.error('Error checking favorite status:', error);
      return false;
    }
  }

  async getFavorites(): Promise<CampingArea[]> {
    if (!this.db) await this.init();
    try {
      // Tablo yoksa boş dizi döndür
      const tables = await this.db!.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='camping_areas';`);
      if (!tables || tables.length === 0) return [];
      const result = await this.db!.getAllAsync(`
        SELECT ca.* FROM camping_areas ca
        INNER JOIN favorites f ON ca.id = f.camping_area_id
        WHERE ca.status = 'active' AND ca.deleted = 0
        ORDER BY f.created_at DESC
      `);
      // --- LOG: friend_user_ids içeren favori kayıtları göster ---
      const friendAreas = (result as any[]).filter((row: any) => {
        if (!row.friend_user_ids) return false;
        try {
          const arr = typeof row.friend_user_ids === 'string' ? JSON.parse(row.friend_user_ids) : row.friend_user_ids;
          return Array.isArray(arr) && arr.length > 0;
        } catch { return false; }
      });
      if (friendAreas.length > 0) {
        console.log('[FRIEND_USER_IDS][FAVORITES]', friendAreas.map(a => ({ id: a.id, name: a.name, friend_user_ids: a.friend_user_ids })));
      } else {
        console.log('[FRIEND_USER_IDS][FAVORITES] friend_user_ids içeren favori kayıt yok.');
      }
      return (result as any[]).map((row: any) => {
        const obj: any = { ...row };
        try { obj.amenities = typeof row.amenities === 'string' ? JSON.parse(row.amenities || '[]') : row.amenities; } catch { obj.amenities = []; }
        try { obj.tags = typeof row.tags === 'string' ? JSON.parse(row.tags || '{}') : row.tags; } catch { obj.tags = {}; }
        try { obj.images = typeof row.images === 'string' ? JSON.parse(row.images || '[]') : (row.images || []); } catch { obj.images = []; }
        try { obj.facilities = typeof row.facilities === 'string' ? JSON.parse(row.facilities || '[]') : (row.facilities || []); } catch { obj.facilities = []; }
        try { obj.accessibility = typeof row.accessibility === 'string' ? JSON.parse(row.accessibility || '[]') : (row.accessibility || []); } catch { obj.accessibility = []; }
        try { obj.social_media = typeof row.social_media === 'string' ? JSON.parse(row.social_media || '{}') : (row.social_media || {}); } catch { obj.social_media = {}; }
        obj.owner_id = row.owner_id !== undefined && row.owner_id !== null ? String(row.owner_id) : '';
        obj.fee = row.fee === null ? null : Boolean(row.fee);
        obj.owner_username = row.owner_username ?? '';
        return obj;
      }) as CampingArea[];
    } catch (error) {
      console.error('Error getting favorites:', error);
      return [];
    }
  }

  // Haversine formula to calculate distance between two points
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  async getAllCampingAreas(): Promise<CampingArea[]> {
    if (!this.db) await this.init();
    try {
      // Tablo yoksa boş dizi döndür
      const tables = await this.db!.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='camping_areas';`);
      if (!tables || tables.length === 0) return [];
      const result = await this.db!.getAllAsync('SELECT * FROM camping_areas WHERE status = "active" AND deleted = 0 ORDER BY name');
      // --- LOG: friend_user_ids içeren kayıtları göster ---
      const friendAreas = result.filter((row: any) => {
        if (!row.friend_user_ids) return false;
        try {
          const arr = typeof row.friend_user_ids === 'string' ? JSON.parse(row.friend_user_ids) : row.friend_user_ids;
          return Array.isArray(arr) && arr.length > 0;
        } catch { return false; }
      });
      if (friendAreas.length > 0) {
        const friendAreasArr = friendAreas as any[];
        console.log('[FRIEND_USER_IDS][LOCAL]', friendAreasArr.map(a => ({ id: a.id, name: a.name, friend_user_ids: a.friend_user_ids })));
      } else {
  // ...existing code...
      }
      // --- DEBUG: status/deleted filtresi olmadan friend_user_ids içeren kayıtları göster ---
      try {
        const allFriendAreas = await this.db!.getAllAsync('SELECT id, name, friend_user_ids, status, deleted FROM camping_areas');
        const friendRows = allFriendAreas.filter((row: any) => {
          if (!row.friend_user_ids) return false;
          try {
            const arr = typeof row.friend_user_ids === 'string' ? JSON.parse(row.friend_user_ids) : row.friend_user_ids;
            return Array.isArray(arr) && arr.length > 0;
          } catch { return false; }
        });
        if (friendRows.length > 0) {
          // ...existing code...
        } else {
          // ...existing code...
        }
      } catch (e) {
        console.error('[FRIEND_USER_IDS][ALL_LOCAL][ERROR]', e);
      }
      return (result as any[]).map((row: any) => {
        const obj: any = { ...row };
        try { obj.amenities = typeof row.amenities === 'string' ? JSON.parse(row.amenities || '[]') : row.amenities; } catch { obj.amenities = []; }
        try { obj.tags = typeof row.tags === 'string' ? JSON.parse(row.tags || '{}') : row.tags; } catch { obj.tags = {}; }
        try { obj.images = typeof row.images === 'string' ? JSON.parse(row.images || '[]') : (row.images || []); } catch { obj.images = []; }
        try { obj.facilities = typeof row.facilities === 'string' ? JSON.parse(row.facilities || '[]') : (row.facilities || []); } catch { obj.facilities = []; }
        try { obj.accessibility = typeof row.accessibility === 'string' ? JSON.parse(row.accessibility || '[]') : (row.accessibility || []); } catch { obj.accessibility = []; }
        try { obj.social_media = typeof row.social_media === 'string' ? JSON.parse(row.social_media || '{}') : (row.social_media || {}); } catch { obj.social_media = {}; }
        try { obj.photo_links = typeof row.photo_links === 'string' ? JSON.parse(row.photo_links || '[]') : (row.photo_links || []); } catch { obj.photo_links = []; }
        try { obj.friend_user_ids = typeof row.friend_user_ids === 'string' ? JSON.parse(row.friend_user_ids || '[]') : row.friend_user_ids; } catch { obj.friend_user_ids = []; }
        try {
          if (typeof row.opening_hours === 'string' && row.opening_hours.trim().length > 0 && (row.opening_hours.trim().startsWith('{') || row.opening_hours.trim().startsWith('['))) {
            obj.opening_hours = JSON.parse(row.opening_hours);
          } else {
            obj.opening_hours = row.opening_hours;
          }
        } catch { obj.opening_hours = row.opening_hours; }
        obj.owner_id = row.owner_id !== undefined && row.owner_id !== null ? String(row.owner_id) : '';
        obj.community_id = row.community_id !== undefined && row.community_id !== null ? row.community_id : undefined;
        obj.fee = row.fee === null ? null : Boolean(row.fee);
        obj.owner_username = row.owner_username ?? '';
        return obj;
      }) as CampingArea[];
    } catch (error) {
      console.error('Error getting all camping areas:', error);
      return [];
    }
  }

  async getStats() {
    if (!this.db) await this.init();

    try {
      const totalResult: any = await this.db!.getFirstAsync('SELECT COUNT(*) as total FROM camping_areas WHERE status = "active" AND deleted = 0');
      const typeResults: any[] = await this.db!.getAllAsync(`
        SELECT type, COUNT(*) as count 
        FROM camping_areas 
        WHERE status = 'active' AND deleted = 0
        GROUP BY type
      `);
      // Kullanıcı alanları istatistikleri (artık user alanı yok, count 0 dönecek)
      const userAreasResult: any = { count: 0 };
      console.log('User areas in database:', userAreasResult.count || 0);

      return {
        total: totalResult && typeof totalResult.total === 'number' ? totalResult.total : 0,
        userAreas: userAreasResult && typeof userAreasResult.count === 'number' ? userAreasResult.count : 0,

        byType: typeResults.reduce((acc: Record<string, number>, row: any) => {
          acc[row.type] = row.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { total: 0, userAreas: 0, byType: {} };
    }
  }

  // Overpass ve Rentech senkronizasyon fonksiyonları kaldırıldı. Artık sadece API ve kullanıcı eklemeleri desteklenecek.
  // --- COMMUNITY MEMBERS ---

  /**
   * Topluluğa üye ekle
   */
  async addCommunityMember(community_id: number, user_id: number, role: string = 'member', status: string = 'active'): Promise<number> {
    return DatabaseManager.enqueue(async () => {
      if (!this.db) await this.init();
      const result = await this.db!.runAsync(
        `INSERT INTO community_members (community_id, user_id, role, status, joined_at, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [community_id, user_id, role, status]
      );
      return result.lastInsertRowId;
    });
  }

  /**
   * Belirli bir kullanıcının topluluktaki rolünü getirir
   */
  async getUserRoleInCommunity(community_id: number, user_id: number): Promise<string | null> {
    if (!this.db) await this.init();
    const row = await this.db!.getFirstAsync(
      `SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = 'active'`,
      [community_id, user_id]
    ) as { role?: string } | undefined;
    return row && typeof row.role === 'string' ? row.role : null;
  }

  /**
   * Belirli bir kullanıcının topluluktaki rolünü ve durumunu getirir
   */
  async getUserMembershipInCommunity(community_id: number, user_id: number): Promise<{ role: string; status: string } | null> {
    if (!this.db) await this.init();
    const row = await this.db!.getFirstAsync(
      `SELECT role, status FROM community_members WHERE community_id = ? AND user_id = ?`,
      [community_id, user_id]
    ) as { role?: string; status?: string } | undefined;
    if (row && typeof row.role === 'string' && typeof row.status === 'string') {
      return { role: row.role, status: row.status };
    }
    return null;
  }
  /**
   * Kullanılan SQLite veritabanındaki tüm tablo adlarını logla (debug için)
   */
  async listAllTables() {
    if (!this.db) await this.init();
    try {
      const tables = await this.db!.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
      const tableNames = tables.map((t: any) => t.name);
      console.log('[DB][listAllTables] Mevcut tablolar:', tableNames);
      return tableNames;
    } catch (err) {
      console.error('[DB][listAllTables] Tablo listesi alınamadı:', err);
      return [];
    }
  }
}

// Getter function to ensure database is initialized when accessed (backward compatibility)
export function getDatabase(): DatabaseManager {
  return DatabaseManager.getInstance();
}