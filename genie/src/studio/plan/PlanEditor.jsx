// 平面图编辑器（纸色图纸，多层）：上传平面图（ImportFlow：选页 → 找到每一层 → AI 读）→ 拉方块画房间、点墙放门窗、
// 画楼梯连上下两层 → 生成 3D。单位：米。0.05m 吸附；房间边会吸到同一层附近房间的边、也会吸到下面那一层（虚线）的边上。
// 楼层：画布左上角的「一楼 · 二楼 · ＋」（≤ 900px 是画布顶上一整条）；⋯ 改名 / 上下移 / 删除；＋ 空白（带着楼梯）/ 复制这一层。
// 楼梯（T）：拖出楼梯间 → 上下两层各有一个楼梯间（下层画踏步 + 「上」，上层是斜线的洞 + 「下」），在任何一层移动两层一起动。
// iPad：手指点墙就能放门窗（不靠鼠标悬停预览）；双指捏合缩放、平移；＋ / － 以画面中心缩放；系统打断（pointercancel）会复原。
// ≤ 900px（iPad 竖放、手机）属性面板变成可以收起的底部抽屉，平面图用满整个宽度。
// 客人版（onSettings 没给）：客人碰不到设置 / API key —— 这台设备没有 key 时不显示 AI。
// 许愿模式（upload = false）：只能画（楼层、楼梯都可以）；没有「上传平面图」、没有 AI；没有底图时，量尺校准、移动底图两个工具也不出现。

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ROOM_TYPES,
  OPENING_KINDS,
  TEMPLATES,
  MAX_FLOORS,
  FLOOR_NAMES,
  buildWalls,
  bounds,
  snapAll,
  templatePlan,
  uid,
  migratePlan,
  floorById,
  floorName,
  addFloor,
  removeFloor,
  moveFloor,
  updateFloor,
  addStair,
  updateStair,
  removeStair,
  stairById,
  stairFlights,
  stairPath,
  checkPlan,
  carveFloor,
} from './model.js';
import { planFileToImage } from './planImage.js';
import * as AI from './ai.js';
import { loadSettings } from '../store.js';
import { t, tj, L, isEn } from '../../shared/i18n.js';
import { BRAND } from '../../shared/config.js';
import { Icon, roomLabel, useMedia } from '../ui/kit.jsx';

// 上传平面图的整套流程（IMPORT 写的）：有这个文件才用，按需载入（pdf.js 那些不进首屏）
const IMPORT_MODS = import.meta.glob('./ImportFlow.jsx');
const ImportFlow = IMPORT_MODS['./ImportFlow.jsx'] ? lazy(IMPORT_MODS['./ImportFlow.jsx']) : null;

const SNAP = 0.05;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const r2 = (v) => Math.round(v * 100) / 100;
const MIN_S = 8;
const MAX_S = 400;
const ZOOM_INSET = 72; // 右边：缩放按钮那一条
const HINT_INSET = 60; // 底部：工具提示（可以折两行）
const SHEET_INSET = 68; // 窄屏：收起的属性抽屉
const DIM_MIN_PX = 70; // 房间在屏幕上小于这个就不写尺寸（走廊、浴室的字会压到墙上）
const HISTORY = 30;

const TOOLS = [
  { id: 'select', zh: '选择 / 移动', key: 'v', icon: 'pointer' },
  { id: 'room', zh: '画房间', key: 'r', icon: 'room' },
  { id: 'stair', zh: '楼梯', key: 't', icon: 'stair' },
  { id: 'door', zh: '门', key: 'd', icon: 'door' },
  { id: 'window', zh: '窗', key: 'w', icon: 'window' },
  { id: 'slider', zh: '落地趟门', key: 's', icon: 'slider' },
  { id: 'open', zh: '打通', key: 'o', icon: 'open' },
  { id: 'calibrate', zh: '量尺校准', key: 'c', icon: 'ruler' },
  { id: 'underlay', zh: '移动底图', key: 'u', icon: 'hand' },
];
const OPENING_TOOLS = ['door', 'window', 'slider', 'open'];
const UNDERLAY_TOOLS = ['calibrate', 'underlay']; // 只对底图有用：许愿模式（不能上传）又没有底图时不出现
const SHORT_EN = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth']; // 手机上英文楼层名用短的
const LEVEL_WORDS = ['ground', 'first', 'second', 'third'];
const DIR_NEXT = { N: 'E', E: 'S', S: 'W', W: 'N' };
const DIR_ROT = { N: 0, E: 90, S: 180, W: 270 };
const DIR_ZH = { N: '朝上', E: '朝右', S: '朝下', W: '朝左' };
const SHAPES = [
  ['straight', '直跑'],
  ['L', 'L 形'],
  ['U', 'U 形'],
];

/** 楼梯工具的图标（lucide 没有楼梯）：三级台阶 */
function StairIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h5v-5h5v-5h5V5h3" />
      <path d="M3 20V9" opacity="0.35" />
    </svg>
  );
}

function edgesOf(rooms) {
  const out = [];
  for (const r of rooms) {
    out.push({ axis: 'x', c: r.y, a: r.x, b: r.x + r.w });
    out.push({ axis: 'x', c: r.y + r.d, a: r.x, b: r.x + r.w });
    out.push({ axis: 'z', c: r.x, a: r.y, b: r.y + r.d });
    out.push({ axis: 'z', c: r.x + r.w, a: r.y, b: r.y + r.d });
  }
  return out;
}

function nearestEdge(rooms, p, maxD) {
  let best = null;
  for (const e of edgesOf(rooms)) {
    const along = e.axis === 'x' ? p.x : p.y;
    const perp = e.axis === 'x' ? p.y : p.x;
    if (along < e.a - 0.1 || along > e.b + 0.1) continue;
    const d = Math.abs(perp - e.c);
    if (d <= maxD && (!best || d < best.d)) best = { ...e, d, along: Math.max(e.a, Math.min(e.b, along)) };
  }
  return best;
}

/** 一段字大约几个字宽（中文 1、拉丁字母约 0.58） */
const emWidth = (str) => Math.max(3, [...String(str)].reduce((w, c) => w + (/[⺀-鿿＀-￯]/.test(c) ? 1 : 0.58), 0));

/** 房间名的字号：一行放不下要缩小时，英文按空格折成两行（找最平均的断点），字能大一截就用两行 */
function fitLabel(label, w, d, sw) {
  const max = 14 * sw;
  const one = Math.min(max, (w * 0.86) / emWidth(label), d / 3.2);
  const words = String(label).split(' ').filter(Boolean);
  if (one >= max * 0.98 || words.length < 2) return { lines: [label], fs: one };
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const wid = Math.max(emWidth(lines[0]), emWidth(lines[1]));
    if (!best || wid < best.wid) best = { lines, wid };
  }
  const two = Math.min(max, (w * 0.86) / best.wid, d / 4.8);
  return two > one * 1.15 ? { lines: best.lines, fs: two } : { lines: [label], fs: one };
}

