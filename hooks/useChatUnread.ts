import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { onChatEvent } from '@/lib/chatEvents';
import { loadReadMap } from '@/lib/readMap';
import { createChatSocket } from '@/lib/chatSocket';
import { getToken } from '@/lib/auth';
import { getMe } from '@/lib/userCommunityApi';

const DELETED_KEY = '@chat_deleted_v1';

async function loadDeletedMap() {
  try {
    const raw = await AsyncStorage.getItem(DELETED_KEY);
    if (!raw) return { conversations: {}, participants: {}, messages: {} };
    const parsed = JSON.parse(raw);
    parsed.conversations = parsed.conversations || {};
    parsed.participants = parsed.participants || {};
    parsed.messages = parsed.messages || {};
    return parsed;
  } catch (e) {
    return { conversations: {}, participants: {}, messages: {} };
  }
}

function getConvLastTime(conv: any) {
  if (!conv) return 0;
  const cand = conv.updated_at ?? conv.updatedAt ?? conv.last_message?.created_at ?? conv.last_message?.createdAt ?? conv.last_message_at ?? conv.lastMessage?.created_at ?? conv.lastMessage?.createdAt;
  const t = cand ? (typeof cand === 'number' ? cand : Date.parse(String(cand))) : NaN;
  return !isNaN(t) ? t : 0;
}

function extractParticipantIds(conv: any) {
  const ids = new Set<string>();
  if (!conv) return [];
  const pushId = (v: any) => { if (v == null) return; const s = String(v); if (s) ids.add(s); };
  if (Array.isArray(conv.participants)) {
    for (const p of conv.participants) {
      if (!p) continue;
      if (typeof p === 'object') {
        pushId(p.user_id ?? p.recipient_id ?? p.other_user_id ?? p.id);
      } else {
        pushId(p);
      }
    }
  }
  const keys = ['recipient_id','other_user_id','user_id','participant_id'];
  for (const k of keys) if (conv[k]) pushId(conv[k]);
  const candidateObjs = ['other_user','recipient','user','participant_user','participant','other_user_object','recipient_object'];
  for (const k of candidateObjs) {
    const u = conv[k];
    if (u && typeof u === 'object') pushId(u.user_id ?? u.id);
  }
  return Array.from(ids);
}

