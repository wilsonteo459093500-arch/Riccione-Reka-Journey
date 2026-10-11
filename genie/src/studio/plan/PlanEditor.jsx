// 平面图编辑器（纸色图纸）：上传底图（图片 / PDF）→ AI 识别（选填）→ 拉方块画房间、点墙放门窗 → 生成 3D。
// 单位：米。0.05m 吸附；房间边会吸到附近房间的边上（墙线才干净）。
// iPad：手指点墙就能放门窗（不靠鼠标悬停预览）；双指捏合缩放、平移；＋ / － 以画面中心缩放；系统打断（pointercancel）会复原。
// 「全图」给右下的缩放按钮、底部的提示留出位置；≤ 900px（iPad 竖放、手机）属性面板变成可以收起的底部抽屉，平面图用满整个宽度。
// 许愿模式（onSettings 没给）：客人碰不到设置 / API key —— 这台设备没有 key 时不显示「AI 识别」。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROOM_TYPES, OPENING_KINDS, TEMPLATES, buildWalls, bounds, snapPlan, templatePlan, uid } from './model.js';
import { planFileToImage } from './planImage.js';
import { detectPlan } from './ai.js';
import { loadSettings } from '../store.js';
import { t, tj, L, isEn } from '../../shared/i18n.js';
import { BRAND } from '../../shared/config.js';
import { Icon, roomLabel, useMedia } from '../ui/kit.jsx';

const SNAP = 0.05;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const r2 = (v) => Math.round(v * 100) / 100;
const MIN_S = 8;
const MAX_S = 400;
const ZOOM_INSET = 72; // 右边：缩放按钮那一条
const HINT_INSET = 60; // 底部：工具提示（可以折两行）
const SHEET_INSET = 68; // 窄屏：收起的属性抽屉
const DIM_MIN_PX = 70; // 房间在屏幕上小于这个就不写尺寸（走廊、浴室的字会压到墙上）

const TOOLS = [
  { id: 'select', zh: '选择 / 移动', key: 'v', icon: 'pointer' },
  { id: 'room', zh: '画房间', key: 'r', icon: 'room' },
  { id: 'door', zh: '门', key: 'd', icon: 'door' },
  { id: 'window', zh: '窗', key: 'w', icon: 'window' },
  { id: 'slider', zh: '落地趟门', key: 's', icon: 'slider' },
  { id: 'open', zh: '打通', key: 'o', icon: 'open' },
  { id: 'calibrate', zh: '量尺校准', key: 'c', icon: 'ruler' },
  { id: 'underlay', zh: '移动底图', key: 'u', icon: 'hand' },
];
const OPENING_TOOLS = ['door', 'window', 'slider', 'open'];

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
const emWidth = (str) => Math.max(3, [...String(str)].reduce((w, c) => w + (/[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(c) ? 1 : 0.58), 0));

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

/** 平面图的基本检查（重叠、太小），用当前语言说 */
function issuesOf(plan) {
  const out = [];
  const rs = plan.rooms || [];
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i];
    if (a.w < 0.8 || a.d < 0.8) out.push(t('{0} 太小了', [roomLabel(a)]));
    for (let j = i + 1; j < rs.length; j++) {
      const b = rs[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
      if (ox > 0.1 && oy > 0.1) out.push(t('{0} 和 {1} 重叠了', [roomLabel(a), roomLabel(b)]));
    }
  }
  return out;
}

