// Topluluk üyesini tamamen sil (DELETE)
import { addPendingChange } from './pendingChanges';
import NetInfo from '@react-native-community/netinfo';

export async function removeMember(communityId: number, userId: number) {
  const token = await getToken();
  const isConnected = (await NetInfo.fetch()).isConnected;
  const url = `${API_URL}/communities/${communityId}/members/${userId}`;
  if (!isConnected) {
    // Offline ise pending changes kuyruğuna ekle
    await addPendingChange({
      type: 'delete',
      campground_id: null,
      data: { communityId, userId, url, entity: 'community_member' }
    });
    console.log('[removeMember] OFFLINE, pending changes kuyruğuna eklendi:', { communityId, userId, url });
    return { success: true, pending: true };
  }
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const status = res.status;
    let responseBody = null;
    try {
      responseBody = await res.json();
    } catch (e) {
      responseBody = null;
    }
    console.log('[removeMember] HTTP status:', status, 'Yanıt:', responseBody);
    if (status === 204) {
      return { success: true };
    }
    if (responseBody && typeof responseBody === 'object') {
      return { ...responseBody, status };
    }
    return { error: 'Geçersiz yanıt', status };
  } catch (err) {
    console.log('[removeMember] HATA:', err);
    // Hata olursa pending changes kuyruğuna ekle
    await addPendingChange({
      type: 'delete',
      campground_id: null,
      data: { communityId, userId, url, entity: 'community_member' }
    });
    return { success: true, pending: true };
  }
}
// Tek topluluk detayını çekmek için
export async function getCommunityById(id: number) {
  const res = await fetch(`${API_URL}/communities/${id}`);
  return res.json();
}
// Kullanıcı ve topluluk işlemleri için temel API modülü
// JWT yönetimi ve endpoint çağrıları

import { getToken, saveToken, saveRefreshToken } from './auth';
import { API_URL } from './config';
import { apiFetch } from './apiFetch';

// --- Kullanıcı ---
export async function registerUser({ name, username, email, password, communityId, trial_user, agreement_accepted }: { name: string, username: string, email: string, password: string, communityId?: number, trial_user?: boolean, agreement_accepted?: boolean }) {
  const res = await fetch(`${API_URL}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, username, email, password, community_id: communityId, trial_user, agreement_accepted }),
  });
  const data = await res.json();
  if (data.token) {
    await saveToken(data.token);
    console.log('[AUTH] Yeni access token kaydedildi:', data.token);
  }
  if (data.refreshToken) {
    await saveRefreshToken(data.refreshToken);
    console.log('[AUTH] Yeni refresh token kaydedildi:', data.refreshToken);
  }
  console.log('registerUser yanıtı:', data);
  return data;
}

export async function loginUser({ identifier, password }: { identifier: string, password: string }) {
  // identifier: email veya kullanıcı adı olabilir
  let body: any = { password };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier)) {
    body.email = identifier;
  } else {
    body.username = identifier;
    body.name = identifier;
  }
  const res = await fetch(`${API_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.token) {
    await saveToken(data.token);
    console.log('[AUTH] Yeni access token kaydedildi:', data.token);
  }
  if (data.refreshToken) {
    await saveRefreshToken(data.refreshToken);
    console.log('[AUTH] Yeni refresh token kaydedildi:', data.refreshToken);
  }
  console.log('loginUser yanıtı:', data);
  return data; // JWT döner
}

export async function getMe() {
  const token = await getToken();
  console.log('[getMe] Kullanılan token:', token);
  const res = await apiFetch(`${API_URL}/users/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

// --- Topluluk ---
export async function listCommunities() {
  const res = await fetch(`${API_URL}/communities`);
  return res.json();
}

export async function getCommunity(id: number) {
  const res = await fetch(`${API_URL}/communities/${id}`);
  return res.json();
}

export async function joinCommunity(id: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/communities/${id}/join`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function listCommunityMembers(id: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/communities/${id}/members`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

// --- Topluluk Üyelik Onayları (Lider için) ---
export async function approveMember(communityId: number, userId: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/communities/${communityId}/members/${userId}/approve`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function rejectMember(communityId: number, userId: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/communities/${communityId}/members/${userId}/reject`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
