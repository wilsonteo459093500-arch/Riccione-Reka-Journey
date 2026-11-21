// 分页之间打招呼（Web Locks：同一个网址的所有分页共用，分页关掉锁就自动放掉）
//   ukir-tab:<随机>   每个开着的分页一把 ——「清除本机全部资料」先数还有几个别的分页开着
//   ukir-edit:<项目>  编辑器开着这个项目（共享锁）—— 自动清图片时跳过它（撤销历史里可能还用着换掉的图）
//   ukir-write        正在导入 PDF / 恢复备份 / 复制项目（共享锁）—— 这时候不清图片（新图还没挂到项目上）
// 浏览器没有 Web Locks（很旧的版本）→ 拿锁什么也不做；要「确定没人在用」的地方（清图片、清除全部资料）一律当成有人在用。

const locks = () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null);

export const locksSupported = () => !!locks();

export const TAB_PREFIX = 'ukir-tab:';
export const EDIT_PREFIX = 'ukir-edit:';
export const WRITE_LOCK = 'ukir-write';

/**
 * 拿一把锁一直拿着，直到调用返回的 release()
 * @returns {() => void}
 */
export function holdLock(name, mode = 'shared') {
  const L = locks();
  if (!L) return () => {};
  let release;
  const done = new Promise((r) => (release = r));
  L.request(name, { mode }, () => done).catch(() => {});
  return () => release();
}

/** 拿着共享锁做一件事（导入、恢复、复制时用 WRITE_LOCK） */
export async function withSharedLock(name, fn) {
  const L = locks();
  if (!L) return await fn();
  return await L.request(name, { mode: 'shared' }, () => fn());
}

/** 现在有哪些锁被拿着（所有分页）→ 名字的清单；不支持 → null */
export async function heldLockNames() {
  const L = locks();
  if (!L?.query) return null;
  try {
    const snap = await L.query();
    return [...(snap.held || []), ...(snap.pending || [])].map((x) => x.name).filter(Boolean);
  } catch {
    return null;
  }
}

/** 这个分页的名字（每个分页开着时一直拿着 ukir-tab:<它>） */
export const TAB_ID = `${TAB_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let tabHeld = false;
export function holdTabLock() {
  if (tabHeld) return;
  tabHeld = true;
  holdLock(TAB_ID, 'exclusive');
}

/** 别的 UKIR STUDIO 分页还开着几个（不知道 → null） */
export async function otherTabCount() {
  const names = await heldLockNames();
  if (!names) return null;
  return new Set(names.filter((n) => n.startsWith(TAB_PREFIX) && n !== TAB_ID)).size;
}

/**
 * 拿到独占的 WRITE_LOCK 才做（没人在导入 / 恢复 / 复制）；拿不到（有人在写，或者浏览器不支持）→ 返回 null，不做
 * fn 收到正在编辑的项目 id 集合
 */
export async function whenNobodyWrites(fn) {
  const L = locks();
  if (!L?.query) return null;
  return await L.request(WRITE_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) return null;
    const names = (await heldLockNames()) || [];
    const editing = new Set(names.filter((n) => n.startsWith(EDIT_PREFIX)).map((n) => n.slice(EDIT_PREFIX.length)));
    return await fn(editing);
  });
}