export default function PlanEditor({ initial, underlay: initialUnderlay, autoUpload, onCancel, onApply, onSettings }) {
  const [plan, setPlan] = useState(() => initial);
  const [underlay, setUnderlay] = useState(initialUnderlay || null);
  const [tool, setTool] = useState(initial.rooms.length ? 'select' : 'room');
  const [sel, setSel] = useState(null);
  const [view, setView] = useState({ s: 50, ox: 80, oy: 80 });
  const [preview, setPreview] = useState(null);
  const [calib, setCalib] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [widthHint, setWidthHint] = useState('');
  const [sheet, setSheet] = useState(false); // 窄屏：属性抽屉拉开了没有
  const [hasKey] = useState(() => !!loadSettings().apiKey);
  const narrow = useMedia('(max-width: 900px)');
  const phone = useMedia('(max-width: 599px)');
  const canAI = !!onSettings || hasKey; // 许愿模式没有 key：不显示 AI 识别（客人到不了设置）
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const fileRef = useRef(null);
  const drag = useRef(null);
  const imageRef = useRef(null);
  const pointers = useRef(new Map());
  const viewRef = useRef(view);
  viewRef.current = view;
  const layoutRef = useRef({ narrow, phone });
  layoutRef.current = { narrow, phone };

  const walls = useMemo(() => buildWalls(plan), [plan]);
  const issues = useMemo(() => issuesOf(plan), [plan]);

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
      let bb = p.rooms.length ? bounds(p) : null;
      if (u) {
        const ub = { x0: u.x, y0: u.y, x1: u.x + u.w, y1: u.y + u.h };
        bb = bb ? { x0: Math.min(bb.x0, ub.x0), y0: Math.min(bb.y0, ub.y0), x1: Math.max(bb.x1, ub.x1), y1: Math.max(bb.y1, ub.y1) } : ub;
      }
      if (!bb) bb = { x0: 0, y0: 0, x1: 12, y1: 9 };
      // 留白：四周一圈 + 底部提示（手机上不显示提示）+ 窄屏收起的抽屉 + 右下的缩放按钮。
      // 缩放按钮只占右下一角：试两种 —— 放在它左边（右边留一条）或放在它上面（底部多留一段），哪个平面图大用哪个
      const { narrow: nw, phone: ph } = layoutRef.current;
      const pad = W < 520 ? 16 : 32;
      const cr = el.getBoundingClientRect();
      const zr = zoomRef.current?.getBoundingClientRect();
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
        const ah = Math.max(80, H - bottom - pad * 2);
        const s = Math.max(MIN_S, Math.min(MAX_S, Math.min(aw / bw, ah / bh)));
        if (!best || s > best.s) best = { s, ox: pad + (aw - bw * s) / 2 - bb.x0 * s, oy: pad + (ah - bh * s) / 2 - bb.y0 * s };
      }
      setView(best);
    },
    [plan, underlay],
  );

  useEffect(() => {
    fit();
    if (autoUpload) setTimeout(() => fileRef.current?.click(), 250);
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

  const updateRoom = (id, patch) => setPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const updateOpening = (id, patch) => setPlan((p) => ({ ...p, openings: p.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));

  const snapEdges = (vals, others, tol = 0.15) => {
    let best = null;
    for (const v of vals)
      for (const o of others) {
        const d = o - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best))) best = d;
      }
    return best || 0;
  };

  /** 这一点附近的墙上，按当前工具放一扇门 / 窗（tolPx：手指要宽松一点） */
  const openingAt = (p, tolPx, kind = tool) => {
    const edge = nearestEdge(plan.rooms, p, tolPx / viewRef.current.s);
    if (!edge) return null;
    const k = OPENING_KINDS[kind];
    if (!k) return null;
    const w = Math.min(k.width, edge.b - edge.a);
    const c = Math.max(edge.a + w / 2, Math.min(edge.b - w / 2, snap(edge.along)));
    return edge.axis === 'x' ? { x1: r2(c - w / 2), x2: r2(c + w / 2), y1: edge.c, y2: edge.c } : { x1: edge.c, x2: edge.c, y1: r2(c - w / 2), y2: r2(c + w / 2) };
  };

  const addOpening = (op) => {
    const o = { id: uid('o'), kind: tool, ...op };
    setPlan((pl) => ({ ...pl, openings: [...pl.openings, o] }));
    setSel({ type: 'opening', id: o.id });
    setPreview(null);
  };

  // ── 上传 + AI ──
  const onFile = async (file) => {
    if (!file) return;
    setBusy(t('读取平面图…'));
    setMsg('');
    try {
      const img = await planFileToImage(file);
      imageRef.current = img;
      const w = Number(widthHint) || 12;
      const u = { src: img.src, x: 0, y: 0, w, h: (w * img.height) / img.width, opacity: 0.55, iw: img.width, ih: img.height };
      setUnderlay(u);
      setTimeout(() => fit(plan, u), 30);
      const s = loadSettings();
      if (s.apiKey && !plan.rooms.length) await runAI(img);
      else if (s.apiKey) setMsg(t('底图已放好。可以按「AI 识别」，或直接拉方块描房间。'));
      // 许愿模式（没有设置入口）不提「设置里填 key」
      else setMsg(onSettings ? t('底图已放好。用「画房间」沿着墙描一遍；先用量尺校准比例会更准。（设置里填 Gemini key 就能 AI 自动识别）') : t('底图已放好。用「画房间」沿着墙描一遍；先用量尺校准比例会更准。'));
    } catch (e) {
      const m = String(e?.message || e);
      // 旧 iPadOS（< 17.4）读 PDF 会缺函数：给一句能照着做的话
      const pdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
      if (pdf && (e instanceof TypeError || /is not a function|withResolvers/i.test(m))) setMsg(t('这台设备读不了 PDF：请更新 iPadOS，或把平面图截图成 JPG / PNG 再上传'));
      else setMsg(t('读不出来：{0}', [t(m)]));
    } finally {
      setBusy('');
    }
  };

  const runAI = async (img = imageRef.current) => {
    const im = img || (underlay && { src: underlay.src, width: underlay.iw || 1600, height: underlay.ih || 1200 });
    if (!im) return setMsg(t('先上传一张平面图。'));
    const s = loadSettings();
    if (!s.apiKey) {
      // 许愿模式没有 onSettings：只说一句，不打开设置（客人不该看到 API key）
      setMsg(t('需要先在设置里填 Gemini API key。'));
      onSettings?.();
      return;
    }
    setBusy(t('AI 正在看图（约 10–30 秒）…'));
    try {
      const { plan: p, underlay: u, info } = await detectPlan(s, im, { widthM: Number(widthHint) || undefined });
      const next = { ...plan, rooms: p.rooms, openings: p.openings };
      setPlan(next);
      setUnderlay({ ...u, iw: im.width, ih: im.height });
      setTool('select');
      setTimeout(() => fit(next, u), 30);
      setMsg(t('识别到 {0} 个房间、{1} 个门窗（整体宽约 {2}m{3}）。请对一下：拖动房间边缘校正，再按「生成 3D」。', [info.rooms, info.openings, info.widthM, info.fromDims ? t('，读自图上尺寸') : t('，按你填的 / 估算')]));
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  // ── 指针（鼠标 / 手指 / 笔；两根手指 = 捏合缩放 + 平移） ──
  const revertDrag = (d) => {
    if (!d) return;
    if (d.kind === 'moveRoom' || d.kind === 'resize') updateRoom(d.id, d.orig);
    else if (d.kind === 'moveOpening') updateOpening(d.id, d.orig);
    else if (d.kind === 'underlay') setUnderlay(d.orig);
    else if (d.kind === 'draw') setPreview(null);
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const r = svgRef.current.getBoundingClientRect();
    revertDrag(drag.current);
    drag.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  };

  const onDown = (e) => {
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
        const r = plan.rooms.find((x) => x.id === target.dataset.id);
        drag.current = { kind: 'resize', id: r.id, h: target.dataset.h, start: p, orig: { ...r } };
      } else if (target?.dataset.kind === 'opening') {
        const o = plan.openings.find((x) => x.id === target.dataset.id);
        setSel({ type: 'opening', id: o.id });
        drag.current = { kind: 'moveOpening', id: o.id, start: p, orig: { ...o } };
      } else if (target?.dataset.kind === 'room') {
        const r = plan.rooms.find((x) => x.id === target.dataset.id);
        setSel({ type: 'room', id: r.id });
        drag.current = { kind: 'moveRoom', id: r.id, start: p, orig: { ...r } };
      } else {
        setSel(null);
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy };
      }
    } else if (tool === 'room') {
      drag.current = { kind: 'draw', start: { x: snap(p.x), y: snap(p.y) } };
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
      drag.current = { kind: 'underlay', start: p, orig: { ...underlay } };
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
    else if (d.kind === 'draw') {
      const x0 = d.start.x;
      const y0 = d.start.y;
      const x1 = snap(p.x);
      const y1 = snap(p.y);
      setPreview({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), d: Math.abs(y1 - y0) });
    } else if (d.kind === 'moveRoom') {
      let x = snap(d.orig.x + p.x - d.start.x);
      let y = snap(d.orig.y + p.y - d.start.y);
      const others = plan.rooms.filter((r) => r.id !== d.id);
      x += snapEdges(
        [x, x + d.orig.w],
        others.flatMap((r) => [r.x, r.x + r.w]),
      );
      y += snapEdges(
        [y, y + d.orig.d],
        others.flatMap((r) => [r.y, r.y + r.d]),
      );
      updateRoom(d.id, { x: r2(x), y: r2(y) });
    } else if (d.kind === 'resize') {
      const o = d.orig;
      let { x, y, w, d: dd } = o;
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      const others = plan.rooms.filter((r) => r.id !== d.id);
      const xs = others.flatMap((r) => [r.x, r.x + r.w]);
      const ys = others.flatMap((r) => [r.y, r.y + r.d]);
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
      setUnderlay((u) => ({ ...u, x: d.orig.x + p.x - d.start.x, y: d.orig.y + p.y - d.start.y }));
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
      const type = plan.rooms.length === 0 ? 'living' : 'bedroom';
      const r = { id: uid('r'), type, name: ROOM_TYPES[type].zh, x: r2(preview.x), y: r2(preview.y), w: r2(preview.w), d: r2(preview.d) };
      setPlan((p) => ({ ...p, rooms: [...p.rooms, r] }));
      setSel({ type: 'room', id: r.id });
    }
    if (d?.kind === 'draw') setPreview(null);
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
    if (sel.type === 'room') setPlan((p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== sel.id) }));
    else setPlan((p) => ({ ...p, openings: p.openings.filter((o) => o.id !== sel.id) }));
    setSel(null);
  }, [sel]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input,select,textarea') || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
      else if (e.key === 'Escape') {
        setSel(null);
        setCalib(null);
        setPreview(null);
      } else {
        const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (tl) setTool(tl.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeSel]);

  const applyCalibration = () => {
    if (!calib?.p1 || !calib?.p2 || !underlay) return;
    const real = Number(calib.len);
    const meas = Math.hypot(calib.p2.x - calib.p1.x, calib.p2.y - calib.p1.y);
    if (!real || !meas) return;
    const f = real / meas;
    const p1 = calib.p1;
    setUnderlay((u) => ({ ...u, x: p1.x + (u.x - p1.x) * f, y: p1.y + (u.y - p1.y) * f, w: u.w * f, h: u.h * f }));
    setCalib(null);
    setPreview(null);
    setMsg(t('底图比例已校准（×{0}）。', [f.toFixed(3)]));
  };

  const room = sel?.type === 'room' && plan.rooms.find((r) => r.id === sel.id);
  const opening = sel?.type === 'opening' && plan.openings.find((o) => o.id === sel.id);
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

  const toolHint = {
    select: t('拖房间移动 · 拖角改尺寸 · 点门窗再拖'),
    room: t('按住拖出一个方块 = 一个房间'),
    door: t('点一下墙放门'),
    window: t('点一下墙放窗'),
    slider: t('点一下墙放落地趟门'),
    open: t('点一下两个空间之间的墙，把它打通'),
    calibrate: t('点两下量一段已知长度，再输入真实尺寸'),
    underlay: t('拖动底图对齐房间'),
  }[tool];

  // 属性：宽屏是右边一栏；≤ 900px 是平面图底部可以收起的抽屉（标题行写着现在选中的是什么）
  const sheetTitle = room ? t('房间') : opening ? t('门窗') : t('整体');
  const sheetSummary = room
    ? `${roomLabel(room)} · ${room.w.toFixed(2)} × ${room.d.toFixed(2)} m`
    : opening
      ? `${L(OPENING_KINDS[opening.kind])} · ${Math.hypot(opening.x2 - opening.x1, opening.y2 - opening.y1).toFixed(2)} m`
      : t('{0} 个房间 · {1} 个门窗 · {2} 段墙', [plan.rooms.length, plan.openings.length, walls.length]);
  const side = (
    <>
      {msg && <p className="pe-msg">{msg}</p>}
      {room ? (
        <div className="pe-insp">
          <h4>{t('房间')}</h4>
          <div className="pe-types">
            {Object.entries(ROOM_TYPES).map(([k, rt]) => (
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
              ['x', 'X'],
              ['y', 'Y'],
              ['w', t('宽')],
              ['d', t('深')],
            ].map(([k, l]) => (
              <label key={k}>
                {l}
                <input type="number" step="0.05" inputMode="decimal" value={room[k]} onChange={(e) => updateRoom(room.id, { [k]: Math.max(k === 'w' || k === 'd' ? 0.6 : -99, Number(e.target.value)) })} />
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
            <input
              type="number"
              step="0.05"
              inputMode="decimal"
              value={r2(Math.hypot(opening.x2 - opening.x1, opening.y2 - opening.y1))}
              onChange={(e) => {
                const w = Math.max(0.3, Number(e.target.value));
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
                <input type="number" step="0.05" inputMode="decimal" value={opening.sill ?? OPENING_KINDS[opening.kind].sill} onChange={(e) => updateOpening(opening.id, { sill: Number(e.target.value) })} />
              </label>
              <label>
                {t('窗顶高')}
                <input type="number" step="0.05" inputMode="decimal" value={opening.head ?? OPENING_KINDS[opening.kind].head} onChange={(e) => updateOpening(opening.id, { head: Number(e.target.value) })} />
              </label>
            </div>
          )}
          <button type="button" className="pe-btn danger" onClick={removeSel}>
            <Icon name="trash" size={16} />
            {t('删除')}
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
            <label>
              {t('层高（m）')}
              <input type="number" step="0.05" min="2.4" max="4" inputMode="decimal" value={plan.wallH} onChange={(e) => setPlan({ ...plan, wallH: Math.max(2.4, Math.min(4, Number(e.target.value))) })} />
            </label>
            <label title={t('平面图上方是北 = 0°；顺时针转')}>
              {t('北方（°）')}
              <input type="number" step="15" inputMode="numeric" value={plan.north || 0} onChange={(e) => setPlan({ ...plan, north: ((Number(e.target.value) % 360) + 360) % 360 })} />
            </label>
          </div>
          <div className="pe-compass" style={{ transform: `rotate(${plan.north || 0}deg)` }} aria-hidden="true">
            <span>N</span>
          </div>
          {underlay && (
            <label>
              {t('底图透明度')}
              <input type="range" min="0" max="1" step="0.05" value={underlay.opacity ?? 0.55} onChange={(e) => setUnderlay({ ...underlay, opacity: Number(e.target.value) })} />
            </label>
          )}
          <ul className="pe-howto">
            <li>{tj('{0}：按住拖出方块；边会自动吸到旁边房间的边上。', [<b key="b">{t('画房间')}</b>])}</li>
            <li>{tj('{0}：选工具后点一下墙（鼠标会先出现金色预览）。', [<b key="b">{t('门 / 窗')}</b>])}</li>
            <li>{tj('{0}：两个空间之间不要墙（开放式厨房）。客厅 / 餐厅 / 玄关 / 走廊之间默认已打通。', [<b key="b">{t('打通')}</b>])}</li>
            <li>{tj('{0}：决定阳光从哪边进来（西晒看得出来）。', [<b key="b">{t('北方')}</b>])}</li>
            <li>{tj('{0}：捏合缩放、拖动平移。', [<b key="b">{t('双指')}</b>])}</li>
          </ul>
          {issues.length > 0 && (
            <div className="pe-issues">
              {issues.map((x, i) => (
                <p key={i}>
                  <Icon name="alert" size={15} />
                  {x}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="pe-stat">{t('{0} 个房间 · {1} 个门窗 · {2} 段墙', [plan.rooms.length, plan.openings.length, walls.length])}</p>
    </>
  );

  return (
    <div className={`pe ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={t('平面图')}>
      <header className="pe-head">
        <div className="pe-title">
          <p className="eyebrow">{isEn() ? BRAND.studioEn : BRAND.studio}</p>
          <b>{t('平面图')}</b>
        </div>
        <div className="pe-head-actions">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="pe-btn" onClick={() => fileRef.current?.click()} title={t('上传平面图')} aria-label={t('上传平面图')}>
            <Icon name="upload" size={17} />
            <span>{t('上传平面图')}</span>
          </button>
          <label className="pe-hint-in" title={t('平面图的整体外墙宽度（米），AI 读不到尺寸时用')}>
            <span>{t('整体宽')}</span>
            <input value={widthHint} onChange={(e) => setWidthHint(e.target.value.replace(/[^\d.]/g, ''))} placeholder="12" inputMode="decimal" />
            <span>m</span>
          </label>
          {canAI && (
            <button type="button" className="pe-btn ai" onClick={() => runAI()} disabled={!!busy} title={t('AI 识别')} aria-label={t('AI 识别')}>
              <Icon name="wand" size={17} />
              <span>{t('AI 识别')}</span>
            </button>
          )}
          <label className="pe-select">
            <Icon name="start" size={16} />
            <select
              value=""
              aria-label={t('用模板…')}
              onChange={(e) => {
                if (!e.target.value) return;
                const p = templatePlan(e.target.value);
                setPlan({ ...plan, rooms: p.rooms, openings: p.openings, wallH: p.wallH, north: p.north, name: p.name });
                setSel(null);
                setTimeout(() => fit(p, underlay), 20);
              }}
            >
              <option value="">{t('用模板…')}</option>
              {TEMPLATES.map((tp) => (
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
          <button type="button" className="pe-btn gold" disabled={!plan.rooms.length} onClick={() => onApply(snapPlan(plan, 0.06), underlay)}>
            <Icon name="sparkles" size={17} />
            <span>{t('生成 3D')}</span>
          </button>
        </div>
      </header>

      <div className="pe-body">
        <nav className="pe-tools" aria-label={t('工具')}>
          {TOOLS.map((tl) => (
            <button
              key={tl.id}
              type="button"
              className={tool === tl.id ? 'on' : ''}
              aria-pressed={tool === tl.id}
              onClick={() => (setTool(tl.id), setPreview(null), setCalib(null))}
              title={`${t(tl.zh)} (${tl.key.toUpperCase()})`}
              disabled={(tl.id === 'calibrate' || tl.id === 'underlay') && !underlay}
            >
              <Icon name={tl.icon} size={20} stroke={1.6} />
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
            <g transform={`translate(${view.ox},${view.oy}) scale(${view.s})`}>
              <g className="grid">{grid}</g>
              {underlay && <image href={underlay.src} x={underlay.x} y={underlay.y} width={underlay.w} height={underlay.h} opacity={underlay.opacity ?? 0.55} preserveAspectRatio="none" />}
              {plan.rooms.map((r) => {
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
                      className={`pe-room ${room?.id === r.id ? 'on' : ''}`}
                      strokeWidth={sw * (room?.id === r.id ? 2.5 : 1)}
                    />
                    <text x={cx} y={y0} fontSize={fs} textAnchor="middle" className="pe-label">
                      {lab.lines.map((ln, i) => (
                        <tspan key={i} x={cx} dy={i ? lh : 0}>
                          {ln}
                        </tspan>
                      ))}
                    </text>
                    {showDims && (
                      <text x={cx} y={y0 + (lab.lines.length - 1) * lh + fs * 0.6 + fd * 1.1} fontSize={fd} textAnchor="middle" className="pe-dim">
                        {dims}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* 墙 + 门窗（由房间自动生成） */}
              {walls.map((w) =>
                w.pieces.map((p, i) => {
                  const [x1, y1, x2, y2] = w.axis === 'x' ? [p.a, w.c, p.b, w.c] : [w.c, p.a, w.c, p.b];
                  return <line key={`${w.id}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`pe-wall k-${p.kind}`} strokeWidth={p.kind === 'solid' ? w.t : p.kind === 'open' ? 2 * sw : w.t * 0.6} pointerEvents="none" />;
                }),
              )}
              {plan.openings.map((o) => (
                <line key={o.id} data-kind="opening" data-id={o.id} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} className={`pe-open-hit ${opening?.id === o.id ? 'on' : ''}`} strokeWidth={Math.max(0.25, 18 * sw)} />
              ))}
              {room &&
                ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => {
                  const cx = h.includes('w') ? room.x : h.includes('e') ? room.x + room.w : room.x + room.w / 2;
                  const cy = h.includes('n') ? room.y : h.includes('s') ? room.y + room.d : room.y + room.d / 2;
                  return (
                    <g key={h}>
                      <rect data-kind="handle" data-id={room.id} data-h={h} x={cx - 14 * sw} y={cy - 14 * sw} width={28 * sw} height={28 * sw} className="pe-handle-hit" />
                      <rect x={cx - 6 * sw} y={cy - 6 * sw} width={12 * sw} height={12 * sw} rx={3 * sw} className="pe-handle" strokeWidth={sw * 1.5} pointerEvents="none" />
                    </g>
                  );
                })}
              {preview && preview.w != null && <rect x={preview.x} y={preview.y} width={preview.w} height={preview.d} className="pe-preview" strokeWidth={sw * 2} />}
              {preview?.opening && <line x1={preview.opening.x1} y1={preview.opening.y1} x2={preview.opening.x2} y2={preview.opening.y2} className={`pe-open-prev k-${tool}`} strokeWidth={10 * sw} />}
              {calib?.p1 && <line x1={calib.p1.x} y1={calib.p1.y} x2={(calib.p2 || preview?.calibTo || calib.p1).x} y2={(calib.p2 || preview?.calibTo || calib.p1).y} className="pe-calib" strokeWidth={3 * sw} />}
            </g>
          </svg>
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
              <input autoFocus value={calib.len} onChange={(e) => setCalib({ ...calib, len: e.target.value.replace(/[^\d.]/g, '') })} onKeyDown={(e) => e.key === 'Enter' && applyCalibration()} placeholder="3.6" inputMode="decimal" />
              <span>{t('米')}</span>
              <button type="button" className="pe-btn primary" onClick={applyCalibration}>
                {t('校准')}
              </button>
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
    </div>
  );
}
