import { API_URL } from './config';
import { getToken } from './auth';

// user_id ile kullanıcı bilgisi çek
export async function getUserById(user_id: number): Promise<{ username: string; tag: string } | null> {
  console.log('getUserById çağrıldı:', user_id);
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/users/${user_id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      console.log('getUserById: response not ok', res.status);
      return null;
    }
    const data = await res.json();
    console.log('getUserById API yanıtı:', data);
    // username ve tag alanı varsa döndür
    return {
      username: data.username || '',
      tag: data.tag || ''
    };
  } catch (err) {
    console.log('getUserById hata:', err);
    return null;
  }
}
import { getDatabase } from '@/lib/database';

export async function getUserMembership(community_id: number, user_id: number) {
  const db = getDatabase();
  return db.getUserMembershipInCommunity(community_id, user_id);
}
