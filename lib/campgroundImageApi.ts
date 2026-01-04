import { API_URL } from './config';
import { getToken } from './auth';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { apiFetch } from '@/lib/apiFetch';

export interface CampgroundImage {
  image_id: string;
  campground_id: number;
  image_url: string | null;
  local_uri: string | null;
  status: 'pending' | 'uploaded' | 'failed';
  uploaded_by?: number;
  created_by?: number;
  source?: string;
}

// 1. Fotoğraf ekleme ve sunucuya yükleme

export async function uploadCampgroundImage({
  campground_id,
  local_uri,
  image_id,
  uploaded_by = 0,
  created_by = 0,
  source = 'mobile_app',
}: {
  campground_id: number;
  local_uri: string;
  image_id: string;
  uploaded_by: number;
  created_by: number;
  source?: string;
}): Promise<CampgroundImage> {

  const token = await getToken();

  console.log('[uploadCampgroundImage] Başlatıldı:', { campground_id, local_uri, image_id });
  const formData = new FormData();
  formData.append('file', {
    uri: local_uri,
    name: `${image_id}.jpg`,
    type: 'image/jpeg',
  } as any);
  formData.append('campground_id', String(campground_id));
  formData.append('image_id', image_id);
  console.log('[uploadCampgroundImage] FormData hazırlandı');

  // API_URL ve endpointi logla
  const apiUrl = `${API_URL}/campground_images/upload`;
  console.log('[uploadCampgroundImage] Kullanılan API URL:', apiUrl);

  let data = null;
  let status: 'pending' | 'uploaded' | 'failed' = 'pending';
  let image_url: string | null = null;
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        // 'Content-Type': 'multipart/form-data', // Bunu elle ekleme! RN FormData ile otomatik ekler
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    console.log('[uploadCampgroundImage] API isteği gönderildi');
    if (!response.ok) {
      const errText = await response.text();
      console.log('[uploadCampgroundImage] Sunucu hatası:', response.status, errText);
      status = 'failed';
    } else {
      try {
        data = await response.json();
        console.log('[uploadCampgroundImage] API yanıtı:', data);
        image_url = data && data.image_url ? data.image_url : null;
        status = image_url ? 'uploaded' : 'failed';
      } catch (jsonErr) {
        console.log('[uploadCampgroundImage] Yanıt JSON parse hatası:', jsonErr);
        status = 'failed';
      }
    }
  } catch (err) {
    console.log('[uploadCampgroundImage] HATA:', err);
    status = 'failed';
  }
  return {
    image_id,
    campground_id,
    image_url,
    local_uri,
    status,
    uploaded_by,
    created_by,
    source,
  };
}

// 3. Fotoğraf silme (local ve sunucu)
export async function deleteCampgroundImage({
  image_id,
  server_id,
  onLocalDelete,
}: {
  image_id: string;
  server_id?: number;
  onLocalDelete?: () => void;
}): Promise<boolean> {
  // Önce localden sil (ör: local DB veya dosya sisteminden)
  if (onLocalDelete) {
    try { onLocalDelete(); } catch {}
  }
  // Sunucudan sil
  const token = await getToken();
  let url = '';
  if (server_id) {
    url = `${API_URL}/campground_images/${server_id}`;
  } else {
    url = `${API_URL}/campground_images?image_id=${encodeURIComponent(image_id)}`;
  }
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return res.ok;
}
// 2. Fotoğraf listeleme ve local ile id bazında merge
export async function fetchAndMergeCampgroundImages({
  campground_id,
  localImages = [],
}: {
  campground_id: number;
  localImages?: CampgroundImage[];
}): Promise<CampgroundImage[]> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/campground_images?campground_id=${campground_id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Fotoğraflar sunucudan alınamadı');
  const remoteImages = await res.json();
  // remoteImages: [{ image_id, image_url, ... }]
  // 1. id ile eşleşenleri güncelle, sadece localde olanları ekle
  const remoteMap = Object.fromEntries(remoteImages.map((img: any) => [img.image_id, img]));
  const merged: CampgroundImage[] = [];
  // Sunucudan gelenler
  for (const r of remoteImages) {
    const local = localImages.find(l => l.image_id === r.image_id);
    merged.push({
      image_id: r.image_id,
      campground_id: r.campground_id,
      image_url: r.image_url,
      local_uri: local?.local_uri || null,
      status: 'uploaded',
      uploaded_by: r.uploaded_by,
      created_by: r.created_by,
      source: r.source,
    });
  }
  // Sadece localde olup sunucuda olmayanlar (pending/fail)
  for (const l of localImages) {
    if (!remoteMap[l.image_id]) {
      merged.push(l);
    }
  }
  return merged;
}
