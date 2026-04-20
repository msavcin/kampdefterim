import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { openConversationOrCommunity } from '@/lib/chatNavigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listCommunities, getMe } from '@/lib/userCommunityApi';
import { createChatSocket } from '@/lib/chatSocket';
import { getToken } from '@/lib/auth';
import FriendAvatar from '@/components/FriendAvatar';
import ThemedIcon from '@/components/ThemedIcon';
import { useTheme } from '@/components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
const LAST_OPENED_KEY = '@chat_last_opened_v1';
import { emitChatEvent, onChatEvent } from '@/lib/chatEvents';
import { markRead } from '@/lib/readMap';

const DELETED_KEY = '@chat_deleted_v1';

async function loadDeletedMap() {
  try {
    const raw = await AsyncStorage.getItem(DELETED_KEY);
    if (!raw) return { conversations: {}, participants: {}, messages: {} };
    const parsed = JSON.parse(raw);
    // ensure messages map exists
    parsed.messages = parsed.messages || {};
    return parsed;
  } catch (e) { return { conversations: {}, participants: {} }; }
}

function getConvLastTime(conv:any) {
  if (!conv) return 0;
  const cand = conv.updated_at ?? conv.updatedAt ?? conv.last_message?.created_at ?? conv.last_message?.createdAt ?? conv.last_message_at ?? conv.lastMessage?.created_at ?? conv.lastMessage?.createdAt;
  const t = cand ? (typeof cand === 'number' ? cand : Date.parse(String(cand))) : NaN;
  return !isNaN(t) ? t : 0;
}

function extractParticipant(item:any) {
  const userCandidates = [item.other_user, item.recipient, item.user, item.participant_user, item.participant, item.other_user_object, item.recipient_object];
  for (const u of userCandidates) {
    if (u && typeof u === 'object') {
      const name = u.name || u.full_name || u.display_name || u.username || (u.id ? String(u.id) : undefined);
      const avatar_url = u.avatar_url || u.avatar || u.avatarUrl || u.photo;
      if (name || avatar_url) return { name, avatar_url };
    }
  }
  const nameFields = [item.other_user_name, item.recipient_name, item.other_username, item.recipient_username, item.name, item.title, item.display_name, item.chat_name];
  for (const n of nameFields) if (n) return { name: String(n) };
  const arr = item.participants ?? item.members ?? item.participants_ids ?? item.user_ids ?? item.memberships ?? item.participant_ids;
  if (Array.isArray(arr) && arr.length) {
    const obj = arr.find((p:any) => p && typeof p === 'object' && (p.name || p.username || p.avatar_url));
    if (obj) return { name: obj.name || obj.username || obj.display_name, avatar_url: obj.avatar_url || obj.avatar };
    const id = arr.find((p:any) => p && (typeof p === 'string' || typeof p === 'number'));
    if (id) return { name: String(id) };
  }
  return null;
}

