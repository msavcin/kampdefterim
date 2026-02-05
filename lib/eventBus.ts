type Listener = (payload?: any) => void;

const listeners: Record<string, Set<Listener>> = {};

export function on(event: string, cb: Listener) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(cb);
}

export function off(event: string, cb: Listener) {
  if (!listeners[event]) return;
  listeners[event].delete(cb);
}

export function emit(event: string, payload?: any) {
  if (!listeners[event]) return;
  for (const cb of Array.from(listeners[event])) {
    try {
      cb(payload);
    } catch (e) {
      // swallow listener errors
      console.warn('[eventBus] listener error for', event, e);
    }
  }
}

// Default export olarak da ekle
export const eventBus = {
  on,
  off,
  emit,
};
