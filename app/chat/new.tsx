import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listCommunities } from '@/lib/userCommunityApi';
import FriendAvatar from '@/components/FriendAvatar';
import ThemedIcon from '@/components/ThemedIcon';
import { useTheme } from '@/components/ThemeProvider';
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

function extractParticipantIds(conv:any) {
  const ids = new Set<string>();
  if (!conv) return [];
  const pushId = (v:any) => { if (v==null) return; const s = String(v); if (s) ids.add(s); };
  if (Array.isArray(conv.participants)) {
    for (const p of conv.participants) {
      if (!p) continue;
      if (typeof p === 'object') {
        pushId(p.id ?? p.user_id ?? p.recipient_id ?? p.other_user_id);
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
    if (u && typeof u === 'object') pushId(u.id ?? u.user_id);
  }
  return Array.from(ids);
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
      const found = byId.get(String(idCandidate)) ?? byId.get(Number(idCandidate));
      if (found) return found;
    }
  }

  const byUsername = convIndex?.byUsername;
  if (byUsername) {
    const unameKey = normalizeIndexKey(friend.username);
    const nameKey = normalizeIndexKey(friend.name);
    const found = (unameKey && byUsername.get(unameKey)) || (nameKey && byUsername.get(nameKey));
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
  onContinue,
  onStart,
  onDelete,
}: any) => {
  const conv = useMemo(() => getFriendConversation(item, convIndex, conversations), [item, convIndex, conversations]);

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
          {Number(conv?.unread_count) > 0 && (
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
}: any) => (
  <View style={{flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderColor:colors.border, backgroundColor:colors.surface}}>
    <View style={{width:40,height:40,borderRadius:8,backgroundColor:colors.surfaceVariant,alignItems:'center',justifyContent:'center'}}><Text>🏘️</Text></View>
    <View style={{flex:1, marginLeft:12}}>
      <Text style={{fontWeight:'600', color: colors.text}}>{item.name}</Text>
      {item.description ? <Text style={{color:colors.muted}} numberOfLines={1}>{item.description}</Text> : null}
    </View>
    <TouchableOpacity onPress={() => onStart(item)} style={{backgroundColor:colors.primary, paddingVertical:8,paddingHorizontal:12, borderRadius:8}}>
      <Text style={{color:'#fff'}}>Mesaj Başlat</Text>
    </TouchableOpacity>
  </View>
));

