import { apiFetch } from './apiFetch';
import { API_URL } from './config';

type RouterLike = { replace?: (...args:any[])=>void; push?: (...args:any[])=>void } | any;

async function resolveConversationMeta(convId: string | number) {
  try {
    // try direct conversation endpoint first
    const res = await apiFetch(`${API_URL}/chat/conversations/${convId}`);
    if (res && res.ok) {
      try { const j = await res.json(); return j; } catch (e) { /* ignore parse */ }
    }
  } catch (e) { /* ignore */ }

  try {
    // fallback to list and find
    const listRes = await apiFetch(`${API_URL}/chat/conversations`);
    if (listRes && listRes.ok) {
      const data = await listRes.json();
      if (Array.isArray(data)) {
        const found = data.find((c:any) => String(c?.id ?? c?.conversation_id ?? c?.conversation?.id) === String(convId));
        if (found) return found;
      }
    }
  } catch (e) { /* ignore */ }

  return null;
}

export async function openConversationOrCommunity(router: RouterLike, convId: string | number, opts?: { replace?: boolean; skipRemote?: boolean }) {
  console.log('[openConversationOrCommunity] open', convId, 'opts', opts);
  const doReplace = opts?.replace !== false;

  const goConversation = () => {
    if (doReplace) {
      try { router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } }); return true; } catch (e) { console.warn('[openConversationOrCommunity] replace conversation failed', e); }
      try { router.replace(`/chat/${convId}`); return true; } catch (e) { console.warn('[openConversationOrCommunity] replace conversation fallback failed', e); }
    } else {
      try { router.push({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } }); return true; } catch (e) { console.warn('[openConversationOrCommunity] push conversation failed', e); }
      try { router.push(`/chat/${convId}`); return true; } catch (e) { console.warn('[openConversationOrCommunity] push conversation fallback failed', e); }
    }
    return false;
  };

  const goCommunity = (communityId: string | number) => {
    if (doReplace) {
      try { router.replace({ pathname: '/chat/community/[communityId]', params: { communityId: String(communityId) } }); return true; } catch (e) { console.warn('[openConversationOrCommunity] replace community failed', e); }
      try { router.replace(`/chat/community/${communityId}`); return true; } catch (e) { console.warn('[openConversationOrCommunity] replace community fallback failed', e); }
    } else {
      try { router.push({ pathname: '/chat/community/[communityId]', params: { communityId: String(communityId) } }); return true; } catch (e) { console.warn('[openConversationOrCommunity] push community failed', e); }
      try { router.push(`/chat/community/${communityId}`); return true; } catch (e) { console.warn('[openConversationOrCommunity] push community fallback failed', e); }
    }
    return false;
  };

  // Offline / hotspot: API asılı kalmasın — sohbet ekranına hemen git
  if (opts?.skipRemote) {
    goConversation();
    return;
  }

  try {
    const meta = await Promise.race([
      resolveConversationMeta(convId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 700)),
    ]);
    const communityId = meta?.community_id ?? (meta?.community && meta.community.id) ?? null;
    if (communityId) {
      goCommunity(communityId);
      return;
    }
    goConversation();
  } catch (e) {
    if (!goConversation()) {
      if (opts?.replace !== false) try { router.replace('/chat'); } catch (err) { }
      else try { router.push('/chat'); } catch (err) { }
    }
  }
}

export default { openConversationOrCommunity };
