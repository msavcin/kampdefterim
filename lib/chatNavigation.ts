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

export async function openConversationOrCommunity(router: RouterLike, convId: string | number, opts?: { replace?: boolean }) {
  const doReplace = opts?.replace !== false;
  try {
    const meta = await resolveConversationMeta(convId);
    const foundConvId = meta?.id ?? meta?.conversation_id ?? meta?.conversation?.id ?? null;
    const communityId = meta?.community_id ?? (meta?.community && meta.community.id) ?? null;
    if (communityId) {
      if (doReplace) {
        try { router.replace({ pathname: '/chat/community/[communityId]', params: { communityId: String(communityId) } }); return; } catch (e) {}
        try { router.replace(`/chat/community/${communityId}`); return; } catch (e) {}
      } else {
        try { router.push({ pathname: '/chat/community/[communityId]', params: { communityId: String(communityId) } }); return; } catch (e) {}
        try { router.push(`/chat/community/${communityId}`); return; } catch (e) {}
      }
    }

    // fallback: open conversation screen
    if (doReplace) {
      try { router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } }); return; } catch (e) {}
      try { router.replace(`/chat/${convId}`); return; } catch (e) {}
    } else {
      try { router.push({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } }); return; } catch (e) {}
      try { router.push(`/chat/${convId}`); return; } catch (e) {}
    }
  } catch (e) {
    // final fallback
    if (opts?.replace !== false) try { router.replace('/chat'); } catch (err) { }
    else try { router.push('/chat'); } catch (err) { }
  }
}

export default { openConversationOrCommunity };