export default function NewChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
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
  const [tab, setTab] = useState<'friends'|'communities'>('friends');

  const emitUnreadUpdated = (totalUnread: number) => {
    if (lastUnreadTotalRef.current !== null && lastUnreadTotalRef.current === totalUnread) return;
    lastUnreadTotalRef.current = totalUnread;
    suppressUnreadUpdatedRef.current = true;
    try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) { }
  };
  const [creating, setCreating] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

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
        const totalUnread = arrWithRead.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
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
                  if (key === 'id' || key.endsWith('_id') || key === 'user_id' || key === 'recipient_id' || key === 'other_user_id') {
                    try { byId.set(String(v), c); } catch {}
                    continue;
                  }
                  if (['username','handle','slug','tag','tag_name','login','name','display_name','full_name'].includes(key)) {
                    const uname = normalize(v);
                    if (uname) try { byUsername.set(uname, c); } catch {}
                    continue;
                  }
                  if (typeof v === 'object' || Array.isArray(v)) {
                    walk(v, depth + 1);
                    continue;
                  }
                  if (typeof v === 'string') {
                    const s = normalize(v);
                    if (s && (/^[a-z0-9_@.-]+$/i.test(s))) {
                      if (v.startsWith('@') || /[a-zA-Z]/.test(v)) try { byUsername.set(s, c); } catch {}
                    }
                    if (/^\d+$/.test(v)) try { byId.set(String(v), c); } catch {}
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

  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      refreshConversations();
    }
  }, [isFocused, refreshConversations]);

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
                const totalUnread = Array.isArray(out) ? out.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0) : 0;
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
        if (mounted) setCommunities(Array.isArray(comms) ? comms : []);

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
                const totalUnread = arrWithRead.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
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
                          if (key === 'id' || key.endsWith('_id') || key === 'user_id' || key === 'recipient_id' || key === 'other_user_id') {
                            try { byId.set(String(v), c); } catch {}
                            continue;
                          }
                          if (['username','handle','slug','tag','tag_name','login','name','display_name','full_name'].includes(key)) {
                            const uname = normalize(v);
                            if (uname) try { byUsername.set(uname, c); } catch {}
                            continue;
                          }
                          if (typeof v === 'object' || Array.isArray(v)) {
                            walk(v, depth + 1);
                            continue;
                          }
                          if (typeof v === 'string') {
                            const s = normalize(v);
                            if (s && (/^[a-z0-9_@.-]+$/i.test(s))) {
                              if (v.startsWith('@') || /[a-zA-Z]/.test(v)) try { byUsername.set(s, c); } catch {}
                            }
                            if (/^\d+$/.test(v)) try { byId.set(String(v), c); } catch {}
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
    if (selectedFriend?.id) payload.recipient_id = Number(selectedFriend.id);
    else if (selectedCommunity?.id) payload.community_id = Number(selectedCommunity.id);
    else if (initialRecipientId) payload.recipient_id = Number(initialRecipientId);
    else if (initialCommunityId) payload.community_id = Number(initialCommunityId);
    else { Alert.alert('Hata', 'Alıcı seçili değil.'); return; }

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
        try {
          // don't mark conversation as locally-deleted on successful send;
          // only refresh unread totals so floating badge stays in sync
          const listRes = await apiFetch(`${API_URL}/chat/conversations`);
          if (listRes && listRes.ok) {
            const listData = await listRes.json();
            if (Array.isArray(listData)) {
              const totalUnread = listData.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
              try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) {}
            }
          }
        } catch (e) { console.warn('[NewChat] emit unread update failed', e); }

        try { await AsyncStorage.setItem(LAST_OPENED_KEY, String(convId)); } catch (e) { /* ignore */ }
        router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } });
        return;
      }

      const recipientId = payload.recipient_id ?? (selectedFriend?.id ? Number(selectedFriend.id) : undefined) ?? (initialRecipientId ? Number(initialRecipientId) : undefined);
      if (recipientId) {
        try {
          const listRes = await apiFetch(`${API_URL}/chat/conversations`);
          if (listRes.ok) {
            const listData = await listRes.json();
            if (Array.isArray(listData)) {
              const found = listData.find((c:any) => {
                const members = c.participants ?? c.members ?? c.participants_ids ?? c.user_ids ?? [];
                if (Array.isArray(members) && members.some((id:any) => Number(id) === Number(recipientId))) return true;
                if (c.recipient_id && Number(c.recipient_id) === Number(recipientId)) return true;
                if (c.other_user_id && Number(c.other_user_id) === Number(recipientId)) return true;
                return false;
              });
                if (found?.id) {
                router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: String(found.id) } });
                return;
              }
            }
          }
        } catch (e) {
          console.warn('[NewChat] fallback conv lookup error', e);
        }
      }

      Alert.alert('Başarılı', 'Mesaj gönderildi. Sohbet listesine yönlendiriliyorsunuz.');
      router.replace('/chat/chat-list');
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
              const totalUnread = Array.isArray(out) ? out.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0) : 0;
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
    router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } });
  }, [router]);

  const handleStartWithFriend = useCallback((friend: any) => {
    if (!friend?.id) { Alert.alert('Hata', 'Bu kullanıcıda geçerli bir id yok.'); return; }
    setSelectedFriend(friend);
    setSelectedCommunity(null);
    setComposerText('');
  }, []);

  const handleStartWithCommunity = useCallback((community: any) => {
    if (!community?.id) { Alert.alert('Hata', 'Topluluk id yok'); return; }
    setSelectedCommunity(community);
    setSelectedFriend(null);
    setComposerText('');
  }, []);

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
                  const totalUnread = listData.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
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

  const filteredFriends = useMemo(() => friends.filter(f => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (f.name || '').toLowerCase().includes(q) || (f.username || '').toLowerCase().includes(q);
  }), [friends, query]);

  const renderFriendItem = useCallback(({ item }: { item: any }) => (
    <FriendRow
      item={item}
      colors={colors}
      convIndex={convIndex}
      conversations={conversations}
      onContinue={handleContinueConversation}
      onStart={handleStartWithFriend}
      onDelete={handleDeleteConversation}
    />
  ), [colors, convIndex, conversations, handleContinueConversation, handleStartWithFriend, handleDeleteConversation]);

  const renderCommunityItem = useCallback(({ item }: { item: any }) => (
    <CommunityRow
      item={item}
      colors={colors}
      onStart={handleStartWithCommunity}
    />
  ), [colors, handleStartWithCommunity]);

  const communityKeyExtractor = useCallback((item:any, index:number) => String(item.id ?? `community-${index}`), []);

  if (loading) return <SafeAreaView style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background}}><ActivityIndicator/></SafeAreaView>;

  return (
    <>
      <Stack.Screen options={{ title: 'Sohbet', headerRight: () => (<ThemedIcon name="MessageCircle" size={20} />) }} />
      <SafeAreaView style={{flex:1, backgroundColor: colors.background}}>
      <View style={{padding:16, backgroundColor: colors.background}}>
        <Text style={{fontSize:18,fontWeight:'600',marginBottom:8,color:colors.text}}>Sohbet</Text>
        <Text style={{color:colors.muted,marginBottom:12}}>Bir kişiye veya topluluğa mesaj göndermek için seçin.</Text>
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
          />
        ) : (
          <FlatList
            data={communities}
            keyExtractor={communityKeyExtractor}
            renderItem={renderCommunityItem}
          />
        )}
      </View>
      </SafeAreaView>
    </>
  );
}