export function useChatUnread() {
  const [personalUnread, setPersonalUnread] = useState<number>(0);
  const [communityUnread, setCommunityUnread] = useState<number>(0);
  const [localUserId, setLocalUserId] = useState<number | string | null>(null);
  const localUserIdRef = useRef<number | string | null>(null);
  const personalUnreadRef = useRef<number>(0);
  const convsRef = { current: new Map<string, any>() } as { current: Map<string, any> };

  const getLastMessageSenderId = (conv:any) => {
    const last = conv?.last_message ?? conv?.lastMessage ?? conv?.conversation?.last_message ?? conv?.conversation?.lastMessage;
    if (!last || typeof last !== 'object') return null;
    return last?.sender_id ?? last?.senderId ?? last?.from_id ?? last?.user_id ?? last?.userId ?? null;
  };

  const isUnreadFromSelf = (conv:any) => {
    if (!conv || Number(conv?.unread_count) <= 0) return false;
    const senderId = localUserIdRef.current;
    if (senderId == null) return false;
    const lastSender = getLastMessageSenderId(conv);
    return lastSender != null && String(lastSender) === String(senderId);
  };

  const fetchUnread = useCallback(async () => {
    try {
      console.log('[useChatUnread] fetchUnread start');
      const res = await apiFetch(`${API_URL}/chat/conversations`);
      if (!res || !res.ok) {
        console.log('[useChatUnread] fetchUnread failed status', res?.status);
        setPersonalUnread(0);
        setCommunityUnread(0);
        return;
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      const deletedMap = await loadDeletedMap();
      const readMap = await loadReadMap();
      // build a local map of conversations after applying deleted/read overlays
      try {
        const map = new Map<string, any>();
        for (const c of arr) {
          try {
            const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
            const lastTime = getConvLastTime(c);
            if (convId && deletedMap.conversations && deletedMap.conversations[String(convId)]) {
              const del = Number(deletedMap.conversations[String(convId)]) || 0;
              if (del && lastTime && lastTime <= del) continue;
            }
            const pIds = extractParticipantIds(c);
            let skip = false;
            for (const pid of pIds) {
              const pd = deletedMap.participants?.[String(pid)];
              if (pd && lastTime && lastTime <= Number(pd)) { skip = true; break; }
            }
            if (skip) continue;
            const readTs = readMap && convId ? Number(readMap[String(convId)]) || 0 : 0;
            const entry = { ...c };
            if (readTs && lastTime && readTs >= lastTime) {
              entry.unread_count = 0;
            }
            map.set(String(convId ?? Math.random()), entry);
          } catch (e) { /* ignore per-conv errors */ }
        }
        convsRef.current = map;
        const isCommunityConv = (c:any) => {
          if (!c) return false;
          try {
            const type = String(c?.type ?? c?.conversation_type ?? c?.kind ?? '').toLowerCase();
            const communityTypeNames = ['community','group','channel','community_chat','group_chat','community_conversation'];
            if (type && communityTypeNames.includes(type)) return true;
          } catch (e) { }
          try {
            if (c?.community_id) return true;
            if (c?.community && (c.community.id || c.community.community_id)) return true;
            if (c?.conversation && (c.conversation.community_id || (c.conversation.community && (c.conversation.community.id || c.conversation.community.community_id)))) return true;
            if (c?.metadata && (c.metadata.community_id || c.metadata.communityId)) return true;
            if (c?.meta && (c.meta.community_id || c.meta.communityId)) return true;
          } catch (e) { }
          return false;
        };
        const personalTotal = Array.from(map.values()).reduce((acc:number, c:any) => {
          if (isCommunityConv(c)) return acc;
          if (isUnreadFromSelf(c)) return acc;
          return acc + (Number(c?.unread_count) || 0);
        }, 0);
        const communityTotal = Array.from(map.values()).reduce((acc:number, c:any) => {
          if (!isCommunityConv(c)) return acc;
          if (isUnreadFromSelf(c)) return acc;
          return acc + (Number(c?.unread_count) || 0);
        }, 0);
        console.log('[useChatUnread] fetchUnread result personalTotal=', personalTotal, 'communityTotal=', communityTotal, 'convs=', map.size);
        personalUnreadRef.current = personalTotal;
        setPersonalUnread(personalTotal);
        setCommunityUnread(communityTotal);
      } catch (e) {
        console.warn('[useChatUnread] fetchUnread build map failed', e);
        setPersonalUnread(0);
        setCommunityUnread(0);
      }
    } catch (e) {
      console.warn('[useChatUnread] fetch error', e);
      setPersonalUnread(0);
      setCommunityUnread(0);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let socketRef: ReturnType<typeof createChatSocket> | null = null;
    (async () => {
      try {
        const me = await getMe().catch(() => null);
        const resolvedMeId = me?.id ?? me?.user_id ?? me?.userId ?? null;
        if (resolvedMeId != null) {
          setLocalUserId(resolvedMeId);
          localUserIdRef.current = resolvedMeId;
        }
      } catch (e) {
        // ignore profile fetch failures
      }
      await fetchUnread();
      try {
        const token = await getToken();
        if (token) {
          const handler = (msg: any) => {
            try {
              const t = String(msg?.type || '');
              if (t === 'unread_updated') {
                // re-fetch authoritative totals so we can exclude community conversations
                try { fetchUnread(); } catch (err) { console.warn('[useChatUnread] fetch on unread_updated failed', err); }
                return;
              }
              if (['message','conversation_created','client_message_sent','conversation_updated','message_deleted','message_received'].includes(t)) {
                fetchUnread();
              }
            } catch (e) { console.warn('[useChatUnread] socket handler error', e); }
          };
          socketRef = createChatSocket(handler);
          try { socketRef.connect(token); } catch (e) { console.warn('[useChatUnread] socket connect failed', e); }
        } else {
          console.log('[useChatUnread] no token, socket not started');
        }
      } catch (e) {
        console.warn('[useChatUnread] socket init error', e);
      }
    })();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && mounted) {
        try { fetchUnread(); } catch (err) { console.warn('[useChatUnread] AppState fetchUnread failed', err); }
      }
    });

    const unsub = onChatEvent((e: any) => {
      if (!mounted) return;
      if (__DEV__) {
        try { console.log('[useChatUnread] onChatEvent', e?.type, e?.payload ? 'payload' : ''); } catch {}
      }
      // If a specific conv was marked read locally, update our local map immediately
      if (e?.type === 'mark_read') {
        try {
          const convId = e?.payload?.convId ?? e?.payload?.conversationId ?? e?.payload?.convID;
          if (convId) {
            const key = String(convId);
            const existing = convsRef.current.get(key);
            if (existing) {
              existing.unread_count = 0;
              convsRef.current.set(key, existing);
            }
            const isCommunityConv = (c:any) => {
              try { const t = String(c?.type ?? '').toLowerCase(); if (t === 'community') return true; } catch (e) {}
              return !!(c?.community_id || (c?.community && (c.community.id || c.community.community_id)) || c?.communityId);
            };
            const totalNow = Array.from(convsRef.current.values()).reduce((acc:number, c:any) => {
              if (isCommunityConv(c)) return acc;
              return acc + (Number(c?.unread_count) || 0);
            }, 0);
            const communityNow = Array.from(convsRef.current.values()).reduce((acc:number, c:any) => {
              if (!isCommunityConv(c)) return acc;
              return acc + (Number(c?.unread_count) || 0);
            }, 0);
            if (__DEV__) {
              try { console.log('[useChatUnread] applied local mark_read, totalNow=', totalNow); } catch {}
            }
            personalUnreadRef.current = totalNow;
            setPersonalUnread(totalNow);
            setCommunityUnread(communityNow);
            // also schedule a full refresh to reconcile with server/readMap
            setTimeout(() => { try { fetchUnread(); } catch (err) { console.warn('[useChatUnread] fetch after mark_read failed', err); } }, 200);
            return;
          }
        } catch (err) { /* ignore */ }
      }

      if (e?.type === 'chat_viewed') {
        if (personalUnreadRef.current !== 0) {
          personalUnreadRef.current = 0;
          setPersonalUnread(0);
        }
        return;
      }

      if (e?.type === 'unread_updated') {
        try { fetchUnread(); } catch (err) { console.warn('[useChatUnread] fetch on event unread_updated failed', err); }
        return;
      }

      // For deleted and other chat events, refresh authoritative data
      if (['deleted','reset','message_received','conversation_created','client_message_sent','conversation_updated','message_deleted','message'].includes(e?.type)) {
        try { fetchUnread(); } catch (err) { console.warn('[useChatUnread] fetchUnread on event failed', err); }
      }
    });

    return () => {
      mounted = false;
      try { unsub(); } catch {}
      try { appStateSubscription.remove(); } catch (e) { /* ignore */ }
      try { socketRef && socketRef.disconnect(); } catch (e) { /* ignore */ }
    };
  }, [fetchUnread]);

  return { personalUnread, communityUnread, refresh: fetchUnread };
}