/** 数字输入：打字的时候不夹（打「2.9」不会在「2」那一下被改成 2.4），离开 / 回车才夹到范围里 */
function NumField({ value, onChange, min = -Infinity, max = Infinity, step = 0.05, ...rest }) {
  const [txt, setTxt] = useState(null);
  const shown = txt ?? (Number.isFinite(value) ? String(+(+value).toFixed(3)) : '');
  const commit = () => {
    if (txt == null) return;
    const v = Number(txt);
    if (txt !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    setTxt(null);
  };
  return (
    <input
      type="number"
      step={step}
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        const s = e.target.value;
        setTxt(s);
        const v = Number(s);
        if (s !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      {...rest}
    />
  );
}

export default function PlanEditor({ initial, underlays: initialUnderlays, underlay: legacyUnderlay, autoUpload, upload = true, onCancel, onApply, onSettings, startFloor }) {
  const [plan, setPlan] = useState(() => migratePlan(initial));
  const [underlays, setUnderlays] = useState(() => {
    const m = { ...(initialUnderlays || {}) };
    // 旧的调用方式（一张底图）：当成一楼的
    if (legacyUnderlay && !initialUnderlays) m[migratePlan(initial).floors[0].id] = legacyUnderlay;
    return m;
  });
  const [fid, setFid] = useState(() => {
    const p = migratePlan(initial);
    return floorById(p, startFloor) ? startFloor : p.floors[0].id;
  });
  const floor = floorById(plan, fid) || plan.floors[0];
  const level = floor.level;
  const below = level > 0 ? plan.floors[level - 1] : null;
  const above = plan.floors[level + 1] || null;
  const underlay = underlays[floor.id] || null;
  const hasAnyRooms = plan.floors.some((f) => f.rooms.some((r) => !r.stairId));
  const [tool, setTool] = useState(() => (migratePlan(initial).floors.some((f) => f.rooms.length) ? 'select' : 'room'));
  const [sel, setSel] = useState(null); // { type: 'room' | 'opening' | 'stair', id }
  const [view, setView] = useState({ s: 50, ox: 80, oy: 80 });
  const [preview, setPreview] = useState(null);
  const [calib, setCalib] = useState(null);
  const [calibAll, setCalibAll] = useState(null); // null = 默认（同一张图读出来的楼层一起）
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [msgUndo, setMsgUndo] = useState(false);
  const [sheet, setSheet] = useState(false); // 窄屏：属性抽屉拉开了没有
  const [menu, setMenu] = useState(null); // 'floor' | 'add' | null
  const [ask, setAsk] = useState(null); // 确认框 { text, ok, run }
  const [importFile, setImportFile] = useState(null);
  const [hasKey, setHasKey] = useState(() => !!loadSettings().apiKey);
  const narrow = useMedia('(max-width: 900px)');
  const phone = useMedia('(max-width: 599px)');
  // 客人版没有 key：不显示 AI（客人到不了设置）；许愿模式一律没有（不能上传，就没有图可认）
  const canAI = upload && (!!onSettings || hasKey);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const floorsRef = useRef(null);
  const fileRef = useRef(null);
  const calibRef = useRef(null);
  const actsRef = useRef(null);
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const past = useRef([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fidRef = useRef(fid);
  fidRef.current = floor.id;
  const layoutRef = useRef({ narrow, phone });
  layoutRef.current = { narrow, phone };

  const walls = useMemo(() => buildWalls(floor), [floor]);
  const ghostWalls = useMemo(() => (below ? buildWalls(below) : []), [below]);
  const issues = useMemo(() => checkPlan(plan), [plan]);
  const stairsHere = useMemo(() => plan.stairs.filter((s) => s.from === floor.id || s.to === floor.id), [plan, floor.id]);

  // 换了方案（模板 / 导入）以后，现在这一层不在了 → 回到一楼
  useEffect(() => {
    if (!floorById(plan, fid)) setFid(plan.floors[0].id);
  }, [plan, fid]);

  /** 记一笔（删除、加楼层、楼梯、模板、校准…之前），⌘Z / Ctrl+Z 撤销 */
  const remember = useCallback(() => {
    past.current.push({ plan, underlays });
    if (past.current.length > HISTORY) past.current.shift();
  }, [plan, underlays]);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setPlan(prev.plan);
    setUnderlays(prev.underlays);
    setSel(null);
    setMsg('');
    setMsgUndo(false);
  }, []);
  const say = (m, withUndo = false) => {
    setMsg(m);
    setMsgUndo(withUndo);
  };

  const floorLabel = useCallback(
    (f, short = false) => {
      if (!f) return '';
      const p = plan;
      if (!f.name && short && isEn()) return SHORT_EN[f.level] || t(floorName(p, f.id));
      return t(floorName(p, f.id));
    },
    [plan],
  );

  // 标题栏中间那组按钮：真的放不下时才横滑 + 两头淡出（data-overflow）；放得下就是一排干净的按钮，最后一个不会被淡掉
  useLayoutEffect(() => {
    const el = actsRef.current;
    if (!el) return undefined;
    const update = () => {
      const v = el.scrollWidth > el.clientWidth + 1 ? '1' : '';
      if ((el.dataset.overflow || '') !== v) el.dataset.overflow = v;
    };
    update();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [canAI]);

  // 量完第二点：长度输入框要拿到焦点（点在画布上的那一下会把 autoFocus 的焦点抢走）
  useEffect(() => {
    if (!calib?.p2) return undefined;
    const tm = setTimeout(() => calibRef.current?.focus(), 0);
    return () => clearTimeout(tm);
  }, [calib?.p2]);

  // 有新消息（AI 结果、读图失败…）：窄屏把抽屉拉开，免得没看到
  useEffect(() => {
    if (msg) setSheet(true);
  }, [msg]);

  const fit = useCallback(
    (p = plan, u = underlay) => {
      const el = svgRef.current;
      if (!el) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      // 所有楼层合起来（楼层是对齐的：换层的时候画面不跳）
      let bb = p.floors.some((f) => f.rooms.length) ? bounds(p) : null;
      if (u) {
        const ub = { x0: u.x, y0: u.y, x1: u.x + u.w, y1: u.y + u.h };
        bb = bb ? { x0: Math.min(bb.x0, ub.x0), y0: Math.min(bb.y0, ub.y0), x1: Math.max(bb.x1, ub.x1), y1: Math.max(bb.y1, ub.y1) } : ub;
      }
      if (!bb) bb = { x0: 0, y0: 0, x1: 12, y1: 9 };
      // 留白：四周一圈 + 顶上的楼层标签 + 底部提示（手机上不显示提示）+ 窄屏收起的抽屉 + 右下的缩放按钮。
      // 缩放按钮只占右下一角：试两种 —— 放在它左边（右边留一条）或放在它上面（底部多留一段），哪个平面图大用哪个
      const { narrow: nw, phone: ph } = layoutRef.current;
      const pad = W < 520 ? 16 : 32;
      const cr = el.getBoundingClientRect();
      const zr = zoomRef.current?.getBoundingClientRect();
      const fr = floorsRef.current?.getBoundingClientRect();
      const top = fr?.height ? Math.max(0, fr.bottom - cr.top + 6 - pad) : 48;
      const zoomW = zr?.width ? cr.right - zr.left + 8 - pad : ZOOM_INSET;
      const zoomH = zr?.height ? cr.bottom - zr.top + 8 - pad : 190;
      const base = (ph ? 0 : HINT_INSET) + (nw ? SHEET_INSET : 0);
      const bw = bb.x1 - bb.x0;
      const bh = bb.y1 - bb.y0;
      let best = null;
      for (const [right, bottom] of [
        [Math.max(0, zoomW), base],
        [0, Math.max(base, zoomH)],
      ]) {
        const aw = Math.max(80, W - right - pad * 2);
        const ah = Math.max(80, H - bottom - top - pad * 2);
        const s = Math.max(MIN_S, Math.min(MAX_S, Math.min(aw / bw, ah / bh)));
        if (!best || s > best.s) best = { s, ox: pad + (aw - bw * s) / 2 - bb.x0 * s, oy: pad + top + (ah - bh * s) / 2 - bb.y0 * s };
      }
      setView(best);
    },
    [plan, underlay],
  );

  useEffect(() => {
    fit();
    if (autoUpload && upload) setTimeout(() => fileRef.current?.click(), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // iPad 转了方向（宽 ↔ 窄的版式）：重新放到画面中间
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return undefined;
    }
    const tm = setTimeout(() => fit(), 60);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow, phone]);

  const toM = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.ox) / v.s, y: (e.clientY - r.top - v.oy) / v.s };
  };

  /** 以屏幕上 (mx, my)（相对画布）为中心缩放 */
  const zoomBy = (k, mx, my) => {
    setView((v) => {
      const s = Math.max(MIN_S, Math.min(MAX_S, v.s * k));
      return { s, ox: mx - ((mx - v.ox) * s) / v.s, oy: my - ((my - v.oy) * s) / v.s };
    });
  };
  const zoomCenter = (k) => {
    const el = svgRef.current;
    if (el) zoomBy(k, el.clientWidth / 2, el.clientHeight / 2);
  };

  // ── 改这一层 ──
  const setFloor = (fn) => setPlan((p) => updateFloor(p, fidRef.current, fn));
  /** 房间：楼梯间 → 改楼梯（上下两层一起）；其他 → 只改这一层 */
  const updateRoom = (id, patch) =>
    setPlan((p) => {
      const f = floorById(p, fidRef.current);
      const r = f?.rooms.find((x) => x.id === id);
      if (r?.stairId) {
        const rect = {};
        for (const k of ['x', 'y', 'w', 'd']) if (k in patch) rect[k] = patch[k];
        return updateStair(p, r.stairId, rect);
      }
      return updateFloor(p, fidRef.current, (fl) => ({ ...fl, rooms: fl.rooms.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    });
  const updateOpening = (id, patch) => setFloor((f) => ({ ...f, openings: f.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));

  const snapEdges = (vals, others, tol = 0.15) => {
    let best = null;
    for (const v of vals)
      for (const o of others) {
        const d = o - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best))) best = d;
      }
    return best || 0;
  };
  /** 吸附的对象：这一层别的房间 + 下面那一层（虚线）的房间 */
  const snapTargets = (exceptId, exceptStair) => {
    const rs = [...floor.rooms.filter((r) => r.id !== exceptId && !(exceptStair && r.stairId === exceptStair)), ...(below ? below.rooms.filter((r) => !(exceptStair && r.stairId === exceptStair)) : [])];
    return { xs: rs.flatMap((r) => [r.x, r.x + r.w]), ys: rs.flatMap((r) => [r.y, r.y + r.d]) };
  };

  /** 这一点附近的墙上，按当前工具放一扇门 / 窗（tolPx：手指要宽松一点） */
  const openingAt = (p, tolPx, kind = tool) => {
    const edge = nearestEdge(floor.rooms, p, tolPx / viewRef.current.s);
    if (!edge) return null;
    const k = OPENING_KINDS[kind];
    if (!k) return null;
    const w = Math.min(k.width, edge.b - edge.a);
    const c = Math.max(edge.a + w / 2, Math.min(edge.b - w / 2, snap(edge.along)));
    return edge.axis === 'x' ? { x1: r2(c - w / 2), x2: r2(c + w / 2), y1: edge.c, y2: edge.c } : { x1: edge.c, x2: edge.c, y1: r2(c - w / 2), y2: r2(c + w / 2) };
  };

  const addOpening = (op) => {
    const o = { id: uid('o'), kind: tool, ...op };
    setFloor((f) => ({ ...f, openings: [...f.openings, o] }));
    setSel({ type: 'opening', id: o.id });
    setPreview(null);
  };

  // ── 楼层 ──
  const switchFloor = (id) => {
    if (!floorById(plan, id) || id === floor.id) return;
    setFid(id);
    setSel(null);
    setCalib(null);
    setPreview(null);
    setMenu(null);
  };
  const doAddFloor = (copy) => {
    remember();
    const { plan: np, floorId } = addFloor(plan, { copy, from: floor.id });
    setMenu(null);
    if (!floorId) return say(t('最多 {0} 层', [MAX_FLOORS]));
    setPlan(np);
    setFid(floorId);
    setSel(null);
    setTool(copy === 'all' ? 'select' : 'room');
    const nf = floorById(np, floorId);
    say(t('加好了{0}。', [floorLabel(nf)]), true);
  };
  const askRemoveFloor = () => {
    setMenu(null);
    if (plan.floors.length <= 1) return;
    const f = floor;
    setAsk({
      text: t('删除{0}？这一层的房间和家具都会删掉（可以撤销）', [floorLabel(f)]),
      ok: t('删除'),
      danger: true,
      run: () => {
        remember();
        const np = removeFloor(plan, f.id);
        setPlan(np);
        setUnderlays((u) => {
          const m = { ...u };
          delete m[f.id];
          return m;
        });
        setFid(np.floors[Math.max(0, f.level - 1)].id);
        setSel(null);
        say(t('已删除{0}。', [floorLabel(f)]), true);
      },
    });
  };
  const doMoveFloor = (dir) => {
    remember();
    setPlan(moveFloor(plan, floor.id, dir));
    setMenu(null);
  };

  // ── 楼梯 ──
  /** 画好一个楼梯间：有上一层 → 从这一层上去；这一层是最上面、下面那层还没有楼梯上来 → 从下面上到这一层；都没有 → 问要不要加一层 */
  const placeStair = (rect) => {
    const make = (p0, from, to) => {
      let { plan: np, stairId } = addStair(p0, { from, to, ...rect });
      if (!stairId) return;
      // 楼梯占的地方，从上下两层的房间里挖掉（客厅变成 L 形的两块），免得重叠
      const st = stairById(np, stairId);
      for (const id of [st.from, st.to]) np = updateFloor(np, id, (f) => carveFloor(f, st));
      setPlan(np);
      setSel({ type: 'stair', id: stairId });
      setTool('select');
      say(t('楼梯画好了：上下两层都有，在任何一层移动都会一起动。'));
    };
    if (above) {
      remember();
      return make(plan, floor.id, above.id);
    }
    if (below && !plan.stairs.some((s) => s.to === floor.id)) {
      remember();
      return make(plan, below.id, floor.id);
    }
    if (plan.floors.length >= MAX_FLOORS) return say(t('最多 {0} 层', [MAX_FLOORS]));
    const nextName = t(FLOOR_NAMES[plan.floors.length] || FLOOR_NAMES[1]);
    setAsk({
      text: t('加{0}并连上楼梯？', [nextName]),
      ok: t('加{0}', [nextName]),
      run: () => {
        remember();
        const { plan: np, floorId } = addFloor(plan, { copy: 'blank' });
        if (floorId) make(np, floor.id, floorId);
      },
    });
  };

  // ── 上传（ImportFlow）+ 重新识别这一层 ──
  const onFile = async (file) => {
    if (!file) return;
    setHasKey(!!loadSettings().apiKey);
    if (ImportFlow) {
      setImportFile(file);
      return;
    }
    // 还没有 ImportFlow（或载入失败）：只把图放成这一层的底图
    setBusy(t('读取平面图…'));
    say('');
    try {
      const img = await planFileToImage(file);
      const w = 12;
      const u = { src: img.src, x: 0, y: 0, w, h: (w * img.height) / img.width, opacity: 0.55, iw: img.width, ih: img.height };
      setUnderlays((m) => ({ ...m, [floor.id]: u }));
      setTimeout(() => fit(plan, u), 30);
      say(t('底图已放好。用「画房间」沿着墙描一遍；先用量尺校准比例会更准。'));
    } catch (e) {
      const m = String(e?.message || e);
      const pdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
      if (pdf && (e instanceof TypeError || /is not a function|withResolvers/i.test(m))) say(t('这台设备读不了 PDF：请更新 iPadOS，或把平面图截图成 JPG / PNG 再上传'));
      else say(t('读不出来：{0}', [t(m)]));
    } finally {
      setBusy('');
    }
  };

  /** ImportFlow 读完：替换全部楼层，或只放进某一层 */
  const onImportDone = ({ plan: p2, underlays: u2 = {}, mode, floorId } = {}) => {
    setImportFile(null);
    if (!p2) return;
    remember();
    const np = migratePlan(p2);
    let next;
    let target;
    if (mode === 'into' && floorById(plan, floorId)) {
      const src = np.floors[0];
      const stairs = plan.stairs.filter((s) => s.from === floorId || s.to === floorId);
      const keep = (r) => !r.stairId && !(r.type === 'stair' && stairs.length);
      next = migratePlan(updateFloor(plan, floorId, (f) => ({ ...f, rooms: [...f.rooms.filter((r) => r.stairId), ...src.rooms.filter(keep)], openings: src.openings, ...(src.meta ? { meta: src.meta } : {}) })));
      const u = u2[src.id];
      if (u) setUnderlays((m) => ({ ...m, [floorId]: u }));
      target = floorId;
    } else {
      next = { ...np, name: plan.name || np.name, north: plan.north };
      setUnderlays({ ...u2 });
      target = next.floors[0].id;
    }
    setPlan(next);
    setFid(target);
    setSel(null);
    setTool('select');
    const rooms = next.floors.reduce((n, f) => n + f.rooms.filter((r) => !r.stairId).length, 0);
    say(t('已放进编辑器：{0} 层、{1} 个房间。请对一下，再按「生成 3D」。', [next.floors.length, rooms]), true);
    setTimeout(() => fit(next, u2[target] || null), 40);
  };

  const rereadThisFloor = async () => {
    const s = loadSettings();
    setHasKey(!!s.apiKey);
    if (!s.apiKey) {
      // 客人版没有 onSettings：只说一句，不打开设置（客人不该看到 API key）
      say(t('需要先在设置里填 Gemini API key。'));
      onSettings?.();
      return;
    }
    if (!underlay) return say(t('这一层还没有底图：先上传平面图。'));
    const f = floor;
    setBusy(t('AI 正在重新读{0}（约 30–90 秒）…', [floorLabel(f)]));
    try {
      let res;
      if (typeof AI.rereadFloor === 'function') res = await AI.rereadFloor(s, underlay, { floorId: f.id, level: LEVEL_WORDS[f.level] || 'other', title: f.meta?.import?.title || '', floor: f, plan });
      else {
        const img = { src: underlay.src, width: underlay.iw || 1600, height: underlay.ih || 1200 };
        const r = await AI.detectPlan(s, img, {});
        const got1 = migratePlan(r.plan).floors[0];
        res = { rooms: got1.rooms, openings: got1.openings, underlay: { ...r.underlay, iw: img.width, ih: img.height } };
      }
      const got = res?.floor || res?.plan?.floors?.[0] || res || {};
      const stairs = plan.stairs.filter((st) => st.from === f.id || st.to === f.id);
      const rooms = (got.rooms || []).filter((r) => !r.stairId && !(r.type === 'stair' && stairs.length));
      remember();
      setPlan((p) => migratePlan(updateFloor(p, f.id, (fl) => ({ ...fl, rooms: [...fl.rooms.filter((r) => r.stairId), ...rooms], openings: got.openings || [] }))));
      if (res?.underlay) setUnderlays((m) => ({ ...m, [f.id]: { ...m[f.id], ...res.underlay } }));
      setTool('select');
      say(t('重新识别了{0}：{1} 个房间、{2} 个门窗。', [floorLabel(f), rooms.length, (got.openings || []).length]), true);
    } catch (e) {
      say(e?.message || String(e));
    } finally {
      setBusy('');
    }
  };

  // ── 指针（鼠标 / 手指 / 笔；两根手指 = 捏合缩放 + 平移） ──
  const revertDrag = (d) => {
    if (!d) return;
    if (d.kind === 'moveRoom' || d.kind === 'resize') updateRoom(d.id, d.orig);
    else if (d.kind === 'moveOpening') updateOpening(d.id, d.orig);
    else if (d.kind === 'underlay') setUnderlays((m) => ({ ...m, [d.floor]: d.orig }));
    else if (d.kind === 'draw' || d.kind === 'drawStair') setPreview(null);
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const r = svgRef.current.getBoundingClientRect();
    revertDrag(drag.current);
    drag.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  };

  const selectRoomOrStair = (r) => {
    if (r.stairId) setSel({ type: 'stair', id: r.stairId });
    else setSel({ type: 'room', id: r.id });
  };

  const onDown = (e) => {
    setMenu(null);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 指针已经被系统收回（iPad 上偶尔会这样）时 setPointerCapture 会抛错：不能因此整个按下都不算
    try {
      svgRef.current.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.current.size === 2) return startPinch();
    if (pointers.current.size > 2) return;
    const v = viewRef.current;
    if (e.button === 1 || e.button === 2) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy };
      return;
    }
    const p = toM(e);
    const target = e.target.closest('[data-kind]');
    if (tool === 'select') {
      if (target?.dataset.kind === 'handle') {
        const r = floor.rooms.find((x) => x.id === target.dataset.id);
        drag.current = { kind: 'resize', id: r.id, stair: r.stairId, h: target.dataset.h, start: p, orig: { x: r.x, y: r.y, w: r.w, d: r.d } };
      } else if (target?.dataset.kind === 'opening') {
        const o = floor.openings.find((x) => x.id === target.dataset.id);
        setSel({ type: 'opening', id: o.id });
        drag.current = { kind: 'moveOpening', id: o.id, start: p, orig: { ...o } };
      } else if (target?.dataset.kind === 'room') {
        const r = floor.rooms.find((x) => x.id === target.dataset.id);
        selectRoomOrStair(r);
        drag.current = { kind: 'moveRoom', id: r.id, stair: r.stairId, start: p, orig: { x: r.x, y: r.y, w: r.w, d: r.d } };
      } else {
        setSel(null);
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy };
      }
    } else if (tool === 'room' || tool === 'stair') {
      drag.current = { kind: tool === 'room' ? 'draw' : 'drawStair', start: { x: snap(p.x), y: snap(p.y) } };
      setPreview({ x: snap(p.x), y: snap(p.y), w: 0, d: 0 });
    } else if (OPENING_TOOLS.includes(tool)) {
      if (e.pointerType === 'mouse') {
        // 鼠标：悬停时已经有金色预览，按下就放
        const op = preview?.opening || openingAt(p, 22);
        if (op) addOpening(op);
        else drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy };
      } else {
        // 手指 / 笔：没有悬停 —— 松手时才放（这期间第二根手指放上来 = 捏合，不放门窗；拖动 = 平移）
        drag.current = { kind: 'tapOpening', start: p, x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy };
      }
    } else if (tool === 'calibrate') {
      if (!calib || calib.p2) setCalib({ p1: p, p2: null, len: '' });
      else setCalib({ ...calib, p2: p });
    } else if (tool === 'underlay' && underlay) {
      drag.current = { kind: 'underlay', floor: floor.id, start: p, orig: { ...underlay } };
    }
  };

  const onMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d?.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const r = svgRef.current.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const k = dist / d.d;
      const pmx = d.mx;
      const pmy = d.my;
      setView((v) => {
        const s = Math.max(MIN_S, Math.min(MAX_S, v.s * k));
        // 先以旧的中点缩放，再跟着中点平移
        return { s, ox: pmx - ((pmx - v.ox) * s) / v.s + (mx - pmx), oy: pmy - ((pmy - v.oy) * s) / v.s + (my - pmy) };
      });
      drag.current = { ...d, d: dist, mx, my };
      return;
    }
    const p = toM(e);
    if (!d) {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        if (OPENING_TOOLS.includes(tool)) {
          const op = openingAt(p, 22);
          setPreview(op ? { opening: op } : null);
        } else if (tool === 'calibrate' && calib?.p1 && !calib.p2) setPreview({ calibTo: p });
      }
      return;
    }
    if (d.kind === 'tapOpening') {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) drag.current = { ...d, kind: 'pan' };
      return;
    }
    if (d.kind === 'pan') setView((v) => ({ ...v, ox: d.ox + e.clientX - d.x, oy: d.oy + e.clientY - d.y }));
    else if (d.kind === 'draw' || d.kind === 'drawStair') {
      const x0 = d.start.x;
      const y0 = d.start.y;
      const x1 = snap(p.x);
      const y1 = snap(p.y);
      setPreview({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), d: Math.abs(y1 - y0), stair: d.kind === 'drawStair' });
    } else if (d.kind === 'moveRoom') {
      let x = snap(d.orig.x + p.x - d.start.x);
      let y = snap(d.orig.y + p.y - d.start.y);
      const { xs, ys } = snapTargets(d.id, d.stair);
      x += snapEdges([x, x + d.orig.w], xs);
      y += snapEdges([y, y + d.orig.d], ys);
      updateRoom(d.id, { x: r2(x), y: r2(y) });
    } else if (d.kind === 'resize') {
      const o = d.orig;
      let { x, y, w, d: dd } = o;
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      const { xs, ys } = snapTargets(d.id, d.stair);
      if (d.h.includes('w')) {
        let nx = snap(o.x + dx);
        nx += snapEdges([nx], xs);
        w = o.x + o.w - nx;
        x = nx;
      }
      if (d.h.includes('e')) {
        let ne = snap(o.x + o.w + dx);
        ne += snapEdges([ne], xs);
        w = ne - o.x;
      }
      if (d.h.includes('n')) {
        let ny = snap(o.y + dy);
        ny += snapEdges([ny], ys);
        dd = o.y + o.d - ny;
        y = ny;
      }
      if (d.h.includes('s')) {
        let ns = snap(o.y + o.d + dy);
        ns += snapEdges([ns], ys);
        dd = ns - o.y;
      }
      if (w >= 0.6 && dd >= 0.6) updateRoom(d.id, { x: r2(x), y: r2(y), w: r2(w), d: r2(dd) });
    } else if (d.kind === 'moveOpening') {
      const o = d.orig;
      const horiz = Math.abs(o.y1 - o.y2) < 0.01;
      const delta = snap(horiz ? p.x - d.start.x : p.y - d.start.y);
      if (horiz) updateOpening(d.id, { x1: r2(o.x1 + delta), x2: r2(o.x2 + delta) });
      else updateOpening(d.id, { y1: r2(o.y1 + delta), y2: r2(o.y2 + delta) });
    } else if (d.kind === 'underlay') {
      setUnderlays((m) => ({ ...m, [d.floor]: { ...m[d.floor], x: d.orig.x + p.x - d.start.x, y: d.orig.y + p.y - d.start.y } }));
    }
  };

  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'pinch') {
      // 松开一根手指：结束捏合，剩下那根不接着拖（避免误操作）
      if (pointers.current.size < 2) drag.current = pointers.current.size ? { kind: 'idle' } : null;
      return;
    }
    if (d?.kind === 'idle') {
      if (!pointers.current.size) drag.current = null;
      return;
    }
    drag.current = null;
    // 系统打断（来电、手势）：拖到一半的东西复原
    if (e.type === 'pointercancel') {
      revertDrag(d);
      return;
    }
    if (d?.kind === 'tapOpening') {
      const op = openingAt(d.start, 40);
      if (op) addOpening(op);
      return;
    }
    if (d?.kind === 'draw' && preview && preview.w >= 0.6 && preview.d >= 0.6) {
      const type = floor.rooms.some((r) => !r.stairId) ? 'bedroom' : level === 0 ? 'living' : 'family';
      const r = { id: uid('r'), type, name: ROOM_TYPES[type].zh, x: r2(preview.x), y: r2(preview.y), w: r2(preview.w), d: r2(preview.d) };
      setFloor((f) => ({ ...f, rooms: [...f.rooms, r] }));
      setSel({ type: 'room', id: r.id });
    }
    if (d?.kind === 'drawStair' && preview && preview.w >= 0.8 && preview.d >= 0.8) placeStair({ x: r2(preview.x), y: r2(preview.y), w: r2(preview.w), d: r2(preview.d) });
    if (d?.kind === 'draw' || d?.kind === 'drawStair') setPreview(null);
  };

  const onWheel = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };

  useEffect(() => {
    const el = svgRef.current;
    const prevent = (e) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    el.addEventListener('contextmenu', prevent);
    return () => {
      el.removeEventListener('wheel', prevent);
      el.removeEventListener('contextmenu', prevent);
    };
  }, []);

  const removeSel = useCallback(() => {
    if (!sel) return;
    remember();
    if (sel.type === 'stair') setPlan((p) => removeStair(p, sel.id));
    else if (sel.type === 'room') setFloor((f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== sel.id) }));
    else setFloor((f) => ({ ...f, openings: f.openings.filter((o) => o.id !== sel.id) }));
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, remember]);

  useEffect(() => {
    const onKey = (e) => {
      if (importFile || e.target.closest('input,select,textarea')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      const i = plan.floors.findIndex((f) => f.id === fidRef.current);
      if (e.key === '[' || e.key === 'PageDown') {
        e.preventDefault();
        if (i > 0) switchFloor(plan.floors[i - 1].id);
      } else if (e.key === ']' || e.key === 'PageUp') {
        e.preventDefault();
        if (i < plan.floors.length - 1) switchFloor(plan.floors[i + 1].id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
      else if (e.key === 'Escape') {
        setSel(null);
        setCalib(null);
        setPreview(null);
        setMenu(null);
        setAsk(null);
      } else {
        const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
        // 和工具栏一样：没有底图时量尺、移动底图用不了（按钮是灰的 / 许愿模式里不出现），快捷键也不切过去
        if (tl && (underlay || !UNDERLAY_TOOLS.includes(tl.id))) setTool(tl.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeSel, underlay, plan, fid, undo, importFile]);

  // 量尺校准：这一层（或所有楼层）的房间、门窗、楼梯、底图一起按比例缩放 —— AI 读错比例时，量一段就全部改对
  const sharedSheet = plan.floors.length > 1 && plan.floors.every((f) => f.meta?.import?.page != null && f.meta.import.page === plan.floors[0].meta?.import?.page);
  const calibEvery = plan.floors.length > 1 && (calibAll ?? sharedSheet);
  const applyCalibration = () => {
    if (!calib?.p1 || !calib?.p2 || !underlay) return;
    const real = Number(calib.len);
    const meas = Math.hypot(calib.p2.x - calib.p1.x, calib.p2.y - calib.p1.y);
    if (!real || !meas) return;
    const f = real / meas;
    const p1 = calib.p1;
    const sx = (x) => r2(p1.x + (x - p1.x) * f);
    const sy = (y) => r2(p1.y + (y - p1.y) * f);
    const ids = calibEvery ? plan.floors.map((x) => x.id) : [floor.id];
    remember();
    const scaled = {
      ...plan,
      floors: plan.floors.map((fl) =>
        ids.includes(fl.id)
          ? {
              ...fl,
              rooms: fl.rooms.map((r) => ({ ...r, x: sx(r.x), y: sy(r.y), w: r2(r.w * f), d: r2(r.d * f) })),
              openings: fl.openings.map((o) => ({ ...o, x1: sx(o.x1), y1: sy(o.y1), x2: sx(o.x2), y2: sy(o.y2) })),
            }
          : fl,
      ),
      stairs: plan.stairs.map((s) => (ids.includes(s.from) || ids.includes(s.to) ? { ...s, x: sx(s.x), y: sy(s.y), w: r2(s.w * f), d: r2(s.d * f), ...(s.width ? { width: r2(s.width * f) } : {}) } : s)),
    };
    setPlan(migratePlan(scaled));
    setUnderlays((m) => {
      const out = { ...m };
      for (const id of ids) {
        const u = out[id];
        if (u) out[id] = { ...u, x: p1.x + (u.x - p1.x) * f, y: p1.y + (u.y - p1.y) * f, w: u.w * f, h: u.h * f };
      }
      return out;
    });
    setCalib(null);
    setPreview(null);
    say(calibEvery ? t('比例已校准（×{0}）：所有楼层的房间、门窗和底图一起缩放了。', [f.toFixed(3)]) : t('比例已校准（×{0}）：这一层的房间、门窗和底图一起缩放了。', [f.toFixed(3)]), true);
  };

  const room = sel?.type === 'room' && floor.rooms.find((r) => r.id === sel.id);
  const opening = sel?.type === 'opening' && floor.openings.find((o) => o.id === sel.id);
  const stair = sel?.type === 'stair' && stairById(plan, sel.id);
  const stairRoom = stair && floor.rooms.find((r) => r.stairId === stair.id);
  const handleRoom = room || stairRoom || null;
  const sw = 1 / view.s;

  // 网格
  const grid = useMemo(() => {
    const el = svgRef.current;
    if (!el) return null;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const step = view.s < 20 ? 1 : 0.5;
    const x0 = Math.floor(-view.ox / view.s / step) * step;
    const x1 = (W - view.ox) / view.s;
    const y0 = Math.floor(-view.oy / view.s / step) * step;
    const y1 = (H - view.oy) / view.s;
    const lines = [];
    for (let x = x0; x <= x1; x += step) lines.push(<line key={`x${x.toFixed(2)}`} x1={x} y1={y0} x2={x} y2={y1} className={Math.abs(x % 1) < 0.01 ? 'g1' : 'g2'} strokeWidth={sw} />);
    for (let y = y0; y <= y1; y += step) lines.push(<line key={`y${y.toFixed(2)}`} x1={x0} y1={y} x2={x1} y2={y} className={Math.abs(y % 1) < 0.01 ? 'g1' : 'g2'} strokeWidth={sw} />);
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // 检查：这一层的在前、别的楼层的在后（标楼层名）；点一下 → 换到那一层、选中那个房间
  const roomById = (id) => {
    for (const f of plan.floors) {
      const r = f.rooms.find((x) => x.id === id);
      if (r) return r;
    }
    return null;
  };
  const fmtIssue = (is) => t(is.zh, is.vars.map((v) => (v && typeof v === 'object' ? (v.room ? roomLabel(roomById(v.room)) : v.floor ? floorLabel(floorById(plan, v.floor)) : '') : v)));
  const issueList = [...issues.filter((i) => i.floor === floor.id || i.floor == null), ...issues.filter((i) => i.floor && i.floor !== floor.id)];
  const openIssue = (is) => {
    if (is.floor && floorById(plan, is.floor)) {
      setFid(is.floor);
      setCalib(null);
    }
    const r = is.ids?.[0] && roomById(is.ids[0]);
    if (r) selectRoomOrStair(r);
    setTool('select');
  };
  const errorFloors = new Set(issues.filter((i) => i.level === 'error' && i.floor).map((i) => i.floor));

  const toolHint = {
    select: t('拖房间移动 · 拖角改尺寸 · 点门窗再拖'),
    room: t('按住拖出一个方块 = 一个房间'),
    stair: t('拖出楼梯间：直跑 / L 形 / U 形按长宽自动选'),
    door: t('点一下墙放门'),
    window: t('点一下墙放窗'),
    slider: t('点一下墙放落地趟门'),
    open: t('点一下两个空间之间的墙，把它打通'),
    calibrate: t('点两下量一段已知长度，再输入真实尺寸'),
    underlay: t('拖动底图对齐房间'),
  }[tool];
  // 楼上空着：提示虚线是下面那一层
  const emptyUpper = below && !floor.rooms.some((r) => !r.stairId) && !preview;
  const upperHint = emptyUpper ? (stairsHere.length ? t('虚线是{0}：沿着外墙拉方块；楼梯已经在了', [floorLabel(below)]) : t('虚线是{0}：沿着外墙拉方块；用「楼梯」工具连上下两层', [floorLabel(below)])) : '';

  const roomCount = floor.rooms.filter((r) => !r.stairId).length;
  const stat = t('{0}：{1} 个房间 · {2} 个门窗 · {3} 段墙', [floorLabel(floor), roomCount, floor.openings.length, walls.length]);

  // 楼梯的检查（只看这一座）
  const stairIssues = stair ? issues.filter((i) => i.ids?.some((id) => id.startsWith(`${stair.id}-`)) && i.code.startsWith('stair')) : [];
  const stairGeo = stair ? stairFlights(plan, stair.id) : null;
  const stairOverlaps = stair
    ? [stair.from, stair.to].some((id) => floorById(plan, id)?.rooms.some((r) => !r.stairId && Math.min(r.x + r.w, stair.x + stair.w) - Math.max(r.x, stair.x) > 0.05 && Math.min(r.y + r.d, stair.y + stair.d) - Math.max(r.y, stair.y) > 0.05))
    : false;

  // 属性：宽屏是右边一栏；≤ 900px 是平面图底部可以收起的抽屉（标题行写着现在选中的是什么）
  const sheetTitle = room ? t('房间') : opening ? t('门窗') : stair ? t('楼梯') : t('整体');
  const sheetSummary = room
    ? `${roomLabel(room)} · ${room.w.toFixed(2)} × ${room.d.toFixed(2)} m`
    : opening
      ? `${L(OPENING_KINDS[opening.kind])} · ${Math.hypot(opening.x2 - opening.x1, opening.y2 - opening.y1).toFixed(2)} m`
      : stair
        ? `${floorLabel(floorById(plan, stair.from))} → ${floorLabel(floorById(plan, stair.to))} · ${stair.w.toFixed(2)} × ${stair.d.toFixed(2)} m`
        : stat;

  const roomTypes = Object.entries(ROOM_TYPES).filter(([k]) => k !== 'stair' && (k !== 'void' || level > 0));

  const side = (
    <>
      {msg && (
        <p className="pe-msg">
          {msg}
          {msgUndo && past.current.length > 0 && (
            <button type="button" className="pe-msg-undo" onClick={undo}>
              {t('撤销')}
            </button>
          )}
        </p>
      )}
      {room ? (
        <div className="pe-insp">
          <h4>{t('房间')}</h4>
          <div className="pe-types">
            {roomTypes.map(([k, rt]) => (
              <button
                key={k}
                type="button"
                className={room.type === k ? 'on' : ''}
                style={{ '--c': rt.color }}
                onClick={() => {
                  const cur = ROOM_TYPES[room.type];
                  const isDefault = !room.name || room.name === cur?.zh || room.name === cur?.en || room.name === L(cur);
                  updateRoom(room.id, { type: k, name: isDefault ? rt.zh : room.name });
                }}
              >
                <i />
                {L(rt)}
              </button>
            ))}
          </div>
          <label>
            {t('名字')}
            <input value={room.name === '' ? '' : roomLabel(room)} onChange={(e) => updateRoom(room.id, { name: e.target.value })} />
          </label>
          <div className="pe-nums">
            {[
              ['x', 'X', -99],
              ['y', 'Y', -99],
              ['w', t('宽'), 0.6],
              ['d', t('深'), 0.6],
            ].map(([k, l, min]) => (
              <label key={k}>
                {l}
                <NumField value={room[k]} min={min} max={99} onChange={(v) => updateRoom(room.id, { [k]: r2(v) })} />
              </label>
            ))}
          </div>
          <button type="button" className="pe-btn danger" onClick={removeSel}>
            <Icon name="trash" size={16} />
            {t('删除房间')}
          </button>
        </div>
      ) : opening ? (
        <div className="pe-insp">
          <h4>{t('门窗')}</h4>
          <div className="pe-types">
            {Object.entries(OPENING_KINDS).map(([k, ok]) => (
              <button key={k} type="button" className={opening.kind === k ? 'on' : ''} onClick={() => updateOpening(opening.id, { kind: k })}>
                {L(ok)}
              </button>
            ))}
          </div>
          <label>
            {t('宽度（m）')}
            <NumField
              value={r2(Math.hypot(opening.x2 - opening.x1, opening.y2 - opening.y1))}
              min={0.3}
              max={20}
              onChange={(w) => {
                const horiz = Math.abs(opening.y1 - opening.y2) < 0.01;
                const c = horiz ? (opening.x1 + opening.x2) / 2 : (opening.y1 + opening.y2) / 2;
                updateOpening(opening.id, horiz ? { x1: r2(c - w / 2), x2: r2(c + w / 2) } : { y1: r2(c - w / 2), y2: r2(c + w / 2) });
              }}
            />
          </label>
          {(opening.kind === 'window' || opening.kind === 'slider') && (
            <div className="pe-nums">
              <label>
                {t('窗台高')}
                <NumField value={opening.sill ?? OPENING_KINDS[opening.kind].sill} min={0} max={3} onChange={(v) => updateOpening(opening.id, { sill: v })} />
              </label>
              <label>
                {t('窗顶高')}
                <NumField value={opening.head ?? OPENING_KINDS[opening.kind].head} min={0.5} max={4.5} onChange={(v) => updateOpening(opening.id, { head: v })} />
              </label>
            </div>
          )}
          <button type="button" className="pe-btn danger" onClick={removeSel}>
            <Icon name="trash" size={16} />
            {t('删除')}
          </button>
        </div>
      ) : stair ? (
        <div className="pe-insp">
          <h4>{t('楼梯')}</h4>
          <p className="pe-st-link">
            {floorLabel(floorById(plan, stair.from))} → {floorLabel(floorById(plan, stair.to))}
          </p>
          <div className="pe-field">
            <span>{t('形状')}</span>
            <div className="pe-seg" role="group" aria-label={t('形状')}>
              {SHAPES.map(([k, zh]) => (
                <button key={k} type="button" className={stair.shape === k ? 'on' : ''} aria-pressed={stair.shape === k} onClick={() => (remember(), setPlan((p) => updateStair(p, stair.id, { shape: k })))}>
                  {t(zh)}
                </button>
              ))}
            </div>
          </div>
          <div className="pe-field">
            <span>{t('上楼方向')}</span>
            <button type="button" className="pe-dir" onClick={() => setPlan((p) => updateStair(p, stair.id, { up: DIR_NEXT[stair.up] }))} aria-label={t('换方向')}>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ transform: `rotate(${DIR_ROT[stair.up]}deg)` }} aria-hidden="true">
                <path d="M12 20V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <b>{t(DIR_ZH[stair.up])}</b>
              <em>{t('换方向')}</em>
            </button>
          </div>
          {stair.shape !== 'straight' && (
            <div className="pe-field">
              <span>{t('转向')}</span>
              <div className="pe-seg" role="group" aria-label={t('转向')}>
                {[
                  ['left', '左'],
                  ['right', '右'],
                ].map(([k, zh]) => (
                  <button key={k} type="button" className={stair.turn === k ? 'on' : ''} aria-pressed={stair.turn === k} onClick={() => setPlan((p) => updateStair(p, stair.id, { turn: k }))}>
                    {t(zh)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {stair.shape === 'L' && (
            <label>
              {t('梯段宽（m）')}
              <NumField value={stair.width} min={0.6} max={2} onChange={(v) => setPlan((p) => updateStair(p, stair.id, { width: r2(v) }))} />
            </label>
          )}
          <div className="pe-nums">
            {[
              ['x', 'X', -99],
              ['y', 'Y', -99],
              ['w', t('宽'), 0.8],
              ['d', t('深'), 0.8],
            ].map(([k, l, min]) => (
              <label key={k}>
                {l}
                <NumField value={stair[k]} min={min} max={99} onChange={(v) => setPlan((p) => updateStair(p, stair.id, { [k]: r2(v) }))} />
              </label>
            ))}
          </div>
          {stairGeo && <p className="pe-st-info">{t('{0} 级踏步 · 每级高 {1} mm · 踏步宽 {2} mm', [stairGeo.risers, Math.round(stairGeo.rise * 1000), Math.round(stairGeo.tread * 1000)])}</p>}
          {stairIssues.length > 0 && (
            <div className="pe-issues">
              {stairIssues.map((x, i) => (
                <p key={i}>
                  <Icon name="alert" size={15} />
                  {fmtIssue(x)}
                </p>
              ))}
            </div>
          )}
          {stairOverlaps && (
            <button
              type="button"
              className="pe-btn"
              onClick={() => {
                remember();
                setPlan((p) => [stair.from, stair.to].reduce((acc, id) => updateFloor(acc, id, (f) => carveFloor(f, stair)), p));
              }}
            >
              {t('让出楼梯的位置')}
            </button>
          )}
          <button type="button" className="pe-btn danger" onClick={removeSel}>
            <Icon name="trash" size={16} />
            {t('删除楼梯')}
          </button>
        </div>
      ) : (
        <div className="pe-insp">
          <h4>{t('整体')}</h4>
          <label>
            {t('方案名')}
            <input value={t(plan.name || '')} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
          </label>
          <div className="pe-nums">
            <label title={t('平面图上方是北 = 0°；顺时针转')}>
              {t('北方（°）')}
              <NumField value={plan.north || 0} step={15} min={-720} max={720} onChange={(v) => setPlan({ ...plan, north: ((Math.round(v) % 360) + 360) % 360 })} />
            </label>
            <div className="pe-compass" style={{ transform: `rotate(${plan.north || 0}deg)` }} aria-hidden="true">
              <span>N</span>
            </div>
          </div>
          <h4 className="pe-fl-h">{floorLabel(floor)}</h4>
          <label>
            {t('楼层名')}
            <input value={floor.name} placeholder={t(FLOOR_NAMES[level] || '')} onChange={(e) => setFloor((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <div className="pe-nums">
            <label>
              {t('天花高（m）')}
              <NumField value={floor.ceil} min={2.4} max={4.5} onChange={(v) => setFloor((f) => ({ ...f, ceil: v }))} />
            </label>
            {above && (
              <label>
                {t('楼层高（m）')}
                <NumField value={floor.height} min={2.6} max={6} onChange={(v) => setFloor((f) => ({ ...f, height: v }))} />
              </label>
            )}
          </div>
          {above && <p className="pe-fl-hint">{t('楼层高 = 这一层地面到上一层地面（含楼板）')}</p>}
          {underlay && (
            <label>
              {t('底图透明度')}
              <input type="range" min="0" max="1" step="0.05" value={underlay.opacity ?? 0.55} onChange={(e) => setUnderlays((m) => ({ ...m, [floor.id]: { ...underlay, opacity: Number(e.target.value) } }))} />
            </label>
          )}
          {issueList.length > 0 && (
            <div className="pe-issues">
              {issueList.map((x, i) => (
                <button key={i} type="button" className={`pe-issue ${x.level}`} onClick={() => openIssue(x)}>
                  <Icon name="alert" size={15} />
                  <span>
                    {x.floor && x.floor !== floor.id && <b>{floorLabel(floorById(plan, x.floor))} · </b>}
                    {fmtIssue(x)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <ul className="pe-howto">
            <li>{tj('{0}：按住拖出方块；边会自动吸到旁边房间的边上。', [<b key="b">{t('画房间')}</b>])}</li>
            <li>{tj('{0}：拖出楼梯间，上下两层一起出现；在哪一层拖都一起动。', [<b key="b">{t('楼梯')}</b>])}</li>
            <li>{tj('{0}：左上角换楼层；「＋」加一层，楼上会看到下面那层的虚线。', [<b key="b">{t('楼层')}</b>])}</li>
            <li>{tj('{0}：选工具后点一下墙（鼠标会先出现金色预览）。', [<b key="b">{t('门 / 窗')}</b>])}</li>
            <li>{tj('{0}：两个空间之间不要墙（开放式厨房）。客厅 / 餐厅 / 玄关 / 走廊之间默认已打通。', [<b key="b">{t('打通')}</b>])}</li>
            <li>{tj('{0}：决定阳光从哪边进来（西晒看得出来）。', [<b key="b">{t('北方')}</b>])}</li>
            <li>{tj('{0}：捏合缩放、拖动平移。', [<b key="b">{t('双指')}</b>])}</li>
          </ul>
        </div>
      )}
      <p className="pe-stat">{stat}</p>
    </>
  );

  // ── 楼梯的样子：下层 = 踏步线 + 走向箭头 +「上」；上层 = 斜线的洞 +「下」 ──
  const stairArt = (s) => {
    const g = stairFlights(plan, s.id);
    const path = stairPath(plan, s.id);
    if (!g || !path) return null;
    const lower = s.from === floor.id;
    const fs = Math.min(15 * sw, Math.min(s.w, s.d) * 0.42);
    const pts = path.points.map((q) => `${q.x},${q.y}`).join(' ');
    const lines = [];
    if (lower)
      g.flights.forEach((fl) => {
        const { x0, y0, x1, y1 } = fl.rect;
        for (let i = 0; i < fl.risers; i++) {
          const o = i * fl.tread;
          if (fl.dir === 'N') lines.push([x0, y1 - o, x1, y1 - o]);
          else if (fl.dir === 'S') lines.push([x0, y0 + o, x1, y0 + o]);
          else if (fl.dir === 'E') lines.push([x0 + o, y0, x0 + o, y1]);
          else lines.push([x1 - o, y0, x1 - o, y1]);
        }
        lines.push(fl.dir === 'N' || fl.dir === 'S' ? [x0, y0, x0, y1] : [x0, y0, x1, y0]);
        lines.push(fl.dir === 'N' || fl.dir === 'S' ? [x1, y0, x1, y1] : [x0, y1, x1, y1]);
      });
    // 「上」写在第一跑的中间，「下」写在楼梯洞的中间
    const f0 = g.flights[0]?.rect;
    const lab = lower && f0 ? { x: (f0.x0 + f0.x1) / 2, y: (f0.y0 + f0.y1) / 2 } : { x: s.x + s.w / 2, y: s.y + s.d / 2 };
    const mouth = lower ? g.entry.seg : g.exit.seg;
    return (
      <g key={`st-${s.id}`} className={`pe-stair ${lower ? 'lo' : 'hi'} ${stair?.id === s.id ? 'on' : ''}`} pointerEvents="none">
        {!lower && <rect x={s.x} y={s.y} width={s.w} height={s.d} className="pe-stair-void" />}
        {lines.map(([a, b, c, d], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={d} className="pe-stair-tread" strokeWidth={sw} />
        ))}
        {g.landings.map((ld, i) => (
          <rect key={`l${i}`} x={ld.rect.x0} y={ld.rect.y0} width={ld.rect.x1 - ld.rect.x0} height={ld.rect.y1 - ld.rect.y0} className="pe-stair-landing" strokeWidth={sw} />
        ))}
        <polyline points={pts} className={`pe-stair-path ${lower ? '' : 'dn'}`} strokeWidth={1.6 * sw} markerEnd={lower ? 'url(#pe-arrow)' : undefined} />
        <line x1={mouth.x0} y1={mouth.y0} x2={mouth.x1} y2={mouth.y1} className="pe-stair-mouth" strokeWidth={4 * sw} />
        <text x={lab.x} y={lab.y + fs * 0.35} fontSize={fs} textAnchor="middle" className="pe-stair-label">
          {lower ? t('上') : t('下')}
        </text>
      </g>
    );
  };

  const floorBar = (
    <div className={`pe-floors ${narrow ? 'full' : ''}`} ref={floorsRef}>
      <div className="pe-floors-row" role="tablist" aria-label={t('楼层')}>
        {plan.floors.map((f) => (
          <span key={f.id} className="pe-fl-tab">
            <button type="button" role="tab" aria-selected={f.id === floor.id} className={f.id === floor.id ? 'on' : ''} onClick={() => switchFloor(f.id)}>
              {floorLabel(f, phone)}
              {errorFloors.has(f.id) && <i className="pe-fl-dot" aria-hidden="true" />}
            </button>
            {f.id === floor.id && (
              <button type="button" className="pe-fl-more" aria-label={t('这一层的选项')} aria-expanded={menu === 'floor'} onClick={() => setMenu(menu === 'floor' ? null : 'floor')}>
                <Icon name="more" size={16} />
              </button>
            )}
          </span>
        ))}
        <button type="button" className="pe-fl-add" aria-label={t('加一层')} title={t('加一层')} aria-expanded={menu === 'add'} disabled={plan.floors.length >= MAX_FLOORS} onClick={() => setMenu(menu === 'add' ? null : 'add')}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      {menu === 'floor' && (
        <div className="pe-fl-menu" role="menu">
          <label className="pe-fl-rename">
            <span>{t('重命名')}</span>
            <input value={floor.name} placeholder={t(FLOOR_NAMES[level] || '')} onChange={(e) => setFloor((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && setMenu(null)} />
          </label>
          <button type="button" role="menuitem" disabled={!above} onClick={() => doMoveFloor(1)}>
            {t('往上移')}
          </button>
          <button type="button" role="menuitem" disabled={!below} onClick={() => doMoveFloor(-1)}>
            {t('往下移')}
          </button>
          <button type="button" role="menuitem" className="danger" disabled={plan.floors.length <= 1} onClick={askRemoveFloor}>
            {t('删除这一层')}
          </button>
        </div>
      )}
      {menu === 'add' && (
        <div className="pe-fl-menu" role="menu">
          <p>{t('加一层')}</p>
          <button type="button" role="menuitem" onClick={() => doAddFloor('blank')}>
            {t('空白（带着楼梯）')}
          </button>
          <button type="button" role="menuitem" onClick={() => doAddFloor('all')}>
            {t('复制这一层')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={`pe ${narrow ? 'narrow' : ''} ${upload ? '' : 'draw-only'}`} role="dialog" aria-modal="true" aria-label={t('平面图')}>
      <style>{PE_FLOORS_CSS}</style>
      <header className="pe-head">
        <div className="pe-title">
          <p className="eyebrow">{isEn() ? BRAND.studioEn : BRAND.studio}</p>
          <b>{t('平面图')}</b>
        </div>
        {/* 英文在 iPad 横放（1024–1279）和手机上换短的字（lbl-short：Template…），整排放得下，不用横滑 */}
        <div className="pe-head-actions" ref={actsRef}>
          {/* 许愿模式不放文件选择：连隐藏的 <input type=file> 都不渲染 */}
          {upload && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button type="button" className="pe-btn" onClick={() => fileRef.current?.click()} title={t('上传平面图')} aria-label={t('上传平面图')}>
                <Icon name="upload" size={17} />
                <span>{t('上传平面图')}</span>
              </button>
            </>
          )}
          {canAI && (
            <button type="button" className="pe-btn ai" onClick={rereadThisFloor} disabled={!!busy || !underlay} title={t('重新识别这一层')} aria-label={t('重新识别这一层')}>
              <Icon name="wand" size={17} />
              <span>{t('重新识别这一层')}</span>
            </button>
          )}
          {/* 原生下拉（iPad 上是系统的选择器）叠在一颗胶囊上、透明：胶囊只有「用模板…」那么宽，
              不会被最长的模板名撑到 300px；箭头是自己画的，淡出、横滑都不会把它切掉 */}
          <label className="pe-select">
            <Icon name="start" size={16} />
            <span className="pe-select-label" aria-hidden="true">
              <span className="lbl-long">{t('用模板…')}</span>
              {isEn() && <span className="lbl-short">{t('模板…')}</span>}
            </span>
            <Icon name="down" size={14} className="pe-select-chev" />
            <select
              value=""
              aria-label={t('用模板…')}
              onChange={(e) => {
                if (!e.target.value) return;
                remember();
                const p = templatePlan(e.target.value);
                // 底图按楼层的顺序跟过去（模板的楼层 id 不一样）
                setUnderlays((m) => {
                  const out = {};
                  plan.floors.forEach((f, i) => {
                    if (m[f.id] && p.floors[i]) out[p.floors[i].id] = m[f.id];
                  });
                  return out;
                });
                setPlan(p);
                setFid(p.floors[Math.min(level, p.floors.length - 1)].id);
                setSel(null);
                setTimeout(() => fit(p, null), 20);
              }}
            >
              <option value="">{t('用模板…')}</option>
              {TEMPLATES.filter((tp) => !tp.hidden).map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {L(tp)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pe-head-right">
          <button type="button" className="pe-btn ghost" onClick={onCancel}>
            {t('取消')}
          </button>
          <button
            type="button"
            className="pe-btn gold"
            disabled={!hasAnyRooms}
            onClick={() => {
              const out = snapAll(plan, 0.06);
              const us = {};
              for (const f of out.floors) if (underlays[f.id]) us[f.id] = underlays[f.id];
              onApply(out, us);
            }}
          >
            <Icon name="sparkles" size={17} />
            <span>{t('生成 3D')}</span>
          </button>
        </div>
      </header>

      <div className="pe-body">
        <nav className="pe-tools" aria-label={t('工具')}>
          {TOOLS.filter((tl) => upload || underlay || !UNDERLAY_TOOLS.includes(tl.id)).map((tl) => (
            <button
              key={tl.id}
              type="button"
              className={tool === tl.id ? 'on' : ''}
              aria-pressed={tool === tl.id}
              onClick={() => (setTool(tl.id), setPreview(null), setCalib(null))}
              title={`${t(tl.zh)} (${tl.key.toUpperCase()})`}
              disabled={(tl.id === 'calibrate' || tl.id === 'underlay') && !underlay}
            >
              {tl.icon === 'stair' ? <StairIcon size={20} /> : <Icon name={tl.icon} size={20} stroke={1.6} />}
              <em>{t(tl.zh)}</em>
            </button>
          ))}
        </nav>

        <div className="pe-canvas">
          <svg
            ref={svgRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={(e) => e.pointerType === 'mouse' && !drag.current && setPreview((p) => (p?.opening || p?.calibTo ? null : p))}
            onWheel={onWheel}
            className={`tool-${tool}`}
          >
            <defs>
              <pattern id="pe-hatch" patternUnits="userSpaceOnUse" width="0.22" height="0.22" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="0.22" className="pe-hatch-line" strokeWidth="0.035" />
              </pattern>
              <marker id="pe-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="pe-arrow-head" />
              </marker>
            </defs>
            <g transform={`translate(${view.ox},${view.oy}) scale(${view.s})`}>
              <g className="grid">{grid}</g>
              {underlay && <image href={underlay.src} x={underlay.x} y={underlay.y} width={underlay.w} height={underlay.h} opacity={underlay.opacity ?? 0.55} preserveAspectRatio="none" />}
              {/* 下面那一层：淡淡的底色 + 虚线墙（只看、不能点；画房间时边会吸过去） */}
              {below && (
                <g className="pe-ghost" pointerEvents="none">
                  {below.rooms
                    .filter((r) => !r.stairId)
                    .map((r) => (
                      <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.d} className="pe-ghost-room" />
                    ))}
                  {ghostWalls.map((w) => {
                    const [x1, y1, x2, y2] = w.axis === 'x' ? [w.a, w.c, w.b, w.c] : [w.c, w.a, w.c, w.b];
                    return <line key={w.id} x1={x1} y1={y1} x2={x2} y2={y2} className="pe-ghost-wall" strokeWidth={1.5 * sw} strokeDasharray={`${6 * sw} ${4 * sw}`} />;
                  })}
                  {below.rooms
                    .filter((r) => !r.stairId && Math.min(r.w, r.d) * view.s >= 60)
                    .map((r) => {
                      const lab = roomLabel(r);
                      const fs = Math.min(11 * sw, (r.w * 0.8) / emWidth(lab));
                      return (
                        <text key={`gl-${r.id}`} x={r.x + 0.12} y={r.y + 0.12 + fs} fontSize={fs} className="pe-ghost-label">
                          {lab}
                        </text>
                      );
                    })}
                </g>
              )}
              {floor.rooms.map((r) => {
                const isStair = !!r.stairId;
                const on = (room && room.id === r.id) || (stair && r.stairId === stair.id);
                const isVoid = !!ROOM_TYPES[r.type]?.void;
                const label = roomLabel(r);
                const dims = `${r.w.toFixed(2)} × ${r.d.toFixed(2)} m`;
                // 字号跟着房间宽度走：英文名长，小房间里也要放得下（必要时折两行）
                const lab = fitLabel(label, r.w, r.d, sw);
                const fs = lab.fs;
                const fd = Math.min(11 * sw, (r.w * 0.86) / emWidth(dims), r.d / 4.5);
                const cx = r.x + r.w / 2;
                const lh = fs * 1.12;
                // 房间在屏幕上太小（< 70px）：只写名字，尺寸点开房间看
                const showDims = Math.min(r.w, r.d) * view.s >= DIM_MIN_PX;
                const y0 = r.y + r.d / 2 - ((lab.lines.length - 1) * lh) / 2 + (showDims ? 0 : fs * 0.35);
                return (
                  <g key={r.id}>
                    <rect
                      data-kind="room"
                      data-id={r.id}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.d}
                      fill={ROOM_TYPES[r.type]?.color || 'var(--bg-deep)'}
                      className={`pe-room ${on ? 'on' : ''} ${isStair ? 'is-stair' : ''}`}
                      strokeWidth={sw * (on ? 2.5 : 1)}
                    />
                    {isVoid && <rect x={r.x} y={r.y} width={r.w} height={r.d} fill="url(#pe-hatch)" pointerEvents="none" />}
                    {!isStair && (
                      <text x={cx} y={y0} fontSize={fs} textAnchor="middle" className="pe-label">
                        {lab.lines.map((ln, i) => (
                          <tspan key={i} x={cx} dy={i ? lh : 0}>
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    )}
                    {!isStair && showDims && (
                      <text x={cx} y={y0 + (lab.lines.length - 1) * lh + fs * 0.6 + fd * 1.1} fontSize={fd} textAnchor="middle" className="pe-dim">
                        {dims}
                      </text>
                    )}
                  </g>
                );
              })}
              {stairsHere.map(stairArt)}
              {/* 墙 + 门窗（由房间自动生成） */}
              {walls.map((w) =>
                w.pieces.map((p, i) => {
                  const [x1, y1, x2, y2] = w.axis === 'x' ? [p.a, w.c, p.b, w.c] : [w.c, p.a, w.c, p.b];
                  return <line key={`${w.id}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`pe-wall k-${p.kind}`} strokeWidth={p.kind === 'solid' ? w.t : p.kind === 'open' ? 2 * sw : w.t * 0.6} pointerEvents="none" />;
                }),
              )}
              {floor.openings.map((o) => (
                <line key={o.id} data-kind="opening" data-id={o.id} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} className={`pe-open-hit ${opening?.id === o.id ? 'on' : ''}`} strokeWidth={Math.max(0.25, 18 * sw)} />
              ))}
              {handleRoom &&
                tool === 'select' &&
                ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => {
                  const r = handleRoom;
                  const cx = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
                  const cy = h.includes('n') ? r.y : h.includes('s') ? r.y + r.d : r.y + r.d / 2;
                  return (
                    <g key={h}>
                      <rect data-kind="handle" data-id={r.id} data-h={h} x={cx - 14 * sw} y={cy - 14 * sw} width={28 * sw} height={28 * sw} className="pe-handle-hit" />
                      <rect x={cx - 6 * sw} y={cy - 6 * sw} width={12 * sw} height={12 * sw} rx={3 * sw} className="pe-handle" strokeWidth={sw * 1.5} pointerEvents="none" />
                    </g>
                  );
                })}
              {preview && preview.w != null && <rect x={preview.x} y={preview.y} width={preview.w} height={preview.d} className={`pe-preview ${preview.stair ? 'is-stair' : ''}`} strokeWidth={sw * 2} />}
              {preview?.opening && <line x1={preview.opening.x1} y1={preview.opening.y1} x2={preview.opening.x2} y2={preview.opening.y2} className={`pe-open-prev k-${tool}`} strokeWidth={10 * sw} />}
              {calib?.p1 && <line x1={calib.p1.x} y1={calib.p1.y} x2={(calib.p2 || preview?.calibTo || calib.p1).x} y2={(calib.p2 || preview?.calibTo || calib.p1).y} className="pe-calib" strokeWidth={3 * sw} />}
            </g>
          </svg>
          {floorBar}
          {upperHint && !busy && <p className="pe-fl-empty">{upperHint}</p>}
          {toolHint && !busy && !calib?.p2 && <p className="pe-toolhint">{toolHint}</p>}
          <div className="pe-zoom" ref={zoomRef}>
            <button type="button" onClick={() => zoomCenter(1.25)} aria-label={t('放大')}>
              <Icon name="plus" size={18} />
            </button>
            <button type="button" onClick={() => zoomCenter(0.8)} aria-label={t('缩小')}>
              <Icon name="minus" size={18} />
            </button>
            <button type="button" onClick={() => fit()} aria-label={t('全图')} title={t('全图')}>
              <Icon name="fit" size={16} />
            </button>
          </div>
          {busy && (
            <div className="pe-busy" role="status">
              <div className="boot-ring" />
              <p>{busy}</p>
            </div>
          )}
          {calib?.p2 && (
            <div className="pe-calib-box">
              <span>{t('这段的真实长度是')}</span>
              <input ref={calibRef} autoFocus value={calib.len} onChange={(e) => setCalib({ ...calib, len: e.target.value.replace(/[^\d.]/g, '') })} onKeyDown={(e) => e.key === 'Enter' && applyCalibration()} placeholder="3.6" inputMode="decimal" />
              <span>{t('米')}</span>
              {plan.floors.length > 1 && (
                <label className="pe-calib-all">
                  <input type="checkbox" checked={calibEvery} onChange={(e) => setCalibAll(e.target.checked)} />
                  <span>{t('所有楼层一起')}</span>
                </label>
              )}
              <button type="button" className="pe-btn primary" onClick={applyCalibration}>
                {t('校准')}
              </button>
            </div>
          )}
          {ask && (
            <div className="pe-ask" role="alertdialog" aria-modal="true" aria-label={ask.text}>
              <div className="pe-ask-card">
                <p>{ask.text}</p>
                <div>
                  <button type="button" className="pe-btn ghost" onClick={() => setAsk(null)}>
                    {t('取消')}
                  </button>
                  <button
                    type="button"
                    className={`pe-btn ${ask.danger ? 'danger-solid' : 'gold'}`}
                    onClick={() => {
                      const a = ask;
                      setAsk(null);
                      a.run();
                    }}
                  >
                    {ask.ok}
                  </button>
                </div>
              </div>
            </div>
          )}
          {narrow && (
            <aside className={`pe-side pe-sheet ${sheet ? 'open' : ''}`} aria-label={sheetTitle}>
              <button type="button" className="pe-sheet-head" onClick={() => setSheet((v) => !v)} aria-expanded={sheet}>
                <span className="pe-sheet-grab" aria-hidden="true" />
                <b>{sheetTitle}</b>
                <em>{sheetSummary}</em>
                <Icon name="down" size={18} className="pe-sheet-chev" />
              </button>
              {sheet && <div className="pe-sheet-body">{side}</div>}
            </aside>
          )}
        </div>

        {!narrow && <aside className="pe-side">{side}</aside>}
      </div>
      {importFile && ImportFlow && (
        <Suspense
          fallback={
            <div className="pe-busy pe-import-wait" role="status">
              <div className="boot-ring" />
              <p>{t('读取平面图…')}</p>
            </div>
          }
        >
          <ImportFlow file={importFile} ai={upload && hasKey} current={plan} onSettings={onSettings} onCancel={() => setImportFile(null)} onDone={onImportDone} />
        </Suspense>
      )}
    </div>
  );
}

// 楼层标签、楼梯、确认框的样式（只用 base.css 的变量）。放在这里而不是 studio.css：这些都是编辑器自己的零件
const PE_FLOORS_CSS = `
.pe-insp input:not([type='range']), .pe-insp select, .pe-fl-rename input { box-sizing: border-box; }
.pe-floors { position: absolute; top: 12px; left: 12px; z-index: 5; max-width: calc(100% - 24px); }
.pe-floors-row { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 16px; background: rgba(var(--glass-rgb), 0.94); box-shadow: var(--shadow-2), 0 0 0 0.5px var(--line); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
.pe-floors.full { left: 8px; right: 8px; top: 8px; max-width: none; }
.pe-floors.full .pe-floors-row { overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
.pe-floors.full .pe-floors-row::-webkit-scrollbar { display: none; }
.pe-fl-tab { display: inline-flex; align-items: center; flex: none; }
.pe-floors-row button { position: relative; flex: none; min-height: 40px; border: 0; border-radius: 12px; background: none; color: var(--ink); font: 600 14px/1 var(--sans); cursor: pointer; }
.pe-floors.full .pe-floors-row button { min-height: 44px; }
.pe-fl-tab > button[role='tab'] { padding: 0 14px; }
.pe-fl-tab > button[role='tab']::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 5px; height: 2px; border-radius: 1px; background: transparent; }
.pe-fl-tab > button.on { background: var(--card); box-shadow: 0 0 0 0.5px var(--line); }
.pe-fl-tab > button.on::after { background: var(--gold); }
.pe-floors-row button:hover { background: var(--fill); }
.pe-fl-more, .pe-fl-add { width: 40px; display: grid; place-items: center; color: var(--ink-soft) !important; }
.pe-floors.full .pe-fl-more, .pe-floors.full .pe-fl-add { width: 44px; }
.pe-fl-add:disabled { opacity: 0.35; cursor: default; }
.pe-fl-dot { position: absolute; top: 7px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--danger); }
.pe-fl-menu { position: absolute; top: calc(100% + 6px); left: 0; min-width: 220px; display: flex; flex-direction: column; gap: 2px; padding: 6px; border-radius: 16px; background: var(--card); box-shadow: var(--shadow-2), 0 0 0 0.5px var(--line); }
.pe-fl-menu p { margin: 6px 10px 4px; font: 600 12px/1.2 var(--sans); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); }
.pe-fl-menu button { min-height: 44px; padding: 0 12px; border: 0; border-radius: 11px; background: none; color: var(--ink); font: 500 15px/1.2 var(--sans); text-align: left; cursor: pointer; }
.pe-fl-menu button:hover { background: var(--fill); }
.pe-fl-menu button:disabled { opacity: 0.35; cursor: default; background: none; }
.pe-fl-menu button.danger { color: var(--danger); }
.pe-fl-rename { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px 8px; font: 500 12px/1.2 var(--sans); color: var(--ink-soft); }
.pe-fl-rename input { min-height: 40px; padding: 6px 10px; border: 0; border-radius: 10px; background: var(--bg); color: var(--ink); font: 500 16px/1.2 var(--sans); -webkit-user-select: text; user-select: text; }
.pe-fl-empty { position: absolute; top: 72px; left: 50%; transform: translateX(-50%); width: max-content; max-width: min(520px, calc(100% - 32px)); margin: 0; padding: 9px 16px; border-radius: 16px; background: rgba(var(--gold-l-rgb), 0.55); color: var(--gold-ink); font: 600 14px/1.4 var(--sans); text-align: center; pointer-events: none; }
.pe.narrow .pe-fl-empty { top: 64px; }
.pe .pe-calib-box { top: 66px; }
.pe-calib-all { display: inline-flex; align-items: center; gap: 6px; font: 500 13px/1 var(--sans); color: var(--ink-soft); cursor: pointer; }
.pe-calib-all input { width: 18px; height: 18px; accent-color: var(--accent); }
.pe-ghost-room { fill: rgba(var(--shade-rgb), 0.045); }
.pe-ghost-wall { stroke: var(--ink-soft); opacity: 0.55; }
.pe-ghost-label { font-family: var(--sans); font-weight: 500; fill: var(--ink-soft); opacity: 0.7; }
.pe-room.is-stair { fill-opacity: 0.85; }
.pe-stair-void { fill: url(#pe-hatch); }
.pe-hatch-line { stroke: var(--ink-soft); opacity: 0.5; }
.pe-stair-tread { stroke: var(--ink); opacity: 0.7; }
.pe-stair-landing { fill: none; stroke: var(--ink); opacity: 0.45; }
.pe-stair-path { fill: none; stroke: var(--gold-d); stroke-linejoin: round; stroke-linecap: round; }
.pe-stair-path.dn { stroke-dasharray: 0.12 0.1; opacity: 0.7; }
.pe-arrow-head { fill: var(--gold-d); }
.pe-stair-mouth { stroke: var(--gold); opacity: 0.55; stroke-linecap: round; }
.pe-stair-label { font-family: var(--sans); font-weight: 700; fill: var(--gold-ink); paint-order: stroke; stroke: var(--card); stroke-width: 0.06; }
.pe-preview.is-stair { fill: rgba(var(--gold-rgb), 0.28); }
.pe-ask { position: absolute; inset: 0; z-index: 8; display: grid; place-items: center; padding: 16px; background: rgba(var(--bg-rgb), 0.55); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.pe-ask-card { width: min(380px, 100%); padding: 20px; border-radius: 22px; background: var(--card); box-shadow: var(--shadow-2), 0 0 0 0.5px var(--line); }
.pe-ask-card p { margin: 0 0 16px; font: 600 16px/1.45 var(--sans); color: var(--ink); }
.pe-ask-card > div { display: flex; justify-content: flex-end; gap: 8px; }
.pe-btn.danger-solid { background: var(--danger); color: var(--card); }
.pe-msg-undo { margin-left: 10px; padding: 4px 10px; min-height: 32px; border: 0; border-radius: 9px; background: var(--card); color: var(--accent); font: 600 13px/1 var(--sans); cursor: pointer; box-shadow: 0 0 0 0.5px var(--line); }
.pe-fl-h { margin-top: 22px !important; padding-top: 16px; border-top: 0.5px solid var(--line); }
.pe-sheet .pe-fl-h { display: block !important; }
.pe-fl-hint { margin: -4px 0 10px; font: 400 13px/1.45 var(--sans); color: var(--ink-soft); }
.pe-nums .pe-compass { align-self: end; margin: 0 auto 4px; }
.pe-field { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; font: 500 13px/1.2 var(--sans); color: var(--ink-soft); }
.pe-seg { display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: var(--bg); }
.pe-seg button { flex: 1; min-height: 40px; border: 0; border-radius: 10px; background: none; color: var(--ink); font: 600 14px/1 var(--sans); cursor: pointer; }
.pe-seg button.on { background: var(--card); box-shadow: 0 0 0 0.5px var(--line), var(--shadow-1); }
.pe-dir { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 14px; border: 0; border-radius: 12px; background: var(--card); box-shadow: inset 0 0 0 0.5px var(--line); color: var(--ink); cursor: pointer; }
.pe-dir svg { transition: transform 0.25s var(--ease); color: var(--gold-d); }
.pe-dir b { font: 600 15px/1 var(--sans); }
.pe-dir em { margin-left: auto; font: 500 13px/1 var(--sans); font-style: normal; color: var(--accent); }
.pe-st-link { margin: 0 0 4px; font: 600 15px/1.3 var(--sans); color: var(--ink); }
.pe-st-info { margin: 4px 0 10px; font: 500 13px/1.45 var(--sans); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.pe-insp > .pe-btn { margin-top: 8px; margin-right: 8px; }
.pe-issues .pe-issue { display: flex; align-items: flex-start; gap: 6px; width: 100%; margin: 4px 0; padding: 6px 8px; min-height: 36px; border: 0; border-radius: 10px; background: none; color: var(--danger); font: 500 13px/1.4 var(--sans); text-align: left; cursor: pointer; }
.pe-issues .pe-issue.warn { color: var(--gold-ink); }
.pe-issues .pe-issue:hover { background: var(--fill); }
.pe-issues .pe-issue svg { flex: none; margin-top: 2px; }
.pe-import-wait { position: fixed; z-index: 80; }
`;
