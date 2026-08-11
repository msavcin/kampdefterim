import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, TextInput, Text, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity, Alert, Keyboard, Dimensions, findNodeHandle, UIManager } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { openConversationOrCommunity } from '@/lib/chatNavigation';
import { getMe } from '@/lib/userCommunityApi';
import { getToken } from '@/lib/auth';
import * as SecureStore from 'expo-secure-store';
import { createChatSocket } from '@/lib/chatSocket';
import { emitChatEvent, onChatEvent } from '@/lib/chatEvents';
import { markRead } from '@/lib/readMap';
import { offlineTransportManager } from '@/lib/offlineTransport';
import { clearOfflineUnread } from '@/lib/offlineUnread';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import MessageBubble from '@/components/MessageBubble';
import NearbyPeersBar from '@/components/NearbyPeersBar';
import ThemedIcon from '@/components/ThemedIcon';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';

const DELETED_KEY = '@chat_deleted_v1';
const LAST_OPENED_KEY = '@chat_last_opened_v1';

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const themed = createThemedStyles(colors);
  const conversationId = (params as any).conversationId;
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [friendMapById, setFriendMapById] = useState<Record<string, { name?: string; avatar_url?: string }>>({});
  const [friendMapByName, setFriendMapByName] = useState<Record<string, { name?: string; avatar_url?: string }>>({});
  const [conversationMeta, setConversationMeta] = useState<any>(null);
  const socketRef = useRef<any>(null);
  const listRef = useRef<FlatList<any> | null>(null);
  const shouldScrollRef = useRef<boolean>(false);
  const tokenRef = useRef<string | null>(null);
  const [localUserId, setLocalUserId] = useState<number | string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardScreenY, setKeyboardScreenY] = useState<number | null>(null);
  const [composerKeyboardOffset, setComposerKeyboardOffsetState] = useState(0);
  const composerLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const composerRef = useRef<any>(null);
  const composerScreenLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const keyboardVisibleRef = useRef(false);
  const keyboardHeightRef = useRef(0);
  const keyboardScreenYRef = useRef<number | null>(null);
  const composerKeyboardOffsetRef = useRef(0);
  // Android 15/16'da bazı klavyeler eventScreenY değerine üst araç/suggestion barını
  // dahil etmiyor. Bu yüzden yeni Android'lerde daha büyük güvenlik payı bırakıyoruz.
  const COMPOSER_KEYBOARD_MARGIN =
    Platform.OS === 'android' && (Number(Platform.Version) || 0) >= 35 ? 56 : 8;
  const [isOffline, setIsOffline] = useState(false);
  const [hasWifiPeers, setHasWifiPeers] = useState(false);
  const isConnected = useNetworkStatus();
  const prevConnectedRef = useRef<boolean | null>(null);

  const getMsgTime = (m:any) => {
    // Öncelik sırası:
    // 1. meta.client_sent_at — offline sync'te gönderilen gerçek offline zamanı,
    //    sunucu bunu meta JSONB'ye kaydetmişse server timestamp'ini ezer.
    // 2. timestamp — offline queue'dan gelen ham unix ms (offline_peer mesajlar)
    // 3. created_at / createdAt / sent_at — sunucudan gelen zaman damgası
    const meta = m?.meta;
    if (meta?.client_sent_at) {
      try { const v = Date.parse(String(meta.client_sent_at)); if (v > 0) return v; } catch { /* fall through */ }
    }
    const t = m?.timestamp ?? m?.created_at ?? m?.createdAt ?? m?.sent_at;
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

  function isCommunityConversationObj(c:any) {
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
  }

  const sumPersonalUnread = (arr:any[]) => Array.isArray(arr) ? arr.reduce((acc:number, c:any) => {
    if (isCommunityConversationObj(c)) return acc;
    const communityId = c?.community_id ?? c?.community?.id ?? null;
    if (communityId) return acc;
    return acc + (Number(c?.unread_count) || 0);
  }, 0) : 0;

  const normalizeMessage = (message:any) => {
    if (!message || typeof message !== 'object') return message;
    const id = getMessageId(message);
    if (id != null && message.id == null) {
      return { ...message, id };
    }
    return message;
  };

  const isEmptyMessage = (msg:any) => {
    if (!msg || typeof msg !== 'object') return true;
    const rawText = msg?.text ?? msg?.body ?? '';
    if (typeof rawText === 'string' && rawText.trim() !== '') return false;
    const hasAttachment = Array.isArray(msg?.attachments) && msg.attachments.length > 0;
    const hasMedia = Array.isArray(msg?.media) && msg.media.length > 0;
    const hasFiles = Array.isArray(msg?.files) && msg.files.length > 0;
    const hasImage = !!(msg?.image || msg?.image_url || msg?.photo);
    return !(hasAttachment || hasMedia || hasFiles || hasImage);
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

  const getConversationRecipientId = (conv:any, currentUserId:any) => {
    if (!conv || typeof conv !== 'object') return null;
    const candidate = conv.recipient_id ?? conv.other_user_id ?? conv.user_id ?? conv.participant_id;
    if (candidate != null) return candidate;

    const participantIds = Array.isArray(conv.participants) ? conv.participants : Array.isArray(conv.members) ? conv.members : Array.isArray(conv.user_ids) ? conv.user_ids : Array.isArray(conv.participants_ids) ? conv.participants_ids : [];
    if (participantIds.length) {
      const normalizedCurrentUser = currentUserId != null ? String(currentUserId) : null;
      const ids = participantIds.map((item:any) => {
        if (item == null) return null;
        if (typeof item === 'object') return String(item.user_id ?? item.recipient_id ?? item.other_user_id ?? item.participant_id ?? item.id);
        return String(item);
      }).filter((id:any) => id);
      if (ids.length === 1) return ids[0];
      if (ids.length === 2 && normalizedCurrentUser) {
        const other = ids.find((id:any) => id !== normalizedCurrentUser);
        if (other) return other;
      }
      if (ids.length === 1) return ids[0];
    }

    const otherObj = conv.other_user ?? conv.recipient ?? conv.user ?? conv.participant_user ?? conv.participant ?? conv.other_user_object ?? conv.recipient_object ?? conv.participants?.[0] ?? conv.members?.[0];
    if (otherObj && typeof otherObj === 'object') {
      return otherObj.user_id ?? otherObj.recipient_id ?? otherObj.other_user_id ?? otherObj.participant_id ?? otherObj.id ?? null;
    }

    return null;
  };

  const inferRecipientIdFromMessages = (msgs:any[], currentUserId:any) => {
    if (!Array.isArray(msgs) || msgs.length === 0) return null;
    const normalizedCurrent = currentUserId != null ? String(currentUserId) : null;
    const senderIds = new Set<string>();
    const recipientIds = new Set<string>();

    for (const msg of msgs) {
      const senderId = msg?.sender_id ?? msg?.senderId ?? msg?.from_id ?? msg?.user_id ?? msg?.userId;
      const recipientId = msg?.recipient_id ?? msg?.recipientId ?? msg?.recipient;
      if (normalizedCurrent != null) {
        if (senderId != null && String(senderId) !== normalizedCurrent) return senderId;
        if (recipientId != null && String(recipientId) !== normalizedCurrent) return recipientId;
      } else {
        if (senderId != null) senderIds.add(String(senderId));
        if (recipientId != null) recipientIds.add(String(recipientId));
      }
    }

    if (normalizedCurrent == null) {
      if (recipientIds.size === 1) return Array.from(recipientIds)[0];
      if (senderIds.size === 1) return Array.from(senderIds)[0];
    }
    return null;
  };

  const setComposerKeyboardOffset = (nextOffset: number) => {
    const normalized = Math.max(0, Math.round(Number(nextOffset) || 0));
    composerKeyboardOffsetRef.current = normalized;
    setComposerKeyboardOffsetState(normalized);
  };

  const calculateAdaptiveComposerOffset = (
    layout = composerLayoutRef.current,
    layoutScreen = composerScreenLayoutRef.current,
    keyboardTop = keyboardScreenYRef.current,
  ) => {
    if (Platform.OS !== 'android' || !keyboardVisibleRef.current || !layout) {
      return 0;
    }
    const windowDims = Dimensions.get('window');
    const resolvedKeyboardTop = keyboardTop != null
      ? keyboardTop
      : Math.max(0, windowDims.height - (keyboardHeightRef.current || 0) - (insets.bottom || 0));

    const baselineComposerBottom = layoutScreen
      ? layoutScreen.y + layoutScreen.height + composerKeyboardOffsetRef.current
      : layout.y + layout.height + composerKeyboardOffsetRef.current;

    return Math.max(0, Math.ceil(baselineComposerBottom - resolvedKeyboardTop + COMPOSER_KEYBOARD_MARGIN));
  };

  const applyAdaptiveComposerOffset = (phase: string, keyboardTopOverride?: number | null) => {
    const nextOffset = calculateAdaptiveComposerOffset(
      composerLayoutRef.current,
      composerScreenLayoutRef.current,
      keyboardTopOverride ?? keyboardScreenYRef.current,
    );
    const currentOffset = composerKeyboardOffsetRef.current;
    if (Math.abs(nextOffset - currentOffset) > 2) {
      setComposerKeyboardOffset(nextOffset);
      logKeyboardDebug(`${phase}:offsetApplied`, undefined, { nextOffset, previousOffset: currentOffset });
    } else {
      logKeyboardDebug(`${phase}:offsetStable`, undefined, { nextOffset, previousOffset: currentOffset });
    }
  };

  const measureRefInWindow = (ref: any) => {
    return new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      try {
        if (!ref || !ref.current) return resolve(null);
        const node = ref.current as any;
        if (typeof node.measureInWindow === 'function') {
          node.measureInWindow((x: number, y: number, width: number, height: number) => {
            resolve({ x, y, width, height });
          });
        } else {
          const handle = findNodeHandle(node);
          if (handle && UIManager && typeof UIManager.measureInWindow === 'function') {
            UIManager.measureInWindow(handle, (x: number, y: number, width: number, height: number) => {
              resolve({ x, y, width, height });
            });
          } else resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  };

  const logKeyboardDebug = (phase: string, event?: any, extra?: Record<string, any>) => {
    try {
      const windowDims = Dimensions.get('window');
      const screenDims = Dimensions.get('screen');
      const eventHeight = Number(event?.endCoordinates?.height ?? keyboardHeightRef.current ?? 0);
      const eventScreenY = event?.endCoordinates?.screenY ?? keyboardScreenYRef.current ?? null;
      const apiLevel = Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0;
      const adaptiveOffset = calculateAdaptiveComposerOffset(composerLayoutRef.current, eventScreenY);
      const composerBottom = composerLayoutRef.current
        ? composerLayoutRef.current.y + composerLayoutRef.current.height
        : null;
      const composerGapToKeyboard = composerBottom != null && eventScreenY != null
        ? eventScreenY - composerBottom
        : null;
      console.log('[CHAT_KEYBOARD_DEBUG][personal]', JSON.stringify({
        phase,
        platform: Platform.OS,
        apiLevel,
        keyboardVisible: keyboardVisibleRef.current,
        stateKeyboardHeight: keyboardHeightRef.current,
        eventHeight,
        eventScreenY,
        windowHeight: windowDims.height,
        windowWidth: windowDims.width,
        screenHeight: screenDims.height,
        screenWidth: screenDims.width,
        insetsTop: insets.top,
        insetsBottom: insets.bottom,
        keyboardAvoidingBehavior: Platform.OS === 'ios' ? 'padding' : 'undefined',
        adaptiveOffset,
        composerKeyboardOffset: composerKeyboardOffsetRef.current,
        composerKeyboardMargin: COMPOSER_KEYBOARD_MARGIN,
        composerBottom,
        composerGapToKeyboard,
        composerLayout: composerLayoutRef.current,
        ...(extra || {}),
      }));
    } catch (debugError) {
      console.warn('[CHAT_KEYBOARD_DEBUG][personal] log error', debugError);
    }
  };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e:any) => {
      const nextHeight = Number(e?.endCoordinates?.height || 0);
      const nextScreenY = e?.endCoordinates?.screenY ?? null;
      keyboardVisibleRef.current = true;
      keyboardHeightRef.current = nextHeight;
      keyboardScreenYRef.current = nextScreenY;
      setKeyboardVisible(true);
      setKeyboardHeight(nextHeight);
      setKeyboardScreenY(nextScreenY);
      // Önce sistemin adjustResize yapmasına izin ver. Gerekiyorsa layout ölçümünden
      // sonra sadece eksik kalan kadar manuel offset uygulayacağız.
      setComposerKeyboardOffset(0);
      logKeyboardDebug('keyboardDidShow', e, { nextKeyboardHeight: nextHeight, nextScreenY });
      // measure composer in window coordinates to get reliable comparison with keyboard screenY
      (async () => {
        const measured = await measureRefInWindow(composerRef);
        if (measured) {
          composerScreenLayoutRef.current = measured;
          logKeyboardDebug('composerMeasuredOnKeyboardShow', undefined, { measured });
        }
        requestAnimationFrame(() => applyAdaptiveComposerOffset('keyboardDidShow+raf', nextScreenY));
        setTimeout(() => applyAdaptiveComposerOffset('keyboardDidShow+80ms', nextScreenY), 80);
        setTimeout(() => applyAdaptiveComposerOffset('keyboardDidShow+180ms', nextScreenY), 180);
        setTimeout(() => applyAdaptiveComposerOffset('keyboardDidShow+350ms', nextScreenY), 350);
        setTimeout(() => applyAdaptiveComposerOffset('keyboardDidShow+700ms', nextScreenY), 700);
      })();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      logKeyboardDebug('keyboardDidHide');
      keyboardVisibleRef.current = false;
      keyboardHeightRef.current = 0;
      keyboardScreenYRef.current = null;
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      setKeyboardScreenY(null);
      setComposerKeyboardOffset(0);
    });
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
        const me = await getMe().catch(() => null);
        if (mounted && me) {
          const resolvedMeId = me.id ?? me.user_id ?? me.userId ?? null;
          if (resolvedMeId != null) setLocalUserId(resolvedMeId);
        } else if (mounted) {
          // getMe() başarısız (offline) → SecureStore cache'den yükle
          try {
            const cached = await SecureStore.getItemAsync('localUser');
            if (cached) {
              const u = JSON.parse(cached);
              const cachedId = u?.id ?? u?.user_id ?? null;
              if (cachedId != null) setLocalUserId(cachedId);
            }
          } catch { /* ignore */ }
        }
      } catch (e) { /* ignore user profile failures */ }

      const paramsAny = params as any;
      // if conversationId param is not a valid numeric id but a communityId was passed,
      // try to find an existing conversation for that community and redirect to it
      try {
        const convNum = Number(conversationId);
        if ((conversationId == null || Number.isNaN(convNum) || convNum <= 0) && paramsAny.communityId) {
          try {
            const listRes = await apiFetch(`${API_URL}/chat/conversations`);
            if (listRes && listRes.ok) {
              const listData = await listRes.json();
              if (Array.isArray(listData)) {
                const found = listData.find((c:any) => Number(c?.community_id) === Number(paramsAny.communityId) || (c?.community && Number(c.community?.id) === Number(paramsAny.communityId)));
                const convIdFound = found?.id ?? found?.conversation_id ?? found?.conversation?.id;
                if (convIdFound) {
                  try { await AsyncStorage.setItem(LAST_OPENED_KEY, String(convIdFound)); } catch (e) { /* ignore */ }
                  try { await openConversationOrCommunity(router, convIdFound, { replace: true }); } catch (e) { console.warn('[Chat] openConversationOrCommunity failed', e); }
                  return;
                }
                  // if conversationId is numeric, check if it's tied to a community and enforce membership
                  if (!Number.isNaN(convNum) && convNum > 0) {
                    try {
                      const listRes2 = await apiFetch(`${API_URL}/chat/conversations`);
                      if (listRes2 && listRes2.ok) {
                        const listData2 = await listRes2.json();
                        if (Array.isArray(listData2)) {
                          const foundConv = listData2.find((c:any) => Number(c?.id ?? c?.conversation_id ?? c?.conversation?.id) === convNum);
                          const convCommunityId = foundConv?.community_id ?? (foundConv?.community && foundConv.community.id) ?? null;
                            if (convCommunityId) {
                            const me = await getMe().catch(() => null);
                            if (!me || Number(me.community_id) !== Number(convCommunityId)) {
                              Alert.alert('Erişim reddedildi', 'Bu konuşmaya erişim izniniz yok.');
                              try { router.back(); } catch (e) { router.replace('/'); }
                              return;
                            }
                            // If this conversation belongs to a community, keep users in the community screen
                            try { await openConversationOrCommunity(router, convNum, { replace: true }); } catch (e) { console.warn('[Chat] openConversationOrCommunity failed', e); }
                            return;
                          }
                        }
                      }
                    } catch (e) { /* ignore */ }
                  }
              }
            }
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore parse errors */ }

      try {
        if (conversationId) {
          await AsyncStorage.setItem(LAST_OPENED_KEY, String(conversationId));
          try { emitChatEvent({ type: 'chat_viewed' }); } catch (e) { }
          // Ekran açıldığında bu konuşmanın offline unread'ini temizle (badge sıfırla)
          clearOfflineUnread(String(conversationId)).catch(() => {});
          emitChatEvent({ type: 'mark_read', payload: { convId: conversationId } });
        }
      } catch (e) { /* ignore store errors */ }

      if (conversationId) {
        try {
          const metaRes = await apiFetch(`${API_URL}/chat/conversations/${conversationId}`);
          if (metaRes && metaRes.ok) {
            const metaData = await metaRes.json();
            if (mounted) setConversationMeta(metaData);
          }
        } catch (e) { /* ignore conversation meta fetch failures */ }
      }

      // Önce önbellekten yükle — internet olmasa bile önceki yazışmalar hemen görünür
      if (conversationId) {
        try {
          const cachedRaw = await AsyncStorage.getItem(`@chat_msgs_v1_${conversationId}`);
          if (cachedRaw && mounted) {
            const cached: any[] = JSON.parse(cachedRaw);
            if (Array.isArray(cached) && cached.length > 0) {
              setMessages(cached);
              setLoading(false); // önbellek varsa spinner'ı hemen kapat
            }
          }
        } catch { /* ignore cache errors */ }
      }

      try {
        const res = await apiFetch(`${API_URL}/chat/conversations/${conversationId}/messages?limit=50`);
        const data = await res.json();
        if (!mounted) return;
        if (mounted) setIsOffline(false); // API erişilebilir
        // server may return reverse order; ensure chronological order for inverted FlatList
        const rawArr = Array.isArray(data) ? data : [];
        // Filter out any community-scoped messages when viewing a personal conversation
        // and ignore blank/empty messages created only to establish the conversation.
        const arr = rawArr.filter((m:any) => {
          try {
            const isCommunity = m?.community_id || (m?.community && (m.community.id || m.community.community_id)) || m?.communityId;
            if (isCommunity) return false;
            if (isEmptyMessage(m)) return false;
            return true;
          } catch (e) { return true; }
        });
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
                  const totalUnread = sumPersonalUnread(listData);
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
                  const totalUnread = sumPersonalUnread(listData);
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
        // API erişilemedi; önbellekten yüklendiyse banner göster
        if (mounted) setIsOffline(true);
      } finally {
        if (mounted) setLoading(false);
      }

      const socket = createChatSocket((msg:any) => {
        if (msg.type === 'auth' && msg.ok) {
          setLocalUserId(msg.userId);
        } else if (msg.type === 'message' && msg.payload) {
          try {
            const payload = msg.payload;
            // ignore community-scoped messages in personal conversation view
            const payloadCommunity = payload?.community_id ?? (payload?.community && (payload.community.id || payload.community.community_id)) ?? payload?.communityId ?? null;
            if (payloadCommunity) return;
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
                  if (isEmptyMessage(normalizedPayload)) return prev;
                  const pid = getMessageId(normalizedPayload);
                  if (pid != null) {
                    const pidStr = String(pid);
                    if (prev.some(m => String(getMessageId(m)) === pidStr)) return prev;
                    const filtered = prev.filter(m => String(getMessageId(m)) !== pidStr);
                    return [normalizedPayload, ...filtered];
                  }
                  return [normalizedPayload, ...prev];
                } catch (e) { /* ignore dedupe errors */ }
                const normalizedFallback = normalizeMessage(payload);
                return isEmptyMessage(normalizedFallback) ? prev : [normalizedFallback, ...prev];
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
            // ignore community-scoped deletes here
            const payloadCommunity = payload?.community_id ?? (payload?.community && (payload.community.id || payload.community.community_id)) ?? payload?.communityId ?? null;
            if (payloadCommunity) return;
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
                    const normalized = Array.isArray(data2) ? sortDesc(data2.map(normalizeMessage)).filter((m:any) => !(m?.community_id || (m?.community && (m.community.id || m.community.community_id)) || m?.communityId)) : [];
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
      try { showSub.remove(); } catch {}
      try { hideSub.remove(); } catch {}
    };
  }, [conversationId]);

  // ─── Offline SQLite kuyruğundan peer mesajlarını yükle ──────────────────────
  // Chat ekranı kapalıyken gelen peer mesajları SQLite'a kaydedilir.
  // Ekran açıldığında veya offline'a geçildiğinde bu mesajlar state'e eklenir.
  const mergeOfflineQueueMessages = React.useCallback(async () => {
    if (!conversationId) return;
    try {
      const { getLocalMessages: getOfflineLocalMsgs } = await import('@/lib/offlineChatQueue');
      const queueMsgs = await getOfflineLocalMsgs(String(conversationId));
      if (!queueMsgs.length) return;
      const normalized = queueMsgs.map((q: any) => ({
        id: q.id,
        text: q.text,
        sender_id: q.senderId,
        sender_name: q.senderName,
        created_at: new Date(q.timestamp).toISOString(),
        offline_peer: true,
      }));
      setMessages(prev => {
        const existingIds = new Set(
          prev.map((m: any) => { const mid = getMessageId(m); return mid != null ? String(mid) : null; }).filter(Boolean),
        );
        const newOnes = normalized.filter((m: any) => !existingIds.has(String(m.id)));
        if (!newOnes.length) return prev;
        return sortDesc([...prev, ...newOnes]);
      });
    } catch { /* ignore */ }
  }, [conversationId]);

  // İlk açılışta + offline geçişinde kuyruğu yükle
  useEffect(() => {
    mergeOfflineQueueMessages();
  }, [mergeOfflineQueueMessages]);

  useEffect(() => {
    if (!isConnected) {
      mergeOfflineQueueMessages();
    }
  }, [isConnected, mergeOfflineQueueMessages]);

  // ─── Global offline sync tamamlandı → sunucudan güncel mesajları çek ────────
  // _layout.tsx'teki global online recovery syncPendingToServer'ı çağırdıktan
  // sonra bu event'i emit eder. Chat ekranı açıksa sunucudan mesajları yeniler.
  useEffect(() => {
    if (!conversationId) return;
    const unsub = onChatEvent(async (e) => {
      if (e.type !== 'offline_sync_complete') return;
      try {
        const refreshRes = await apiFetch(`${API_URL}/chat/conversations/${conversationId}/messages?limit=50`);
        if (!refreshRes || !refreshRes.ok) return;
        const refreshData = await refreshRes.json();
        const rawArr = Array.isArray(refreshData) ? refreshData : [];
        const filtered = rawArr.filter((m: any) => {
          try {
            const isCommunity = m?.community_id || (m?.community && (m.community.id || m.community.community_id)) || m?.communityId;
            if (isCommunity) return false;
            if (isEmptyMessage(m)) return false;
            return true;
          } catch { return true; }
        }).filter((m: any) => !isDeleteControlMessage(m)).map(normalizeMessage);
        setMessages(prev => {
          const serverIds = new Set(
            filtered.map((m: any) => { const mid = getMessageId(m); return mid != null ? String(mid) : null; }).filter(Boolean),
          );
          // Sunucuda olmayan yerel mesajları (peer veya hâlâ bekleyen) koru
          const localOnly = prev.filter((m: any) => {
            const mid = getMessageId(m);
            const midStr = mid != null ? String(mid) : null;
            if (!midStr || midStr.startsWith('tmp-')) return false;
            return !serverIds.has(midStr);
          });
          return sortDesc([...filtered, ...localOnly]);
        });
      } catch { /* yenileme başarısız olsa mevcut listeyi koru */ }
    });
    return unsub;
  }, [conversationId]);

  // ─── Çevrimdışı transport entegrasyonu ───────────────────────────────────────
  // İnternet yoksa transport başlatılır; bu konuşmaya gelen peer mesajları dinlenir.
  useEffect(() => {
    if (!conversationId) return;
    let unsubMsg: (() => void) | null = null;

    (async () => {
      try {
        // Transport sadece offline modda başlatılır
        if (!isConnected && !offlineTransportManager.isActive) {
          let uid = '';
          let uname = '';
          // Önce SecureStore cache'den oku — offline olunca getMe ağ çağrısı yapamaz
          try {
            const cached = await SecureStore.getItemAsync('localUser');
            if (cached) {
              const u = JSON.parse(cached);
              uid   = String(u?.id ?? u?.user_id ?? '');
              uname = String(u?.name ?? u?.username ?? u?.full_name ?? '');
            }
          } catch { /* ignore */ }
          // Cache yoksa API'dan dene (online mod)
          if (!uid) {
            const me = await getMe().catch(() => null);
            if (me) {
              uid   = String(me?.id ?? me?.user_id ?? '');
              uname = String(me?.name ?? me?.username ?? me?.full_name ?? '');
            }
          }
          if (uid) await offlineTransportManager.start(uid, uname);
        }

        // Bu konuşmaya gelen peer mesajlarını dinle
        unsubMsg = offlineTransportManager.onMessage((msg) => {
          if (String(msg.conversationId) !== String(conversationId)) return;
          const peerMsg = {
            id:         msg.id,
            text:       msg.text,
            sender_id:  msg.senderId,
            sender_name: msg.senderName,
            created_at: new Date(msg.timestamp).toISOString(),
          };
          setMessages(prev => {
            if (prev.some(m => String(getMessageId(m)) === String(msg.id))) return prev;
            return [peerMsg, ...prev];
          });
        });
      } catch (e) {
        console.warn('[Chat] offline transport init hatası:', e);
      }
    })();

    return () => { unsubMsg?.(); };
  }, [isConnected, conversationId]);

  // ─── Online/Offline geçiş yönetimi ──────────────────────────────────────────
  // isConnected her değiştiğinde isOffline banner'ını günceller.
  // false→true (online'a dönüş) durumunda: socket yeniden bağlanır,
  // SQLite kuyruğundaki mesajlar sunucuya iletilir, offline transport durdurulur.
  useEffect(() => {
    setIsOffline(!isConnected);

    // İlk render'da geçiş analizi yapma
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      return;
    }
    const wasOffline = !prevConnectedRef.current;
    prevConnectedRef.current = isConnected;

    if (!isConnected || !wasOffline) return;

    // ─── Offline → Online ───
    (async () => {
      try {
        // 0. localUserId null ise (offline başlatılmış ekran) SecureStore/API'dan al
        let effectiveUserId: string | null = localUserId != null ? String(localUserId) : null;
        if (!effectiveUserId) {
          try {
            const cached = await SecureStore.getItemAsync('localUser');
            if (cached) {
              const u = JSON.parse(cached);
              effectiveUserId = String(u?.id ?? u?.user_id ?? '') || null;
              if (effectiveUserId) setLocalUserId(effectiveUserId);
            }
          } catch { /* ignore */ }
        }
        if (!effectiveUserId) {
          const me = await getMe().catch(() => null);
          if (me) {
            effectiveUserId = String(me?.id ?? me?.user_id ?? '') || null;
            if (effectiveUserId) setLocalUserId(effectiveUserId);
          }
        }

        // 1. Token'ı yenile ve socket'i yeniden bağla
        tokenRef.current = await getToken();
        try { socketRef.current?.connect(tokenRef.current || ''); } catch {}

        // 2. Offline mesaj sync'i _layout.tsx global recovery'si üstlenir.
        //    offline_sync_complete eventi gelince UI zaten sunucudan yenilenir.
        //    Burada tekrar POST etmek race condition'a (çifte kayıt) yol açar.

        // 3. Sunucudan güncel mesajları çek ve doğru sırayla göster
        try {
          const refreshRes = await apiFetch(`${API_URL}/chat/conversations/${conversationId}/messages?limit=50`);
          if (refreshRes && refreshRes.ok) {
            const refreshData = await refreshRes.json();
            const rawRefresh = Array.isArray(refreshData) ? refreshData : [];
            const filteredRefresh = rawRefresh.filter((m: any) => {
              try {
                const isCommunity = m?.community_id || (m?.community && (m.community.id || m.community.community_id)) || m?.communityId;
                if (isCommunity) return false;
                if (isEmptyMessage(m)) return false;
                return true;
              } catch { return true; }
            });
            const normalizedRefresh = filteredRefresh
              .filter((m: any) => !isDeleteControlMessage(m))
              .map(normalizeMessage);
            // Sunucu mesajlarını mevcut state ile birleştir:
            // Sunucuda olmayan peer (karşı taraf) mesajları korunur; tmp- geçici mesajlar atılır.
            setMessages(prev => {
              // offline_id → yerel mesaj haritası: sunucu offline_id döndürüyorsa
              // UUID mesajını server mesajıyla eşleştirmek için kullanılır.
              const localByOfflineId = new Map<string, any>();
              for (const m of prev) {
                const mid = getMessageId(m);
                if (mid != null && !String(mid).startsWith('tmp-')) {
                  localByOfflineId.set(String(mid), m);
                }
              }

              // Sunucu mesajlarına orijinal metni/timestamp'i yamala:
              // Sunucu offline_id döndürdüyse ilgili yerel mesajın metnini koru.
              const patchedRefresh = normalizedRefresh.map((sm: any) => {
                const offlineId =
                  sm?.offline_id ??
                  sm?.meta?.offline_id ??
                  sm?.metadata?.offline_id ??
                  null;
                const localMatch = offlineId ? localByOfflineId.get(String(offlineId)) : null;
                if (!localMatch) return sm;

                const serverText: string = sm?.text ?? sm?.body ?? '';
                const localText: string = localMatch?.text ?? localMatch?.body ?? '';
                const localClientSentAt: string | undefined =
                  localMatch?.meta?.client_sent_at ?? undefined;

                return {
                  ...sm,
                  // Sunucu metni yerel metinden kısaysa (kısaltma) yereli koru
                  text: serverText.length >= localText.length ? serverText : localText,
                  meta: {
                    ...(sm.meta ?? {}),
                    client_sent_at:
                      sm.meta?.client_sent_at ??
                      localClientSentAt ??
                      undefined,
                  },
                };
              });

              const serverIds = new Set(
                patchedRefresh
                  .map((m: any) => { const mid = getMessageId(m); return mid != null ? String(mid) : null; })
                  .filter(Boolean),
              );
              // Sunucunun offline_id olarak tanıdığı yerel UUID mesajlarını filtrele
              const serverOfflineIds = new Set(
                patchedRefresh
                  .map((m: any) => {
                    const oid = m?.offline_id ?? m?.meta?.offline_id ?? m?.metadata?.offline_id ?? null;
                    return oid != null ? String(oid) : null;
                  })
                  .filter(Boolean),
              );
              // Sunucuda bulunmayan ve geçici (tmp-) olmayan yerel mesajları koru
              const localOnly = prev.filter((m: any) => {
                const mid = getMessageId(m);
                const midStr = mid != null ? String(mid) : null;
                if (!midStr || midStr.startsWith('tmp-')) return false;
                // Sunucunun offline_id olarak tanımladığı mesajı koru (artık server id var)
                if (serverOfflineIds.has(midStr)) return false;
                return !serverIds.has(midStr);
              });
              return sortDesc([...patchedRefresh, ...localOnly]);
            });
          }
        } catch { /* yenileme başarısız olsa mevcut listeyi koru */ }
      } catch (e) {
        console.warn('[Chat] online recovery hatası:', e);
      }
    })();
  }, [isConnected, conversationId]);

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

  // Mesajlar her güncellendiğinde AsyncStorage'a kaydet (offline cache)
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const toSave = messages.slice(0, 100); // en fazla 100 mesaj sakla
    AsyncStorage.setItem(`@chat_msgs_v1_${conversationId}`, JSON.stringify(toSave)).catch(() => {});
  }, [messages, conversationId]);

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

    let recipientIdFromMeta = getConversationRecipientId(conversationMeta, localUserId);
    if (payload.conversation_id && recipientIdFromMeta == null && !conversationMeta) {
      try {
        const metaRes = await apiFetch(`${API_URL}/chat/conversations/${payload.conversation_id}`);
        if (metaRes && metaRes.ok) {
          const metaJson = await metaRes.json();
          setConversationMeta(metaJson);
          recipientIdFromMeta = getConversationRecipientId(metaJson, localUserId);
        }
      } catch (e) {
        console.warn('[Chat] failed to refresh conversationMeta before send', e);
      }
    }
    if (payload.conversation_id && recipientIdFromMeta != null) {
      payload.recipient_id = Number(recipientIdFromMeta);
    }
    let inferredRecipient: any = null;
    if (payload.conversation_id && payload.recipient_id == null) {
      inferredRecipient = inferRecipientIdFromMessages(messages, localUserId);
      if (inferredRecipient != null) {
        payload.recipient_id = Number(inferredRecipient);
      }
    }
    if (payload.conversation_id && payload.recipient_id == null) {
      // API artık conversation_id olabilir; logu hata değil bilgi olarak bırak.
      console.info('[Chat] send payload has conversation_id only, no recipient_id determined yet', { conversationId: payload.conversation_id, conversationMeta, recipientIdFromMeta, inferredRecipient });
    }
    const optimistic = { id: tempId, text, sender_id: localUserId ?? 'me', created_at: new Date().toISOString(), sending: true, conversation_id: payload.conversation_id, recipient_id: payload.recipient_id };
    setMessages(prev => [optimistic, ...prev]);
    setText('');
    try {
      console.log('[Chat] send payload', payload, { recipientIdFromMeta, conversationMeta, inferredRecipient });
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
      if (isEmptyMessage(normalizedSaved)) {
        setMessages(prev => prev.filter(m => String(getMessageId(m)) !== String(tempId)));
      } else {
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
      }
      // Eğer sunucu yeni bir conversation id döndürdüyse, canonical route'a yönlendir
        try {
        const returnedConvId = saved?.conversation_id ?? saved?.conversation?.id ?? null;
        if (returnedConvId && String(returnedConvId) !== String(conversationId)) {
          try { await AsyncStorage.setItem(LAST_OPENED_KEY, String(returnedConvId)); } catch (e) { /* ignore */ }
          try { await openConversationOrCommunity(router, returnedConvId, { replace: true }); } catch (e) { console.warn('[Chat] openConversationOrCommunity failed', e); }
          return;
        }
      } catch (e) { /* ignore redirect errors */ }
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
                const totalUnread2 = sumPersonalUnread(listData2);
                try { emitChatEvent({ type: 'unread_updated', payload: { total: totalUnread2 } }); } catch (e) {}
              }
            }
          } catch (e) { console.warn('[Chat] emit unread update after send failed', e); }
      } catch (e) { /* ignore */ }
    } catch (e) {
      // Çevrimdışı fallback: mesajı kuyruğa kaydet, transport aktifse iletin
      let savedOffline = false;
      try {
        let queueId: string;
        if (offlineTransportManager.isActive) {
          // Transport mesajı kuyruğa alır ve peer'lara iletir; ayrıca enqueueMessage çağırma
          queueId = await offlineTransportManager.sendMessage(String(conversationId), text, payload.recipient_id);
        } else {
          const { enqueueMessage } = await import('@/lib/offlineChatQueue');
          queueId = await enqueueMessage({
            conversationId: String(conversationId),
            senderId: String(localUserId ?? ''),
            senderName: '',
            recipientId: payload.recipient_id ?? null,
            text,
            timestamp: Date.now(),
          });
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === tempId
              ? { ...m, id: queueId, sending: false, offline_queued: true, created_at: new Date().toISOString() }
              : m,
          ),
        );
        savedOffline = true;
      } catch { /* ignore */ }
      if (!savedOffline) {
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, failed: true } : m)));
        console.warn('[Chat] send error', e);
      }
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
  // composerKeyboardOffset state'i runtime layout ölçümüne göre yukarıdaki helper'lar tarafından güncellenir.

  if (loading) return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <SafeAreaView style={{flex:1, backgroundColor: colors.background, justifyContent:'center', alignItems:'center'}}>
        <ActivityIndicator />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );

  return (
    <KeyboardAvoidingView style={{flex:1, backgroundColor: colors.background}} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <SafeAreaView edges={keyboardVisible ? ['left','right'] : ['left','right','bottom']} style={themed.screenContainer}>
        <View style={{...themed.screenHeader, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
          <View>
            <Text style={themed.screenHeaderTitle}>Sohbet</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/new')} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <View style={{ alignItems: 'center' }}>
              <ThemedIcon name="Menu" size="md" context="primary" style={{ marginBottom: 2 }} />
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Menü</Text>
            </View>
          </TouchableOpacity>
        </View>

        {isOffline && (
          <View style={{ backgroundColor: '#f59e0b', paddingVertical: 8, paddingHorizontal: 12 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500', textAlign: 'center', marginBottom: 6 }}>
              Çevrimdışı — önceki yazışmalar gösteriliyor
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
              {!hasWifiPeers && (
                <TouchableOpacity
                  onPress={() => router.push('/guide-wifi' as any)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📶 WiFi Rehberi</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {isOffline && (
          <NearbyPeersBar
            visible={true}
            onStatusChange={(wifi) => { setHasWifiPeers(wifi); }}
          />
        )}

        <FlatList
          ref={listRef}
          data={messages.filter((m:any) => !isEmptyMessage(m))}
          inverted
          style={{flex:1, backgroundColor: colors.background}}
          contentContainerStyle={{ paddingTop: 18 + insets.bottom, paddingBottom: keyboardVisible ? 18 : 18 + insets.bottom }}
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
            <MessageBubble
              message={item}
              isMe={String(item.sender_id) === String(localUserId) || String(item.sender_id) === 'me'}
              onDelete={handleDelete}
              senderName={getSenderInfo(item).name}
              senderAvatarUrl={getSenderInfo(item).avatar_url}
            />
          )}
        />

        <View
          ref={composerRef}
          onLayout={(event) => {
            composerLayoutRef.current = event.nativeEvent.layout;
            logKeyboardDebug('composerLayout', undefined, { layout: event.nativeEvent.layout, composerKeyboardOffset });
            (async () => {
              try {
                const measured = await measureRefInWindow(composerRef);
                if (measured) {
                  composerScreenLayoutRef.current = measured;
                  logKeyboardDebug('composerLayoutMeasured', undefined, { measured });
                }
              } catch (e) {}
              applyAdaptiveComposerOffset('composerLayout');
            })();
          }}
          style={{flexDirection:'row', paddingHorizontal:8, paddingVertical:8, paddingBottom: keyboardVisible ? 8 : 8 + insets.bottom, marginBottom: composerKeyboardOffset, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border}}
        >
          <TextInput
            style={{flex:1, borderWidth:1, borderColor:colors.border, borderRadius:8, padding:8, backgroundColor: colors.background, color: colors.text}}
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            placeholder="Mesaj yazın..."
            returnKeyType="send"
            onSubmitEditing={handleSend}
            onFocus={() => {
              setTimeout(() => applyAdaptiveComposerOffset('inputFocus+120ms'), 120);
              setTimeout(() => applyAdaptiveComposerOffset('inputFocus+300ms'), 300);
            }}
          />
          <TouchableOpacity onPress={handleSend} style={{marginLeft:8, alignSelf:'center', paddingHorizontal:12, paddingVertical:8, backgroundColor:colors.primary, borderRadius:8}}>
            <Text style={{color:'#fff'}}>Gönder</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
