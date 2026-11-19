// 走进去 · 右上角的小地图（SPEC §5）：这一层的房间（平面图上的矩形 + 简短的房间名）、你在哪（金色的点 + 看过去的扇形）、
// 多层就有楼层标签。点地图上一个地方 → onWalk({ fi, x, z })（x / z = 平面图的 x / y，米）；点楼层标签 → onFloor(fi)。
//   点和扇形跟着 controller 的 'pose' 事件走：直接改 SVG 的属性，不重画 React（走路时每一帧都有）。
//   所有楼层用同一个外框：换层时地图不跳。房间放不下名字就不写。
//   手机：缩成 120px 的圆（以你为中心的一小块，跟着你走），点一下展开；展开后点地图走过去会自己收起来。展开着 → onOpen(true)。
//   卡片不比画面高：量一下放得下多高（画面底边、横着叠到的工具轮），地图跟着缩（矮的横屏上楼层标签也看得到、点得到）。
//   只用 plan/model.js 的纯函数和 kit.jsx 的房间名（不 import src/studio/export/：test/export.test.mjs 不让）。
// props = { ctl, plan, fi, room（房间 id 或对象）, going（正在走去的那一层 / null）, size: 'wide' | 'compact' | 'phone', onWalk, onFloor, onOpen, className }

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../shared/i18n.js';
import { ROOM_TYPES, floorName } from '../plan/model.js';
import { Icon, roomLabel } from '../ui/kit.jsx';

/**
 * 每种大小：地图最大多宽多高（px）、最多多大一块（px²：竖长的户型可以长高一点，不会缩成一条）、房间名的字号（px）。
 * 宽的户型（condo3）照旧碰到最大宽度；竖长的（semid2，连车廊 10.6 × 21.4m）在右上角长高，房间名才放得下。
 */
export const MAP_SIZES = {
  wide: { w: 232, h: 264, area: 42000, font: 11 },
  compact: { w: 146, h: 264, area: 34000, font: 10 }, // 宽最多 146：竖着的 iPad（820）上地图的左边让开上面居中的提示
  phone: { w: 284, h: 300, area: 85200, font: 11 },
};
export const MINI_PX = 120; // 手机上缩起来的圆（px）
export const MAP_GAP = 12; // 卡片的底边离画面底边 / 工具轮至少多远（px）
export const MAP_MIN_H = 60; // 再挤，地图也至少这么高（px）
export const MINI_SPAN = 12; // 缩起来时看多大一块（米，直径）
const PAD = 0.5; // 外框四边留多少（米）

const cls = (...a) => a.filter(Boolean).join(' ');
const r3 = (v) => Math.round(v * 1000) / 1000;
const roomsOf = (plan, fi) => plan?.floors?.[fi]?.rooms || [];

/** 所有楼层的房间合起来的外框（米），四边各留 pad → { x, y, w, h } */
export function mapBox(plan, pad = PAD) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of plan?.floors || [])
    for (const r of f?.rooms || []) {
      if (![r.x, r.y, r.w, r.d].every(Number.isFinite)) continue;
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.d);
    }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 10, h: 8 };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** 地图上的名字要短：「后院 / 晒衣处」→「后院」，「Yard / drying」→「Yard」 */
export function shortName(s) {
  return String(s || '')
    .split(/\s*[/／·]\s*/)[0]
    .trim();
}

/** 房间是哪一类（决定画法）：stair 楼梯间 · void 挑空 · out 阳台 / 车廊 · room 其余 */
export function roomKind(r) {
  const T = ROOM_TYPES[r?.type] || {};
  if (r?.stairId || T.stair) return 'stair';
  if (T.void) return 'void';
  if (T.outdoor) return 'out';
  return 'room';
}

/** 这一层要画的房间：[{ id, x, y, w, d, kind, name }]（name 已经翻好、截短） */
export function mapRooms(plan, fi) {
  return roomsOf(plan, fi)
    .filter((r) => [r.x, r.y, r.w, r.d].every(Number.isFinite) && r.w > 0 && r.d > 0)
    .map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, d: r.d, kind: roomKind(r), name: shortName(roomLabel(r)) }));
}

/** 一行字大概多宽（px）：中日韩字一个字宽，其余大约半个多 */
export function textWidth(s, px) {
  let w = 0;
  for (const ch of String(s || '')) w += /[⺀-鿿豈-﫿＀-￯]/.test(ch) ? 1 : 0.58;
  return w * px;
}

/** 名字放得下这个房间吗（scale = 每米多少 px） */
export function labelFits(name, room, scale, px) {
  if (!name) return false;
  return textWidth(name, px) <= room.w * scale - 6 && px + 4 <= room.d * scale;
}

