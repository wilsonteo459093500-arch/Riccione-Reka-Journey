// 走进去 · 切口换成批荡 —— docs/walk/SPEC.md §10
//
// 鸟瞰的模型像建筑剖面：楼板外露的边、墙体的上下两面（墙头、门窗过梁的底面、挨着楼梯井往下接的那一段的底面）
// 都是墨色切口（house.js 的 houseKit(lib).cap）。走进去以后从屋里看，它们不是剖面而是一块块黑的：
// 上楼梯快到顶的时候抬头看楼梯口，那一圈楼板的边是一块黑色的楔子；门洞、窗洞上沿是一条黑边。
// 所以盖上天花的那一下（人已经进了门：flight.js 的 ceilings(true)）每一层的这些网格换一份新的材质数组，切口那一格换成批荡：
//   · 楼板（userData.plate）→ 天花的批荡（lib.fixed.ceiling：和楼板的底面一样，整块楼板一个颜色）；
//   · 墙体（合并的墙，userData.slot === 'walls'）→ 墙面（lib.slot('walls')：和门洞、窗洞两侧的端面一样，刷墙时跟着变）。
// 共用的 cap 材质本身、原来的材质数组都不动；掀掉天花（飞出去的第一下、一下子回去的 restoreOrbit）→ 每个网格放回原来的那个
// material（同一个对象）→ 鸟瞰和进去之前一模一样（mode B 逐像素比对）。
// 只看每一层的壳（F.shell.group：地板、墙、窗、门扇、栏杆）和楼板（F.plate）：家具在 F.furn 里（主题墙的深色衬底是 lib.fixed.cap，
// 是设计，不换），底座、树不在楼层里。
// 走着的时候引擎不重建楼层（刷墙 / 地板 = lib.apply 原地改材质；换楼层 = 换图层 / 可见性；换家具只重建家具；
// setScene 走进去时不会来：撤销换过平面图的那一步、读客人的户型图都等回到全屋）。万一来了：engine.floors 换了一个新数组 →
// 控制器每帧的 plasterEdges(engine) 看出来，旧的放回去（网格已经不在了，放回去也没坏处）、新的楼层重新换上。

const STATE = new WeakMap(); // engine → { floors, records }

/**
 * roots 下面的每个网格：材质（或材质数组里的某几格）是切口（isCap）→ 换成 pick(mesh) 给的材质（null / undefined = 这个网格不换）。
 * 换的是一份新的数组（单个材质就直接换成那一个），原来的数组和材质对象都不动；记到 records（{ mesh, was, now }）。
 * 已经在 records 里的网格跳过：调几次都一样。→ records
 */
export function swapCaps(roots, { isCap, pick, records = [] } = {}) {
  const done = new Set(records.map((r) => r.mesh));
  const visit = (o) => {
    if (!o?.isMesh || done.has(o)) return;
    const was = o.material;
    const arr = Array.isArray(was);
    if (!(arr ? was.some((m) => isCap(m)) : isCap(was))) return;
    const to = pick(o);
    if (!to) return;
    const now = arr ? was.map((m) => (isCap(m) ? to : m)) : to;
    o.material = now;
    done.add(o);
    records.push({ mesh: o, was, now });
  };
  for (const root of roots || []) {
    if (!root) continue;
    if (typeof root.traverse === 'function') root.traverse(visit);
    else visit(root);
  }
  return records;
}

/** 放回原来的材质（同一个对象）。网格的材质已经不是我们换上的那一份（别人又换过）→ 不动它。records 清空 */
export function restoreCaps(records) {
  for (const r of records || []) if (r.mesh.material === r.now) r.mesh.material = r.was;
  if (records) records.length = 0;
  return records;
}

/** 这一套引擎的切口材质：house.js 打的 'cap' 标签（lib.fixed.cap 是家具用的深色衬底，不算） */
const capOf = (lib) => (m) => !!m && m.userData?.fixed === 'cap' && m !== lib?.fixed?.cap;

/**
 * on = true：每一层的楼板、墙体换上批荡的边（已经换好、楼层也没重建 → 什么都不做）；楼层重建过 → 旧的放回去、新的换上。
 * on = false：全部放回去。→ 这一次有没有换 / 放回什么（有 → engine.dirty = true）。
 */
export function plasterEdges(engine, on = true) {
  if (!engine) return false;
  const s = STATE.get(engine);
  if (!on) {
    if (!s) return false;
    const had = s.records.length > 0;
    restoreCaps(s.records);
    STATE.delete(engine);
    if (had) engine.dirty = true;
    return had;
  }
  const floors = engine.floors || [];
  if (s && s.floors === floors) return false;
  const had = !!s?.records.length;
  if (s) restoreCaps(s.records);
  const lib = engine.lib;
  const plate = lib?.fixed?.ceiling;
  const wall = typeof lib?.slot === 'function' ? lib.slot('walls') : null;
  const records = [];
  if (plate && wall) {
    const roots = [];
    for (const F of floors) roots.push(F?.shell?.group, F?.plate);
    swapCaps(roots, { isCap: capOf(lib), pick: (o) => (o.userData?.plate ? plate : o.userData?.slot === 'walls' ? wall : null), records });
  }
  STATE.set(engine, { floors, records });
  const changed = had || records.length > 0;
  if (changed) engine.dirty = true;
  return changed;
}

/** 现在换着的网格数（测试 / 脚本看） */
export function plastered(engine) {
  return STATE.get(engine)?.records.length || 0;
}
