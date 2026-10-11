// 底部：材质栏（木 / 石 / 砖 / 布 / 漆 / 金属）＋ 家具。每个材质像一片真的样板（有倒角、有光）。
// 拖到 3D 里任何表面 → 那一组表面发金光 → 放手就换上。点一下 = 换到当前选中的表面。
// 触屏、鼠标都用 pointer 事件自己做拖拽（HTML5 拖放在 iPad 上不能用）：
//   触屏：横着滑 = 滚动这一排（touch-action: pan-x 交给浏览器）；往上拖 = 拿起样板；
//   pointercancel（浏览器接手去滚动了）什么都不做；鼠标滚轮竖着滚 = 横向滚动。
// 拖着的样板（drag-ghost）用 portal 画在整个工作室的最上层：材质栏所在的 .dock-wrap 自己是一层（z-index 11），
// 留在里面的话，拖到情绪面板的材质板、日光面板、工具条上时样板和提示会被盖住。

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORIES, MATERIALS, SLOT_BY_ID, fits, misfitHint, MAT_BY_ID } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
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

export default function MaterialDock({ project, slot, engine, onDrop, onAddItem, onClearSlot }) {
  const [tab, setTab] = useState('fabric');
  const [ghost, setGhost] = useState(null);
  const drag = useRef(null);
  const row = useRef(null);

  // 选了表面 → 自动切到它能用的类别
  useEffect(() => {
    if (!slot) return;
    const cats = SLOT_BY_ID[slot]?.cats || [];
    if (!cats.includes(tab)) setTab(cats[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

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
          if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 10) onDrop(d.matId, null);
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
  const list = MATERIALS.filter((m) => m.cat === tab);
  const tabs = [...CATEGORIES.map((c) => ({ id: c.id, label: L(c), sub: isEn() ? '' : c.en })), { id: 'furniture', label: t('家具'), sub: isEn() ? '' : 'Furniture', sep: true }];

  return (
    <>
      <div className="glass dock">
        <div className="dock-head">
          <div className="seg seg-dock" role="tablist" aria-label={t('材质类别')}>
            {tabs.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} className={`${tab === c.id ? 'on' : ''} ${c.sep ? 'sep' : ''}`} onClick={() => setTab(c.id)}>
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
                    onPointerDown={(e) => startDrag(e, { matId: m.id })}
                    title={isEn() ? L(m) : `${m.zh} · ${m.en}`}
                    aria-label={L(m)}
                  >
                    <span className="sample">
                      <img src={swatchURL(m.id, 128) || ''} alt="" draggable={false} />
                      {used.has(m.id) && <i className="used-dot" aria-hidden="true" />}
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
