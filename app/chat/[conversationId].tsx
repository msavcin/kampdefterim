import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, TextInput, Text, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';
import { createChatSocket } from '@/lib/chatSocket';
import { emitChatEvent } from '@/lib/chatEvents';
import { markRead } from '@/lib/readMap';
import MessageBubble from '@/components/MessageBubble';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Map, Heart, User, SquareCheck as CheckSquare, Bell, MessageCircle } from 'lucide-react-native';
import { useTheme } from '../../components/ThemeProvider';

const DELETED_KEY = '@chat_deleted_v1';
const LAST_OPENED_KEY = '@chat_last_opened_v1';

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const conversationId = (params as any).conversationId;
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<any>(null);
  const listRef = useRef<FlatList<any> | null>(null);
  const shouldScrollRef = useRef<boolean>(false);
  const tokenRef = useRef<string | null>(null);
  const [localUserId, setLocalUserId] = useState<number | string | null>(null);

  const footerItems = [
    { name: '/', label: 'Harita', icon: Map },
    { name: '/announcements', label: 'Duyurular', icon: Bell },
    { name: '/checklist', label: 'Checklist', icon: CheckSquare },
    { name: '/favorites', label: 'Favoriler', icon: Heart },
    { name: '/new', label: 'Sohbet', icon: MessageCircle },
    { name: '/profile', label: 'Profil', icon: User },
  ];

  const getMsgTime = (m:any) => {
    const t = m?.created_at ?? m?.createdAt ?? m?.sent_at ?? m?.timestamp;
    if (!t) return 0;
    try { return typeof t === 'number' ? t : Date.parse(String(t)) || 0; } catch (e) { return 0; }
  };

  const sortChrono = (arr:any[]) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice().sort((a:any,b:any) => {
      return getMsgTime(a) - getMsgTime(b);
    });
  };

  const getMessageId = (message:any) => {
    return message?.id ?? message?.message_id ?? message?.messageId ?? null;
  };

  const normalizeMessage = (message:any) => {
    if (!message || typeof message !== 'object') return message;
    const id = getMessageId(message);
    if (id != null && message.id == null) {
      return { ...message, id };
    }
    return message;
  };

  const isDeleteControlMessage = (item:any) => {
    if (!item || typeof item !== 'object') return false;
    const action = item?.metadata?.action ?? item?.meta?.control?.action ?? item?.action ?? item?.type;
    const actionStr = typeof action === 'string' ? String(action).toLowerCase() : null;
    return actionStr === 'delete' || actionStr === 'delete_message' || actionStr === 'remove' || String(item?.type).toLowerCase() === 'control';
  };

  const getControlTarget = (item:any) => {
    return item?.metadata?.target_message_id ?? item?.meta?.control?.target_message_id ?? item?.meta?.control?.targetMessageId ?? item?.target_message_id ?? item?.targetMessageId ?? null;
  };

  const sortDesc = (arr:any[]) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice().sort((a:any,b:any) => {
      return getMsgTime(b) - getMsgTime(a);
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      tokenRef.current = await getToken();
      try {
        if (conversationId) {
          await AsyncStorage.setItem(LAST_OPENED_KEY, String(conversationId));
          try { emitChatEvent({ type: 'chat_viewed' }); } catch (e) { }
        }
      } catch (e) { /* ignore store errors */ }
        try {
        const res = await apiFetch(`${API_URL}/chat/conversations/${conversationId}/messages?limit=50`);
        const data = await res.json();
        if (!mounted) return;
        // server may return reverse order; ensure chronological order for inverted FlatList
        const arr = Array.isArray(data) ? data : [];
        try {
            const raw = await AsyncStorage.getItem(DELETED_KEY);
            const deletedMap = raw ? JSON.parse(raw) : { conversations: {}, participants: {}, messages: {} };
          const convDel = deletedMap.conversations?.[String(conversationId)];
          if (convDel) {
            const delTs = Number(convDel);
            const filtered = arr.filter((m:any) => {
              const t = m?.created_at ?? m?.createdAt ?? m?.sent_at ?? m?.timestamp;
              const tt = t ? (typeof t === 'number' ? t : Date.parse(String(t))) : NaN;
              if (isNaN(tt)) return true;
              return tt > delTs;
            });
            // detect control messages (delete commands) and collect targets
            const deleteTargets = new Set<string>();
            const nonControl: any[] = [];
            for (const item of filtered) {
              if (isDeleteControlMessage(item)) {
                const tgt = getControlTarget(item);
                if (tgt) deleteTargets.add(String(tgt));
                continue;
              }
              nonControl.push(normalizeMessage(item));
            }
            const mapped = nonControl.map((m:any) => {
              try {
                const mid = getMessageId(m);
                if (mid && deletedMap.messages && deletedMap.messages[String(mid)]) return { ...m, is_deleted: true };
                if (mid && deleteTargets.has(String(mid))) return { ...m, is_deleted: true };
              } catch (e) { }
              return m;
            });
            setMessages(sortDesc(mapped));
            try { await markRead(conversationId); } catch (e) { /* ignore */ }
            try { emitChatEvent({ type: 'mark_read', payload: { convId: conversationId } }); } catch (e) {}
            try { socketRef.current && typeof socketRef.current.send === 'function' && socketRef.current.send({ type: 'mark_read', payload: { conversation_id: conversationId } }); } catch (e) {}
            try {
              const listRes = await apiFetch(`${API_URL}/chat/conversations`);
              if (listRes && listRes.ok) {
                const listData = await listRes.json();
                if (Array.isArray(listData)) {
                  const totalUnread = listData.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
                  try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) {}
                }
              }
            } catch (e) { console.warn('[Chat] emit unread update failed', e); }
          } else {
            // filter control messages and apply delete targets
            const deleteTargets2 = new Set<string>();
            const nonControlAll: any[] = [];
            for (const item of arr) {
              if (isDeleteControlMessage(item)) {
                const tgt = getControlTarget(item);
                if (tgt) deleteTargets2.add(String(tgt));
                continue;
              }
              nonControlAll.push(normalizeMessage(item));
            }
            const mappedAll = nonControlAll.map((m:any) => {
              try {
                const mid = getMessageId(m);
                if (mid && deletedMap.messages && deletedMap.messages[String(mid)]) return { ...m, is_deleted: true };
                if (mid && deleteTargets2.has(String(mid))) return { ...m, is_deleted: true };
              } catch (e) { }
              return m;
            });
            setMessages(sortDesc(mappedAll));
            try { await markRead(conversationId); } catch (e) { /* ignore */ }
            try { emitChatEvent({ type: 'mark_read', payload: { convId: conversationId } }); } catch (e) {}
            try { socketRef.current && typeof socketRef.current.send === 'function' && socketRef.current.send({ type: 'mark_read', payload: { conversation_id: conversationId } }); } catch (e) {}
            try {
              const listRes = await apiFetch(`${API_URL}/chat/conversations`);
              if (listRes && listRes.ok) {
                const listData = await listRes.json();
                if (Array.isArray(listData)) {
                  const totalUnread = listData.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
                  try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread } }); } catch (e) {}
                }
              }
            } catch (e) { console.warn('[Chat] emit unread update failed', e); }
          }
        } catch (e) {
          // fallback: filter control messages and mark targets
          const deleteTargetsFb = new Set<string>();
          const nonControlFb: any[] = [];
          for (const item of arr) {
            if (isDeleteControlMessage(item)) {
              const tgt = getControlTarget(item);
              if (tgt) deleteTargetsFb.add(String(tgt));
              continue;
            }
            nonControlFb.push(normalizeMessage(item));
          }
          const mappedFallback = nonControlFb.map((m:any) => {
            try {
              const mid = getMessageId(m);
              if (mid && deleteTargetsFb.has(String(mid))) return { ...m, is_deleted: true };
            } catch (e) { }
            return m;
          });
          setMessages(sortDesc(mappedFallback));
        }
      } catch (e) {
        console.warn('[Chat] fetch messages error', e);
      } finally {
        if (mounted) setLoading(false);
      }

      const socket = createChatSocket((msg:any) => {
        if (msg.type === 'auth' && msg.ok) {
          setLocalUserId(msg.userId);
        } else if (msg.type === 'message' && msg.payload) {
          try {
            const payload = msg.payload;
            if (String(payload.conversation_id) === String(conversationId)) {
              // treat control messages (delete commands) specially
              if (isDeleteControlMessage(payload)) {
                const target = getControlTarget(payload);
                if (target) {
                  setMessages(prev => prev.map(m => String(getMessageId(m)) === String(target) ? { ...m, is_deleted: true } : m));
                  (async () => {
                    try {
                      const raw = await AsyncStorage.getItem(DELETED_KEY);
                      const existing = raw ? JSON.parse(raw) : { conversations: {}, participants: {}, messages: {} };
                      existing.messages = existing.messages || {};
                      existing.messages[String(target)] = Date.now();
                      await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(existing));
                    } catch (e) { /* ignore */ }
                  })();
                }
                return;
              }
              setMessages(prev => {
                try {
                  const normalizedPayload = normalizeMessage(payload);
                  const pid = getMessageId(normalizedPayload);
                  if (pid != null) {
                    const pidStr = String(pid);
                    if (prev.some(m => String(getMessageId(m)) === pidStr)) return prev;
                    const filtered = prev.filter(m => String(getMessageId(m)) !== pidStr);
                    return [normalizedPayload, ...filtered];
                  }
                  return [normalizedPayload, ...prev];
                } catch (e) { /* ignore dedupe errors */ }
                return [normalizeMessage(payload), ...prev];
              });
              (async () => {
                try {
                  await markRead(conversationId);
                  try { emitChatEvent({ type: 'mark_read', payload: { convId: conversationId } }); } catch (e) { }
                } catch (e) { }
              })();
            }
          } catch (e) { console.warn(e); }
        } else if (msg.type === 'message_deleted' && msg.payload) {
          try {
            const payload = msg.payload;
            const delId = payload?.message_id ?? payload?.id ?? null;
            if (String(payload.conversation_id) === String(conversationId)) {
              if (delId != null) {
                // soft-delete in UI
                setMessages(prev => prev.map(m => String(getMessageId(m)) === String(delId) ? { ...m, is_deleted: true } : m));
              } else {
                // fallback: refresh list
                (async () => {
                    try {
                    const res2 = await apiFetch(`${API_URL}/chat/conversations/${conversationId}/messages?limit=50`);
                    const data2 = await res2.json();
                    const normalized = Array.isArray(data2) ? sortDesc(data2.map(normalizeMessage)) : [];
                    setMessages(normalized);
                  } catch (e) { /* ignore */ }
                })();
              }
            }
          } catch (e) { console.warn('[Chat] message_deleted handler error', e); }
        }
      });
      socketRef.current = socket;
      socket.connect(tokenRef.current || '');
    })();

    return () => {
      mounted = false;
      try { socketRef.current?.disconnect(); } catch {}
    };
  }, [conversationId]);

  useEffect(() => {
    if (messages.length === 0) return;
    shouldScrollRef.current = true;
    if (!listRef.current) return;
    try {
      listRef.current.scrollToIndex({ index: 0, animated: true });
    } catch (e) {
      try {
        listRef.current.scrollToOffset({ offset: 0, animated: true });
      } catch (err) {
        // ignore
      }
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const tempId = 'tmp-' + Date.now();
    const convIdNum = Number(conversationId);
    const paramsAny = params as any;
    const payload: any = { text };
    if (!Number.isNaN(convIdNum) && convIdNum > 0) {
      payload.conversation_id = convIdNum;
    } else if (paramsAny.recipientId) {
      payload.recipient_id = Number(paramsAny.recipientId);
    } else if (paramsAny.communityId) {
      payload.community_id = Number(paramsAny.communityId);
    } else {
      // cannot send without any identifier
      const optimistic = { id: tempId, text, sender_id: localUserId ?? 'me', created_at: new Date().toISOString(), sending: true };
      setMessages(prev => [...prev, optimistic].map(m => (m.id === tempId ? { ...m, failed: true } : m)));
      console.warn('[Chat] send aborted: missing conversation_id/recipient_id/community_id', paramsAny);
      return;
    }

    const optimistic = { id: tempId, text, sender_id: localUserId ?? 'me', created_at: new Date().toISOString(), sending: true, conversation_id: payload.conversation_id };
    setMessages(prev => [optimistic, ...prev]);
    setText('');
    try {
      console.log('[Chat] send payload', payload);
      const res = await apiFetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch (err) {
        console.warn('[Chat] reading response text failed', err);
      }
      if (!res.ok) {
        console.warn('[Chat] send failed status:', res.status, 'body:', bodyText);
        throw new Error(`send failed: ${res.status} ${bodyText}`);
      }
      let saved: any = null;
      try {
        saved = bodyText ? JSON.parse(bodyText) : null;
      } catch (err) {
        try {
          saved = await res.json();
        } catch (er) {
          saved = null;
        }
      }
      const normalizedSaved = normalizeMessage(saved);
      console.log('[Chat] send response saved', normalizedSaved);
      setMessages(prev => {
        try {
          const savedId = getMessageId(normalizedSaved);
          const savedIdStr = savedId != null ? String(savedId) : null;
          const out: any[] = [];
          for (const m of prev) {
            if (String(getMessageId(m)) === String(tempId)) continue; // remove temp placeholder
            if (savedIdStr != null && String(getMessageId(m)) === savedIdStr) continue; // remove any existing dup
            out.push(m);
          }
          return normalizedSaved ? [normalizedSaved, ...out] : out;
        } catch (e) {
          return prev.map(m => (String(getMessageId(m)) === String(tempId) ? normalizedSaved : m));
        }
      });
      // Try to notify server via socket (if available) to speed up delivery/broadcast
      try {
        const notify = { type: 'client_message_sent', payload: { conversation_id: saved?.conversation_id ?? payload.conversation_id, message_id: saved?.id } };
        if (socketRef.current && typeof socketRef.current.send === 'function') {
          try { socketRef.current.send(notify); console.log('[Chat] notified server via socket', notify); } catch (e) { console.warn('[Chat] socket notify failed', e); }
        }
        // also send a secondary event that some servers might listen for
        const notify2 = { type: 'conversation_updated', payload: { conversation_id: saved?.conversation_id ?? payload.conversation_id, message_id: saved?.id } };
        if (socketRef.current && typeof socketRef.current.send === 'function') {
          try { socketRef.current.send(notify2); console.log('[Chat] notified server via socket', notify2); } catch (e) { console.warn('[Chat] socket notify2 failed', e); }
        }
        // finally, update local unread totals for this client immediately
        try {
          const listRes2 = await apiFetch(`${API_URL}/chat/conversations`);
          if (listRes2 && listRes2.ok) {
            const listData2 = await listRes2.json();
            if (Array.isArray(listData2)) {
              const totalUnread2 = listData2.reduce((acc:number, c:any) => acc + (Number(c?.unread_count) || 0), 0);
              try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread2 } }); } catch (e) {}
            }
          }
        } catch (e) { console.warn('[Chat] emit unread update after send failed', e); }
      } catch (e) { /* ignore */ }
    } catch (e) {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, failed: true } : m)));
      console.warn('[Chat] send error', e);
    }
  };

    const handleDelete = async (messageId:any) => {
      if (!messageId) return;
      // optimistic soft-delete locally (mark as deleted)
      setMessages(prev => prev.map(m => (String(getMessageId(m)) === String(messageId) ? { ...m, is_deleted: true } : m)));

      try {
        const raw = await AsyncStorage.getItem(DELETED_KEY);
        const existing = raw ? JSON.parse(raw) : { conversations: {}, participants: {}, messages: {} };
        existing.messages = existing.messages || {};
        existing.messages[String(messageId)] = Date.now();
        await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(existing));
      } catch (e) {
        console.warn('[Chat] persist message delete failed', e);
      }

      // also send a control message so the server broadcasts a delete command to other clients
      try {
        const ctrl = {
          conversation_id: Number(conversationId),
          text: '',
          metadata: { action: 'delete', target_message_id: messageId },
          meta: { control: { action: 'delete', target_message_id: messageId } },
        };
        try {
          const ctrlRes = await apiFetch(`${API_URL}/chat/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctrl) });
          if (ctrlRes && ctrlRes.ok) console.log('[Chat] control message sent');
          else console.warn('[Chat] control message send failed', ctrlRes?.status);
        } catch (e) { console.warn('[Chat] control message send error', e); }
      } catch (e) { /* ignore */ }

      // notify others via socket and local event bus (best-effort)
      try {
        if (socketRef.current && typeof socketRef.current.send === 'function') {
          try { socketRef.current.send({ type: 'message_deleted', payload: { message_id: messageId, conversation_id: conversationId } }); } catch (e) { console.warn('[Chat] socket send message_deleted failed', e); }
        }
      } catch (e) { /* ignore */ }
      try { emitChatEvent({ type: 'deleted', payload: { message_id: messageId, conversation_id: conversationId } }); } catch (e) { }
      Alert.alert('Başarılı', 'Mesaj silindi.');
    };

  if (loading) return (
    <SafeAreaView style={{flex:1, backgroundColor: colors.background, justifyContent:'center', alignItems:'center'}}>
      <ActivityIndicator />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{flex:1, backgroundColor: colors.background}}>
      <KeyboardAvoidingView
        style={{flex:1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          style={{flex:1, backgroundColor: colors.background}}
          contentContainerStyle={{ paddingTop: 0 + insets.bottom, paddingBottom: 18 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 20 }}
          onContentSizeChange={() => {
            if (!shouldScrollRef.current || !listRef.current) return;
            try {
              listRef.current.scrollToOffset({ offset: 0, animated: true });
            } catch (e) {
              // ignore
            }
            shouldScrollRef.current = false;
          }}
          keyExtractor={(m:any, index:number) => String(getMessageId(m) ?? `msg-${index}`)}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMe={String(item.sender_id) === String(localUserId) || String(item.sender_id) === 'me'} onDelete={handleDelete} />
          )}
        />

        <View style={{flexDirection:'row', padding:8, paddingBottom: 8 + insets.bottom, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border}}>
          <TextInput
            style={{flex:1, borderWidth:1, borderColor:colors.border, borderRadius:8, padding:8, backgroundColor: colors.background, color: colors.text}}
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            placeholder="Mesaj yazın..."
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity onPress={handleSend} style={{marginLeft:8, alignSelf:'center', paddingHorizontal:12, paddingVertical:8, backgroundColor:colors.primary, borderRadius:8}}>
            <Text style={{color:'#fff'}}>Gönder</Text>
          </TouchableOpacity>
        </View>
        <View style={{flexDirection:'row', justifyContent:'space-around', alignItems:'center', paddingVertical:10, paddingBottom: insets.bottom, backgroundColor: colors.tabBar, borderTopWidth: 1, borderTopColor: colors.tabBarBorder}}>
          {footerItems.map(item => {
            const Icon = item.icon;
            const isActive = item.name === '/new';
            return (
              <TouchableOpacity key={item.name} onPress={() => router.push(item.name as any)} style={{alignItems:'center', width: 48}}>
                <Icon color={isActive ? colors.tabBarActive : colors.tabBarInactive} size={20} />
                <Text style={{fontSize:10, color: isActive ? colors.tabBarActive : colors.tabBarInactive, marginTop: 4, textAlign:'center'}}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