/** 大小 → 每米多少 px、地图的 px 宽高；maxH = 画面里放得下多高（px，mapRoomH 量出来的；没给 = 不限） */
export function mapScale(box, size = 'wide', maxH = null) {
  const S = MAP_SIZES[size] || MAP_SIZES.wide;
  const h = maxH > 0 ? Math.min(S.h, maxH) : S.h;
  const s = Math.min(S.w / box.w, h / box.h, S.area ? Math.sqrt(S.area / (box.w * box.h)) : Infinity);
  return { s, W: Math.round(box.w * s), H: Math.round(box.h * s), font: S.font };
}

/**
 * 卡片里的地图最高多少 px：卡片的底边不出画面（留 MAP_GAP），横着叠到工具轮的时候也不伸到它下面。
 * m = { uiH（整层多高）, top（卡片顶边）, chrome（卡片里地图以外的高：名字、楼层标签、边距）, tools（工具轮顶边 / null） }
 * → px（至少 MAP_MIN_H）；量不到（整层还没有高）→ null（不限）
 */
export function mapRoomH({ uiH, top = 0, chrome = 0, tools = null }) {
  if (!(uiH > 0)) return null;
  let bottom = uiH - MAP_GAP;
  if (Number.isFinite(tools)) bottom = Math.min(bottom, tools - MAP_GAP);
  return Math.max(MAP_MIN_H, Math.floor(bottom - top - chrome));
}

/** 你在哪、朝哪看 → SVG 的 transform（扇形画成朝上 = 平面图的 −y；yaw 的约定见 tour.js：看的方向 = (−sin yaw, −cos yaw)） */
export function meTransform(p) {
  const deg = (-(Number(p?.yaw) || 0) * 180) / Math.PI;
  return `translate(${r3(p.x)} ${r3(p.z)}) rotate(${r3(deg) + 0})`;
}

/** 扇形（局部坐标，朝上）：半径 len、半角 half（弧度） */
function conePath(len, half = 0.62) {
  const x = Math.sin(half) * len;
  const y = -Math.cos(half) * len;
  return `M0 0 L${r3(-x)} ${r3(y)} A${r3(len)} ${r3(len)} 0 0 1 ${r3(x)} ${r3(y)} Z`;
}

