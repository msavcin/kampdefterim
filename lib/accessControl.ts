// lib/accessControl.ts
// Tüm kullanıcı erişim/yetki filtreleri burada merkezi olarak tanımlanır.
import type { CampingArea } from './database';

export function filterCampingAreasByUser(
  campingAreas: CampingArea[],
  user?: any,
  isGuest?: boolean
): CampingArea[] {
  if (!user) return [];
  if (user.role === 'superadmin') {
    return campingAreas;
  } else if (isGuest && user.id) {
    // Guest ise sadece kendi oluşturduklarını görür
    return campingAreas.filter(a => String((a as any).owner_id) === String(user.id));
  } else if (user.role === 'community_leader' && user.community_id) {
    // Topluluk lideri ise topluluğa ait, public ve arkadaş ile paylaşılanları görür
    return campingAreas.filter(a => {
      const isCommunity = (a as any).community_id && String((a as any).community_id) === String(user.community_id);
      const isPublic = a.visibility === 'public';
      let friendList = (a as any).friend_user_ids;
      if (typeof friendList === 'string') {
        try { friendList = JSON.parse(friendList); } catch { friendList = []; }
      }
      // Tüm id'leri string'e çevirerek karşılaştır
      const userIdStr = String(user.id);
      const friendListStr = Array.isArray(friendList) ? friendList.map(String) : [];
      const isFriend = friendListStr.includes(userIdStr);
      if (isFriend) {
        // Debug log
        console.log('[DEBUG][ACCESS] Arkadaş paylaşımı: area.id', a.id, 'friend_user_ids:', friendListStr, 'user.id:', userIdStr);
      }
      return isCommunity || isPublic || isFriend;
    });
  } else if (user.id) {
    // Normal kullanıcı ise kendine, topluluğa, arkadaşına veya public olanları görür
    return campingAreas.filter(a => {
      const isOwner = String((a as any).owner_id) === String(user.id);
      const isCommunity = (a as any).community_id && user.community_id && String((a as any).community_id) === String(user.community_id);
      let friendList = (a as any).friend_user_ids;
      if (typeof friendList === 'string') {
        try { friendList = JSON.parse(friendList); } catch { friendList = []; }
      }
      // Tüm id'leri string'e çevirerek karşılaştır
      const userIdStr = String(user.id);
      const friendListStr = Array.isArray(friendList) ? friendList.map(String) : [];
      const isFriend = friendListStr.includes(userIdStr);
      if (isFriend) {
        // Debug log
        console.log('[DEBUG][ACCESS] Arkadaş paylaşımı: area.id', a.id, 'friend_user_ids:', friendListStr, 'user.id:', userIdStr);
      }
      const isPublic = a.visibility === 'public';
      return isOwner || isCommunity || isFriend || isPublic;
    });
  }
  return [];
}
