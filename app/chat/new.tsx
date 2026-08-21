import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';
import { openConversationOrCommunity } from '@/lib/chatNavigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listCommunities, getMe, listCommunityMembers } from '@/lib/userCommunityApi';
import { createChatSocket } from '@/lib/chatSocket';
import { getToken } from '@/lib/auth';
import { offlineTransportManager } from '@/lib/offlineTransport';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import NearbyPeersBar from '@/components/NearbyPeersBar';
import FriendAvatar from '@/components/FriendAvatar';
import ThemedIcon from '@/components/ThemedIcon';
import { useTheme } from '@/components/ThemeProvider';
import { createThemedStyles } from '../../constants/theme/sharedStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
const LAST_OPENED_KEY = '@chat_last_opened_v1';
import { emitChatEvent, onChatEvent } from '@/lib/chatEvents';
import { markRead } from '@/lib/readMap';
import { getOfflineUnreadMap, clearOfflineUnread } from '@/lib/offlineUnread';

const DELETED_KEY = '@chat_deleted_v1';
const FRIENDS_CACHE_KEY = '@chat_friends_cache_v1';
const CONVERSATIONS_CACHE_KEY = '@conversations_cache_v1';
import { loadFriendConvMap, saveFriendConvLink } from '@/lib/chatFriendConvMap';

function conversationIdOf(c: any) {
  return c?.id ?? c?.conversation_id ?? c?.conversation?.id ?? null;
}

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

