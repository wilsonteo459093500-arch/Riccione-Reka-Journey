// 讯息怎么送到同房间的其他手机。
//   supabase：经过 SPACE 那个 Supabase 项目的「即时转送」（Realtime broadcast），不存任何资料
//   local   ：同一个浏览器的分页之间（BroadcastChannel），开发和自动测试用（网址加 ?net=local）
//
// 介面：{ send(msg), onMessage(cb) → 取消, onStatus(cb) → 取消, status(), close() }
// status: 'connecting' | 'online' | 'offline'

const URL_ = import.meta.env?.VITE_SUPABASE_URL;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const PREFIX = 'play:'; // 跟 SPACE 自己的频道分开

export function netMode() {
  try {
    const q = new URLSearchParams(location.search).get('net');
    if (q) sessionStorage.setItem('play.net', q);
    const s = sessionStorage.getItem('play.net');
    if (s === 'local') return 'local';
  } catch {
    /* ignore */
  }
  return URL_ && KEY ? 'supabase' : 'local';
}

function emitter() {
  const subs = new Set();
  return {
    on(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    emit(v) {
      for (const cb of [...subs]) {
        try {
          cb(v);
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
}

function localTransport(name) {
  const bc = new BroadcastChannel(PREFIX + name);
  const msgs = emitter();
  const st = emitter();
  bc.onmessage = (e) => msgs.emit(e.data);
  queueMicrotask(() => st.emit('online'));
  return {
    send: (m) => bc.postMessage(m),
    onMessage: msgs.on,
    onStatus: st.on,
    status: () => 'online',
    close: () => bc.close(),
  };
}

let clientPromise = null;
function supabaseClient() {
  clientPromise ||= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    }),
  );
  return clientPromise;
}

function supabaseTransport(name) {
  const msgs = emitter();
  const st = emitter();
  let status = 'connecting';
  let channel = null;
  let closed = false;
  const queue = [];
  const setStatus = (s) => {
    if (s === status) return;
    status = s;
    st.emit(s);
  };

  supabaseClient().then((client) => {
    if (closed) return;
    channel = client.channel(PREFIX + name, { config: { broadcast: { self: false, ack: false } } });
    channel.on('broadcast', { event: 'm' }, ({ payload }) => msgs.emit(payload));
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('online');
        while (queue.length) channel.send({ type: 'broadcast', event: 'm', payload: queue.shift() });
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        setStatus('offline');
      }
    });
  });

  return {
    send(m) {
      if (status === 'online' && channel) channel.send({ type: 'broadcast', event: 'm', payload: m });
      else if (queue.length < 50) queue.push(m);
    },
    onMessage: msgs.on,
    onStatus: st.on,
    status: () => status,
    close() {
      closed = true;
      if (channel) supabaseClient().then((c) => c.removeChannel(channel));
    },
  };
}

export function createTransport(name) {
  return netMode() === 'local' ? localTransport(name) : supabaseTransport(name);
}
