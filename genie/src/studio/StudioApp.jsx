// 3D 梦想工作室（WISH Studio）—— 主界面，给设计师 / 销售用。深色画布 + 纸色磨砂玻璃面板（VI「晨光溪岸」）。
// 路由：studio.html                上次的方案（第一次来：直接打开示范户型，3 秒内看到东西）
//       studio.html#p=<档案>       从许愿之旅的蓝图进来：套用客人的材质、收纳、生活习惯（客人的雷区一律避开）；
//                                  客人版 —— 只有加 ?staff=1、或从员工版蓝图点进来才是设计师版
//       studio.html#s=<方案>       别人分享的方案（打开后存成自己的一份：新 id，不会盖掉原稿）
//       studio.html?demo=1         展厅大屏：示范户型 + 自动环绕 + 一天的光影循环；只留一个小小的 WISH 字标，不出现客人名字
//       studio.html?mode=wish      客户许愿模式（外壳 iframe 里）：底座写「示范户型 · 概念示意」，语言跟着外壳
//       ?staff=1                   员工链接（公司 WhatsApp、员工版蓝图点进来）：一定显示设计师的「收纳对账」
//       ?lang=en                   英文（中文原文就是 key，见 shared/i18n.js）
//
// 谁在看（设计师的东西绝不能给客人看到）：
//   设计师自己建的方案 → 员工版；别人分享来的（sharedFrom）→ 客人版；
//   带客人档案进来的（#p=，蓝图页的「在 3D 里看见它」）一律是客人版（audience: 'client'）—— 客人把链接复制到别处打开、
//   转给家人（没有 referrer）也一样；只有链接带 ?staff=1，或者从员工版蓝图（quiz.html?staff=1）点进来，才是员工版。
//   许愿模式、展厅永远是客人版。
//   客人版：没有「收纳对账」、没有「见面时要聊的」、没有「新方案 / 打开方案」（展厅 iPad 上别的客人的方案一个都不列），
//   没有「设置」（公司的 AI key、接口地址），梦想家卡打开的是客人版蓝图（不带 ?staff=1）。
//   许愿模式再少两样：不能上传平面图（只能画）、不能下载概念图 —— 都会碰到展厅 iPad 的相册 / 文件，里面有前面客人的图。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Engine } from './engine/Engine.js';
import { buildWalls, buildAllWalls, templatePlan, emptyPlan, migratePlan, isMultiFloor, floorById, floorName, uid, roomSides } from './plan/model.js';
import * as Furnish from './engine/furnish.js';
import { CATALOG } from './engine/furniture.js';
import { DAY_PRESETS } from './engine/daylight.js';
import { createProject, loadProjects, saveProject, currentProject, packProject, unpackProject, getUnderlays, putUnderlays, migrateProject, loadSettings, safeMaterials } from './store.js';
import { unpackJSON, packJSON, storagePlan, insights } from '../shared/profile.js';
import { APPLIANCES } from '../quiz/flow.js';
import { MOOD_BY_ID, tagsOf } from '../shared/moods.js';
import { AVOID_LABEL } from '../shared/summary.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';
import { MAT_BY_ID, fits, misfitHint, DEFAULT_SLOT_FOR_CAT, SLOT_BY_ID } from '../shared/materials.js';
import { BRAND } from '../shared/config.js';
import { t, L, isEn, setLang } from '../shared/i18n.js';
import { fmt } from '../shared/units.js';
import { isWishMode, tellShell } from '../shared/zen.js';
import MoodPanel from './ui/MoodPanel.jsx';
import DaylightPanel from './ui/DaylightPanel.jsx';
import MaterialDock from './ui/MaterialDock.jsx';
import Callouts from './ui/Callouts.jsx';
import Toolbar from './ui/Toolbar.jsx';
import { HoverTip, SelectionBar } from './ui/ItemUI.jsx';
import { Icon, FurnIcon, ConfirmSheet, slotName, listSep, roomLabel, useMedia } from './ui/kit.jsx';
import StartModal from './ui/StartModal.jsx';
import ShareModal from './ui/ShareModal.jsx';
import HelpModal from './ui/HelpModal.jsx';
import FloorSwitch from './ui/FloorSwitch.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import PlanEditor from './plan/PlanEditor.jsx';

const WISH = isWishMode();
const QS = new URLSearchParams(location.search);
const SHOWROOM = !WISH && QS.get('demo') === '1';

/** 从哪一页点进来的：员工版蓝图（quiz.html?staff=1）→ 'staff'；客人版蓝图（quiz.html）→ 'client'；其他 → '' */
const REF = (() => {
  try {
    if (!document.referrer) return '';
    const r = new URL(document.referrer);
    if (r.origin !== location.origin || !/\/quiz(\.html)?$/.test(r.pathname)) return '';
    return r.searchParams.get('staff') === '1' ? 'staff' : 'client';
  } catch {
    return '';
  }
})();
/** 这一次是员工打开的（链接带 ?staff=1，或从员工版蓝图点进来）；许愿模式里永远不是 */
const STAFF_LINK = !WISH && (QS.get('staff') === '1' || REF === 'staff');

/** 这份方案给设计师看（显示收纳对账、见面要聊的、员工版蓝图链接）还是给客人看 */
function staffFor(p) {
  if (WISH || !p) return false;
  if (STAFF_LINK) return true;
  if (REF === 'client') return false;
  if (p.audience) return p.audience === 'staff';
  return !p.sharedFrom;
}

// ───────────────────────── 楼层（v2 平面图） ─────────────────────────

/** 存着的方案 → v2（store 已经迁移过；再保险一次很便宜：旧的单层方案、没带 floor 的家具） */
const asV2 = (p) => migrateProject(p);
/** 每一层的底图 { floorId: underlay }（这台设备的 IndexedDB；旧的只有一张 → 一楼的） */
const loadUnderlays = async (id, plan) => (await getUnderlays(id, plan.floors[0].id)) || {};
async function saveUnderlays(id, map) {
  if (map && Object.keys(map).length) await putUnderlays(id, map);
}
const allRooms = (plan) => (plan?.floors || []).flatMap((f) => f.rooms);
/** 生成 / 打开多层方案时的那一句（不说「右边 / 上面」：楼层按钮在电脑、iPad 上是右边，手机上是工具条下面） */
const floorsToast = (plan) => (plan.floors.length === 2 ? t('两层都生成好了 —— 点「一楼 / 二楼」看每一层') : t('{0} 层都生成好了 —— 点楼层按钮看每一层', [plan.floors.length]));

/**
 * 从材质栏加进来的墙件（主题墙：贴墙、不能拖）和挂画：放到离落点最近、够长的那段实墙上（避开门窗、打通），背朝墙。
 * 已经有电视墙 / 主题墙的那一段墙往后排（不叠在电视墙上），别的墙都不合适时才用。
 * 朝向和 furnish.js 的 at() 一样：北墙 0 · 南墙 180 · 西墙 90 · 东墙 270；主题墙的背面由引擎再贴紧墙面（alignWallItem）。
 * 找不到合适的墙 → null（照旧放在落点）。
 */
