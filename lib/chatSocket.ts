import { API_URL } from './config';

type MessageHandler = (msg: any) => void;

export function createChatSocket(onMessage: MessageHandler, onOpen?: () => void, onClose?: () => void) {
  let ws: WebSocket | null = null;
  let sendQueue: any[] = [];
  let reconnectAttempts = 0;
  let shouldReconnect = true;
  const maxDelay = 10000;

  const connect = (token: string) => {
    try {
      if (ws) {
        try { ws.close(); } catch {}
        ws = null;
      }
      const url = API_URL.replace(/^https?/, 'wss') + '/chat/socket';
      console.log('[chatSocket] connecting to', url, 'token?', !!token);
      ws = new WebSocket(url);

      ws.onopen = () => {
        reconnectAttempts = 0;
        shouldReconnect = true;
        console.log('[chatSocket] open');
        if (token && ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'auth', token })); console.log('[chatSocket] sent auth'); } catch (e) { console.warn('[chatSocket] auth send failed', e); }
        } else if (token) {
          // If still opening, send auth after small delay
          setTimeout(() => {
            try { ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'auth', token })); console.log('[chatSocket] sent auth (delayed)'); } catch (err) { console.warn('[chatSocket] delayed auth failed', err); }
          }, 200);
        } else {
          console.log('[chatSocket] no token provided');
        }
        // flush queued sends
        try {
          if (sendQueue.length && ws && ws.readyState === WebSocket.OPEN) {
            for (const obj of sendQueue) {
              try { ws.send(JSON.stringify(obj)); } catch (err) { console.warn('[chatSocket] flush send failed', err); }
            }
            sendQueue = [];
          }
        } catch (err) { console.warn('[chatSocket] flush queue error', err); }
        onOpen && onOpen();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(typeof e.data === 'string' ? e.data : (e.data as any));
          try {
            let preview = '(no-payload)';
            try { preview = JSON.stringify(msg).slice(0, 1500); } catch { preview = '(stringify failed)'; }
            console.log('[chatSocket] recv', msg?.type ?? '(no-type)', preview);
          } catch (logErr) { /* ignore logging errors */ }
          onMessage(msg);
        } catch (err) {
          console.warn('[chatSocket] message parse error', err);
        }
      };

      ws.onclose = () => {
        console.log('[chatSocket] close');
        onClose && onClose();
        if (!shouldReconnect) return;
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, Math.max(0, reconnectAttempts - 1)), maxDelay);
        setTimeout(() => connect(token), delay);
      };

      ws.onerror = (err) => {
        console.warn('[chatSocket] error', err);
        try { ws && ws.close(); } catch {}
      };
    } catch (err) {
      console.warn('[chatSocket] connect failed', err);
    }
  };

  const send = (obj: any) => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { console.log('[chatSocket] send', obj?.type ?? '(no-type)'); } catch {}
        ws.send(JSON.stringify(obj));
      } else {
        // queue message to send when socket opens
        try { console.log('[chatSocket] queueing send', obj?.type ?? '(no-type)'); } catch {}
        if (sendQueue.length < 200) sendQueue.push(obj);
        else console.warn('[chatSocket] send queue full, dropping message');
      }
    } catch (err) {
      console.warn('[chatSocket] send error', err);
    }
  };

  const disconnect = () => {
    shouldReconnect = false;
    try { ws && ws.close(); } catch {}
    ws = null;
  };

  return { connect, send, disconnect } as const;
}

export type ChatSocket = ReturnType<typeof createChatSocket>;
