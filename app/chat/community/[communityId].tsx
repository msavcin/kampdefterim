import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, TextInput, Text, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity, Alert, Keyboard, Dimensions, findNodeHandle, UIManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { getToken } from '@/lib/auth';
import * as SecureStore from 'expo-secure-store';
import { createChatSocket } from '@/lib/chatSocket';
import MessageBubble from '@/components/MessageBubble';
import NearbyPeersBar from '@/components/NearbyPeersBar';
import ThemedIcon from '@/components/ThemedIcon';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import { createThemedStyles } from '@/constants/theme/sharedStyles';
import { emitChatEvent } from '@/lib/chatEvents';
import { markRead } from '@/lib/readMap';
import { getMe } from '@/lib/userCommunityApi';
import { offlineTransportManager } from '@/lib/offlineTransport';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const DELETED_KEY = '@chat_deleted_v1';
const LAST_OPENED_KEY = '@chat_last_opened_v1';

const getMsgTime = (m:any) => {
  // Öncelik: meta.client_sent_at (offline sync'te kaydedilen gerçek gönderme zamanı)
  // → timestamp (offline queue unix ms) → created_at / sent_at (sunucu zamanı)
  const meta = m?.meta;
  if (meta?.client_sent_at) {
    try { const v = Date.parse(String(meta.client_sent_at)); if (v > 0) return v; } catch { /* fall through */ }
  }
  const t = m?.timestamp ?? m?.created_at ?? m?.createdAt ?? m?.sent_at;
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
      console.log('[CHAT_KEYBOARD_DEBUG][community]', JSON.stringify({
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
      console.warn('[CHAT_KEYBOARD_DEBUG][community] log error', debugError);
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

  // Mesajları offline cache'e kaydet
  useEffect(() => {
    if (!communityId || messages.length === 0) return;
    AsyncStorage.setItem(`@chat_msgs_v1_community_${communityId}`, JSON.stringify(messages.slice(0, 100))).catch(() => {});
  }, [messages, communityId]);

  // ─── Offline SQLite kuyruğundan peer mesajlarını yükle ──────────────────────
  const mergeOfflineQueueMessages = useCallback(async () => {
    if (!communityId) return;
    try {
      const { getLocalMessages: getOfflineLocalMsgs } = await import('@/lib/offlineChatQueue');
      const cacheKey = `community_${communityId}`;
      // Hem community_ önekli hem de communityId ile kaydedilmiş mesajları çek
      const [q1, q2] = await Promise.all([
        getOfflineLocalMsgs(cacheKey),
        getOfflineLocalMsgs(String(communityId)),
      ]);
      const queueMsgs = [...q1, ...q2];
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
  }, [communityId]);

  useEffect(() => {
    mergeOfflineQueueMessages();
  }, [mergeOfflineQueueMessages]);

  useEffect(() => {
    if (!isConnected) {
      mergeOfflineQueueMessages();
    }
  }, [isConnected, mergeOfflineQueueMessages]);

  // ─── Çevrimdışı transport entegrasyonu ─────────────────────────────────
  useEffect(() => {
    if (!communityId) return;
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
        const cacheKey = `community_${communityId}`;
        unsubMsg = offlineTransportManager.onMessage((msg) => {
          if (String(msg.conversationId) !== String(cacheKey) && String(msg.conversationId) !== String(communityId)) return;
          const peerMsg = {
            id:          msg.id,
            text:        msg.text,
            sender_id:   msg.senderId,
            sender_name: msg.senderName,
            created_at:  new Date(msg.timestamp).toISOString(),
          };
          setMessages(prev => {
            if (prev.some(m => String(getMessageId(m)) === String(msg.id))) return prev;
            return [peerMsg, ...prev];
          });
        });
      } catch (e) {
        console.warn('[CommunityChat] offline transport init hatası:', e);
      }
    })();
    return () => { unsubMsg?.(); };
  }, [isConnected, communityId]);

  // ─── Online/Offline geçiş yönetimi ────────────────────────────────
  useEffect(() => {
    setIsOffline(!isConnected);
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      return;
    }
    const wasOffline = !prevConnectedRef.current;
    prevConnectedRef.current = isConnected;
    if (!isConnected || !wasOffline) return;

    // Offline → Online geçişi
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

        tokenRef.current = await getToken();
        try { socketRef.current?.connect(tokenRef.current || ''); } catch {}

        const { getPendingMessages, markMessageSynced } = await import('@/lib/offlineChatQueue');
        const pending = await getPendingMessages();
        for (const qMsg of pending) {
          if (String(qMsg.conversationId) !== `community_${communityId}`) continue;
          // Yalnızca kendi yazdığımız mesajları gönder — peer'dan gelen mesajları
          // mevcut token ile POST etmek hepsini aynı kullanıcıya atfeder.
          if (qMsg.senderId && effectiveUserId && String(qMsg.senderId) !== String(effectiveUserId)) {
            await markMessageSynced(qMsg.id);
            continue;
          }
          try {
            const res = await apiFetch(`${API_URL}/chat/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ community_id: Number(communityId), text: qMsg.text }),
            });
            if (res && res.ok) {
              await markMessageSynced(qMsg.id);
              try {
                const serverMsg = await res.json();
                if (serverMsg) {
                  setMessages(prev => prev.map(m => String(getMessageId(m)) === String(qMsg.id) ? serverMsg : m));
                }
              } catch { /* ignore */ }
            }
          } catch { /* bu mesajı atla */ }
        }
        try { await offlineTransportManager.stop(); } catch {}

        // Sunucudan güncel mesajları çek ve doğru sırayla göster
        try {
          const currentConvId = convIdRef.current;
          if (currentConvId) {
            const refreshRes = await apiFetch(`${API_URL}/chat/conversations/${currentConvId}/messages?limit=50`);
            if (refreshRes && refreshRes.ok) {
              const refreshData = await refreshRes.json();
              const arr = Array.isArray(refreshData) ? refreshData.map(normalizeMessage) : [];
              setMessages(sortDesc(arr));
            }
          } else {
            const refreshRes = await apiFetch(`${API_URL}/chat/messages?community_id=${communityId}&limit=50`);
            if (refreshRes && refreshRes.ok) {
              const refreshData = await refreshRes.json();
              const arr = Array.isArray(refreshData) ? refreshData.map(normalizeMessage) : [];
              setMessages(sortDesc(arr));
            }
          }
        } catch { /* yenileme başarısız olsa mevcut listeyi koru */ }
      } catch (e) {
        console.warn('[CommunityChat] online recovery hatası:', e);
      }
    })();
  }, [isConnected, communityId]);

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
      // Çevrimdışı fallback: mesajı kuyruğa kaydet
      let savedOffline = false;
      try {
        let queueId: string;
        if (offlineTransportManager.isActive) {
          // Transport mesajı kuyruğa alır ve peer'lara iletir; ayrıca enqueueMessage çağırma
          queueId = await offlineTransportManager.sendMessage(`community_${communityId}`, text);
        } else {
          const { enqueueMessage } = await import('@/lib/offlineChatQueue');
          queueId = await enqueueMessage({
            conversationId: `community_${communityId}`,
            senderId: String(localUserId ?? ''),
            senderName: '',
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
        console.warn('[CommunityChat] send error', e);
        Alert.alert('Hata', 'Mesaj gönderilemedi.');
      }
    }
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
    <KeyboardAvoidingView style={{ flex:1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
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

        {isOffline && (
          <View style={{ backgroundColor: '#f59e0b', paddingVertical: 8, paddingHorizontal: 12 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500', textAlign: 'center', marginBottom: 6 }}>
              Çevrimdışı — önceki yazışmalar gösteriliyor
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
              {!hasWifiPeers && (
                <TouchableOpacity
                  onPress={() => router.push('/guide-wifi' as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}
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
