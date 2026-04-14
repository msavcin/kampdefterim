import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import FriendAvatar from '@/components/FriendAvatar';
import { onChatEvent, emitChatEvent } from '@/lib/chatEvents';
import { createChatSocket } from '@/lib/chatSocket';
import { getToken } from '@/lib/auth';

const DELETED_KEY = '@chat_deleted_v1';

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

export default function ChatList() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const socketRef: { current: any | null } = { current: null };

    const load = async () => {
      try {
        const res = await apiFetch(`${API_URL}/chat/conversations`);
        const data = await res.json();
        if (!mounted) return;
        const arr = Array.isArray(data) ? data : [];
        try {
          const raw = await AsyncStorage.getItem(DELETED_KEY);
          const deletedMap = raw ? JSON.parse(raw) : { conversations: {}, participants: {}, messages: {} };
          let readMap: any = {};
          try {
            const rraw = await AsyncStorage.getItem('@chat_read_v1');
            readMap = rraw ? JSON.parse(rraw) : {};
          } catch (e) { readMap = {}; }
          const arrFiltered = arr.filter((c:any) => {
            try {
              const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
              const lastTime = getConvLastTime(c);
              if (convId && deletedMap.conversations && deletedMap.conversations[String(convId)]) {
                const del = Number(deletedMap.conversations[String(convId)]);
                if (del && lastTime && lastTime <= del) return false;
              }
              const pIds: string[] = [];
              if (Array.isArray(c?.participants)) {
                for (const p of c.participants) {
                  if (!p) continue;
                  if (typeof p === 'object') pIds.push(String(p.id ?? p.user_id ?? p.recipient_id ?? p.other_user_id));
                  else pIds.push(String(p));
                }
              }
              const keys = ['recipient_id','other_user_id','user_id','participant_id'];
              for (const k of keys) if (c[k]) pIds.push(String(c[k]));
              for (const pid of pIds) {
                const pd = deletedMap.participants?.[String(pid)];
                if (pd && lastTime && lastTime <= Number(pd)) return false;
              }
            } catch (e) { /* keep */ }
            return true;
          });
          try {
            // apply local read marks
            const arrWithRead = Array.isArray(arrFiltered) ? arrFiltered.map((c:any) => {
              try {
                const convId = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
                const lastTime = getConvLastTime(c);
                const readTs = readMap && convId ? Number(readMap[String(convId)]) || 0 : 0;
                if (readTs && lastTime && readTs >= lastTime) {
                  return { ...c, unread_count: 0 };
                }
              } catch (e) {}
              return c;
            }) : arrFiltered;
            const totalUnread = arrWithRead.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
            try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) { }
            setConversations(arrWithRead);
          } catch (e) { setConversations(arrFiltered); }
        } catch (e) {
          setConversations(arr);
          try {
            const totalUnread = arr.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
            try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) { }
          } catch (e) { }
        }
      } catch (e) {
        console.warn('[ChatList] fetch error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    try { emitChatEvent({ type: 'chat_viewed' }); } catch (e) { }
    // subscribe to local event bus
    let unsubLocal = () => {};
    try {
      unsubLocal = onChatEvent((e:any) => {
        if (e?.type === 'deleted' || e?.type === 'reset') {
          load();
        } else if (e?.type === 'mark_read') {
          const convId = e?.payload?.convId ?? e?.payload?.conversationId ?? e?.payload?.convID;
          if (!convId) return;
          setConversations(prev => {
            const out = Array.isArray(prev) ? prev.map((c:any) => {
              const id = c?.id ?? c?.conversation_id ?? c?.conversation?.id;
              if (String(id) === String(convId)) return { ...c, unread_count: 0 };
              return c;
            }) : prev;
            try {
              const totalUnread = Array.isArray(out) ? out.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0) : 0;
              emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } });
            } catch (err) { }
            return out;
          });
        }
      });
    } catch (e) { /* ignore */ }

    // also open a socket so remote messages trigger a list refresh (unread counts)
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const socket = createChatSocket((msg:any) => {
          try {
            const t = String(msg?.type || '');
            // refresh list when a relevant conversation/message event arrives
            if (t === 'message' || t === 'conversation_created' || t === 'client_message_sent' || t === 'conversation_updated' || t === 'unread_updated') {
              load();
            }
          } catch (err) { console.warn('[ChatList] socket msg handler error', err); }
        });
        socketRef.current = socket;
        socket.connect(token);
      } catch (err) { console.warn('[ChatList] socket init failed', err); }
    })();

    return () => { mounted = false; try { unsubLocal(); } catch {} try { socketRef.current?.disconnect(); } catch {} };
  }, []);

  if (loading) return (
    <SafeAreaView style={{flex:1,justifyContent:'center',alignItems:'center'}}>
      <ActivityIndicator />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{flex:1}}>
      <FlatList
        data={conversations}
        keyExtractor={(c:any, index) => {
          const base = c?.id ?? c?.conversation_id ?? c?.conversation?.id ?? c?.recipient_id ?? c?.other_user_id ?? c?.user_id ?? 'conv';
          return `${String(base)}-${index}`;
        }}
        renderItem={({ item }) => {
          const convId = item.id ?? item.conversation_id ?? item.conversation?.id;
          const recipientId = item.recipient_id ?? item.other_user_id ?? item.user_id ?? item.participant_id;

          const participant = extractParticipant(item);
          const participantName = participant?.name ?? null;
          const participantAvatar = participant?.avatar_url ?? null;

          const handlePress = () => {
              if (convId) {
              // immediately zero unread for this conversation locally so UI and floating badge update
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
                      emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } });
                    } catch (e) { /* ignore */ }
                    return out;
                  } catch (e) { return prev; }
                });
              } catch (e) { }
                    router.push({ pathname: '/chat/[conversationId]', params: { conversationId: String(convId) } });
            } else if (recipientId) {
              router.push({ pathname: '/chat/new', params: { recipientId: String(recipientId) } });
            } else {
              router.push('/chat/new');
            }
          };

          return (
            <TouchableOpacity onPress={handlePress}>
              <View style={{ flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' }}>
                <FriendAvatar avatar_url={participantAvatar} name={participantName ?? (item.title ?? item.name)} size={48} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontWeight: '600' }}>{item.title ?? participantName ?? item.name ?? 'Sohbet'}</Text>
                  <Text numberOfLines={1} style={{ color: '#666' }}>{item.last_message?.text ?? ''}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <Text numberOfLines={1} style={{ color: '#666', flex: 1 }}>{participantName ? participantName : ''}</Text>
                    {item.unread_count > 0 && (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#e53935', marginLeft: 8 }} />
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}