export default function Minimap({ ctl, plan, fi = 0, room = null, going = null, size = 'wide', onWalk, onFloor, onOpen, className = '' }) {
  const floors = plan?.floors || [];
  const multi = floors.length > 1;
  const phone = size === 'phone';
  const [open, setOpen] = useState(false);
  const mini = phone && !open;
  const [target, setTarget] = useState(null);
  const [maxH, setMaxH] = useState(null); // 画面里放得下多高（量出来的；null = 不限）

  const box = useMemo(() => mapBox(plan), [plan]);
  const rooms = useMemo(() => mapRooms(plan, fi), [plan, fi]);
  const { s, W, H, font } = mapScale(box, size, maxH);
  // 缩起来的圆：每米多少 px
  const ms = MINI_PX / MINI_SPAN;
  const k = mini ? ms : s; // 点、扇形、字都按屏幕 px 定大小 → 换成米
  const roomId = room && typeof room === 'object' ? room.id : room;

  const svg = useRef(null);
  const me = useRef(null);
  const card = useRef(null);
  const view = mini ? `${r3(box.x + box.w / 2 - MINI_SPAN / 2)} ${r3(box.y + box.h / 2 - MINI_SPAN / 2)} ${MINI_SPAN} ${MINI_SPAN}` : `${r3(box.x)} ${r3(box.y)} ${r3(box.w)} ${r3(box.h)}`;

  // 你在哪：pose 事件直接改 SVG
  useEffect(() => {
    if (!ctl?.on) return undefined;
    const apply = (p) => {
      const g = me.current;
      if (!g) return;
      const here = !!p && Number.isFinite(p.x) && Number.isFinite(p.z) && (p.fi == null || p.fi === fi);
      g.style.display = here ? '' : 'none';
      if (!here) return;
      g.setAttribute('transform', meTransform(p));
      if (mini) svg.current?.setAttribute('viewBox', `${r3(p.x - MINI_SPAN / 2)} ${r3(p.z - MINI_SPAN / 2)} ${MINI_SPAN} ${MINI_SPAN}`);
    };
    try {
      apply(ctl.pose?.());
    } catch {
      /* 还没走进去：先不画点 */
    }
    return ctl.on('pose', apply);
  }, [ctl, fi, mini]);

  // 手机上展开着：告诉 WalkMode（潘吉的泡泡先让开）
  useEffect(() => {
    onOpen?.(phone && open);
  }, [phone, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 卡片放得下多高：量一下（画面变了再量）。展开的动画是 scale：用 offset*（排版的大小），不用画出来的大小
  useLayoutEffect(() => {
    const el = card.current;
    const ui = el?.offsetParent;
    if (mini || !el || !ui) return undefined;
    const fit = () => {
      const sv = svg.current;
      if (!sv || !el.isConnected) return;
      const sc = el.offsetHeight / (el.getBoundingClientRect().height || el.offsetHeight) || 1;
      const chrome = el.offsetHeight - sv.getBoundingClientRect().height * sc;
      // 工具轮：横着叠到卡片才让（按没缩的时候卡片多宽算：缩了以后不叠了也照样让，不会一缩一放）；
      // 手机上展开的那一张盖在最上面，不让
      let tools = null;
      const tw = phone ? null : ui.querySelector('.walk-tools');
      if (tw) {
        const u = ui.getBoundingClientRect();
        const r = tw.getBoundingClientRect();
        const right = el.offsetLeft + el.offsetWidth;
        const left = right - Math.max(el.offsetWidth, mapScale(box, size).W + 16);
        if (r.width > 0 && r.right - u.left > left && r.left - u.left < right) tools = r.top - u.top;
      }
      const h = mapRoomH({ uiH: ui.clientHeight, top: el.offsetTop, chrome, tools });
      if (h != null) setMaxH((m) => (m != null && Math.abs(m - h) < 2 ? m : h));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(ui);
    return () => ro.disconnect();
  }, [mini, phone, size, box, fi, multi, maxH]);

  // 点过的地方：一圈慢慢散开
  useEffect(() => {
    if (!target) return undefined;
    const tm = setTimeout(() => setTarget(null), 1600);
    return () => clearTimeout(tm);
  }, [target]);

  const tap = (e) => {
    const el = svg.current;
    if (!el || !onWalk) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = box.x + ((e.clientX - r.left) / r.width) * box.w;
    const z = box.y + ((e.clientY - r.top) / r.height) * box.h;
    setTarget({ x, z, at: Date.now() });
    onWalk({ fi, x: r3(x), z: r3(z) });
    if (phone) setOpen(false);
  };

  const dot = 5.5 / k;
  const body = (
    <svg
      ref={svg}
      className="walk-map-svg"
      viewBox={view}
      width={mini ? MINI_PX : W}
      height={mini ? MINI_PX : H}
      role="img"
      aria-label={t('小地图')}
      onClick={mini ? undefined : tap}
    >
      <g className="walk-map-rooms">
        {rooms.map((r) => (
          <rect key={r.id} className={cls('walk-map-room', `is-${r.kind}`, r.id === roomId && 'is-here')} x={r3(r.x)} y={r3(r.y)} width={r3(r.w)} height={r3(r.d)} />
        ))}
      </g>
      {!mini && (
        <g className="walk-map-labels" fontSize={r3(font / s)}>
          {rooms.map((r) =>
            labelFits(r.name, r, s, font) ? (
              <text key={r.id} className={cls('walk-map-label', r.id === roomId && 'is-here')} x={r3(r.x + r.w / 2)} y={r3(r.y + r.d / 2)}>
                {r.name}
              </text>
            ) : null,
          )}
        </g>
      )}
      {target && !mini && <circle key={target.at} className="walk-map-target" cx={r3(target.x)} cy={r3(target.z)} r={r3(9 / s)} />}
      <g ref={me} className="walk-map-me" style={{ display: 'none' }}>
        <path className="walk-map-cone" d={conePath(30 / k)} />
        <circle className="walk-map-dot" r={r3(dot)} />
      </g>
    </svg>
  );

  if (mini)
    return (
      <button type="button" className={cls('walk-map', 'glass', 'is-mini', className)} aria-label={t('展开小地图')} aria-expanded="false" onClick={() => setOpen(true)}>
        {body}
      </button>
    );

  const here = roomId ? roomsOf(plan, fi).find((r) => r.id === roomId) : null;
  return (
    <div ref={card} className={cls('walk-map', 'glass', `is-${size}`, multi && 'is-multi', phone && open && 'is-open', className)}>
      <div className="walk-map-head">
        <span className="walk-map-room-name">{here ? roomLabel(here) : multi ? t(floorName(plan, floors[fi]?.id)) : t('小地图')}</span>
        {phone && (
          <button type="button" className="walk-map-close" aria-label={t('收起小地图')} aria-expanded="true" data-sfx="close" onClick={() => setOpen(false)}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {body}
      {multi && (
        <div className="walk-map-floors" role="group" aria-label={t('楼层')}>
          {floors.map((f, i) => (
            <button key={f.id} type="button" className={cls('walk-map-floor', i === fi && 'on', i === going && i !== fi && 'is-going')} aria-pressed={i === fi} onClick={() => i !== fi && onFloor?.(i)}>
              {t(floorName(plan, f.id))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
