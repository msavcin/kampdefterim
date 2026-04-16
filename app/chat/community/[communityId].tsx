import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, TextInput, Text, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity, Alert, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';
import { createChatSocket } from '@/lib/chatSocket';
import MessageBubble from '@/components/MessageBubble';
import ThemedIcon from '@/components/ThemedIcon';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../components/ThemeProvider';
import { createThemedStyles } from '../../../constants/theme/sharedStyles';
import { emitChatEvent } from '@/lib/chatEvents';
import { markRead } from '@/lib/readMap';
import { getMe } from '@/lib/userCommunityApi';

const DELETED_KEY = '@chat_deleted_v1';
const LAST_OPENED_KEY = '@chat_last_opened_v1';

const getMsgTime = (m:any) => {
  const t = m?.created_at ?? m?.createdAt ?? m?.sent_at ?? m?.timestamp;
  if (!t) return 0;
  try { return typeof t === 'number' ? t : Date.parse(String(t)) || 0; } catch (e) { return 0; }
};

const sortDesc = (arr:any[]) => {
  if (!Array.isArray(arr)) return [];
  return arr.slice().sort((a:any,b:any) => getMsgTime(b) - getMsgTime(a));
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

export default function CommunityChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const communityId = (params as any).communityId;
  const themed = createThemedStyles(colors);

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [friendMapById, setFriendMapById] = useState<Record<string, { name?: string; avatar_url?: string }>>({});
  const [friendMapByName, setFriendMapByName] = useState<Record<string, { name?: string; avatar_url?: string }>>({});
  const socketRef = useRef<any>(null);
  const listRef = useRef<FlatList<any> | null>(null);
  const shouldScrollRef = useRef<boolean>(false);
  const tokenRef = useRef<string | null>(null);
  const [localUserId, setLocalUserId] = useState<number | string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e:any) => {
      setKeyboardVisible(true);
      try { setKeyboardHeight(e?.endCoordinates?.height || 0); } catch (er) { setKeyboardHeight(0); }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      try { showSub.remove(); } catch {}
      try { hideSub.remove(); } catch {}
    };
  }, []);

  const getSenderInfo = (message:any) => {
    const directSender = message?.sender ?? message?.from ?? message?.user ?? message?.author ?? message?.participant;
    const name = (message?.sender_name ?? message?.senderName ?? message?.sender_username ?? message?.senderUsername ?? message?.username ?? message?.name)
      || (directSender && (directSender.name || directSender.full_name || directSender.display_name || directSender.username));
    const avatar_url = message?.sender_avatar_url ?? message?.senderAvatar ?? message?.avatar_url ?? (message?.avatar ??
      (directSender && (directSender.avatar_url || directSender.avatar || directSender.avatarUrl || directSender.photo)));
    const senderId = message?.sender_id ?? message?.senderId ?? message?.from_id ?? message?.user_id ?? message?.userId;
    if (senderId != null) {
      const mapped = friendMapById[String(senderId)];
      if (mapped) {
        return { name: mapped.name || name, avatar_url: mapped.avatar_url || avatar_url };
      }
    }
    if (name) {
      const mapped = friendMapByName[String(name).toLowerCase()];
      if (mapped) {
        return { name: mapped.name || name, avatar_url: mapped.avatar_url || avatar_url };
      }
    }
    return { name, avatar_url };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      tokenRef.current = await getToken();
      try {
        const res = await apiFetch(`${API_URL}/friendships/list`);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const byId: Record<string, { name?: string; avatar_url?: string }> = {};
            const byName: Record<string, { name?: string; avatar_url?: string }> = {};
            for (const f of data) {
              const idCandidate = f.user_id ?? f.id ?? (typeof f.tag === 'string' && f.tag.startsWith('#') ? Number(f.tag.replace('#', '')) : undefined);
              const resolvedId = typeof idCandidate !== 'undefined' && idCandidate !== null ? String(idCandidate) : null;
              const name = f.name || f.username || '';
              const avatar_url = f.avatar_url || '';
              if (resolvedId) byId[resolvedId] = { name, avatar_url };
              if (f.username) byName[String(f.username).toLowerCase()] = { name, avatar_url };
              if (name) byName[String(name).toLowerCase()] = { name, avatar_url };
            }
            if (mounted) {
              setFriendMapById(byId);
              setFriendMapByName(byName);
            }
          }
        }
      } catch (e) { /* ignore friend lookup failures */ }

      try {
        // membership check: ensure current user belongs to this community
        try {
          const me = await getMe().catch(() => null);
          if (!me || !me.community_id || Number(me.community_id) !== Number(communityId)) {
            Alert.alert('Erişim reddedildi', 'Bu topluluğa erişim izniniz yok.');
            try { router.back(); } catch { router.replace('/'); }
            return;
          }
        } catch (e) { /* ignore */ }

        // try to find canonical conversation for this community via dedicated endpoint
        try {
          const convRes = await apiFetch(`${API_URL}/chat/community/${communityId}/conversation`);
          if (convRes && convRes.ok) {
            const convData = await convRes.json();
            const foundConvId = convData?.id ?? convData?.conversation_id ?? convData?.conversation?.id ?? null;
            if (foundConvId) {
              const convStr = String(foundConvId);
              setConvId(convStr);
              convIdRef.current = convStr;
              try { await AsyncStorage.setItem(LAST_OPENED_KEY, convStr); } catch (e) { /* ignore */ }
              // load messages for the canonical conversation
              try {
                const res2 = await apiFetch(`${API_URL}/chat/conversations/${convStr}/messages?limit=50`);
                if (res2 && res2.ok) {
                  const data2 = await res2.json();
                  const arr2 = Array.isArray(data2) ? data2.map(normalizeMessage) : [];
                  if (mounted) setMessages(sortDesc(arr2));
                }
              } catch (e) { console.warn('[CommunityChat] fetch conv messages failed', e); }
            }
          }
        } catch (e) { /* ignore server lookup errors */ }

        // if no conversation exists yet (convIdRef not set), load community-specific messages as a temporary view
        if (!convIdRef.current) {
          try {
            const res = await apiFetch(`${API_URL}/chat/messages?community_id=${communityId}&limit=50`);
            if (res && res.ok) {
              const data = await res.json();
              const arr = Array.isArray(data) ? data.map(normalizeMessage) : [];
              if (mounted) setMessages(sortDesc(arr));
            }
          } catch (e) {
            console.warn('[CommunityChat] fetch messages error', e);
          }
        }
      } catch (e) { console.warn('[CommunityChat] init error', e); }

      try {
        const socket = createChatSocket((msg:any) => {
          try {
                if (msg.type === 'auth' && msg.ok) {
                  setLocalUserId(msg.userId);
                } else if (msg.type === 'message' && msg.payload) {
                  const payload = msg.payload;
                  const payloadCommunity = String(payload.community_id ?? payload.communityId ?? '');
                  const payloadConv = String(payload.conversation_id ?? payload.conversationId ?? '');
                  // accept messages addressed to this community or to the canonical conversation
                  if (payloadCommunity === String(communityId) || (convIdRef.current && payloadConv === String(convIdRef.current))) {
                // handle control deletes
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
                  } catch (e) { return [normalizeMessage(payload), ...prev]; }
                });
              }
            } else if ((msg.type === 'conversation_updated' || msg.type === 'client_message_sent') && msg.payload) {
              try {
                const payload = msg.payload;
                const payloadCommunity = String(payload.community_id ?? payload.communityId ?? '');
                const payloadConv = String(payload.conversation_id ?? payload.conversationId ?? '');
                if (payloadCommunity === String(communityId) || (convIdRef.current && payloadConv === String(convIdRef.current))) {
                  console.log('[CommunityChat] recv', msg.type, 'for community', communityId, 'payload preview', JSON.stringify(payload).slice(0,200));
                  // attempt to refresh recent messages: prefer conversation messages when convId known
                  (async () => {
                    try {
                      if (convIdRef.current) {
                        const res = await apiFetch(`${API_URL}/chat/conversations/${convIdRef.current}/messages?limit=50`);
                        if (res && res.ok) {
                          const data = await res.json();
                          const arr = Array.isArray(data) ? data.map(normalizeMessage) : [];
                          setMessages(sortDesc(arr));
                        }
                      } else {
                        const res = await apiFetch(`${API_URL}/chat/messages?community_id=${communityId}&limit=50`);
                        if (res && res.ok) {
                          const data = await res.json();
                          const arr = Array.isArray(data) ? data.map(normalizeMessage) : [];
                          setMessages(sortDesc(arr));
                        }
                      }
                    } catch (e) { console.warn('[CommunityChat] fetch after conversation_updated failed', e); }
                  })();
                }
              } catch (e) { console.warn('[CommunityChat] conversation_updated handler error', e); }
            } else if (msg.type === 'message_deleted' && msg.payload) {
              const payload = msg.payload;
              const delId = payload?.message_id ?? payload?.id ?? null;
              if (delId != null) {
                setMessages(prev => prev.map(m => String(getMessageId(m)) === String(delId) ? { ...m, is_deleted: true } : m));
              }
            }
          } catch (e) { console.warn('[CommunityChat] socket msg handler error', e); }
        });
        socketRef.current = socket;
        socket.connect(tokenRef.current || '');
      } catch (e) { console.warn('[CommunityChat] socket init failed', e); }

      if (mounted) setLoading(false);
    })();

    return () => {
      try { socketRef.current?.disconnect(); } catch {}
      mounted = false;
    };
  }, [communityId]);

  // When we have a canonical conversation id for this community, mark it read locally
  useEffect(() => {
    if (!convId) return;
    (async () => {
      try {
        await markRead(String(convId));
      } catch (e) { /* ignore */ }
      try { await AsyncStorage.setItem(LAST_OPENED_KEY, String(convId)); } catch (e) { /* ignore */ }
      try { emitChatEvent({ type: 'mark_read', payload: { convId: String(convId) } }); } catch (e) { /* ignore */ }
      try { emitChatEvent({ type: 'chat_viewed' }); } catch (e) { /* ignore */ }
    })();
  }, [convId]);

  useEffect(() => {
    if (messages.length === 0) return;
    shouldScrollRef.current = true;
    if (!listRef.current) return;
    try { listRef.current.scrollToIndex({ index: 0, animated: true }); } catch (e) {
      try { listRef.current.scrollToOffset({ offset: 0, animated: true }); } catch (err) { }
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const tempId = 'tmp-' + Date.now();
    const payload: any = { text, community_id: Number(communityId) };
    const optimistic = { id: tempId, text, sender_id: localUserId ?? 'me', created_at: new Date().toISOString(), sending: true };
    setMessages(prev => [optimistic, ...prev]);
    setText('');
    try {
      const res = await apiFetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      if (!res.ok) throw new Error(`send failed: ${res.status} ${bodyText}`);
      const saved = bodyText ? JSON.parse(bodyText) : null;
      const normalizedSaved = normalizeMessage(saved);
      setMessages(prev => {
        try {
          const savedId = getMessageId(normalizedSaved);
          const out: any[] = [];
          for (const m of prev) {
            if (String(getMessageId(m)) === String(tempId)) continue;
            if (savedId != null && String(getMessageId(m)) === String(savedId)) continue;
            out.push(m);
          }
          return normalizedSaved ? [normalizedSaved, ...out] : out;
        } catch (e) {
          return prev.map(m => (String(getMessageId(m)) === String(tempId) ? normalizedSaved : m));
        }
      });

      try {
        const returnedConvId = saved?.conversation_id ?? saved?.conversation?.id ?? null;
        if (returnedConvId) {
          const convStr = String(returnedConvId);
          setConvId(convStr);
          convIdRef.current = convStr;
          try { await AsyncStorage.setItem(LAST_OPENED_KEY, convStr); } catch (e) { /* ignore */ }
          // load canonical conversation messages to sync
          try {
            const res3 = await apiFetch(`${API_URL}/chat/conversations/${convStr}/messages?limit=50`);
            if (res3 && res3.ok) {
              const d3 = await res3.json();
              const arr3 = Array.isArray(d3) ? d3.map(normalizeMessage) : [];
              setMessages(sortDesc(arr3));
            }
          } catch (err) { /* ignore */ }
        }
      } catch (e) { /* ignore errors */ }

      try {
        const notify = { type: 'client_message_sent', payload: { conversation_id: saved?.conversation_id ?? null, message_id: saved?.id, community_id: Number(communityId) } };
        if (socketRef.current && typeof socketRef.current.send === 'function') {
          try { socketRef.current.send(notify); console.log('[CommunityChat] notified server via socket', notify); } catch (e) { console.warn('[CommunityChat] socket notify failed', e); }
        }
        // also send conversation_updated to help servers trigger broadcasts
        try {
          const notify2 = { type: 'conversation_updated', payload: { conversation_id: saved?.conversation_id ?? null, message_id: saved?.id, community_id: Number(communityId) } };
          if (socketRef.current && typeof socketRef.current.send === 'function') {
            try { socketRef.current.send(notify2); console.log('[CommunityChat] notified server via socket', notify2); } catch (e) { console.warn('[CommunityChat] socket notify2 failed', e); }
          }
        } catch (e) { /* ignore */ }
        try { emitChatEvent({ type: 'conversation_updated', payload: { conversation_id: saved?.conversation_id ?? null, message_id: saved?.id } }); } catch (e) {}
      } catch (e) { /* ignore */ }
    } catch (e) {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, failed: true } : m)));
      console.warn('[CommunityChat] send error', e);
      Alert.alert('Hata', 'Mesaj gönderilemedi.');
    }
  };

  if (loading) return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={{flex:1, backgroundColor: colors.background, justifyContent:'center', alignItems:'center'}}>
        <ActivityIndicator />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );

  return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView edges={keyboardVisible ? ['left','right'] : ['left','right','bottom']} style={themed.screenContainer}>
        <View style={{...themed.screenHeader, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
          <View>
            <Text style={themed.screenHeaderTitle}>{`Topluluk Sohbeti`}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/new')} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <View style={{ alignItems: 'center' }}>
              <ThemedIcon name="Menu" size="md" context="primary" style={{ marginBottom: 2 }} />
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Menü</Text>
            </View>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          inverted
          style={{flex:1, backgroundColor: colors.background}}
          contentContainerStyle={{ paddingTop: 0 + insets.bottom, paddingBottom: keyboardVisible ? 18 : 18 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 20 }}
          onContentSizeChange={() => {
            if (!shouldScrollRef.current || !listRef.current) return;
            try { listRef.current.scrollToOffset({ offset: 0, animated: true }); } catch (e) {}
            shouldScrollRef.current = false;
          }}
          keyExtractor={(m:any, index:number) => String(getMessageId(m) ?? `msg-${index}`)}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMe={String(item.sender_id) === String(localUserId) || String(item.sender_id) === 'me'}
              senderName={getSenderInfo(item).name}
              senderAvatarUrl={getSenderInfo(item).avatar_url}
            />
          )}
        />

        <View style={{flexDirection:'row', paddingHorizontal:8, paddingVertical:8, paddingBottom: keyboardVisible ? 8 : 8 + insets.bottom, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border}}>
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
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
