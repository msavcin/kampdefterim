// Topluluk üyesinin status'unu güncelleyen API fonksiyonu
import { getToken } from './auth';
import { API_URL } from './config';

export async function updateMemberStatus(communityId: number, userId: number, status: string) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/communities/${communityId}/members/${userId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  const text = await res.text();
  console.log('updateMemberStatus status:', res.status, 'response:', text);
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Geçersiz yanıt', status: res.status, raw: text };
  }
}