const SIDE_ROT = { N: 0, S: 180, W: 90, E: 270 };
/** floor：放进去的那一层（{ rooms, openings }）；furniture：那一层的家具 */
function wallSpot(floor, furniture, kind, pt, room) {
  const def = CATALOG[kind];
  if (!def || !floor?.rooms?.length) return null;
  const [w0, d] = def.size;
  const need = Math.min(w0, 1.2) + 0.1;
  const walls = buildWalls(floor);
  // 已经贴着墙板的地方：{ rot, perp（离墙的那个坐标）, a, b（沿墙的范围） }
  const panels = (furniture || [])
    .filter((f) => f.kind === 'tvWall' || f.kind === 'featureWall')
    .map((f) => {
      const rot = (((Math.round((f.rot || 0) / 90) * 90) % 360) + 360) % 360;
      const ax = rot === 0 || rot === 180; // 背靠北 / 南墙：沿 x 走
      const half = (+(f.w ?? CATALOG[f.kind]?.size?.[0]) || 1) / 2;
      const along = ax ? f.x : f.z;
      return { rot, perp: ax ? f.z : f.x, a: along - half, b: along + half };
    });
  let best = null;
  for (const r of room ? [room] : floor.rooms) {
    for (const s of roomSides(r, walls)) {
      const alongX = s.axis === 'x'; // 北 / 南墙沿 x 走（z = s.c）；西 / 东墙沿 z 走（x = s.c）
      const along = alongX ? pt.x : pt.z;
      const off = (alongX ? pt.z : pt.x) - s.c;
      // 落点在这道墙的哪一边：房间里面那一边才算（落在房间外时，背对落点的墙不选）
      const facing = off * (alongX ? s.inward[1] : s.inward[0]) >= -0.05;
      for (const st of s.stretches) {
        if (st.len < need) continue;
        const w = Math.min(w0, st.len - 0.1);
        const at = Math.min(Math.max(along, st.a + w / 2 + 0.05), st.b - w / 2 - 0.05);
        const out = Math.max(0, st.a - along, along - st.b);
        const busy = panels.some((q) => q.rot === SIDE_ROT[s.side] && Math.abs(q.perp - s.c) < 0.7 && Math.min(q.b, at + w / 2) - Math.max(q.a, at - w / 2) > 0.3);
        const dist = Math.hypot(Math.abs(off), out) + (facing ? 0 : 50) + (busy ? 25 : 0);
        if (!best || dist < best.dist) best = { dist, r, s, w, at };
      }
    }
  }
  if (!best) return null;
  const { r, s, at } = best;
  const w = +best.w.toFixed(2);
  // 主题墙：中心离墙面 d/2（背面正好贴墙）；挂画：和 furnish 一样离墙面 3cm
  const dist = s.thick + (def.wall ? d / 2 : 0.03);
  const pos =
    s.side === 'N'
      ? { x: at, z: r.y + dist }
      : s.side === 'S'
        ? { x: at, z: r.y + r.d - dist }
        : s.side === 'W'
          ? { x: r.x + dist, z: at }
          : { x: r.x + r.w - dist, z: at };
  return { room: r.id, x: +pos.x.toFixed(3), z: +pos.z.toFixed(3), rot: SIDE_ROT[s.side], w };
}

const HISTORY = 60;
const snap = (p) => ({ materials: { ...p.materials }, furniture: p.furniture.map((f) => ({ ...f })), time: p.time, mood: p.mood, plan: p.plan, furnEdited: p.furnEdited });

/** 锚点几乎没动（< 0.5px）就不重画整个界面 */
function anchorsSame(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p.slot !== q.slot || p.visible !== q.visible || Math.abs(p.x - q.x) > 0.5 || Math.abs(p.y - q.y) > 0.5) return false;
  }
  return true;
}

// ───────────────────────── 收纳对账（只给设计师看） ─────────────────────────

const ROW_LABEL = { 'wardrobe:master': '主卧衣柜', shoe: '鞋柜', tall: '电器高柜', store: '储物间', books: '书墙', counter: '台面家电区', dining: '餐位', altar: '神台' };
const ROW_ICON = { wardrobe: 'wardrobe', shoeCabinet: 'shoeCabinet', tallUnit: 'tallUnit', store: 'store', bookshelf: 'bookshelf', kitchenRun: 'kitchenRun', diningTable: 'diningTable', altar: 'altar' };
// 和蓝图、许愿之旅同一种写法：毫米 + 千分位，取到 10 mm（2,100 mm），见面时三样东西对得上
const mmNum = (mm) => fmt(Math.round((Number(mm) || 0) / 10) * 10);
const fmtLen = (mm) => `${mmNum(mm)} mm`;

function rowLabel(r, plan) {
  if (ROW_LABEL[r.key]) return t(ROW_LABEL[r.key]);
  if (r.key.startsWith('wardrobe:')) return t('{0}衣柜', [roomLabel(allRooms(plan).find((x) => x.id === r.room))]);
  return r.key;
}
/** 客人许愿时没数这一项（target ≤ 0）：不画「x / 0」和满格绿条，只写摆了多少 + 「客人没数」 */
const notCounted = (r) => !(r.target > 0);
function rowValue(r) {
  if (notCounted(r)) {
    if (r.unit === 'mm') return fmtLen(r.placed);
    if (r.unit === 'seats') return t('{0} 座', [r.placed]);
    return String(r.placed);
  }
  // 单位只写一次：1,360 / 2,100 mm
  if (r.unit === 'mm') return `${mmNum(r.placed)} / ${fmtLen(r.target)}`;
  if (r.unit === 'seats') return t('{0} / {1} 座', [r.placed, r.target]);
  return `${r.placed} / ${r.target}`;
}
function rowGap(r) {
  if (r.unit === 'mm') return fmtLen(r.gap);
  if (r.unit === 'seats') return t('{0} 座', [r.gap]);
  return String(r.gap);
}

