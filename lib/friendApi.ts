import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';
import { Friend } from '@/types/friend';

export async function fetchFriendsList(userId: string | number | undefined): Promise<Friend[]> {
  if (!userId) return [];
  const token = await getToken();
  if (!token) throw new Error('Oturum bulunamadı (token eksik)');
  const res = await fetch(`${API_URL}/friends?user_id=${userId}`, {
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error('Arkadaşlar yüklenemedi');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
