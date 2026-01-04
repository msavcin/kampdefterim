// Belirli bir valilik_id'ye ait duyuruları getirir
export async function listAnnouncementsByValilikId(valilikId: number) {
  const token = await getToken();
  const url = `${API_URL}/announcements/valilik/${valilikId}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
import { getToken } from './auth';
import { API_URL } from './config';

export async function listAnnouncements(communityId?: number) {
  const token = await getToken();
  let url = `${API_URL}/announcements`;
  if (typeof communityId === 'number' && !isNaN(communityId)) {
    url += `?community_id=${communityId}`;
  }
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = [];
  }
  if (!Array.isArray(data)) {
    data = [];
  }
  return data;
}

export async function getAnnouncement(id: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/announcements/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function addAnnouncement(data: any) {
  const token = await getToken();
  // community_id undefined veya boşsa göndermeyelim
  const sendData = { ...data };
  if (sendData.community_id === undefined || sendData.community_id === null || sendData.community_id === '') {
    delete sendData.community_id;
  }
  console.log('[addAnnouncement] API\'ya gönderilen veri:', sendData);
  const res = await fetch(`${API_URL}/announcements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(sendData),
  });
  let responseJson;
  try {
    responseJson = await res.json();
  } catch (e) {
    responseJson = null;
  }
  console.log('[addAnnouncement] API yanıtı:', res.status, responseJson);
  return responseJson;
}

export async function updateAnnouncement(id: number, data: any) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/announcements/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAnnouncement(id: number) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/announcements/${id}`, {
    method: 'DELETE',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return res;
}
