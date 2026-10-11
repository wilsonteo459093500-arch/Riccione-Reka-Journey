// 底部：材质栏（木 / 石 / 砖 / 布 / 漆 / 金属）＋ 家具。
// 拖到 3D 里任何表面 → 那一组表面发金光 → 放手就换上。点一下 = 换到当前选中的表面。
// 触屏、鼠标都用 pointer 事件自己做拖拽（HTML5 拖放在 iPad 上不能用）。

import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, MATERIALS, SLOT_BY_ID, fits, misfitHint, MAT_BY_ID } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { CATALOG } from '../engine/furniture.js';

const ADDABLE = ['sofa', 'armchair', 'coffeeTable', 'rug', 'plant', 'floorLamp', 'sideTable', 'art', 'bookshelf', 'displayCabinet', 'diningTable', 'sideboard', 'bed', 'nightstand', 'wardrobe', 'dresser', 'desk', 'island', 'tallUnit', 'shoeCabinet', 'bench', 'altar', 'petBed', 'toyStorage', 'lounger', 'featureWall'];

export default function MaterialDock({ project, slot, engine, onDrop, onAddItem, onClearSlot }) {
  const [tab, setTab] = useState('fabric');
  const [ghost, setGhost] = useState(null);
  const drag = useRef(null);

  // 选了表面 → 自动切到它能用的类别
  useEffect(() => {
    if (!slot) return;
    const cats = SLOT_BY_ID[slot]?.cats || [];
    if (!cats.includes(tab)) setTab(cats[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const targetAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const tagged = el?.closest?.('[data-slot]');
    if (tagged) return { slot: tagged.dataset.slot, ui: true };
    if (el?.classList?.contains('studio-canvas')) return { slot: engine.current.slotAt(x, y), ui: false };
    return null;
  };

  const startDrag = (e, payload) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { ...payload, x0: e.clientX, y0: e.clientY, moved: false };
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 7) d.moved = true;
      if (!d.moved) return;
      ev.preventDefault();
      let hint = '';
      let ok = false;
      let target = null;
      if (d.matId) {
        const t = targetAt(ev.clientX, ev.clientY);
        target = t?.slot || null;
        engine.current.highlightSlot(target);
        if (target) {
          ok = fits(d.matId, target);
          hint = ok ? `放手 → ${SLOT_BY_ID[target].zh}换成${MAT_BY_ID[d.matId].zh}` : misfitHint(d.matId, target);
        } else hint = '拖到一个表面上';
      } else {
        hint = `放下 ${CATALOG[d.kind].zh}`;
        ok = true;
      }
      setGhost({ x: ev.clientX, y: ev.clientY, matId: d.matId, kind: d.kind, hint, ok });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const d = drag.current;
      drag.current = null;
      setGhost(null);
      engine.current.highlightSlot(null);
      if (!d) return;
      if (d.matId) {
        if (!d.moved) return onDrop(d.matId, null);
        const t = targetAt(ev.clientX, ev.clientY);
        if (t?.slot) onDrop(d.matId, t.slot);
      } else if (d.kind) {
        if (!d.moved) onAddItem(d.kind);
        else {
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          if (el?.classList?.contains('studio-canvas')) onAddItem(d.kind, ev.clientX, ev.clientY);
        }
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const used = new Set(Object.values(project.materials));
  const list = MATERIALS.filter((m) => m.cat === tab);

  return (
    <>
      <div className="dock">
        <div className="dock-tabs">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={tab === c.id ? 'on' : ''} onClick={() => setTab(c.id)}>
              {c.en}
              <i>{c.zh}</i>
            </button>
          ))}
          <span className="dock-sep" />
          <button type="button" className={tab === 'furniture' ? 'on' : ''} onClick={() => setTab('furniture')}>
            Furniture<i>家具</i>
          </button>
          {slot && (
            <span className="dock-slot">
              正在换：<b>{SLOT_BY_ID[slot].zh}</b>
              <button type="button" onClick={onClearSlot} aria-label="取消">
                ✕
              </button>
            </span>
          )}
        </div>
        <div className="dock-row">
          {tab === 'furniture'
            ? ADDABLE.map((k) => (
                <button key={k} type="button" className="fur" onPointerDown={(e) => startDrag(e, { kind: k })} title={`${CATALOG[k].zh} · 拖进房间或点一下`}>
                  <span>{CATALOG[k].icon}</span>
                  <b>{CATALOG[k].zh}</b>
                </button>
              ))
            : list.map((m) => {
                const dim = slot && !fits(m.id, slot);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`sw ${used.has(m.id) ? 'used' : ''} ${slot && project.materials[slot] === m.id ? 'cur' : ''} ${dim ? 'dim' : ''}`}
                    onPointerDown={(e) => startDrag(e, { matId: m.id })}
                    title={`${m.zh} ${m.en}`}
                  >
                    <img src={swatchURL(m.id, 112) || ''} alt="" draggable={false} />
                    <b>
                      {used.has(m.id) && <i className="dot" />}
                      {m.zh}
                    </b>
                    <em>{m.en}</em>
                  </button>
                );
              })}
        </div>
      </div>
      {ghost && (
        <div className={`drag-ghost ${ghost.ok ? 'ok' : 'bad'}`} style={{ left: ghost.x, top: ghost.y }}>
          {ghost.matId ? <img src={swatchURL(ghost.matId, 112) || ''} alt="" /> : <span className="ghost-ico">{CATALOG[ghost.kind]?.icon}</span>}
          <em>{ghost.hint || MAT_BY_ID[ghost.matId]?.zh}</em>
        </div>
      )}
    </>
  );
}
