// 底部：材质栏（木 / 石 / 砖 / 布 / 漆 / 金属）＋ 家具。每个材质像一片真的样板（有倒角、有光）。
// 拖到 3D 里任何表面 → 那一组表面发金光 → 放手就换上。点一下 = 换到当前选中的表面。
// 触屏、鼠标都用 pointer 事件自己做拖拽（HTML5 拖放在 iPad 上不能用）：
//   触屏：横着滑 = 滚动这一排（touch-action: pan-x 交给浏览器）；往上拖 = 拿起样板；
//   pointercancel（浏览器接手去滚动了）什么都不做；鼠标滚轮竖着滚 = 横向滚动。
// 拖着的样板（drag-ghost）用 portal 画在整个工作室的最上层：材质栏所在的 .dock-wrap 自己是一层（z-index 11），
// 留在里面的话，拖到情绪面板的材质板、日光面板、工具条上时样板和提示会被盖住。
// 「溪岸板材 · sAil」（SPEC §4.6 + §8 R1 / R12）：公司能订的真实板材，排第一个；板材库是空的就没有这个标签。
// 选了柜体 / 主题墙就自动切过来；★ 常用在前；点一下板 → 换上，同时弹一张小卡（序号 + 名字、纹理、表面；员工看得到厂家编号）。
// 柜体 / 主题墙上现在是程序化的样板色时，标签里一行「示意色 · 最接近的溪岸板材：…」，点一下就换成那块板。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORIES, MATERIALS, SLOT_BY_ID, fits, misfitHint, MAT_BY_ID, BOARD_SLOTS, boardsFor, onBoards } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { boardsOn, nearestBoard, factoryCode, sameCode, codesFor } from '../../shared/boards/match.js';
import { KIND_BY_V, FINISH_BY_V, GRAINS, USES } from '../../shared/boards/vocab-core.js';
import { CATALOG } from '../engine/furniture.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { FurnIcon, Icon, slotName, chipName } from './kit.jsx';

// 样板下的名字：系列小字 + 名字（chipName 在 kit.jsx，材质板的格子也用它）
export { chipName };

function ChipName({ fam, name }) {
  return (
    <span className={`chip-name ${fam ? 'has-fam' : ''}`}>
      {fam && <i>{fam}</i>}
      <b>{name}</b>
    </span>
  );
}

const ADDABLE = [
  'sofa',
  'armchair',
  'coffeeTable',
  'rug',
  'plant',
  'floorLamp',
  'sideTable',
  'art',
  'bookshelf',
  'displayCabinet',
  'diningTable',
  'sideboard',
  'bed',
  'nightstand',
  'wardrobe',
  'dresser',
  'desk',
  'island',
  'tallUnit',
  'shoeCabinet',
  'bench',
  'altar',
  'petBed',
  'toyStorage',
  'lounger',
  'featureWall',
];

/** 板材的小筛选（只显示有的那几类） */
const SAIL_FILTERS = [
  ['all', '全部', () => true],
  ['fav', '★ 常用', (m) => m.board.fav],
  ['wood', '木纹', (m) => m.board.kind === 'wood'],
  ['solid', '纯色', (m) => m.board.kind === 'solid'],
  ['stone', '石纹', (m) => m.board.kind === 'stone'],
];

/** 板材登记 / 删除 / 本机板材包读好 → 重新画（返回一个每次变化 +1 的数字） */
function useBoardsVersion() {
  const [v, setV] = useState(0);
  useEffect(() => onBoards(() => setV((n) => n + 1)), []);
  return v;
}

/** 板材小卡上的那一行：溪岸板材 · 乱纹 · 哑光（纯色 / 石纹板写类别；有系列写系列） */
function boardFacts(b) {
  const grain = GRAINS.find((g) => g.v === b.grain);
  return [t('溪岸板材'), b.series ? t(b.series) : '', b.kind !== 'wood' ? t(KIND_BY_V[b.kind]?.zh || '') : '', grain ? t(grain.zh) : '', FINISH_BY_V[b.finish] ? t(FINISH_BY_V[b.finish].zh) : '']
    .filter(Boolean)
    .join(' · ');
}

