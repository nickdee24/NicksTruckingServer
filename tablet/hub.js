// Connection to the hub. Apps subscribe to message types with hub.on(type, fn).
export function connectHub(playerName, server) {
  const listeners = new Map();
  const latest = new Map();
  let ws;

  const emit = (type, msg) => {
    latest.set(type, msg);
    (listeners.get(type) || []).forEach(fn => fn(msg));
  };

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', name: playerName, server }));
      emit('connection', { online: true });
    };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      emit(msg.type, msg);
    };
    ws.onclose = () => {
      emit('connection', { online: false });
      setTimeout(open, 2000);
    };
  };
  open();

  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      if (latest.has(type)) fn(latest.get(type));
      return () => listeners.set(type, listeners.get(type).filter(f => f !== fn));
    },
    send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    latest: type => latest.get(type)
  };
}
