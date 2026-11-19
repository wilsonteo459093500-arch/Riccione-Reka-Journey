// 走进去 · 量尺（SPEC §5 · U5b）：点两下量距离、点墙看长和高、清掉。
//
// WalkMode：工具是 'measure' 时画在整层 .walk-ui 里（不在 .walk-dock 里）：.walk-ui 是 position: absolute; inset: 0、
//   不接指针 —— 标签按 ctl.project(v3) → { x, y, visible } 的屏幕 px 放（自己 position: absolute），
//   要接指针的按钮自己加 pointer-events: auto。放在工具轮正上方的控制条用 bottom: var(--walk-panel-b)（walk.css 给的，
//   已经算好许愿模式抬高、手机的工具条），水平居中。
// props（所有工具面板都一样）：
//   ctl      controller；可能是 null。ctl.on('measure', fn) → off · ctl.project(v3)
//   engine · project · api · wish · staff · room · fi · mode（没用）
//   onClose  收起（回到「走」）
//
// 做法：点和线是控制器画的（marks3d.js）；这里只画字。'measure' 事件 { a, b, mm, text, wall }：
//   两下 → 线的中点上一个标签「2,100 mm · 约 7 尺 / ft」；第一下点在墙上 → 那一点上「墙长 … / 墙高 …」（两行，wallDims 的毫米），
//   控制条上「墙 3,200 × 2,800 mm（长 × 高）」；
//   清掉 → 全是 null。标签跟着 3D 的点走：只有这一层画着（量尺这个工具开着）、又有标签的时候才跑 requestAnimationFrame，
//   直接改 transform（不重画 React）；点跑到镜头后面 / 画面外 → 藏起来。字每次按现在的语言重新拼（不用事件里拼好的 text）。
//   控制条：一句提示（或者量出来的数）+「清掉」（ctl.clearMeasure）+ 收起。

import { useEffect, useRef, useState } from 'react';
import { t } from '../../shared/i18n.js';
import { fmt, mmFt } from '../../shared/units.js';
import { Icon } from '../ui/kit.jsx';
import { measureText } from './measure.js';
import './walk-tools.css';

const EMPTY = { a: null, b: null, mm: null, text: null, wall: null };

/**
 * 'measure' 事件 → 要画的：{ lines（标签的几行）, at（标签放在哪个世界坐标点；没有标签 = null）, result（控制条上的数）, hint }
 */
export function measureView(e) {
  const a = e?.a || null;
  const b = e?.b || null;
  if (!a) return { lines: [], at: null, result: '', hint: t('点两下量距离 · 点墙看长和高') };
  if (b) {
    const mm = Number.isFinite(+e.mm) && e.mm != null ? +e.mm : measureText(a, b).mm;
    const d = mmFt(mm);
    return { lines: [d], at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, result: d, hint: t('再点一下，重新量') };
  }
  const w = e.wall;
  if (w && (w.lengthMm || w.heightMm)) {
    const lines = [t('墙长 {0}', [mmFt(w.lengthMm)]), t('墙高 {0}', [mmFt(w.heightMm)])];
    return { lines, at: a, result: t('墙 {0} × {1} mm（长 × 高）', [fmt(w.lengthMm), fmt(w.heightMm)]), hint: t('再点一下另一点，量两点的距离') };
  }
  return { lines: [], at: null, result: '', hint: t('再点一下另一点') };
}

export default function MeasureLayer({ ctl, onClose }) {
  const [m, setM] = useState(EMPTY);
  useEffect(() => ctl?.on?.('measure', (e) => setM(e || EMPTY)), [ctl]);
  const v = measureView(m);
  const label = useRef(null);
  const at = v.at;
  const [ax, ay, az] = at ? [at.x, at.y, at.z] : [];

  // 标签跟着 3D 的点走（只在有标签时跑；卸下 = 量尺收起了 → 停）
  useEffect(() => {
    const el = label.current;
    if (!ctl?.project || ax == null || !el || typeof requestAnimationFrame !== 'function') return undefined;
    const pt = { x: ax, y: ay, z: az };
    let raf = 0;
    let last = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = ctl.project(pt);
      const key = p?.visible ? `${Math.round(p.x)},${Math.round(p.y)}` : 'off';
      if (key === last) return;
      last = key;
      if (key === 'off') el.style.visibility = 'hidden';
      else {
        el.style.visibility = 'visible';
        el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0) translate(-50%, calc(-100% - 12px))`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [ctl, ax, ay, az]);

  return (
    <div className="walk-measure">
      {v.lines.length > 0 && (
        <div ref={label} className="walk-measure-label glass" style={{ visibility: 'hidden' }} aria-hidden="true">
          {v.lines.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
      <div className="walk-measure-bar glass" role="group" aria-label={t('量尺')}>
        <Icon name="ruler" size={18} />
        <span className="walk-measure-text" role="status" aria-live="polite">
          {v.result && <b>{v.result}</b>}
          <span>{v.hint}</span>
        </span>
        {m.a && (
          <button type="button" className="walk-btn" data-walk-act="clear" onClick={() => ctl?.clearMeasure?.()}>
            {t('清掉')}
          </button>
        )}
        <button type="button" className="walk-panel-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