/** 点一下板之后浮在材质栏上面的小卡（7 秒后自己收起；点叉也收） */
function BoardCard({ id, slot, staff, caseObj, onClose }) {
  const m = MAT_BY_ID[id];
  if (!m?.board) return null;
  const b = m.board;
  const fromCase = !!slot && caseObj?.boards?.[slot] === id;
  const code = codesFor(staff) ? factoryCode(id) : '';
  const twins = code ? sameCode(id).map((x) => L(MAT_BY_ID[x])).filter(Boolean) : [];
  const uses = USES.filter((u) => b.uses.includes(u.v)).map((u) => t(u.zh));
  // 这个案例的柜门还用了织系列（只是资料，3D 里柜体用的是柜体的颜色）
  const weave = slot === 'cabinetry' ? (caseObj?.boardsAlso || []).map((x) => MAT_BY_ID[x]).filter((x) => x?.board?.kind === 'weave') : [];
  return (
    <div className="glass dock-info" role="status" aria-live="polite">
      <span className="sample md">
        <img src={swatchURL(id, 128) || ''} alt="" draggable={false} />
      </span>
      <div className="dock-info-b">
        <b>{L(m)}</b>
        <span className="dock-info-facts">{boardFacts(b)}</span>
        <span className="dock-info-tags">
          {fromCase && <i className="is-case">{t('这个案例用的就是它')}</i>}
          {slot && BOARD_SLOTS.includes(slot) && <i className="is-ours">{t('我们做')}</i>}
        </span>
        {weave.length > 0 && <span className="dock-info-weave">{t('这个案例的柜门：{0}（3D 里先用柜体的颜色示意）', [weave.map((x) => L(x)).join(isEn() ? ', ' : '、')])}</span>}
        {staff && (
          <span className="dock-info-staff">
            {[code && (twins.length ? t('厂家编号 {0}（{1}也是这个编号）', [code, twins.join(isEn() ? ', ' : '、')]) : t('厂家编号 {0}', [code])), uses.join(' / ')].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <button type="button" className="dock-info-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

export default function MaterialDock({ project, slot, engine, onDrop, onAddItem, onClearSlot, staff = false, caseObj = null }) {
  const [tab, setTab] = useState('fabric');
  const [sf, setSf] = useState('all'); // 板材的小筛选
  const [info, setInfo] = useState(null); // 小卡：哪块板
  const [ghost, setGhost] = useState(null);
  const bv = useBoardsVersion();
  // 能上 3D 的板（隐藏的、织系列不算）；板材库是空的 / 关掉 → 没有这个标签
  const sailAll = boardsOn() ? boardsFor(null) : [];
  const sailOn = sailAll.length > 0;
  const drag = useRef(null);
  const row = useRef(null);
  const segRef = useRef(null);
  // 类别标签放不下（分开对照时材质栏只有右半边那么宽、窄窗口）：先收窄一点（snug）；再去掉英文小字（tight）；
  // 还放不下就横着滑、右边淡出（over）
  const [fit, setFit] = useState({ mode: '', over: false });
  useLayoutEffect(() => {
    const seg = segRef.current;
    const dock = seg?.closest('.dock');
    if (!seg || !dock) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      // 从最宽的排法开始量：放得下就停（量完把 class 还原成 React 给的那一个，下一次渲染再按 state 来）
      const before = seg.className;
      seg.classList.remove('snug', 'tight', 'over');
      const tooWide = () => seg.scrollWidth > seg.clientWidth + 1;
      let mode = '';
      for (const m of ['', 'snug', 'tight']) {
        seg.classList.remove('snug', 'tight');
        if (m) seg.classList.add(m);
        mode = m;
        if (!tooWide()) break;
      }
      const over = tooWide();
      seg.className = before;
      setFit((f) => (f.mode === mode && f.over === over ? f : { mode, over }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => !raf && (raf = requestAnimationFrame(measure))) : null;
    ro?.observe(dock);
    document.fonts?.ready?.then(() => !raf && (raf = requestAnimationFrame(measure)));
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [slot]);

  // 选了表面 → 自动切到它能用的类别（柜体 / 主题墙有放得上的溪岸板材 → 板材标签）
  useEffect(() => {
    if (!slot) return;
    if (sailOn && BOARD_SLOTS.includes(slot) && sailAll.some((m) => fits(m.id, slot))) {
      setTab('sail');
      return;
    }
    const cats = SLOT_BY_ID[slot]?.cats || [];
    if (!cats.includes(tab)) setTab(cats[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);
  // 板材都删光了（或者还没读好）：不停在一个空的标签上
  useEffect(() => {
    if (tab === 'sail' && !sailOn) setTab(SLOT_BY_ID[slot]?.cats?.[0] || 'wood');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sailOn, tab]);
  // 小卡：7 秒后自己收起；换了标签 / 表面也收起
  useEffect(() => {
    if (!info) return undefined;
    const id = setTimeout(() => setInfo(null), 7000);
    return () => clearTimeout(id);
  }, [info]);
  useEffect(() => setInfo(null), [tab, slot]);

  // 换类别 → 这一排回到开头
  useEffect(() => {
    if (row.current) row.current.scrollLeft = 0;
  }, [tab]);

  // 竖着滚的滚轮 → 横向滚动（非 passive，才能 preventDefault）
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const targetAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const tagged = el?.closest?.('[data-slot]');
    if (tagged) return { slot: tagged.dataset.slot, ui: true };
    if (el?.classList?.contains('studio-canvas')) return { slot: engine.current?.slotAt(x, y) || null, ui: false };
    return null;
  };

  const startDrag = (e, payload) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (drag.current) return; // 第二根手指：不理
    const touch = e.pointerType !== 'mouse';
    drag.current = { ...payload, id: e.pointerId, touch, x0: e.clientX, y0: e.clientY, moved: false, dead: false };
    const move = (ev) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id || d.dead) return;
      const dx = ev.clientX - d.x0;
      const dy = ev.clientY - d.y0;
      if (!d.moved) {
        if (d.touch) {
          // 触屏：只有「往上拿起」才算拖；横着滑交给浏览器滚动
          if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
            d.dead = true;
            return;
          }
          if (dy < -10 && Math.abs(dy) > Math.abs(dx)) d.moved = true;
        } else if (Math.hypot(dx, dy) > 7) d.moved = true;
      }
      if (!d.moved) return;
      ev.preventDefault();
      let hint = '';
      let ok = false;
      if (d.matId) {
        const tgt = targetAt(ev.clientX, ev.clientY);
        const target = tgt?.slot || null;
        engine.current?.highlightSlot(target);
        if (target) {
          ok = fits(d.matId, target);
          hint = ok ? t('放手 → {0}换成{1}', [slotName(SLOT_BY_ID[target]), L(MAT_BY_ID[d.matId])]) : misfitHint(d.matId, target);
        } else hint = t('拖到一个表面上');
      } else {
        hint = t('放下 {0}', [L(CATALOG[d.kind])]);
        ok = true;
      }
      setGhost({ x: ev.clientX, y: ev.clientY, matId: d.matId, kind: d.kind, hint, ok });
    };
    const up = (ev) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      drag.current = null;
      setGhost(null);
      engine.current?.highlightSlot(null);
      // 浏览器接手滚动（或系统打断）：什么都不换、什么都不加
      if (ev.type === 'pointercancel' || d.dead) return;
      if (d.matId) {
        if (!d.moved) {
          if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 10) {
            const ok = onDrop(d.matId, null, d.board ? { quiet: true } : undefined);
            if (d.board && ok !== false) setInfo(d.matId);
          }
          return;
        }
        const tgt = targetAt(ev.clientX, ev.clientY);
        if (tgt?.slot) onDrop(d.matId, tgt.slot);
      } else if (d.kind) {
        if (!d.moved) {
          if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 10) onAddItem(d.kind);
          return;
        }
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (el?.classList?.contains('studio-canvas')) onAddItem(d.kind, ev.clientX, ev.clientY);
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const used = new Set(Object.values(project.materials));
  // 板材：只列放得上这个表面的（没选表面 = 全部，拖的时候照样按 fits）；★ 常用在前，其余按类别、序号（BOARDS 本来的顺序）
  const sailFits = slot ? sailAll.filter((m) => fits(m.id, slot)) : sailAll;
  const sfOpts = SAIL_FILTERS.filter(([k, , fn]) => k === 'all' || sailFits.some(fn));
  const sfFn = (sfOpts.find(([k]) => k === sf) || SAIL_FILTERS[0])[2];
  const sailList = sailFits.filter(sfFn).sort((a, b) => (b.board.fav ? 1 : 0) - (a.board.fav ? 1 : 0));
  // 柜体 / 主题墙上是程序化的样板色：最接近的溪岸板材（点了才换；远到 2 × matchDE 以外就不提）
  const curId = slot ? project.materials[slot] : null;
  const near = sailOn && slot && BOARD_SLOTS.includes(slot) && MAT_BY_ID[curId] && !MAT_BY_ID[curId].board ? nearestBoard(curId, slot, { avoid: project.profile?.avoid || [] }) : null;
  const sample = near && (near.ok || near.hint) ? near : null;
  const list = tab === 'sail' ? sailList : MATERIALS.filter((m) => m.cat === tab);
  const tabs = [
    ...(sailOn ? [{ id: 'sail', label: t('溪岸板材'), sub: isEn() ? '' : 'sAil', sail: true }] : []),
    ...CATEGORIES.map((c) => ({ id: c.id, label: L(c), sub: isEn() ? '' : c.en })),
    { id: 'furniture', label: t('家具'), sub: isEn() ? '' : 'Furniture', sep: true },
  ];

  return (
    <>
      <div className="glass dock">
        <div className="dock-head">
          <div ref={segRef} className={`seg seg-dock ${fit.mode} ${fit.over ? 'over' : ''}`} role="tablist" aria-label={t('材质类别')}>
            {tabs.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} className={`${tab === c.id ? 'on' : ''} ${c.sep ? 'sep' : ''} ${c.sail ? 'sail' : ''}`} onClick={() => setTab(c.id)}>
                <span>{c.label}</span>
                {c.sub && <i>{c.sub}</i>}
              </button>
            ))}
          </div>
          {slot && (
            <span className="dock-slot">
              <span>
                {t('正在换')} <b>{slotName(SLOT_BY_ID[slot])}</b>
              </span>
              <button type="button" onClick={onClearSlot} aria-label={t('取消')} title={t('取消')}>
                <Icon name="close" size={14} />
              </button>
            </span>
          )}
        </div>
        {tab === 'sail' && (
          <div className="dock-sub">
            {sfOpts.length > 2 && (
              <div className="dock-filters" role="radiogroup" aria-label={t('板材筛选')}>
                {sfOpts.map(([k, zh]) => (
                  <button key={k} type="button" role="radio" aria-checked={sf === k} className={sf === k ? 'on' : ''} onClick={() => setSf(k)}>
                    {k === 'all' ? `${t(zh)} ${sailFits.length}` : t(zh)}
                  </button>
                ))}
              </div>
            )}
            {sample ? (
              <button type="button" className="dock-sample" data-sfx="apply" onClick={() => onDrop(sample.id, slot, { quiet: true }) !== false && setInfo(sample.id)} title={t('点一下换成这块溪岸板材')}>
                <span className="sample xs">
                  <img src={swatchURL(sample.id, 48) || ''} alt="" draggable={false} />
                </span>
                <span>{t('示意色 · 最接近的溪岸板材：{0}', [L(MAT_BY_ID[sample.id])])}</span>
              </button>
            ) : (
              slot && <span className="dock-hint">{t('只显示能放在「{0}」上的', [slotName(SLOT_BY_ID[slot])])}</span>
            )}
          </div>
        )}
        {info && tab === 'sail' && <BoardCard key={`${info}:${bv}`} id={info} slot={slot && fits(info, slot) ? slot : MAT_BY_ID[info]?.board?.uses?.[0] || null} staff={staff} caseObj={caseObj} onClose={() => setInfo(null)} />}
        <div className="dock-row" ref={row}>
          {tab === 'furniture'
            ? ADDABLE.filter((k) => CATALOG[k]).map((k) => (
                <button key={k} type="button" className="chip fur" onPointerDown={(e) => startDrag(e, { kind: k })} title={t('{0} · 拖进房间或点一下', [L(CATALOG[k])])} aria-label={L(CATALOG[k])}>
                  <span className="sample tile">
                    <FurnIcon kind={k} size={24} />
                  </span>
                  <ChipName name={L(CATALOG[k])} />
                </button>
              ))
            : list.map((m) => {
                const dim = slot && !fits(m.id, slot);
                const cur = slot && project.materials[slot] === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`chip sw ${used.has(m.id) ? 'used' : ''} ${cur ? 'cur' : ''} ${dim ? 'dim' : ''}`}
                    onPointerDown={(e) => startDrag(e, { matId: m.id, board: !!m.board })}
                    title={m.board ? L(m) : isEn() ? L(m) : `${m.zh} · ${m.en}`}
                    aria-label={L(m)}
                  >
                    <span className="sample">
                      <img src={swatchURL(m.id, 128) || ''} alt="" draggable={false} loading={m.board ? 'lazy' : undefined} />
                      {used.has(m.id) && <i className="used-dot" aria-hidden="true" />}
                      {m.board?.fav && <i className="fav-dot" aria-hidden="true" />}
                    </span>
                    <ChipName {...chipName(m)} />
                  </button>
                );
              })}
        </div>
      </div>
      {ghost &&
        createPortal(
          <div className={`drag-ghost ${ghost.ok ? 'ok' : 'bad'}`} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            {ghost.matId ? (
              <span className="sample lg">
                <img src={swatchURL(ghost.matId, 128) || ''} alt="" />
              </span>
            ) : (
              <span className="sample tile lg">
                <FurnIcon kind={ghost.kind} size={28} />
              </span>
            )}
            <em>{ghost.hint || L(MAT_BY_ID[ghost.matId])}</em>
          </div>,
          // 工作室的根（.studio 的局部颜色 token 都在上面）；万一找不到就挂在 body 上
          row.current?.closest('.studio') || document.body,
        )}
    </>
  );
}