function extractParticipantIds(conv:any) {
  const ids = new Set<string>();
  if (!conv) return [];
  const pushId = (v:any) => { if (v==null) return; const s = String(v); if (s) ids.add(s); };
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

function isCommunityConversationObj(c:any) {
  if (!c) return false;
  try {
    const type = String(c?.type ?? c?.conversation_type ?? c?.kind ?? c?.kind_type ?? '').toLowerCase();
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
}

const normalizeIndexKey = (value:any) => {
  if (!value && value !== 0) return null;
  try { return String(value).toLowerCase().replace(/^@/, '').trim(); } catch { return String(value || '').toLowerCase(); }
};

function getFriendConversation(friend:any, convIndex:any, conversations:any[]) {
  const idCandidate = friend.id ?? friend.user_id ?? friend.recipient_id ?? (typeof friend.tag === 'string' ? (friend.tag.startsWith('#') ? Number(friend.tag.replace('#','')) : friend.tag) : undefined);
  if (typeof idCandidate !== 'undefined' && idCandidate !== null) {
    const byId = convIndex?.byId;
    if (byId) {
      let found = byId.get(String(idCandidate)) ?? byId.get(Number(idCandidate));
      // ignore community conversations when matching friends
      try {
        if (isCommunityConversationObj(found)) found = undefined;
      } catch (e) { if (found && (found.community_id || (found.community && found.community.id))) found = undefined; }
      if (found) return found;
    }
  }

  const byUsername = convIndex?.byUsername;
  if (byUsername) {
    const unameKey = normalizeIndexKey(friend.username);
    const nameKey = normalizeIndexKey(friend.name);
    let found = (unameKey && byUsername.get(unameKey)) || (nameKey && byUsername.get(nameKey));
    try {
      if (isCommunityConversationObj(found)) found = undefined;
    } catch (e) { if (found && (found.community_id || (found.community && found.community.id))) found = undefined; }
    if (found) return found;
  }

  const normalizeString = (value:any) => {
    if (!value && value !== 0) return null;
    try { return String(value).toLowerCase().trim(); } catch { return null; }
  };

  const friendNameLower = normalizeString(friend.name);
  const friendUsernameLower = normalizeString(friend.username);

  const textContains = (text:any, needle:any) => {
    if (!text || !needle) return false;
    try { return String(text).toLowerCase().includes(String(needle).toLowerCase()); } catch { return false; }
  };

  const matchConversationFallback = (obj:any) => {
    if (!obj || typeof obj !== 'object') return false;
    for (const value of Object.values(obj)) {
      if (value == null) continue;
      if (typeof value === 'string') {
        if ((friendUsernameLower && textContains(value, friendUsernameLower)) || (friendNameLower && textContains(value, friendNameLower))) return true;
      } else if (typeof value === 'object') {
        if (matchConversationFallback(value)) return true;
      }
    }
    return false;
  };

  return conversations.find((c:any) => {
    const id = friend.id ?? friend.user_id ?? friend.recipient_id ?? friend.tag;
    if (typeof id !== 'undefined' && id !== null) {
      const idNum = Number(id);
      const members = c.participants ?? c.members ?? c.participants_ids ?? c.user_ids ?? [];
      if (Array.isArray(members) && members.some((m:any) => Number(m?.id ?? m) === idNum || Number(m) === idNum)) return true;
      if (c.recipient_id && Number(c.recipient_id) === idNum) return true;
      if (c.other_user_id && Number(c.other_user_id) === idNum) return true;
      if (c.user_id && Number(c.user_id) === idNum) return true;
      if (c.participants && Array.isArray(c.participants) && c.participants.some((p:any) => p && (Number(p.id) === idNum || Number(p.user_id) === idNum))) return true;
    }
    // do not match community conversations when looking for friend conversations
    try {
      if (isCommunityConversationObj(c)) return false;
    } catch (e) { if (c?.community_id || (c?.community && c.community.id)) return false; }
    if (friendUsernameLower) {
      const members = c.participants ?? c.members ?? c.participants_ids ?? c.user_ids ?? [];
      if (Array.isArray(members) && members.some((m:any) => {
        if (!m) return false;
        if (typeof m === 'object') {
          if (m.username && normalizeString(m.username) === friendUsernameLower) return true;
          if (m.name && normalizeString(m.name) === friendUsernameLower) return true;
        } else if (typeof m === 'string') {
          if (normalizeString(m) === friendUsernameLower) return true;
        }
        return false;
      })) return true;
      const candidateObjs = [c.other_user, c.recipient, c.user, c.participant_user, c.participant, c.other_user_object, c.recipient_object];
      for (const u of candidateObjs) {
        if (u && typeof u === 'object') {
          if (u.username && normalizeString(u.username) === friendUsernameLower) return true;
          if (u.name && normalizeString(u.name) === friendUsernameLower) return true;
        }
      }
    }
    if (friendNameLower) {
      const members = c.participants ?? c.members ?? c.participants_ids ?? c.user_ids ?? [];
      if (Array.isArray(members) && members.some((m:any) => {
        if (!m || typeof m !== 'object') return false;
        if (m.username && normalizeString(m.username) === friendNameLower) return true;
        if (m.name && normalizeString(m.name) === friendNameLower) return true;
        return false;
      })) return true;
    }
    return matchConversationFallback(c);
  });
}

const FriendRow = React.memo(({
  item,
  colors,
  convIndex,
  conversations,
  conv: convProp,
  showUnread,
  onContinue,
  onStart,
  onDelete,
}: any) => {
  const conv = convProp ?? useMemo(() => getFriendConversation(item, convIndex, conversations), [item, convIndex, conversations]);

  return (
    <View style={{flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderColor:colors.border, backgroundColor:colors.surface}}>
      <FriendAvatar avatar_url={item.avatar_url} name={item.name || item.username} size={40} />
      <View style={{flex:1, marginLeft:12}}>
        <Text style={{fontWeight:'600', color: colors.text}}>{item.name || item.username}</Text>
        {item.username ? <Text style={{color:colors.muted}}>@{item.username}</Text> : null}
        {__DEV__ ? (
          <Text style={{color:'#888', fontSize:12, marginTop:4}}>{conv ? `Eşleşme: ${conv.id ?? conv.conversation_id ?? conv.conversation?.id ?? 'id yok'}` : 'Eşleşme: yok'}</Text>
        ) : null}
      </View>
      {conv ? (
        <View style={{position:'relative'}}>
          <TouchableOpacity onPress={() => onContinue(conv)} style={{backgroundColor:colors.primary, paddingVertical:8, paddingHorizontal:12, borderRadius:8}}>
            <Text style={{color:'#fff'}}>Sohbete Devam Et</Text>
          </TouchableOpacity>
          {showUnread && (
            <View style={{position:'absolute', top:-5, right:4, width:10, height:10, borderRadius:6, backgroundColor:colors.danger}} />
          )}
        </View>
      ) : (
        <TouchableOpacity onPress={() => onStart(item)} style={{backgroundColor:colors.primary, paddingVertical:8,paddingHorizontal:12, borderRadius:8}}>
          <Text style={{color:'#fff'}}>Mesaj Başlat</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

  const CommunityRow = React.memo(({
  item,
  colors,
  onStart,
  conversations,
  showUnread,
}: any) => {
  const conv = Array.isArray(conversations) ? conversations.find((c:any) => {
    try {
      const cid = c?.community_id ?? c?.community?.id ?? c?.metadata?.community_id ?? c?.meta?.community_id ?? c?.conversation?.community_id ?? null;
      if (cid && Number(cid) === Number(item.id)) return true;
      if (isCommunityConversationObj(c) && cid && Number(cid) === Number(item.id)) return true;
    } catch (e) { /* ignore */ }
    return false;
  }) : null;
  const label = conv ? 'Sohbete Katıl' : 'Mesaj Başlat';
  return (
    <View style={{flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderColor:colors.border, backgroundColor:colors.surface}}>
      <View style={{width:40,height:40,borderRadius:8,backgroundColor:colors.surfaceVariant,alignItems:'center',justifyContent:'center'}}>
        <ThemedIcon category="camp" icon="tent" size={24} color={colors.primary} />
      </View>
      <View style={{flex:1, marginLeft:12}}>
        <Text style={{fontWeight:'600', color: colors.text}}>{item.name}</Text>
        {item.description ? <Text style={{color:colors.muted}}>{item.description}</Text> : null}
      </View>
      {showUnread && (
        <View style={{ width: 10, height: 10, borderRadius: 6, backgroundColor: colors.info, marginRight: 8 }} />
      )}
      <TouchableOpacity onPress={() => onStart(item)} style={{backgroundColor:colors.primary, paddingVertical:8,paddingHorizontal:12, borderRadius:8}}>
        <Text style={{color:'#fff'}}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
});

export default function NewChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const themed = createThemedStyles(colors);
  const initialRecipientId = (params as any).recipientId;
  const initialCommunityId = (params as any).communityId;

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [convIndex, setConvIndex] = useState<any>({ byId: new Map(), byUsername: new Map() });
  const [query, setQuery] = useState('');
  const lastUnreadTotalRef = useRef<number | null>(null);
  const suppressUnreadUpdatedRef = useRef(false);
  const localReadOverlayRef = useRef<Map<string, number>>(new Map());
  const autoOpenedRecipientConversationRef = useRef(false);
  const [tab, setTab] = useState<'friends'|'communities'>('friends');
  const [friendConvMap, setFriendConvMap] = useState<Record<string, any>>({});

  const emitUnreadUpdated = (totalUnread: number) => {
    if (lastUnreadTotalRef.current !== null && lastUnreadTotalRef.current === totalUnread) return;
    lastUnreadTotalRef.current = totalUnread;
    suppressUnreadUpdatedRef.current = true;
    try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) { }
  };
  const getLastMessageSenderId = (conv:any) => {
    const last = conv?.last_message ?? conv?.lastMessage ?? conv?.conversation?.last_message ?? conv?.conversation?.lastMessage;
    if (!last || typeof last !== 'object') return null;
    return last?.sender_id ?? last?.senderId ?? last?.from_id ?? last?.user_id ?? last?.userId ?? null;
  };

  const isUnreadFromSelf = (conv:any) => {
    if (!conv || Number(conv?.unread_count) <= 0) return false;
    if (localUserId == null) return false;
    const senderId = getLastMessageSenderId(conv);
    return senderId != null && String(senderId) === String(localUserId);
  };

  const sumPersonalUnread = (arr: any[]) => Array.isArray(arr) ? arr.reduce((acc:number, c:any) => {
    try {
      const t = String(c?.type ?? '').toLowerCase();
      if (t === 'community') return acc;
    } catch (e) { }
    const communityId = c?.community_id ?? c?.community?.id ?? null;
    if (communityId) return acc;
    if (isUnreadFromSelf(c)) return acc;
    return acc + (Number(c?.unread_count) || 0);
  }, 0) : 0;
  const [creating, setCreating] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [localUserId, setLocalUserId] = useState<number | string | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const convRes = await apiFetch(`${API_URL}/chat/conversations`);
      if (!convRes.ok) {
        setConversations([]);
        setConvIndex({ byId: new Map(), byUsername: new Map() });
        return;
      }
      const convData = await convRes.json();
      const arr = Array.isArray(convData) ? convData : [];
      const deletedMap = await loadDeletedMap();
      const readMap = await (async () => { try { const m = await import('@/lib/readMap'); return await m.loadReadMap(); } catch (e) { return {}; } })();
      const arrFiltered = arr.filter((c:any) => {
        try {
          const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
          const lastTime = getConvLastTime(c);
          if (convId && deletedMap.conversations && deletedMap.conversations[String(convId)]) {
            const del = Number(deletedMap.conversations[String(convId)]);
            if (del && lastTime && lastTime <= del) return false;
          }
          const pIds = extractParticipantIds(c);
          for (const pid of pIds) {
            const pd = deletedMap.participants?.[String(pid)];
            if (pd && lastTime && lastTime <= Number(pd)) return false;
          }
        } catch (e) { }
        return true;
      });
      setConversations(arrFiltered);
      let arrWithRead: any[] = arrFiltered;
      try {
        // apply readMap: if user locally marked conversation read after last message, zero unread_count
        arrWithRead = Array.isArray(arrFiltered) ? arrFiltered.map((c:any) => {
          try {
            const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
            const lastTime = getConvLastTime(c);
            const readTs = readMap && convId ? Number(readMap[String(convId)]) || 0 : 0;
            const overlayTs = convId ? Number(localReadOverlayRef.current.get(String(convId))) || 0 : 0;
            if (overlayTs && lastTime && overlayTs >= lastTime) {
              return { ...c, unread_count: 0 };
            }
            if (readTs && lastTime && readTs >= lastTime) {
              return { ...c, unread_count: 0 };
            }
            if (overlayTs && lastTime && overlayTs < lastTime) {
              localReadOverlayRef.current.delete(String(convId));
            }
          } catch (e) {}
          return c;
        }) : arrFiltered;
        setConversations(arrWithRead);
        const totalUnread = sumPersonalUnread(arrWithRead);
        emitUnreadUpdated(totalUnread);
      } catch (e) { }
      try {
        const byId = new Map();
        const byUsername = new Map();
        try {
          console.log('[NewChat] refreshConversations conversations sample', arrFiltered.slice(0,3).map((c:any) => ({
            id: c?.id ?? c?.conversation_id ?? c?.conversation?.id,
            recipient_id: c?.recipient_id ?? null,
            other_user_id: c?.other_user_id ?? null,
            user_id: c?.user_id ?? null,
            participants: Array.isArray(c?.participants) ? c.participants.slice(0,5) : undefined,
            members: Array.isArray(c?.members) ? c.members.slice(0,5) : undefined,
            participants_ids: c?.participants_ids?.slice ? c.participants_ids.slice(0,5) : undefined,
            user_ids: c?.user_ids?.slice ? c.user_ids.slice(0,5) : undefined,
            community_id: c?.community_id ?? c?.community?.id ?? c?.metadata?.community_id ?? c?.meta?.community_id ?? c?.conversation?.community_id,
          })));
        } catch (logErr) { console.warn('[NewChat] refreshConversations sample log failed', logErr); }
        const normalize = (s:any) => {
          if (!s && s !== 0) return null;
          try { return String(s).toLowerCase().replace(/^@/, '').trim(); } catch { return null; }
        };
        arrWithRead.forEach((c:any) => {
          try {
            const pIds = extractParticipantIds(c);
            if (Array.isArray(pIds)) {
              pIds.forEach((pid:any) => {
                if (pid == null) return;
                try { byId.set(String(pid), c); } catch {};
              });
            }
            const seen = new Set<any>();
            const walk = (obj:any, depth = 0) => {
              if (!obj || depth > 6) return;
              if (seen.has(obj)) return;
              if (typeof obj === 'object') seen.add(obj);
              if (Array.isArray(obj)) {
                for (const it of obj) walk(it, depth + 1);
                return;
              }
              if (typeof obj === 'object') {
                for (const [k, v] of Object.entries(obj)) {
                  if (v == null) continue;
                  const key = String(k).toLowerCase();
                  if (['username','handle','slug','tag','tag_name','login','name','display_name','full_name'].includes(key)) {
                    const uname = normalize(v);
                    if (uname) try { byUsername.set(uname, c); } catch {}
                    continue;
                  }
                  if (typeof v === 'object' || Array.isArray(v)) {
                    walk(v, depth + 1);
                    continue;
                  }
                }
              }
            };
            walk(c, 0);
          } catch (e) { }
        });
        setConvIndex({ byId, byUsername });
      } catch (er) {
        setConvIndex({ byId: new Map(), byUsername: new Map() });
      }
    } catch (e) {
      console.warn('[NewChat] refresh conversations error', e);
      setConversations([]);
      setConvIndex({ byId: new Map(), byUsername: new Map() });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshConversations();
    }, [refreshConversations])
  );

  useEffect(() => {
    let socketRef: ReturnType<typeof createChatSocket> | null = null;
    let mounted = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        socketRef = createChatSocket((msg:any) => {
          try {
            const t = String(msg?.type || '');
            if (t === 'conversation_created' || t === 'conversation_updated' || t === 'client_message_sent' || t === 'message') {
              if (!mounted) return;
              // small debounce to avoid spamming API
              setTimeout(() => { try { refreshConversations(); } catch (e) { console.warn('[NewChat] refreshConversations failed', e); } }, 200);
            }
          } catch (e) { console.warn('[NewChat] socket handler error', e); }
        });
        socketRef.connect(token);
      } catch (e) { console.warn('[NewChat] socket init failed', e); }
    })();
    return () => { mounted = false; try { socketRef && socketRef.disconnect(); } catch (e) {} };
  }, [refreshConversations]);

  useEffect(() => {
    const unsub = onChatEvent((e:any) => {
      try {
        if (e?.type === 'deleted' || e?.type === 'reset') {
          refreshConversations();
          return;
        }
        if (e?.type === 'mark_read') {
          const convId = e?.payload?.convId ?? e?.payload?.conversationId ?? e?.payload?.convID;
          if (!convId) return;
          localReadOverlayRef.current.set(String(convId), Date.now());
          // zero this conversation locally and update index entries too
          setConversations(prev => {
            try {
              const out = Array.isArray(prev) ? prev.map((c:any) => {
                const id = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
                if (String(id) === String(convId)) return { ...c, unread_count: 0 };
                return c;
              }) : prev;
              try {
                const totalUnread = sumPersonalUnread(out);
                setTimeout(() => {
                  emitUnreadUpdated(totalUnread);
                }, 0);
              } catch (e) { /* ignore */ }
              return out;
            } catch (err) { return prev; }
          });
          setConvIndex(prev => {
            try {
              const byId = new Map(prev.byId);
              const byUsername = new Map(prev.byUsername);
              for (const [key, value] of prev.byId.entries()) {
                const id = value?.id ?? value?.conversation_id ?? value?.conversation?.id;
                if (String(id) === String(convId)) {
                  byId.set(key, { ...value, unread_count: 0 });
                }
              }
              for (const [key, value] of prev.byUsername.entries()) {
                const id = value?.id ?? value?.conversation_id ?? value?.conversation?.id;
                if (String(id) === String(convId)) {
                  byUsername.set(key, { ...value, unread_count: 0 });
                }
              }
              return { byId, byUsername };
            } catch (err) {
              return prev;
            }
          });
          return;
        }
        if (['message','conversation_created','client_message_sent','conversation_updated','message_deleted'].includes(e?.type)) {
          refreshConversations();
          return;
        }
        if (e?.type === 'unread_updated') {
          if (suppressUnreadUpdatedRef.current) {
            suppressUnreadUpdatedRef.current = false;
            return;
          }
          // server-provided total changed; refresh to stay in sync
          refreshConversations();
          return;
        }
      } catch (err) { /* ignore listener errors */ }
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  useEffect(() => {
    if (autoOpenedRecipientConversationRef.current) return;
    if (!initialRecipientId) return;
    if (!Array.isArray(conversations) || conversations.length === 0) return;
    const recipientId = Number(initialRecipientId);
    if (!recipientId || Number.isNaN(recipientId)) return;
    const existingConv = getFriendConversation({ id: recipientId }, convIndex, conversations);
    const convId = existingConv?.id ?? existingConv?.conversation_id ?? existingConv?.conversation?.id;
    if (convId) {
      autoOpenedRecipientConversationRef.current = true;
      try {
        openConversationOrCommunity(router, convId, { replace: true });
      } catch (e) {
        console.warn('[NewChat] open existing recipient conversation failed', e);
      }
    }
  }, [initialRecipientId, convIndex, conversations, router]);

  // build a quick lookup map of friend -> conversation when lists change
  useEffect(() => {
    try {
      if (Array.isArray(friends) && Array.isArray(conversations)) {
        const map: Record<string, any> = {};
        for (const f of friends) {
          try {
            const key = String(f.id ?? f.username ?? f.name ?? '');
            if (!key) continue;
            const conv = getFriendConversation(f, convIndex, conversations);
            if (conv) map[key] = conv;
          } catch (e) { /* ignore per-friend errors */ }
        }
        setFriendConvMap(map);
      } else {
        setFriendConvMap({});
      }
    } catch (e) { setFriendConvMap({}); }
  }, [friends, conversations, convIndex]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/friendships/list`);
        const data = await res.json();
        const mapped = Array.isArray(data) ? data.map((f:any) => {
          const idFromTag = typeof f.tag === 'string' && f.tag.startsWith('#') ? Number(f.tag.replace('#','')) : undefined;
          const idCandidate = f.user_id ?? f.id ?? idFromTag;
          const resolvedId = typeof idCandidate !== 'undefined' && idCandidate !== null ? Number(idCandidate) : undefined;
          return { id: resolvedId, username: f.username, name: f.name || '', avatar_url: f.avatar_url || '' };
        }) : [];
        if (mounted) setFriends(mapped);
        const comms = await listCommunities();
        let visibleComms = Array.isArray(comms) ? comms : [];
        // filter to communities the current user is a member of (user.community_id)
        try {
          const me = await getMe().catch(() => null);
          const userCommId = me?.community_id ?? null;
          const resolvedMeId = me?.id ?? me?.user_id ?? me?.userId ?? null;
          if (resolvedMeId != null) setLocalUserId(resolvedMeId);
          if (userCommId) {
            visibleComms = visibleComms.filter((c:any) => Number(c?.id) === Number(userCommId));
          } else {
            // no membership -> show empty list
            visibleComms = [];
          }
        } catch (e) {
          // if membership fetch fails, hide communities to be safe
          visibleComms = [];
        }
        if (mounted) setCommunities(visibleComms);

        try {
          const convRes = await apiFetch(`${API_URL}/chat/conversations`);
          if (convRes.ok) {
            const convData = await convRes.json();
            const arr = Array.isArray(convData) ? convData : [];
            if (mounted) {
              const deletedMap = await loadDeletedMap();
              const arrFiltered = arr.filter((c:any) => {
                try {
                  const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
                  const lastTime = getConvLastTime(c);
                  if (convId && deletedMap.conversations && deletedMap.conversations[String(convId)]) {
                    const del = Number(deletedMap.conversations[String(convId)]);
                    if (del && lastTime && lastTime <= del) return false;
                  }
                  const pIds = extractParticipantIds(c);
                  for (const pid of pIds) {
                    const pd = deletedMap.participants?.[String(pid)];
                    if (pd && lastTime && lastTime <= Number(pd)) return false;
                  }
                } catch (e) {
                  // if any error, keep the conversation
                }
                return true;
              });
              const readMap = await (async () => { try { const m = await import('@/lib/readMap'); return await m.loadReadMap(); } catch (e) { return {}; } })();
              const arrWithRead = Array.isArray(arrFiltered) ? arrFiltered.map((c:any) => {
                try {
                  const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
                  const lastTime = getConvLastTime(c);
                  const readTs = readMap && convId ? Number(readMap[String(convId)]) || 0 : 0;
                  const overlayTs = convId ? Number(localReadOverlayRef.current.get(String(convId))) || 0 : 0;
                  if (overlayTs && lastTime && overlayTs >= lastTime) {
                    return { ...c, unread_count: 0 };
                  }
                  if (readTs && lastTime && readTs >= lastTime) {
                    return { ...c, unread_count: 0 };
                  }
                  if (overlayTs && lastTime && overlayTs < lastTime) {
                    localReadOverlayRef.current.delete(String(convId));
                  }
                } catch (e) {}
                return c;
              }) : arrFiltered;
              setConversations(arrWithRead);
              try {
                const totalUnread = sumPersonalUnread(arrWithRead);
                emitUnreadUpdated(totalUnread);
              } catch (e) { }
              try {
                const byId = new Map();
                const byUsername = new Map();
                const normalize = (s:any) => {
                  if (!s && s !== 0) return null;
                  try { return String(s).toLowerCase().replace(/^@/, '').trim(); } catch { return null; }
                };
                arrWithRead.forEach((c:any) => {
                  try {
                    const pIds = extractParticipantIds(c);
                    if (Array.isArray(pIds)) {
                      pIds.forEach((pid:any) => {
                        if (pid == null) return;
                        try { byId.set(String(pid), c); } catch {};
                      });
                    }
                    const seen = new Set<any>();
                    const walk = (obj:any, depth = 0) => {
                      if (!obj || depth > 6) return;
                      if (seen.has(obj)) return; // avoid cycles
                      if (typeof obj === 'object') seen.add(obj);
                      if (Array.isArray(obj)) {
                        for (const it of obj) walk(it, depth + 1);
                        return;
                      }
                      if (typeof obj === 'object') {
                        for (const [k, v] of Object.entries(obj)) {
                          if (v == null) continue;
                          const key = String(k).toLowerCase();
                          if (['username','handle','slug','tag','tag_name','login','name','display_name','full_name'].includes(key)) {
                            const uname = normalize(v);
                            if (uname) try { byUsername.set(uname, c); } catch {}
                            continue;
                          }
                          if (typeof v === 'object' || Array.isArray(v)) {
                            walk(v, depth + 1);
                            continue;
                          }
                        }
                      }
                    };
                    walk(c, 0);
                  } catch (e) {
                    // ignore per-conversation errors
                  }
                });
                setConvIndex({ byId, byUsername });
                try {
                  console.log('[NewChat] convData sample:', JSON.stringify(arrFiltered.slice(0,3)));
                  console.log('[NewChat] convIndex sizes:', { byId: byId.size, byUsername: byUsername.size });
                  console.log('[NewChat] convIndex byId keys (sample):', Array.from(byId.keys()).slice(0,20));
                  console.log('[NewChat] convIndex byUsername keys (sample):', Array.from(byUsername.keys()).slice(0,20));
                } catch (logErr) {
                  console.warn('[NewChat] convIndex log error', logErr);
                }
              } catch (er) {
                setConvIndex({ byId: new Map(), byUsername: new Map() });
              }
            }
          } else {
            if (mounted) {
              setConversations([]);
              setConvIndex({ byId: new Map(), byUsername: new Map() });
            }
          }
        } catch (e) {
          console.warn('[NewChat] fetch conversations error', e);
          if (mounted) { setConversations([]); setConvIndex({ byId: new Map(), byUsername: new Map() }); }
        }

        if (mounted && initialRecipientId) {
          const idNum = Number(initialRecipientId);
          const found = mapped.find(f => Number(f.id) === idNum);
          setSelectedFriend(found ?? { id: idNum, username: '', name: '' });
          setTab('friends');
        } else if (mounted && initialCommunityId) {
          const idNum = Number(initialCommunityId);
          const foundC = Array.isArray(comms) ? comms.find((c:any) => Number(c.id) === idNum) : undefined;
          setSelectedCommunity(foundC ?? { id: idNum, name: `Topluluk ${idNum}` });
          setTab('communities');
        }
      } catch (e) {
        console.warn('[NewChat] fetch lists error', e);
      } finally {
        if (mounted) {
          setLoading(false);
          try { emitChatEvent({ type: 'chat_viewed' }); } catch (e) { }
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleSendFromComposer() {
    if (!composerText.trim()) { Alert.alert('Hata', 'Mesaj boş olamaz.'); return; }
    const payload: any = { text: composerText.trim() };
    if (selectedFriend?.id) {
      payload.actualRecipientId = Number(selectedFriend.id);
      if (localUserId != null) {
        payload.participant_ids = [Number(localUserId), Number(selectedFriend.id)];
      }
    } else if (selectedCommunity?.id) {
      payload.community_id = Number(selectedCommunity.id);
    } else if (initialRecipientId) {
      payload.actualRecipientId = Number(initialRecipientId);
      if (localUserId != null) {
        payload.participant_ids = [Number(localUserId), Number(initialRecipientId)];
      }
    } else if (initialCommunityId) {
      payload.community_id = Number(initialCommunityId);
    } else { Alert.alert('Hata', 'Alıcı seçili değil.'); return; }

    setSending(true);
    try {
        try { console.log('[NewChat] sending payload', payload); } catch (e) {}
      const res = await apiFetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      try { console.log('[NewChat] send response', res.status, text?.slice ? text.slice(0,1000) : text); } catch (e) {}
      if (!res.ok) {
        console.warn('[NewChat] send failed', res.status, text);
        Alert.alert('Hata', 'Mesaj gönderilemedi.');
        return;
      }
      let saved: any = null;
      try { saved = text ? JSON.parse(text) : null; } catch (err) { saved = null; }
      const convId = saved?.conversation_id ?? saved?.conversation?.id ?? saved?.id;
        if (convId) {
        try { await AsyncStorage.setItem(LAST_OPENED_KEY, String(convId)); } catch (e) { /* ignore */ }
        // If this was a community message, navigate to the shared community chat screen
        if (payload.community_id) {
          try {
            router.replace({ pathname: '/chat/community/[communityId]', params: { communityId: String(payload.community_id) } });
          } catch (e) { /* ignore */ }
        } else {
          // navigate first so user sees the conversation screen; rely on centralized helper
          try { await openConversationOrCommunity(router, convId, { replace: true }); } catch (e) { console.warn('[NewChat] openConversationOrCommunity failed', e); }
        }

        // Fire unread totals update in background (don't block navigation)
        (async () => {
          try {
            const listRes = await apiFetch(`${API_URL}/chat/conversations`);
            if (listRes && listRes.ok) {
              const listData = await listRes.json();
              if (Array.isArray(listData)) {
                const totalUnread = sumPersonalUnread(listData);
                try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) {}
              }
            }
          } catch (e) { console.warn('[NewChat] emit unread update failed', e); }
        })();

        return;
      }

const recipientId = payload.actualRecipientId ?? (selectedFriend?.id ? Number(selectedFriend.id) : undefined) ?? (initialRecipientId ? Number(initialRecipientId) : undefined);
      if (recipientId) {
        try {
          const participantIds = localUserId != null ? [Number(localUserId), Number(recipientId)] : [Number(recipientId)];
          const query = participantIds.map(String).join(',');
          const listRes = await apiFetch(`${API_URL}/chat/conversations?participant_ids=${encodeURIComponent(query)}`);
          if (listRes.ok) {
            const listData = await listRes.json();
            if (Array.isArray(listData)) {
              const found = listData.find((c:any) => {
                if (c?.community_id) return false;
                return true;
              });
              if (found?.id) {
                if (found?.community_id) {
                  try { router.replace({ pathname: '/chat/community/[communityId]', params: { communityId: String(found.community_id) } }); } catch (e) { }
                  return;
                }
                try { await openConversationOrCommunity(router, found.id, { replace: true }); } catch (e) { console.warn('[NewChat] openConversationOrCommunity fallback failed', e); }
                return;
              }
            }
          }
        } catch (e) {
          console.warn('[NewChat] fallback conv lookup error', e);
        }
      }

      Alert.alert('Başarılı', 'Mesaj gönderildi. Sohbet ekranına yönlendiriliyorsunuz.');
      router.replace('/chat/new');
    } catch (e) {
      console.warn('[NewChat] send error', e);
      Alert.alert('Hata', 'Mesaj gönderilirken hata oluştu.');
    } finally {
      setSending(false);
    }
  }

  const handleContinueConversation = useCallback(async (conv: any) => {
    const convId = conv?.id ?? conv?.conversation_id ?? conv?.conversation?.id;
    if (!convId) {
      router.replace('/chat/new');
      return;
    }
    try {
      try { await markRead(convId); } catch (e) { }
      localReadOverlayRef.current.set(String(convId), Date.now());
      try {
          setConversations(prev => {
            try {
              const out = Array.isArray(prev) ? prev.map((c:any) => {
                const id = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
                if (String(id) === String(convId)) return { ...c, unread_count: 0 };
                return c;
              }) : prev;
              try {
                const totalUnread = sumPersonalUnread(out);
                setTimeout(() => {
                  try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) { }
                }, 0);
              } catch (e) { }
              return out;
            } catch (e) { return prev; }
          });
          setConvIndex(prev => {
            try {
              const byId = new Map(prev.byId);
              const byUsername = new Map(prev.byUsername);
              for (const [key, value] of prev.byId.entries()) {
                const id = value?.id ?? value?.conversation_id ?? value?.conversation?.id;
                if (String(id) === String(convId)) {
                  byId.set(key, { ...value, unread_count: 0 });
                }
              }
              for (const [key, value] of prev.byUsername.entries()) {
                const id = value?.id ?? value?.conversation_id ?? value?.conversation?.id;
                if (String(id) === String(convId)) {
                  byUsername.set(key, { ...value, unread_count: 0 });
                }
              }
              return { byId, byUsername };
            } catch (e) {
              return prev;
            }
          });
        } catch (e) { }
        try { setTimeout(() => { try { emitChatEvent({ type: 'mark_read', payload: { convId } }); } catch (e) { } }, 0); } catch (e) { }
    } catch (e) {
      // ignore
    }
    try { await AsyncStorage.setItem(LAST_OPENED_KEY, String(convId)); } catch (e) { }
    try { await openConversationOrCommunity(router, convId, { replace: true }); } catch (e) { console.warn('[NewChat] openConversationOrCommunity failed', e); }
  }, [router]);

  const handleOpenFriendConversation = useCallback(async (friend: any) => {
    if (!friend?.id) return false;

    const existingConv = getFriendConversation(friend, convIndex, conversations);
    const convId = existingConv?.id ?? existingConv?.conversation_id ?? existingConv?.conversation?.id;
    if (convId) {
      await openConversationOrCommunity(router, convId, { replace: true });
      return true;
    }

    const recipientId = Number(friend.id);
    if (!recipientId || Number.isNaN(recipientId)) return false;

    let effectiveLocalUserId = localUserId;
    if (effectiveLocalUserId == null) {
      try {
        const me = await getMe();
        const resolvedMeId = me?.id ?? me?.user_id ?? me?.userId ?? null;
        if (resolvedMeId != null) {
          effectiveLocalUserId = resolvedMeId;
          setLocalUserId(resolvedMeId);
        }
      } catch (e) {
        // ignore
      }
    }

    const participantIds = [String(recipientId)];
    if (effectiveLocalUserId != null) {
      participantIds.unshift(String(effectiveLocalUserId));
    }

    try {
      const query = participantIds.join(',');
      console.log('[NewChat] find existing friend conversation query', { query, participantIds });
      const listRes = await apiFetch(`${API_URL}/chat/conversations?participant_ids=${encodeURIComponent(query)}`);
      console.log('[NewChat] existing friend conv response', { ok: Boolean(listRes?.ok), status: listRes?.status });
      if (listRes && listRes.ok) {
        const listData = await listRes.json();
        console.log('[NewChat] existing friend conv payload', { listData });
        if (Array.isArray(listData)) {
          const foundConv = listData.find((c:any) => {
            try {
              if (c?.community_id) return false;
              return true;
            } catch (e) { return false; }
          });
          const foundId = foundConv?.id ?? foundConv?.conversation_id ?? foundConv?.conversation?.id;
          if (foundId) {
            await openConversationOrCommunity(router, foundId, { replace: true });
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('[NewChat] find existing friend conversation failed', e);
    }

    try {
      const msgPayload: any = {
        actualRecipientId: recipientId,
        recipient_id: recipientId,
        participant_ids: participantIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id)),
      };
      console.log('[NewChat] create friend conversation via message payload', msgPayload);
      const msgRes = await apiFetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgPayload),
      });
      console.log('[NewChat] create friend conversation via message response', { ok: Boolean(msgRes?.ok), status: msgRes?.status });
      if (msgRes) {
        const bodyText = await msgRes.text();
        console.log('[NewChat] create friend conversation via message response body', bodyText);
        let msgData: any = null;
        try { msgData = bodyText ? JSON.parse(bodyText) : null; } catch (parseErr) { console.warn('[NewChat] create friend conversation via message response parse failed', parseErr); }
        const createdId = msgData?.conversation_id ?? msgData?.conversation?.id ?? msgData?.conversation?.conversation_id ?? msgData?.conversation?.id ?? msgData?.id ?? msgData?.message?.conversation_id ?? msgData?.message?.conversation?.id;
        if (createdId) {
          await openConversationOrCommunity(router, createdId, { replace: true });
          return true;
        }
      }
    } catch (e) {
      console.warn('[NewChat] create friend conversation via message failed', e);
    }

    return false;
  }, [router, convIndex, conversations, localUserId]);

  const handleStartWithFriend = useCallback(async (friend: any) => {
    if (!friend?.id) { Alert.alert('Hata', 'Bu kullanıcıda geçerli bir id yok.'); return; }
    try {
      const opened = await handleOpenFriendConversation(friend);
      if (opened) return;
    } catch (e) {
      console.warn('[NewChat] handleOpenFriendConversation failed', e);
    }
    setSelectedFriend(friend);
    setSelectedCommunity(null);
    setComposerText('');
  }, [handleOpenFriendConversation]);

  const handleStartWithCommunity = useCallback((community: any) => {
    if (!community?.id) { Alert.alert('Hata', 'Topluluk id yok'); return; }
    // Always open the community-specific chat screen (shared view for all members)
    try {
      router.push({ pathname: '/chat/community/[communityId]', params: { communityId: String(community.id) } });
    } catch (e) {
      setSelectedCommunity(community);
      setSelectedFriend(null);
      setComposerText('');
    }
  }, [router]);

  const handleDeleteConversation = useCallback(async (conv: any) => {
    const convId = conv?.id ?? conv?.conversation_id ?? conv?.conversation?.id;
    if (!convId) { Alert.alert('Hata', 'Sohbet id bulunamadı.'); return; }
    Alert.alert('Sohbeti Sil', 'Bu sohbetin tüm içeriğini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        try {
          let deleted = false;
          try {
            const res = await apiFetch(`${API_URL}/chat/conversations/${convId}`, { method: 'DELETE' });
            if (res && res.ok) deleted = true;
          } catch (e) { }
          if (!deleted) {
            try {
              const res2 = await apiFetch(`${API_URL}/chat/conversations/${convId}/messages`, { method: 'DELETE' });
              if (res2 && res2.ok) deleted = true;
            } catch (e) { }
          }
          if (!deleted) {
            try {
              const res3 = await apiFetch(`${API_URL}/chat/messages?conversation_id=${convId}`, { method: 'DELETE' });
              if (res3 && res3.ok) deleted = true;
            } catch (e) { }
          }

          setConversations(prev => (Array.isArray(prev) ? prev.filter((c:any) => String((c?.id ?? c?.conversation_id ?? c?.conversation?.id) ?? '') !== String(convId)) : []));

          setConvIndex(prev => {
            try {
              const byId = new Map(prev.byId);
              const byUsername = new Map(prev.byUsername);
              for (const k of Array.from(byId.keys())) {
                const v = byId.get(k);
                const vv: any = v;
                const vid = vv?.id ?? vv?.conversation_id ?? vv?.conversation?.id;
                if (String(vid) === String(convId) || vv === conv) byId.delete(k);
              }
              for (const k of Array.from(byUsername.keys())) {
                const v = byUsername.get(k);
                const vv: any = v;
                const vid = vv?.id ?? vv?.conversation_id ?? vv?.conversation?.id;
                if (String(vid) === String(convId) || vv === conv) byUsername.delete(k);
              }
              return { byId, byUsername };
            } catch (e) {
              return { byId: new Map(), byUsername: new Map() };
            }
          });

          try {
            const now = Date.now();
            const existing = await loadDeletedMap();
            const convKey = String(convId);
            existing.conversations = existing.conversations || {};
            existing.participants = existing.participants || {};
            existing.conversations[convKey] = now;
            const pids = extractParticipantIds(conv) || [];
            for (const pid of pids) {
              try { existing.participants[String(pid)] = now; } catch {}
            }
            await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(existing));
            try { emitChatEvent({ type: 'deleted', payload: { convId, participants: pids } }); } catch (e) { }
            try {
              const listRes = await apiFetch(`${API_URL}/chat/conversations`);
              if (listRes && listRes.ok) {
                const listData = await listRes.json();
                if (Array.isArray(listData)) {
                  const totalUnread = sumPersonalUnread(listData);
                  try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) {}
                }
              }
            } catch (e) { console.warn('[NewChat] emit unread update failed', e); }
          } catch (e) {
            console.warn('[NewChat] persist delete map error', e);
          }

          Alert.alert('Başarılı', 'Sohbet içeriği silindi.');
        } catch (e) {
          console.warn('[NewChat] delete conv error', e);
          Alert.alert('Hata', 'Sohbet silinirken hata oluştu.');
        }
      } }
    ]);
  }, []);

  useEffect(() => {
    try {
      const totalUnread = sumPersonalUnread(conversations);
      emitUnreadUpdated(totalUnread);
    } catch (e) {
      // ignore when recalculating only
    }
  }, [localUserId, conversations]);

  const filteredFriends = useMemo(() => friends.filter(f => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (f.name || '').toLowerCase().includes(q) || (f.username || '').toLowerCase().includes(q);
  }), [friends, query]);

  const renderFriendItem = useCallback(({ item }: { item: any }) => {
    // resolve conversation from latest state each render to keep unread in sync
    const conv = getFriendConversation(item, convIndex, conversations);
    const showUnread = Boolean(conv && Number(conv?.unread_count) > 0 && !isUnreadFromSelf(conv));
    return (
      <FriendRow
        item={item}
        colors={colors}
        convIndex={convIndex}
        conversations={conversations}
        conv={conv}
        showUnread={showUnread}
        onContinue={handleContinueConversation}
        onStart={handleStartWithFriend}
        onDelete={handleDeleteConversation}
      />
    );
  }, [colors, convIndex, conversations, handleContinueConversation, handleStartWithFriend, handleDeleteConversation, localUserId]);

  const renderCommunityItem = useCallback(({ item }: { item: any }) => {
    const conv = Array.isArray(conversations) ? conversations.find((c:any) => {
      try {
        const cid = c?.community_id ?? c?.community?.id ?? c?.metadata?.community_id ?? c?.meta?.community_id ?? c?.conversation?.community_id ?? null;
        return cid && Number(cid) === Number(item.id);
      } catch (e) { return false; }
    }) : null;
    const showUnread = Boolean(conv && Number(conv?.unread_count) > 0 && !isUnreadFromSelf(conv));
    return (
      <CommunityRow
        item={item}
        colors={colors}
        showUnread={showUnread}
        onStart={handleStartWithCommunity}
        conversations={conversations}
      />
    );
  }, [colors, handleStartWithCommunity, conversations, localUserId]);

  const communityKeyExtractor = useCallback((item:any, index:number) => String(item.id ?? `community-${index}`), []);

  if (loading) return <SafeAreaView style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background}}><ActivityIndicator/></SafeAreaView>;

  return (
    <SafeAreaView edges={['left','right']} style={themed.screenContainer}>
      <View style={themed.screenHeader}>
        <Text style={themed.screenHeaderTitle}>Sohbet</Text>
        <Text style={themed.screenHeaderSubtitle}>Bir kişiye veya topluluğa mesaj göndermek için seçin.</Text>
      </View>
      <View style={{flex:1, paddingHorizontal:16, paddingBottom:16, backgroundColor: colors.background}}>
        {__DEV__ ? (
          <Text style={{color:'#888',marginBottom:12,fontSize:12}}>Konuşmalar yüklendi: {conversations.length}  — index: {convIndex?.byId?.size ?? 0}/{convIndex?.byUsername?.size ?? 0}</Text>
        ) : null}
        <TextInput placeholder="Ara..." placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={{borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,borderRadius:8,padding:8,marginBottom:12,color:colors.text}} />
        <View style={{flexDirection:'row',marginBottom:12}}>
          <TouchableOpacity onPress={() => setTab('friends')} style={{flex:1, padding:10, backgroundColor: tab === 'friends' ? colors.primaryLight : colors.surfaceVariant, borderRadius:8, marginRight:8, alignItems:'center'}}>
            <Text style={{fontWeight:'600',color:colors.text}}>Kişiler</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('communities')} style={{flex:1,padding:10, backgroundColor: tab === 'communities' ? colors.primaryLight : colors.surfaceVariant, borderRadius:8, alignItems:'center'}}>
            <Text style={{fontWeight:'600',color:colors.text}}>Topluluklar</Text>
          </TouchableOpacity>
        </View>
        {selectedFriend || selectedCommunity ? (
          <View style={{paddingVertical:8}}>
            <Text style={{fontWeight:'600',marginBottom:8,color:colors.text}}>{selectedFriend ? (selectedFriend.name || selectedFriend.username || `Kullanıcı ${selectedFriend.id}`) : (selectedCommunity?.name || `Topluluk ${selectedCommunity?.id}`)}</Text>
            <TextInput placeholder="Mesaj yazın..." placeholderTextColor={colors.muted} value={composerText} onChangeText={setComposerText} style={{borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,borderRadius:8,padding:8,marginBottom:8,color:colors.text}} multiline />
            <View style={{flexDirection:'row'}}>
              <TouchableOpacity onPress={() => { setSelectedFriend(null); setSelectedCommunity(null); setComposerText(''); }} style={{flex:1, padding:10, backgroundColor:colors.surfaceVariant, borderRadius:8, marginRight:8, alignItems:'center'}}>
                <Text style={{color:colors.text}}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendFromComposer} disabled={sending} style={{padding:10, backgroundColor:colors.primary, borderRadius:8, alignItems:'center', justifyContent:'center'}}>
                {sending ? <ActivityIndicator color="#fff"/> : <Text style={{color:'#fff'}}>Gönder</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : tab === 'friends' ? (
          <FlatList
            data={filteredFriends}
            keyExtractor={(item, index) => String(item.id ?? item.username ?? `friend-${index}`)}
            renderItem={renderFriendItem}
            extraData={{ conversations, convIndex, localUserId }}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
          />
        ) : (
          communities.length === 0 ? (
            <View style={{padding:12}}>
              <Text style={{color: colors.muted}}>Henüz bir topluluğa üye değilsiniz. Topluluğa katılmak için </Text>
              <Text onPress={() => router.push('/(auth)/community')} style={{color: colors.primary, marginTop:8}}>Topluluklar sayfasını ziyaret edin.</Text>
            </View>
          ) : (
            <FlatList
              data={communities}
              keyExtractor={communityKeyExtractor}
              renderItem={renderCommunityItem}
              extraData={{ conversations, convIndex, localUserId }}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
            />
          )
        )}
      </View>
      </SafeAreaView>
  );
}
