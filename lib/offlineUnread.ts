/**
 * offlineUnread.ts
 * Offline (WiFi peer) mesajlar için konuşma bazlı okunmamış mesaj sayacı.
 * AsyncStorage üzerinde { [convId]: count } haritası olarak tutulur.
 *
 * Kullanım akışı:
 *  - Peer mesajı geldiğinde → incrementOfflineUnread(convId)
 *  - Kullanıcı konuşmayı açtığında → clearOfflineUnread(convId)
 *  - Cihaz online olduğunda → clearAllOfflineUnread()
 *  - Badge için → getTotalOfflineUnread()
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@offline_unread_v1';

async function load(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function save(map: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

/** Belirtilen konuşma için okunmamış sayısını 1 artırır. */
export async function incrementOfflineUnread(convId: string): Promise<void> {
  const map = await load();
  map[String(convId)] = (map[String(convId)] || 0) + 1;
  await save(map);
}

/** Belirtilen konuşmanın okunmamış sayısını sıfırlar (kullanıcı ekranı açtı). */
export async function clearOfflineUnread(convId: string): Promise<void> {
  const map = await load();
  delete map[String(convId)];
  await save(map);
}

/** Tüm offline okunmamış sayıları sıfırlar (cihaz online oldu). */
export async function clearAllOfflineUnread(): Promise<void> {
  await save({});
}

/** Toplam offline okunmamış mesaj sayısını döner. */
export async function getTotalOfflineUnread(): Promise<number> {
  const map = await load();
  return Object.values(map).reduce((a, b) => a + b, 0);
}

/** Konuşma bazlı offline okunmamış haritasını döner: { [convId]: count } */
export async function getOfflineUnreadMap(): Promise<Record<string, number>> {
  return load();
}
