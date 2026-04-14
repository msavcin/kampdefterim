type ChatEvent = { type: string; payload?: any };

const listeners: Array<(e: ChatEvent) => void> = [];

export function onChatEvent(cb: (e: ChatEvent) => void) {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emitChatEvent(e: ChatEvent) {
  for (const cb of listeners.slice()) {
    try { cb(e); } catch (err) { /* ignore listener errors */ }
  }
}
