// 固定的「我的游戏房」网址（/r/名字）：不用资料库。
// 房主开着房间时，手机在 home:名字 这个频道回答「我现在在 ABCD 房」。
// 扫码的人打开 /r/名字 → 问一声「在哪？」→ 收到房号就跳过去；没人回答就显示「房主还没开房」，继续等。

export const ANNOUNCE_MS = 12_000;

export function cleanSlug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

/** 房主这边：一直告诉大家现在的房号。回传停止函数 */
export function announceHome(transport, getCode) {
  const say = () => {
    const code = getCode();
    if (code) transport.send({ t: 'here', code });
  };
  const off = transport.onMessage((m) => m?.t === 'where' && say());
  const offS = transport.onStatus((s) => s === 'online' && say());
  const timer = setInterval(say, ANNOUNCE_MS);
  if (transport.status() === 'online') say();
  return () => {
    clearInterval(timer);
    off();
    offS();
  };
}

/** 扫码的人这边：找到房号就 onFound(code)。回传停止函数 */
export function findHome(transport, onFound) {
  let done = false;
  const ask = () => !done && transport.send({ t: 'where' });
  const off = transport.onMessage((m) => {
    if (!done && m?.t === 'here' && typeof m.code === 'string') {
      done = true;
      onFound(m.code);
    }
  });
  const offS = transport.onStatus((s) => s === 'online' && ask());
  const timer = setInterval(ask, 5_000);
  if (transport.status() === 'online') ask();
  return () => {
    done = true;
    clearInterval(timer);
    off();
    offS();
  };
}