function getFriendConversation(friend:any, convIndex:any, conversations:any[], friendConvMap?: Record<string, any>) {
  const idCandidate = friend.id ?? friend.user_id ?? friend.recipient_id ?? (typeof friend.tag === 'string' ? (friend.tag.startsWith('#') ? Number(friend.tag.replace('#','')) : friend.tag) : undefined);
  if (friendConvMap && idCandidate != null) {
    const mappedId = friendConvMap[String(idCandidate)] ?? friendConvMap[String(friend.username ?? '')];
    if (mappedId) {
      const mappedConv = Array.isArray(conversations)
        ? conversations.find((c: any) => String(c?.id ?? c?.conversation_id ?? c?.conversation?.id) === String(mappedId))
        : null;
      if (mappedConv && !isCommunityConversationObj(mappedConv)) return mappedConv;
      return { id: mappedId, recipient_id: idCandidate, other_user_id: idCandidate };
    }
  }
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
  isConnected, // passed from parent
  friendConvMap,
}: any) => {
  const convMemo = useMemo(() => getFriendConversation(item, convIndex, conversations, friendConvMap), [item, convIndex, conversations, friendConvMap]);
  const conv = convProp ?? convMemo;
  const [isWifiNearby, setIsWifiNearby] = useState<boolean>(() => {
    try {
      const peers = offlineTransportManager.peers || [];
      return peers.some((p: any) => String(p?.userId) === String(item?.id));
    } catch (e) { return false; }
  });

  useEffect(() => {
    const sync = (peers: any[]) => {
      try {
        const found = Array.isArray(peers) && peers.some((p: any) => String(p?.userId) === String(item?.id));
        setIsWifiNearby(Boolean(found));
      } catch (e) { setIsWifiNearby(false); }
    };
    sync(offlineTransportManager.peers || []);
    const unsub = offlineTransportManager.onPeersChanged(sync);
    return () => { try { unsub(); } catch {} };
  }, [item?.id]);

  const networkStatusFromHook = useNetworkStatus();
  const effectiveIsConnected = typeof isConnected !== 'undefined' ? isConnected : networkStatusFromHook;
  const disabled = !effectiveIsConnected && !isWifiNearby;

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
          <TouchableOpacity
            onPress={() => { if (disabled) { Alert.alert('Çevrimdışı', 'Bu kullanıcı hotspot ile bulunana kadar mesaj gönderilemez.'); return; } onContinue(conv); }}
            disabled={disabled}
            style={{backgroundColor: disabled ? colors.surfaceVariant : colors.primary, paddingVertical:8, paddingHorizontal:12, borderRadius:8, opacity: disabled ? 0.6 : 1}}
          >
            <Text style={{color: disabled ? colors.muted : '#fff'}}>Sohbete Devam Et</Text>
          </TouchableOpacity>
          {showUnread && (
            <View style={{position:'absolute', top:-5, right:4, width:10, height:10, borderRadius:6, backgroundColor:colors.danger}} />
          )}
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => { if (disabled) { Alert.alert('Çevrimdışı', 'Bu kullanıcı hotspot ile bulunana kadar mesaj gönderilemez.'); return; } onStart(item); }}
          disabled={disabled}
          style={{backgroundColor: disabled ? colors.surfaceVariant : colors.primary, paddingVertical:8,paddingHorizontal:12, borderRadius:8, opacity: disabled ? 0.6 : 1}}
        >
          <Text style={{color: disabled ? colors.muted : '#fff'}}>Mesaj Başlat</Text>
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
  disabled = false,
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
      <View pointerEvents={disabled ? 'none' : 'auto'} style={{ marginLeft: 8 }}>
        <TouchableOpacity
          accessibilityState={{ disabled }}
          onPress={disabled ? undefined : () => onStart(item)}
          activeOpacity={disabled ? 1 : 0.85}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: disabled ? colors.surfaceVariant : colors.primary,
            opacity: disabled ? 0.65 : 1,
            minWidth: 96,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: disabled ? colors.muted : '#fff', fontWeight: '600' }}>{label}</Text>
        </TouchableOpacity>
      </View>
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

  const isConnected = useNetworkStatus();

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
  const [persistedFriendConvMap, setPersistedFriendConvMap] = useState<Record<string, string>>({});
  const lastRefreshTimeRef = useRef<number>(0);
  const REFRESH_THROTTLE_MS = 2000; // 2 saniye içinde tekrar yenileme yapma

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
  const [offlineUnreadMap, setOfflineUnreadMap] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [localUserId, setLocalUserId] = useState<number | string | null>(null);
  const [communityMemberIdsMap, setCommunityMemberIdsMap] = useState<Record<string, string[]>>({});
  const [communityHasPeerMap, setCommunityHasPeerMap] = useState<Record<string, boolean>>({});

  const refreshConversations = useCallback(async () => {
    try {
      const convRes = await apiFetch(`${API_URL}/chat/conversations`);
      if (!convRes.ok) {
        // API başarısız: önceki state'i koru, sıfırlama!
        // Cache'den yüklemeyi dene
        try {
          const cached = await AsyncStorage.getItem(CONVERSATIONS_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Cache varsa onu kullan, yoksa mevcut state'i koru
              setConversations(parsed);
              const byId = new Map<string, any>();
              parsed.forEach((c: any) => {
                try {
                  extractParticipantIds(c).forEach((pid: any) => {
                    if (pid != null) byId.set(String(pid), c);
                  });
                } catch { /* ignore */ }
              });
              setConvIndex({ byId, byUsername: new Map() });
            }
          }
        } catch { /* cache yükleme başarısız, mevcut state'i koru */ }
        return; // Önceki state korundu
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
      // Konuşmaları offline kullanım için önbellekle
      try { await AsyncStorage.setItem(CONVERSATIONS_CACHE_KEY, JSON.stringify(arrWithRead)); } catch { /* ignore */ }
    } catch (e) {
      console.warn('[NewChat] refresh conversations error', e);
      // Offline veya hata durumu: önbellekten yükle, yoksa mevcut state'i koru
      try {
        const cached = await AsyncStorage.getItem(CONVERSATIONS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setConversations(parsed);
            const byId = new Map<string, any>();
            parsed.forEach((c: any) => {
              try {
                extractParticipantIds(c).forEach((pid: any) => {
                  if (pid != null) byId.set(String(pid), c);
                });
              } catch { /* ignore */ }
            });
            setConvIndex({ byId, byUsername: new Map() });
            return;
          }
        }
      } catch { /* cache yükleme başarısız */ }
      // Cache de yoksa: önceki state'i koru, sıfırlama!
      // setConversations([]) kaldırıldı - state korunuyor
    }
  }, []);

  const applyFriendsCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(FRIENDS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setFriends(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  const loadFriends = useCallback(async () => {
    if (!isConnected) {
      await applyFriendsCache();
      return;
    }
    try {
      const res = await apiFetch(`${API_URL}/friendships/list`);
      if (!res.ok) {
        await applyFriendsCache();
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        await applyFriendsCache();
        return;
      }
      const mapped = data.map((f:any) => {
        const idFromTag = typeof f.tag === 'string' && f.tag.startsWith('#') ? Number(f.tag.replace('#','')) : undefined;
        const idCandidate = f.user_id ?? f.id ?? idFromTag;
        const resolvedId = typeof idCandidate !== 'undefined' && idCandidate !== null ? Number(idCandidate) : undefined;
        return { id: resolvedId, username: f.username, name: f.name || '', avatar_url: f.avatar_url || '' };
      });
      setFriends(mapped);
      try { await AsyncStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(mapped)); } catch { /* ignore */ }
    } catch {
      await applyFriendsCache();
    }
  }, [isConnected, applyFriendsCache]);

  useFocusEffect(
    useCallback(() => {
      // Throttle: Son yenilemeden beri çok az zaman geçtiyse atla
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
      
      if (timeSinceLastRefresh < REFRESH_THROTTLE_MS) {
        console.log('[NewChat] Focus throttled, skipping refresh (last refresh:', timeSinceLastRefresh, 'ms ago)');
        // Sadece offline unread map'i güncelle
        getOfflineUnreadMap().then(setOfflineUnreadMap).catch(() => {});
        return;
      }
      
      lastRefreshTimeRef.current = now;
      refreshConversations();
      loadFriends();
      getOfflineUnreadMap().then(setOfflineUnreadMap).catch(() => {});
    }, [refreshConversations, loadFriends])
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
        } catch (err) {
              return prev;
            }
          });
          return;
        }
        if (['message','conversation_created','client_message_sent','conversation_updated','message_deleted'].includes(e?.type)) {
          refreshConversations();
          // Offline peer mesajı ise kırmızı nokta haritasını da güncelle
          if (e?.payload?.offline_peer) {
            getOfflineUnreadMap().then(setOfflineUnreadMap).catch(() => {});
          }
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
            const conv = getFriendConversation(f, convIndex, conversations, persistedFriendConvMap);
            if (conv) map[key] = conv;
          } catch (e) { /* ignore per-friend errors */ }
        }
        setFriendConvMap(map);
      } else {
        setFriendConvMap({});
      }
    } catch (e) { setFriendConvMap({}); }
  }, [friends, conversations, convIndex, persistedFriendConvMap]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
      let mapped: any[] = [];
      // Önce cache — hotspot'ta API asılı kalmasın, liste hemen açılsın
      try {
        const cached = await AsyncStorage.getItem(FRIENDS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && mounted) {
            mapped = parsed;
            setFriends(parsed);
          }
        }
      } catch { /* ignore */ }
      try {
        const cachedConv = await AsyncStorage.getItem(CONVERSATIONS_CACHE_KEY);
        const parsed = cachedConv ? JSON.parse(cachedConv) : [];
        let list = Array.isArray(parsed) ? parsed : [];
        const friendMap = await loadFriendConvMap();
        if (mounted) setPersistedFriendConvMap(friendMap);
        try {
          const { listOfflineConversationHints } = await import('@/lib/offlineChatQueue');
          const hints = await listOfflineConversationHints();
          const extras = hints.map((h) => ({
            id: h.conversationId,
            recipient_id: h.recipientId,
            other_user_id: h.recipientId,
            updated_at: h.timestamp,
          }));
          for (const [fid, cid] of Object.entries(friendMap)) {
            extras.push({ id: cid, recipient_id: fid, other_user_id: fid, updated_at: Date.now() });
          }
          const seen = new Set(list.map((c: any) => String(c?.id ?? c?.conversation_id ?? c?.conversation?.id ?? '')).filter(Boolean));
          for (const c of extras) {
            if (!c.id || seen.has(String(c.id))) continue;
            seen.add(String(c.id));
            list.push(c);
          }
        } catch { /* ignore offline hints */ }
        if (mounted && list.length > 0) {
          setConversations(list);
          const byId = new Map<string, any>();
          const byUsername = new Map<string, any>();
          list.forEach((c: any) => {
            try {
              extractParticipantIds(c).forEach((pid: any) => { if (pid != null) byId.set(String(pid), c); });
              if (c?.recipient_id != null) byId.set(String(c.recipient_id), c);
              if (c?.other_user_id != null) byId.set(String(c.other_user_id), c);
            } catch { /* ignore */ }
          });
          for (const [fid, cid] of Object.entries(friendMap)) {
            const found = list.find((c: any) => String(c?.id ?? c?.conversation_id) === String(cid));
            if (found) byId.set(String(fid), found);
          }
          setConvIndex({ byId, byUsername });
        }
      } catch { /* ignore */ }
      try {
        const cachedMe = await SecureStore.getItemAsync('localUser');
        if (cachedMe) {
          const u = JSON.parse(cachedMe);
          const cachedId = u?.id ?? u?.user_id ?? null;
          if (cachedId != null) setLocalUserId(cachedId);
        }
      } catch { /* ignore */ }
      if (mounted) setLoading(false);

      if (!isConnected) {
        try {
          const cached = await AsyncStorage.getItem('@chat_communities_cache_v1');
          if (cached && mounted) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) setCommunities(parsed);
          }
        } catch { /* ignore */ }
        return;
      }

      try {
        const res = await apiFetch(`${API_URL}/friendships/list`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            mapped = data.map((f:any) => {
              const idFromTag = typeof f.tag === 'string' && f.tag.startsWith('#') ? Number(f.tag.replace('#','')) : undefined;
              const idCandidate = f.user_id ?? f.id ?? idFromTag;
              const resolvedId = typeof idCandidate !== 'undefined' && idCandidate !== null ? Number(idCandidate) : undefined;
              return { id: resolvedId, username: f.username, name: f.name || '', avatar_url: f.avatar_url || '' };
            });
            if (mounted) setFriends(mapped);
            try { await AsyncStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(mapped)); } catch { /* ignore */ }
          }
        }
      } catch {
        // cache zaten yüklendi
      }
      let comms: any[] = [];
      try {
        comms = await listCommunities();
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
      } catch (err) {
        // listCommunities failed — fallback to cached communities if available
        try {
          const cached = await AsyncStorage.getItem('@chat_communities_cache_v1');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (mounted) setCommunities(parsed);
            }
          }
        } catch (cacheErr) {
          if (__DEV__) console.warn('[NewChat] communities cache load failed', cacheErr);
        }
      }

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
            // API başarısız: cache/önceki liste kalsın
          }
        } catch (e) {
          console.warn('[NewChat] fetch conversations error', e);
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

  // ─── Çevrimdışı WiFi transport ────────────────────────────────────────────
  // Sohbet listesindeyken transport'u başlat; kullanıcılar chat ekranına
  // girmeden birbirlerini keşfedebilir.
  useEffect(() => {
    if (isConnected) return; // Online: transport gerek yok
    if (offlineTransportManager.isActive) return; // Zaten çalışıyor
    (async () => {
      let userId: string | null = null;
      let userName = 'Kullanıcı';
      try {
        const cached = await SecureStore.getItemAsync('localUser');
        if (cached) {
          const u = JSON.parse(cached);
          userId = String(u?.id ?? u?.user_id ?? '') || null;
          userName = u?.name ?? u?.username ?? userName;
        }
      } catch { /* ignore */ }
      if (!userId) {
        try {
          const me = await getMe().catch(() => null);
          if (me) {
            userId = String(me?.id ?? me?.user_id ?? '') || null;
            userName = (me as any)?.name ?? (me as any)?.username ?? userName;
          }
        } catch { /* ignore */ }
      }
      if (!userId) return;
      console.log('[NewChat] offline transport başlatılıyor (chat listesi)');
      await offlineTransportManager.start(userId, userName);
    })();
  }, [isConnected]);

  // When network status changes, ensure we detect any previously-started
  // conversations immediately (from cache when offline) so friend rows
  // show "Sohbete Devam Et" instead of "Mesaj Başlat".
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!isConnected) {
          try {
            const cached = await AsyncStorage.getItem(CONVERSATIONS_CACHE_KEY);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                if (mounted) {
                  setConversations(parsed);
                  const byId = new Map<string, any>();
                  const byUsername = new Map<string, any>();
                  const normalize = (s:any) => {
                    if (!s && s !== 0) return null;
                    try { return String(s).toLowerCase().replace(/^@/, '').trim(); } catch { return null; }
                  };
                  parsed.forEach((c: any) => {
                    try {
                      extractParticipantIds(c).forEach((pid: any) => {
                        if (pid != null) byId.set(String(pid), c);
                      });
                      // Also build username index
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
                    } catch (e) { /* ignore per-conversation parse errors */ }
                  });
                  setConvIndex({ byId, byUsername });
                }
                return;
              }
            }
          } catch (err) {
            if (__DEV__) console.warn('[NewChat] load cached conversations failed', err);
          }
          // If no cached convs found, still try to refresh from server when available
          if (isConnected) {
            try { await refreshConversations(); } catch (e) { /* ignore */ }
          }
        } else {
          try { await refreshConversations(); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        /* ignore outer errors */
      }
    })();
    return () => { mounted = false; };
  }, [isConnected, refreshConversations]);

  // Fetch community member ids for each visible community so we can detect
  // whether any member is reachable via offlineTransport peers.
  useEffect(() => {
    if (!Array.isArray(communities) || communities.length === 0) {
      setCommunityMemberIdsMap({});
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const promises = communities.map((c:any) => listCommunityMembers(Number(c.id)).catch(() => []));
        const results = await Promise.all(promises);
        const map: Record<string, string[]> = {};
        for (let i = 0; i < communities.length; i++) {
          const c = communities[i];
          const members = results[i];
          if (Array.isArray(members)) {
            map[String(c.id)] = members.map((m:any) => String(m?.id ?? m?.user_id ?? m?.userId)).filter(Boolean);
          } else {
            map[String(c.id)] = [];
          }
        }
        if (mounted) setCommunityMemberIdsMap(map);
      } catch (e) {
        if (mounted) setCommunityMemberIdsMap({});
      }
    })();
    return () => { mounted = false; };
  }, [communities]);

  // Subscribe to peer changes and update per-community connected status
  useEffect(() => {
    const update = (peers: any[]) => {
      try {
        const connectedIds = new Set((peers || []).map((p:any) => String(p.userId)));
        const newMap: Record<string, boolean> = {};
        for (const [cid, memberIds] of Object.entries(communityMemberIdsMap)) {
          newMap[cid] = Array.isArray(memberIds) && memberIds.some(mid => connectedIds.has(String(mid)));
        }
        setCommunityHasPeerMap(newMap);
      } catch (e) { setCommunityHasPeerMap({}); }
    };
    const unsub = offlineTransportManager.onPeersChanged(update);
    // run once with current peers
    try { update(offlineTransportManager.peers || []); } catch (e) { /* ignore */ }
    return () => { try { unsub(); } catch {} };
  }, [communityMemberIdsMap]);

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
      // Çevrimdışı fallback: mesajı yerel SQLite kuyruğuna kaydet
      try {
        const msgText: string = payload?.text ?? composerText.trim();
        const recipientId = selectedFriend?.id ?? (initialRecipientId ? Number(initialRecipientId) : null);
        if (msgText && recipientId) {
          const { enqueueMessage } = await import('@/lib/offlineChatQueue');
          const minId = Math.min(Number(localUserId ?? 0), Number(recipientId));
          const maxId = Math.max(Number(localUserId ?? 0), Number(recipientId));
          const pendingConvId = `pending_${minId}_${maxId}`;
          await enqueueMessage({
            conversationId: pendingConvId,
            senderId: String(localUserId ?? ''),
            senderName: '',
            recipientId: recipientId,
            text: msgText,
            timestamp: Date.now(),
          });
          // Navigate to conversation screen with pending ID
          setComposerText('');
          setSelectedFriend(null);
          try {
            await openConversationOrCommunity(router, pendingConvId, { replace: true });
          } catch (navErr) {
            console.warn('[NewChat] navigate to pending conv failed', navErr);
            Alert.alert(
              'Kaydedildi',
              'İnternet bağlantısı yok. Mesaj kaydedildi, bağlantı gelince gönderilecek.',
            );
          }
          return;
        }
      } catch (queueErr) {
        console.warn('[NewChat] offline queue fallback failed', queueErr);
      }
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
    try {
      const pids = extractParticipantIds(conv);
      for (const pid of pids) {
        if (localUserId != null && String(pid) === String(localUserId)) continue;
        await saveFriendConvLink(pid, convId);
        setPersistedFriendConvMap((prev) => ({ ...prev, [String(pid)]: String(convId) }));
      }
      if (conv?.recipient_id != null) {
        await saveFriendConvLink(conv.recipient_id, convId);
        setPersistedFriendConvMap((prev) => ({ ...prev, [String(conv.recipient_id)]: String(convId) }));
      }
    } catch { /* ignore */ }
    // Offline unread sayacını temizle ve kırmızı noktayı kaldır
    try {
      await clearOfflineUnread(String(convId));
      setOfflineUnreadMap(prev => {
        const next = { ...prev };
        delete next[String(convId)];
        return next;
      });
    } catch (e) { /* ignore */ }
    try { await openConversationOrCommunity(router, convId, { replace: true, skipRemote: !isConnected }); } catch (e) { console.warn('[NewChat] openConversationOrCommunity failed', e); }
  }, [router, isConnected, localUserId]);

  const handleOpenFriendConversation = useCallback(async (friend: any) => {
    if (!friend?.id) return false;

    const existingConv = getFriendConversation(friend, convIndex, conversations, persistedFriendConvMap);
    const convId = existingConv?.id ?? existingConv?.conversation_id ?? existingConv?.conversation?.id;
    if (convId) {
      await saveFriendConvLink(friend.id, convId);
      setPersistedFriendConvMap((prev) => ({ ...prev, [String(friend.id)]: String(convId) }));
      await openConversationOrCommunity(router, convId, { replace: true, skipRemote: !isConnected });
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
    const conv = getFriendConversation(item, convIndex, conversations, persistedFriendConvMap);
    const onlineUnread = Boolean(conv && Number(conv?.unread_count) > 0 && !isUnreadFromSelf(conv));
    const convId = conv ? String(conv?.id ?? conv?.conversation_id ?? conv?.conversation?.id ?? '') : '';
    const offlineUnread = convId ? (offlineUnreadMap[convId] || 0) > 0 : false;
    const showUnread = onlineUnread || offlineUnread;
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
        isConnected={isConnected}
        friendConvMap={persistedFriendConvMap}
        onDelete={handleDeleteConversation}
      />
    );
  }, [colors, convIndex, conversations, offlineUnreadMap, handleContinueConversation, handleStartWithFriend, handleDeleteConversation, localUserId, isConnected, persistedFriendConvMap]);

  const renderCommunityItem = useCallback(({ item }: { item: any }) => {
    const conv = Array.isArray(conversations) ? conversations.find((c:any) => {
      try {
        const cid = c?.community_id ?? c?.community?.id ?? c?.metadata?.community_id ?? c?.meta?.community_id ?? c?.conversation?.community_id ?? null;
        return cid && Number(cid) === Number(item.id);
      } catch (e) { return false; }
    }) : null;
    const showUnread = Boolean(conv && Number(conv?.unread_count) > 0 && !isUnreadFromSelf(conv));
    return (
        (() => {
          const communityIdStr = String(item.id);
          const hasPeer = communityHasPeerMap[communityIdStr] ?? false;
          const disabled = !isConnected && !hasPeer;
          return (
            <CommunityRow
              item={item}
              colors={colors}
              showUnread={showUnread}
              onStart={handleStartWithCommunity}
              conversations={conversations}
              disabled={disabled}
            />
          );
        })()
    );
  }, [colors, handleStartWithCommunity, conversations, localUserId, isConnected, communityHasPeerMap]);

  const communityKeyExtractor = useCallback((item:any, index:number) => String(item.id ?? `community-${index}`), []);

  if (loading) return <SafeAreaView style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background}}><ActivityIndicator/></SafeAreaView>;

  return (
    <SafeAreaView edges={['left','right']} style={themed.screenContainer}>
      <View style={themed.screenHeader}>
        <Text style={themed.screenHeaderTitle}>Sohbet</Text>
        <Text style={themed.screenHeaderSubtitle}>Bir kişiye veya topluluğa mesaj göndermek için seçin.</Text>
      </View>
      <View style={{flex:1, paddingHorizontal:16, paddingBottom:16, backgroundColor: colors.background}}>
        {!isConnected && <NearbyPeersBar visible={true} />}
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
            extraData={{ conversations, convIndex, localUserId, persistedFriendConvMap }}
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