function StorageCheck({ rows, plan, talk, onPick }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('genie.studio.storageOpen') !== '0';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem('genie.studio.storageOpen', o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  const short = rows.filter((r) => r.gap > 0).length;
  return (
    <section className={`storage ${open ? 'open' : ''}`}>
      <button type="button" className="storage-head" onClick={toggle} aria-expanded={open}>
        <span className="storage-ico">
          <Icon name="storage" size={17} />
        </span>
        <span className="storage-title">
          <span className="tag-staff">{t('设计师')}</span>
          <b>{t('收纳对账')}</b>
          <em>{short ? t('{0} 项还差一点', [short]) : t('客人数的收纳都放进去了')}</em>
        </span>
        <Icon name="down" size={16} className="storage-chev" />
      </button>
      {open && (
        <div className="storage-body">
          <p className="storage-note">{t('客人许愿时数的量 vs 3D 里自动摆进去的。点一行，选中那件家具。')}</p>
          <ul className="storage-rows">
            {rows.map((r) => {
              const free = notCounted(r);
              const pct = free ? 0 : Math.min(1, r.placed / r.target);
              const ok = r.gap <= 0;
              const state = free && ok ? 'free' : ok ? 'ok' : 'short';
              return (
                <li key={r.key}>
                  <button type="button" className={`srow ${state}`} onClick={() => onPick(r)}>
                    <span className="srow-ico">
                      <FurnIcon kind={ROW_ICON[r.kind] || r.kind} size={17} stroke={1.6} />
                    </span>
                    <span className="srow-main">
                      <span className="srow-top">
                        <b>{rowLabel(r, plan)}</b>
                        <Icon name={state === 'free' ? 'info' : ok ? 'ok' : 'warn'} size={16} className="srow-state" />
                      </span>
                      <span className="srow-meter">
                        {!free && (
                          <span className="srow-bar">
                            <i style={{ width: `${Math.round(pct * 100)}%` }} />
                          </span>
                        )}
                        <span className="srow-val">{rowValue(r)}</span>
                      </span>
                      {free && <span className="srow-need">{t('客人没数')}</span>}
                      {!free && r.need != null && r.need > 0 && r.unit !== 'count' && <span className="srow-need">{r.unit === 'mm' ? t('客人数的：{0}', [fmtLen(r.need)]) : t('想要 {0} 座', [r.need])}</span>}
                      {/* 件数类（储物间、电器高柜、神台）的建议本身就说清楚缺什么，不再加「还差 1」 */}
                      {!ok && r.hint && <span className="srow-hint">{r.unit === 'count' ? t(r.hint) : t('还差 {0}。{1}', [rowGap(r), t(r.hint)])}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {talk.length > 0 && (
            <details className="storage-talk">
              <summary>{t('见面时要聊的（{0}）', [talk.length])}</summary>
              <ul>
                {talk.map((x, i) => (
                  <li key={i} className={x.level}>
                    <Icon name={x.level === 'conflict' ? 'warn' : 'info'} size={15} />
                    <span>{x.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── 主界面 ─────────────────────────

export default function StudioApp() {
  const host = useRef(null);
  const engine = useRef(null);
  const [project, setProject] = useState(null);
  const projRef = useRef(null);
  projRef.current = project;
  const past = useRef([]);
  const future = useRef([]);
  const [, bump] = useState(0);
  const [ready, setReady] = useState(false);
  const [anchors, setAnchors] = useState([]);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selPos, setSelPos] = useState(null);
  const [slot, setSlot] = useState(null);
  const [labels, setLabels] = useState(true);
  const [wallMode, setWallMode] = useState('cut');
  // 看哪一层（'all' | floorId）：引擎说了算（cb.onFloorView），这里只是跟着画楼层按钮
  const [floorView, setFloorView] = useState('all');
  const [view, setView] = useState('iso');
  const [thumbs, setThumbs] = useState([]);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [demo, setDemo] = useState(SHOWROOM);
  const demoRef = useRef(SHOWROOM);
  demoRef.current = demo;
  const [showroom, setShowroom] = useState(SHOWROOM);
  const showroomRef = useRef(SHOWROOM);
  showroomRef.current = showroom;
  const [panels, setPanels] = useState(() => (innerWidth > 900 ? 'open' : 'closed'));
  const [planDraft, setPlanDraft] = useState(null);
  const [incomingProfile, setIncomingProfile] = useState(null);
  const [bpLink, setBpLink] = useState('');
  const [ctx, setCtx] = useState(null); // WebGL：null | 'lost' | 'restored'
  const [ask, setAsk] = useState(null); // 纸色确认框
  const phone = useMedia('(max-width: 600px)'); // 手机：选择条停在底部（时间滑杆上面），不浮在模型中间
  const toastTimer = useRef(0);
  const toastRaf = useRef(0);

  // 提示停留的时间从「真正画出来」那一刻算起：换一整套材质时，下一帧要编译着色器，慢设备上会卡一下，
  // 计时要是从点击就开始，提示还没画出来就过期了。
  const flash = useCallback((msg, ms = 2600) => {
    if (showroomRef.current) return;
    setToast(msg);
    clearTimeout(toastTimer.current);
    cancelAnimationFrame(toastRaf.current);
    toastRaf.current = requestAnimationFrame(() => {
      toastRaf.current = requestAnimationFrame(() => {
        toastTimer.current = setTimeout(() => setToast(''), ms);
      });
    });
  }, []);

  const confirmSheet = (o) => new Promise((res) => setAsk({ ...o, done: (v) => (setAsk(null), res(v)) }));
  const saveNow = () => !showroomRef.current && projRef.current && saveProject(projRef.current);
  // 分享弹窗打开时打包一次（固定的函数：界面每次重画不会重新压缩整份方案）
  const packShare = useCallback(() => packProject(projRef.current), []);

  // ── 引擎 ──
  useEffect(() => {
    const e = new Engine(host.current, {
      onAnchors: (a) => setAnchors((prev) => (anchorsSame(prev, a) ? prev : a)),
      onHover: (h) => setHover(h),
      onSelect: (id) => setSelected(id),
      onSelMove: (p) => setSelPos((prev) => (p && prev && Math.abs(prev.x - p.x) < 0.5 && Math.abs(prev.y - p.y) < 0.5 ? prev : p)),
      onMove: (id, x, z) => updateFurniture((list) => list.map((f) => (f.id === id ? { ...f, x: +x.toFixed(3), z: +z.toFixed(3) } : f))),
      onInteract: () => !showroomRef.current && setDemo(false),
      onContextLost: () => setCtx('lost'),
      onContextRestored: () => setCtx('restored'),
      // 着色器编译失败（有些 Windows 显卡）：引擎已经自动降了一档；降到底还是不行就请他开硬件加速 / 更新驱动
      onRenderProblem: (p) =>
        flash(p.degradedTo ? t('这台电脑的显卡跑不动高画质，已自动换成兼容画质。') : t('这台电脑的浏览器画不出 3D：请在浏览器设置里打开「硬件加速」，或更新显卡驱动后再试。'), 8000),
      // 演示时引擎每 250ms 报一次时间：演示中界面是藏起来的，不跟着重画；退出时再同步
      onTime: (h) => !demoRef.current && Number.isFinite(h) && setProject((p) => (p && p.time !== h ? { ...p, time: h } : p)),
      // 换了楼层：记在方案上（这台设备下次打开还在这一层；分享链接里不带）
      onFloorView: (v) => {
        setFloorView(v);
        setProject((p) => (p && (p.floorView || 'all') !== v ? { ...p, floorView: v } : p));
      },
    });
    engine.current = e;
    window.__genie = e;
    // 画布被系统收回（iPad 显存紧张）：引擎还没接这个回调时，界面自己也听一下
    const cv = e.renderer?.domElement;
    const lost = () => setCtx((c) => c || 'lost');
    cv?.addEventListener('webglcontextlost', lost);
    // 本机选过的画质（设置里存的）：引擎还没读设置的话，这里补上
    const q = loadSettings().quality;
    if (q && e.quality !== q) e.setQuality?.(q);
    boot();
    return () => {
      cv?.removeEventListener('webglcontextlost', lost);
      e.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    let p = null;
    if (SHOWROOM) {
      // 展厅：永远是示范户型，不读本机方案、不读链接 → 底座上只会是品牌字样
      p = createProject({ plan: templatePlan('condo3'), mood: 'cozy' });
    } else {
      const h = location.hash.slice(1);
      try {
        if (h.startsWith('p=')) {
          const prof = await unpackJSON(h.slice(2));
          if (prof?.code) {
            setIncomingProfile(prof);
            const existing = loadProjects().find((x) => x.profile?.id === prof.id);
            p = existing || createProject({ plan: templatePlan('condo3'), profile: prof });
            // 档案链接默认是客人的：从客人版蓝图点进来、或者链接被复制到别处打开 / 转给家人（没有 referrer）都一样。
            // 记在方案上（这台设备上已有的那一份也改成客人版）：重新整理、以后直接打开 studio.html 也不会露出设计师的东西。
            // 设计师一定是从员工版蓝图或 ?staff=1 进来的（STAFF_LINK），员工链接会再把它改回员工版（见下面）。
            if (!WISH && !STAFF_LINK) p = { ...p, audience: 'client' };
            // 许愿模式：客人直接看到自己的家（示范户型 + 他的材质），设计师再换成真实平面图；客人版也不弹「开始一个空间」
            if (!existing && !WISH && staffFor(p)) setModal('start');
          }
        } else if (h.startsWith('s=')) {
          // 分享来的：新 id + sharedFrom（store.unpackProject）→ 默认是客人版；员工链接（?staff=1）在下面改成员工版
          p = await unpackProject(h.slice(2));
          flash(t('已打开分享的方案（改动会存成你自己的一份）'), 3400);
        }
      } catch {
        flash(t('链接打不开，先给你看示范户型'));
      }
      if (!p) p = currentProject();
      // 员工用员工链接打开了一份客人版 / 分享来的方案：这台设备上的这一份从此归员工（直接打开也显示收纳对账）
      if (p && STAFF_LINK && p.audience !== 'staff' && (p.sharedFrom || p.audience === 'client')) p = { ...p, audience: 'staff' };
      if (!p) {
        p = createProject({ plan: templatePlan('condo3'), mood: 'cozy' });
        setTimeout(() => flash(t('这是示范户型 —— 点右上角「平面图」上传你的平面图'), 4600), 1600);
      }
    }
    history.replaceState(null, '', location.pathname + location.search);
    loadProjectIntoEngine(p, true);
    tellShell('page', { page: 'studio' });
  }

  /** 底座上的字：客人名字 + 梦想家；许愿模式 / 展厅写明「示范户型 · 概念示意」；展厅从不出现客人名字。
   *  梦想家不写罗马数字（「I · The Zen Nester」在概念图上读起来像「我」）：英文只写名字，中文写「暖木禅居 · The Zen Nester」 */
  function plinthOf(p) {
    if (showroomRef.current) return { title: BRAND.plinth, subtitle: t('示范户型 · 概念示意') };
    const d = p.profile && DREAMER_BY_CODE[p.profile.code];
    const title = p.profile?.name ? `${String(p.profile.name).toUpperCase()} · DREAM HOME` : BRAND.plinth;
    let subtitle = d ? (isEn() ? d.en : `${d.zh} · ${d.en}`) : BRAND.full;
    if (WISH) subtitle = t('示范户型 · 概念示意');
    return { title, subtitle };
  }

  /** floorView：打开在哪一层（不给 = 方案上记着的那一层；单层 / 无效 = 全部） */
  function loadProjectIntoEngine(p0, frame = true, { keepHistory = false, floorView } = {}) {
    const e = engine.current;
    const p = asV2(p0);
    e.setScene({ plan: p.plan, furniture: p.furniture, materials: p.materials, time: p.time, ...plinthOf(p), frame, floorView: floorView ?? p.floorView });
    e.setWallMode(wallMode);
    if (!keepHistory) {
      past.current = [];
      future.current = [];
    }
    setProject(p);
    setSelected(null);
    setReady(true);
    scheduleThumbs();
  }

  // ── 自动保存（展厅不存：每次都是全新的示范户型） ──
  useEffect(() => {
    if (!project || showroom) return;
    const tm = setTimeout(() => saveProject(project), 500);
    return () => clearTimeout(tm);
  }, [project, showroom]);

  // ── 日光小图（材质变了就重画，防抖） ──
  const thumbTimer = useRef(0);
  const scheduleThumbs = useCallback(() => {
    clearTimeout(thumbTimer.current);
    if (showroomRef.current) return;
    thumbTimer.current = setTimeout(() => {
      if (!engine.current || showroomRef.current) return;
      try {
        setThumbs(engine.current.thumbs(DAY_PRESETS.map((d) => d.hour)));
      } catch {
        /* 画布不在了（context lost） */
      }
    }, 900);
  }, []);

  // ── 历史（撤销 / 重做；换平面图也能撤回） ──
  const commit = useCallback((next) => {
    const cur = projRef.current;
    if (!cur) return;
    past.current.push(snap(cur));
    if (past.current.length > HISTORY) past.current.shift();
    future.current = [];
    setProject({ ...cur, ...next });
    bump((n) => n + 1);
  }, []);

  const restore = (s) => {
    const cur = projRef.current;
    const e = engine.current;
    if (s.plan && s.plan !== cur.plan) {
      // 撤销 / 重做换回另一版平面图：还在看的那一层不变（那一层还在的话）
      loadProjectIntoEngine({ ...cur, ...s }, false, { keepHistory: true, floorView: e.floorView });
    } else {
      e.setMaterials(s.materials);
      e.setFurniture(s.furniture);
      e.setTime(s.time);
      setProject({ ...cur, ...s });
    }
    scheduleThumbs();
  };
  const undo = () => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(snap(projRef.current));
    restore(s);
    bump((n) => n + 1);
  };
  const redo = () => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(snap(projRef.current));
    restore(s);
    bump((n) => n + 1);
  };

  // ── 命令 ──
  const who = () => projRef.current?.profile?.name || t('这位客人');
  const avoidHits = (mat) => {
    const avoid = projRef.current?.profile?.avoid || [];
    if (!avoid.length || !mat) return [];
    const tags = tagsOf(mat);
    return avoid.filter((k) => tags.has(k));
  };

  const applyMaterial = useCallback(
    (slotId, matId) => {
      const cur = projRef.current;
      if (!cur || cur.materials[slotId] === matId) return;
      engine.current.setMaterial(slotId, matId);
      commit({ materials: { ...cur.materials, [slotId]: matId }, mood: 'custom' });
      scheduleThumbs();
    },
    [commit, scheduleThumbs],
  );

  const applyMood = (id) => {
    const cur = projRef.current;
    let materials;
    let time;
    if (id === 'dreamer' && cur.profile) {
      const d = DREAMER_BY_CODE[cur.profile.code];
      materials = { ...MOOD_BY_ID.cozy.materials, ...cur.profile.materials };
      time = MOOD_BY_ID[d?.mood]?.time ?? 18.4;
    } else {
      materials = { ...MOOD_BY_ID[id].materials };
      time = MOOD_BY_ID[id].time;
    }
    // 客人说过不要的（雷区），一键情绪也不能带回来
    const safe = safeMaterials(materials, cur.profile);
    materials = safe.materials;
    engine.current.setMaterials(materials);
    engine.current.setTime(time);
    commit({ materials, time, mood: id });
    scheduleThumbs();
    if (safe.swaps.length) flash(t('已按 {0} 的雷区避开：{1}', [who(), safe.swaps.map((s) => `${slotName(SLOT_BY_ID[s.slot])} ${L(MAT_BY_ID[s.from])} → ${L(MAT_BY_ID[s.to])}`).join(listSep())]), 4800);
  };

  const timeMsg = useRef(0);
  const setTime = (h) => {
    engine.current.setTime(h);
    setProject((p) => ({ ...p, time: h }));
    clearTimeout(timeMsg.current);
    timeMsg.current = setTimeout(() => tellShell('time', { hour: h }), 300);
  };

  function updateFurniture(fn) {
    const cur = projRef.current;
    if (!cur) return;
    const furniture = fn(cur.furniture);
    engine.current.setFurniture(furniture);
    commit({ furniture, furnEdited: true });
  }

  const rotateItem = (id) => updateFurniture((l) => l.map((f) => (f.id === id ? { ...f, rot: ((f.rot || 0) + 90) % 360 } : f)));
  const removeItem = (id) => {
    updateFurniture((l) => l.filter((f) => f.id !== id));
    engine.current.select(null);
  };
  const duplicateItem = (id) => {
    const nid = uid('f');
    updateFurniture((l) => {
      const f = l.find((x) => x.id === id);
      return f ? [...l, { ...f, id: nid, x: f.x + 0.4, z: f.z + 0.4 }] : l;
    });
    setTimeout(() => engine.current.select(nid), 30);
  };
  const variantItem = (id) =>
    updateFurniture((l) =>
      l.map((f) => {
        if (f.id !== id) return f;
        const vs = CATALOG[f.kind]?.variants;
        if (!vs) return f;
        return { ...f, variant: vs[(vs.indexOf(f.variant || vs[0]) + 1) % vs.length] };
      }),
    );
  const addItem = (kind, clientX, clientY) => {
    const e = engine.current;
    const def = CATALOG[kind];
    if (!def) return;
    const rect = host.current.getBoundingClientRect();
    const x = clientX ?? rect.left + rect.width / 2;
    const y = clientY ?? rect.top + rect.height / 2;
    // 落在「这一层」的地面上（看二楼时就放在二楼）
    const p = e.groundAt(x, y);
    const plan = projRef.current.plan;
    const floor = floorById(plan, p.floorId) || plan.floors[0];
    const room = floor.rooms.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.z >= r.y && p.z <= r.y + r.d);
    const [w, d] = def.size;
    const id = uid('f');
    const item = { id, kind, room: room?.id || null, floor: floor.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), rot: 0, w, d, h: floor.ceil };
    if (kind === 'art') item.y = 1.4;
    // 主题墙（不能拖）、挂画：直接挂到最近的那道墙上（这一层的墙）
    if (def.wall || def.wallMounted) {
      const first = plan.floors[0].id;
      const list = projRef.current.furniture.filter((f) => (f.floor || first) === floor.id);
      const spot = wallSpot(floor, list, kind, p, room) || (room ? wallSpot(floor, list, kind, p, null) : null);
      if (spot) Object.assign(item, spot);
    }
    updateFurniture((l) => [...l, item]);
    setTimeout(() => e.select(id), 30);
    // 主题墙贴着墙、拖不动：不说「拖一拖」
    flash(def.wall ? t('{0} 已贴到最近的那面墙上', [L(def)]) : t('{0} 已放进来 —— 拖一拖换位置', [L(def)]));
  };

  const dropMaterial = (matId, targetSlot) => {
    const mat = MAT_BY_ID[matId];
    if (!mat) return false;
    const s = targetSlot || (slot && fits(matId, slot) ? slot : DEFAULT_SLOT_FOR_CAT[mat.cat]);
    if (!fits(matId, s)) {
      flash(misfitHint(matId, s)); // 已经按当前语言翻好了
      return false;
    }
    applyMaterial(s, matId);
    const hit = avoidHits(mat);
    if (hit.length) flash(t('{0} 说过不要「{1}」—— 想试试也可以，按撤销就能还原', [who(), hit.map((k) => t(AVOID_LABEL[k] || k)).join(listSep())]), 4800);
    else flash(`${slotName(SLOT_BY_ID[s])} → ${L(mat)}`);
    return true;
  };

  // ── 平面图 ──
  /** 编辑器「生成 3D」：plan = v2；underlays = { floorId: 底图 }（旧编辑器给的是一张） */
  const applyPlan = async (plan0, underlays) => {
    const plan = migratePlan(plan0);
    const cur = projRef.current;
    const moved = cur.furnEdited || (cur.furnEdited === undefined && past.current.length > 0);
    if (moved) {
      const ok = await confirmSheet({
        title: t('重新生成 3D？'),
        body: t('重新生成会按新平面图自动摆家具，你手动调整过的家具位置会被覆盖。之后可以按撤销找回。'),
        ok: t('重新生成'),
      });
      if (!ok) return false;
    }
    const furniture = Furnish.furnish(plan, buildAllWalls(plan), cur.profile);
    await saveUnderlays(cur.id, underlays);
    past.current.push(snap(cur));
    if (past.current.length > HISTORY) past.current.shift();
    future.current = [];
    setPlanDraft(null);
    // 多层：生成完先看整栋（「全部」），再提示可以一层层看
    const multi = isMultiFloor(plan);
    loadProjectIntoEngine({ ...cur, plan, furniture, furnEdited: false, floorView: 'all' }, true, { keepHistory: true, floorView: 'all' });
    bump((n) => n + 1);
    flash(multi ? floorsToast(plan) : t('3D 已生成。家具是按设计师的规则自动摆的，拖一拖就能改。'), multi ? 4600 : 3600);
    return true;
  };

  const newFromTemplate = (tid) => {
    const cur = projRef.current;
    const p = createProject({ plan: templatePlan(tid), profile: incomingProfile || cur?.profile || null, mood: incomingProfile || cur?.profile ? null : 'cozy' });
    // 客人版里开的新方案（带着客人的档案）还是客人版：不会因为「新的一份」就露出设计师的东西
    loadProjectIntoEngine(cur && !staffFor(cur) ? { ...p, audience: 'client' } : p, true);
    setModal(null);
    if (isMultiFloor(p.plan)) flash(floorsToast(p.plan), 4600);
  };

  const openPlanEditor = async (start = 'current') => {
    const cur = projRef.current;
    const base = migratePlan(cur.plan);
    const underlays = start === 'current' ? await loadUnderlays(cur.id, base) : {};
    // 「自己画」：一张空白的单层（方案名、北方留着）
    const plan = start === 'blank' ? { ...emptyPlan(), name: base.name, north: base.north } : JSON.parse(JSON.stringify(base));
    // 编辑器打开在 3D 里正在看的那一层（「全部」= 一楼）
    const fv = engine.current?.floorView;
    setPlanDraft({ plan, underlays, autoUpload: start === 'upload', startFloor: start === 'current' && fv && fv !== 'all' && floorById(plan, fv) ? fv : undefined });
    setModal(null);
  };

  // ── 演示模式：自动环绕 + 时间流动（引擎有 setDemo 就交给它：节流到 ~30fps、降分辨率） ──
  useEffect(() => {
    const e = engine.current;
    if (!e || !ready) return;
    if (typeof e.setDemo === 'function') {
      e.setDemo(demo);
      if (!demo && Number.isFinite(e.time)) setProject((p) => (p ? { ...p, time: e.time } : p));
      return;
    }
    // 旧引擎：界面自己转时间，但每 100ms 才动一次光，界面不跟着每帧重画
    e.setAutoRotate(demo);
    if (!demo) {
      e.onTick = null;
      if (Number.isFinite(e.time)) setProject((p) => (p ? { ...p, time: e.time } : p));
      return;
    }
    let last = performance.now();
    let lastSet = 0;
    let h = e.time ?? 18;
    e.onTick = (now) => {
      h = (h + ((now - last) / 1000) * 0.9) % 24;
      last = now;
      if (now - lastSet < 100) return false;
      lastSet = now;
      e.setTime(h);
      return true;
    };
    return () => {
      e.onTick = null;
    };
  }, [demo, ready]);

  // 展厅大屏：不让屏幕睡着
  useEffect(() => {
    if (!showroom || !demo || !navigator.wakeLock) return;
    let lock = null;
    let alive = true;
    const req = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (alive) lock = l;
        else l.release();
      } catch {
        /* 不支持 / 没权限：不影响 */
      }
    };
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch?.(() => {});
    };
  }, [showroom, demo]);

  const exitShowroom = () => {
    setShowroom(false);
    setDemo(false);
    try {
      const u = new URL(location.href);
      u.searchParams.delete('demo');
      history.replaceState(null, '', u.pathname + u.search);
    } catch {
      /* ignore */
    }
  };
  // 展厅字标：长按 1.5 秒退出（大屏前的人随手碰到不会误退）
  const lp = useRef(0);
  const pressStart = () => {
    clearTimeout(lp.current);
    lp.current = setTimeout(exitShowroom, 1500);
  };
  const pressEnd = () => clearTimeout(lp.current);

  // 退出展厅：日光小图在展厅里没画（省电），现在补上
  useEffect(() => {
    if (!showroom && ready) scheduleThumbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showroom]);

  // 展厅里画布被收回：几秒后自己重新载入（没人看着大屏）
  useEffect(() => {
    if (!ctx || !showroom) return;
    const tm = setTimeout(() => location.reload(), 4000);
    return () => clearTimeout(tm);
  }, [ctx, showroom]);

  // ── 键盘（读最新的状态，监听只装一次） ──
  const keyRef = useRef(null);
  keyRef.current = (ev) => {
    if (ev.target.closest?.('input,textarea,select') || planDraft || modal || ask) return;
    const mod = ev.metaKey || ev.ctrlKey;
    if (showroom) {
      if (ev.key === 'Escape') exitShowroom();
      return;
    }
    if (mod && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      ev.shiftKey ? redo() : undo();
    } else if (mod && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      redo();
    } else if ((ev.key === 'PageUp' || ev.key === 'PageDown') && engine.current?.floors?.length > 1) {
      // 楼层：PageUp 往上一层、PageDown 往下一层（「全部」在最上面）
      ev.preventDefault();
      const e = engine.current;
      const ids = [...e.floors.map((F) => F.id), 'all'];
      const i = ids.indexOf(e.floorView);
      const j = Math.max(0, Math.min(ids.length - 1, i + (ev.key === 'PageUp' ? 1 : -1)));
      if (j !== i) e.setFloorView(ids[j]);
    } else if (selected && (ev.key === 'Delete' || ev.key === 'Backspace')) removeItem(selected);
    else if (selected && !mod && ev.key.toLowerCase() === 'r') rotateItem(selected);
    else if (ev.key === 'Escape') {
      if (demo) setDemo(false);
      engine.current?.select(null);
      setSlot(null);
    }
  };
  useEffect(() => {
    const onKey = (ev) => keyRef.current?.(ev);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── 语言：自己切换、或许愿模式外壳叫我们换（外壳不重新载入，只重载这一页） ──
  const switchLang = (l) => {
    saveNow();
    setLang(l);
  };
  useEffect(() => {
    const onMsg = (ev) => {
      if (ev.origin !== location.origin || ev.data?.source !== 'genie-shell') return;
      if (ev.data.type === 'lang' && (ev.data.lang === 'zh' || ev.data.lang === 'en')) {
        saveNow();
        setLang(ev.data.lang);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    document.title = SHOWROOM ? BRAND.full : `${t('3D 梦想工作室')} · ${BRAND.full}`;
  }, []);

  useEffect(() => {
    engine.current?.setWallMode(wallMode);
  }, [wallMode]);

  // ── 取景留白：告诉引擎四边各被面板挡住多少（engine.setInsets），模型就在没挡住的那块里居中、放得下 ──
  //   左：情绪面板（宽屏、展开时；窄屏它是临时盖上来的抽屉，不算）
  //   右：日光面板（只在它是右上角那张浮卡时）
  //   上：开着材质标签时是标签那一带的底边（一行或两行），否则是工具条
  //   下：底部那一列常驻的部分（材质栏、窄屏的日光条、许愿模式的说明）；提示、手机上停靠的选择条是临时的，不算 —— 模型不会跟着跳
  // 引擎自己会防抖，镜头没被动过时才重新取景；第一次（开机）直接对好，不让人看到一次滑动。
  const [calloutBottom, setCalloutBottom] = useState(null); // null = 标签还没排好（先按一行估）
  const insetsBooted = useRef(false);
  useLayoutEffect(() => {
    if (!ready) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const e = engine.current;
      if (!e?.setInsets) return;
      const W = innerWidth;
      const H = innerHeight;
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? r : null;
      };
      const q = (s) => document.querySelector(s);
      const ins = { left: 0, right: 0, top: 0, bottom: 0 };
      // 展厅：没有面板（引擎演示时本来就不留白）；退出展厅时这里会重新量
      if (showroomRef.current) return e.setInsets(ins);
      const mood = box(q('.mood-panel'));
      if (mood && panels === 'open' && W > 1023) ins.left = mood.right + 12;
      const dayEl = q('.day-panel');
      const day = box(dayEl);
      const dayFloats = !!day && getComputedStyle(dayEl).position === 'fixed';
      if (dayFloats) ins.right = W - day.left + 12;
      const tb = box(q('.toolbar'));
      ins.top = tb ? tb.bottom + 8 : 0;
      // 上边最少也要让开工具条（标签带太高、上下加起来超过预算时，引擎先缩上边，但不缩进工具条）
      ins.minTop = ins.top;
      if (labels && !demoRef.current) {
        // 标签只在够大的画布上出现（Callouts：≥ 600 × 560）；还没排好时按一行完整的标签估（76 + 样板 50 + 7 + 名牌 44）
        const band = calloutBottom ?? (W >= 600 && H >= 560 ? 76 + 101 : 0);
        if (band > 0) ins.top = Math.max(ins.top, band + 8);
      }
      let colTop = H;
      for (const s of ['.dock-wrap > .dock', '.dock-wrap > .wish-caption']) {
        const r = box(q(s));
        if (r) colTop = Math.min(colTop, r.top);
      }
      if (day && !dayFloats) colTop = Math.min(colTop, day.top);
      if (colTop < H) {
        ins.bottom = H - colTop + 12;
        // 底部那一列（材质栏）是实心的：引擎缩下边最多缩到它本身的高度，模型不钻到材质栏底下
        ins.minBottom = H - colTop;
      }
      // 楼层按钮：竖的占右边；横的在右半边（日光浮卡下面那一栏，或横屏手机工具条下面的右边）也只占右边 ——
      // 它比日光浮卡宽一点时，右边多让一点，不把上边整条推下去（三层楼的那一排比日光卡宽，以前把上边推到 530px，
      // 模型被挤到材质栏底下）；手机（竖着拿，≤ 600px）上工具条下面那条占上边
      const fs = box(q('.floor-switch'));
      if (fs) {
        if (fs.height > fs.width || (!phone && fs.left > W / 2)) ins.right = Math.max(ins.right, W - fs.left + 12);
        else ins.top = Math.max(ins.top, fs.bottom + 8);
      }
      e.setInsets(ins);
      if (!insetsBooted.current) {
        insetsBooted.current = true;
        // 开机：第一帧就按面板取景（不飞一下）；之后的变化交给引擎平滑地挪
        if (!e.demo && typeof e.frame === 'function' && (e.isFramed?.() ?? true)) e.frame(e.lastView || 'iso', false);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (ro) for (const s of ['.mood-panel', '.day-panel', '.toolbar', '.dock-wrap', '.floor-switch']) document.querySelectorAll(s).forEach((el) => ro.observe(el));
    addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      removeEventListener('resize', schedule);
    };
  }, [ready, panels, phone, labels, calloutBottom, demo, showroom, project?.plan?.floors?.length]);

  // 'auto' 交给引擎自己判断（引擎的 resolveQuality：触屏 → 流畅，电脑 → 高清）
  const onQuality = (q) => engine.current?.setQuality?.(q || 'auto');

  const selItem = selected && project?.furniture.find((f) => f.id === selected);
  const profile = project?.profile;
  const dreamer = profile && DREAMER_BY_CODE[profile.code];

  // 设计师在看，还是客人在看（见文件开头）：客人版不出现任何设计师的东西
  const staffView = !showroom && staffFor(project);

  // 「最近的方案」：设计师看到这台设备上的全部；客人版（万一打开了开始弹窗）最多只列这位客人自己的那一份 ——
  // 展厅 iPad 上别的客人的名字、梦想家、材质一个都不能出现
  const projectsList = useMemo(() => {
    if (modal !== 'start') return [];
    const all = loadProjects();
    if (staffView) return all;
    const pid = projRef.current?.profile?.id;
    return pid ? all.filter((x) => x.profile?.id === pid) : [];
  }, [modal, staffView]);

  // 梦想家卡 → 蓝图：员工版带 ?staff=1（有设计师版开关）；客人版、许愿模式不带
  useEffect(() => {
    const prof = project?.profile;
    if (!prof) {
      setBpLink('');
      return undefined;
    }
    let alive = true;
    packJSON(prof).then((s) => alive && setBpLink(new URL(`quiz.html${WISH ? '?mode=wish' : staffView ? '?staff=1' : ''}#bp=${s}`, location.href).href));
    return () => {
      alive = false;
    };
  }, [project?.profile, staffView]);

  // 收纳对账：只给设计师（员工版、有客人档案）；furnish.js 还没有 furnishReport 时不显示
  const report = useMemo(() => {
    if (!staffView || !project?.profile || typeof Furnish.furnishReport !== 'function') return null;
    try {
      const rows = Furnish.furnishReport(project.plan, buildAllWalls(project.plan), project.profile, project.furniture);
      return Array.isArray(rows) && rows.length ? rows : null;
    } catch {
      return null;
    }
  }, [project?.plan, project?.furniture, project?.profile, staffView]);
  // 见面时要聊的：销售笔记，也只给设计师
  const talk = useMemo(() => {
    if (!staffView || !project?.profile) return [];
    try {
      return insights(project.profile, storagePlan(project.profile.storage, APPLIANCES)).filter((x) => x.level !== 'tip');
    } catch {
      return [];
    }
  }, [project?.profile, staffView]);
  const pickRow = (r) => {
    const e = engine.current;
    const id = r.itemIds?.find((x) => projRef.current?.furniture.some((f) => f.id === x));
    if (id && e) {
      // 那件家具在别的楼层：先换到那一层，再选中
      const fid = e.floorOf(id) || r.floor;
      if (fid && e.floors?.length > 1 && e.interactiveFloor()?.id !== fid) e.setFloorView(fid);
      e.select(id);
    } else flash(r.hint ? t(r.hint) : t('3D 里还没有这一件'), 4200);
  };

  // 选择条：宽屏浮在家具上方（只在两块面板之间）；手机停在底部那一列、时间滑杆正上方
  const selBar = (docked) =>
    selItem &&
    (docked || selPos) &&
    !demo && (
      <SelectionBar
        key={docked ? 'dock' : 'float'}
        docked={docked}
        item={selItem}
        pos={selPos}
        materials={project.materials}
        onRotate={() => rotateItem(selItem.id)}
        onRemove={() => removeItem(selItem.id)}
        onDuplicate={() => duplicateItem(selItem.id)}
        onVariant={CATALOG[selItem.kind]?.variants ? () => variantItem(selItem.id) : null}
        onClose={() => engine.current.select(null)}
      />
    );

  const chip =
    profile && dreamer ? (
      <a className="dreamer-chip" href={bpLink || '#'} target={WISH ? '_self' : '_blank'} rel="noopener" title={t('打开梦想家蓝图')}>
        <span className="dc-num">{dreamer.num}</span>
        <span className="dc-text">
          <b>{t('为 {0} 定制', [profile.name || t('贵宾')])}</b>
          <em>
            {L(dreamer)} · {profile.code}
          </em>
        </span>
        <Icon name="chevron" size={16} className="dc-go" />
      </a>
    ) : staffView ? (
      // 「先让客人走一次许愿之旅」是写给设计师的；客人打开分享来的方案时不出现
      <a className="dreamer-chip ghost" href="quiz.html" target="_blank" rel="noopener">
        <span className="dc-num">
          <Icon name="sparkles" size={17} />
        </span>
        <span className="dc-text">
          <b>{t('先让客人走一次许愿之旅')}</b>
          <em>{t('客人的材质、收纳、雷区会自动带进 3D')}</em>
        </span>
        <Icon name="chevron" size={16} className="dc-go" />
      </a>
    ) : null;

  return (
    <div className={`studio panels-${panels} ${demo ? 'is-demo' : ''} ${showroom ? 'is-showroom' : ''} ${WISH ? 'is-wish' : ''} ${isEn() ? 'is-en' : ''}`}>
      <div className="stage3d" ref={host} />
      {!ready && (
        <div className="boot" role="status">
          <div className="boot-ring" />
          <p>{t('正在搭建你的家…')}</p>
        </div>
      )}

      {ready && project && (
        <>
          {labels && !demo && <Callouts anchors={anchors} materials={project.materials} onPick={(s) => setSlot((cur) => (cur === s ? null : s))} activeSlot={slot} panels={panels} onBand={setCalloutBottom} />}

          <MoodPanel
            project={project}
            dreamer={dreamer}
            staff={staffView}
            slot={slot}
            onSlot={(s) => {
              setSlot(s === slot ? null : s);
              engine.current.highlightSlot(s === slot ? null : s);
              setTimeout(() => engine.current?.highlightSlot(null), 900);
            }}
            onMood={applyMood}
            onToggle={() => setPanels((p) => (p === 'open' ? 'closed' : 'open'))}
            chip={chip}
            extra={report && <StorageCheck rows={report} plan={project.plan} talk={talk} onPick={pickRow} />}
          />

          <Toolbar
            canUndo={past.current.length > 0}
            canRedo={future.current.length > 0}
            onUndo={undo}
            onRedo={redo}
            // 许愿模式不下载概念图：存下来的图（底座写着客人名字）会留在展厅 iPad 的相册里，下一位客人一开相册就看得到
            onShot={WISH ? null : async () => {
              try {
                const blob = await engine.current.snapshot(2);
                const { stampSnapshot } = await import('./ui/stamp.js');
                // 多层、只看某一层时：图注写上是哪一层
                const fv = engine.current.floorView;
                const floor = isMultiFloor(project.plan) && fv && fv !== 'all' && floorById(project.plan, fv) ? t(floorName(project.plan, fv)) : '';
                const out = await stampSnapshot(blob, project, { floor });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(out);
                a.download = `WISH-${String(t(project.name) || 'concept').replace(/[\s/\\:*?"<>|]+/g, '-')}.png`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                flash(t('概念图已下载'));
              } catch {
                flash(t('这台设备暂时存不了高清图，换「流畅」画质再试一次'), 4200);
              }
            }}
            onShare={() => setModal('share')}
            labels={labels}
            onLabels={() => setLabels((v) => !v)}
            view={view}
            onView={() => {
              const order = ['iso', 'iso2', 'top', 'low', 'back'];
              const nv = order[(order.indexOf(view) + 1) % order.length];
              setView(nv);
              engine.current.frame(nv);
            }}
            wallMode={wallMode}
            onWalls={() => setWallMode((m) => (m === 'cut' ? 'down' : m === 'down' ? 'up' : 'cut'))}
            demo={demo}
            onDemo={() => setDemo((d) => !d)}
            onPlan={() => openPlanEditor('current')}
            onStart={staffView && !WISH ? () => setModal('start') : null}
            onHelp={() => setModal('help')}
            // 设置里是公司的 AI key、识别模型、接口地址：只给设计师（客人版、许愿模式都没有这一项；「语言」那一行照样在）
            onSettings={staffView ? () => setModal('settings') : null}
            onLang={switchLang}
            wish={WISH}
          />

          {/* 底部这一列（从下往上）：材质栏 · 窄屏时的日光条 · 许愿模式说明 · 提示；宽屏时日光面板固定在右上 */}
          <div className="dock-wrap">
            {toast && (
              <div className="glass s-toast" role="status" aria-live="polite">
                {toast}
              </div>
            )}
            {WISH && !demo && (
              <div className="glass wish-caption" role="note">
                <Icon name="info" size={15} />
                <span>{t('示范户型 · 设计师会换成你家的平面图')}</span>
              </div>
            )}
            {phone && selBar(true)}
            <DaylightPanel time={project.time} thumbs={thumbs} onTime={setTime} onCommit={saveNow} north={project.plan.north || 0} />
            <MaterialDock project={project} slot={slot} engine={engine} onDrop={dropMaterial} onAddItem={addItem} onClearSlot={() => setSlot(null)} />
          </div>

          {!demo && isMultiFloor(project.plan) && <FloorSwitch plan={project.plan} view={floorView} onView={(v) => engine.current?.setFloorView(v)} />}

          {hover && !selected && !demo && !phone && <HoverTip hover={hover} materials={project.materials} />}
          {!phone && selBar(false)}

          <footer className="foot">
            <button
              type="button"
              className="wordmark"
              tabIndex={showroom ? 0 : -1}
              onPointerDown={showroom ? pressStart : undefined}
              onPointerUp={pressEnd}
              onPointerLeave={pressEnd}
              onPointerCancel={pressEnd}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={showroom ? t('长按退出演示') : BRAND.full}
              title={showroom ? t('长按退出演示') : undefined}
            >
              <b>{BRAND.app}</b>
              <span>{BRAND.by}</span>
            </button>
          </footer>
        </>
      )}

      {modal === 'start' && staffView && (
        <StartModal
          profile={incomingProfile || profile}
          projects={projectsList}
          onTemplate={newFromTemplate}
          onUpload={() => openPlanEditor('upload')}
          onDraw={() => openPlanEditor('blank')}
          onOpen={(p) => {
            loadProjectIntoEngine(p, true);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'share' && <ShareModal project={project} pack={packShare} staff={staffView} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal wish={WISH} onClose={() => setModal(null)} />}
      {modal === 'settings' && staffView && <SettingsModal onClose={() => setModal(null)} onQuality={onQuality} onLang={switchLang} />}

      {/* 设置（AI key）只给设计师：客人版、许愿模式从「平面图 → AI 识别」也走不到设置。
          许愿模式的平面图只能画、不能上传：选文件会打开展厅 iPad 的相册和「文件」，里面有前面客人的图 */}
      {planDraft && (
        <PlanEditor
          initial={planDraft.plan}
          underlays={planDraft.underlays}
          startFloor={planDraft.startFloor}
          autoUpload={planDraft.autoUpload}
          upload={!WISH}
          onCancel={() => setPlanDraft(null)}
          onApply={applyPlan}
          onSettings={staffView ? () => setModal('settings') : undefined}
        />
      )}

      {ask && <ConfirmSheet title={ask.title} body={ask.body} ok={ask.ok} onOk={() => ask.done(true)} onCancel={() => ask.done(false)} />}

      {toast && (!ready || planDraft) && (
        <div className="glass s-toast floating" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      {demo && !showroom && (
        <button type="button" className="glass demo-exit" onClick={() => setDemo(false)}>
          <Icon name="pause" size={15} />
          {t('演示中 · 点任意处退出')}
        </button>
      )}

      {ctx && (
        <div className="ctx-lost" role="alertdialog" aria-modal="true" aria-label={t('3D 需要重新载入')}>
          <div className="glass ctx-card">
            <span className="ctx-ico">
              <Icon name="refresh" size={22} />
            </span>
            <h2>{t('3D 需要重新载入')}</h2>
            <p>{ctx === 'restored' ? t('3D 画面恢复了。如果看起来不对，重新载入一下就好 —— 方案已经自动保存。') : t('这台设备暂时收回了图形内存（iPad 上偶尔会这样）。方案已经自动保存，重新载入就能接着做。')}</p>
            <div className="m-actions">
              {ctx === 'restored' && (
                <button type="button" className="s-btn ghost" onClick={() => setCtx(null)}>
                  {t('继续')}
                </button>
              )}
              <button
                type="button"
                className="s-btn primary"
                onClick={() => {
                  saveNow();
                  location.reload();
                }}
              >
                <Icon name="refresh" size={16} />
                {t('重新载入')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
