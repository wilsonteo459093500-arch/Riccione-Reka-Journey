// 楼层切换（像 The Sims / Matterport 的楼层按钮，也像电梯面板：上面的楼层在上面）：全部 · 二楼 · 一楼。
// 只在两层以上的方案出现（单层的方案、许愿模式的示范户型、展厅演示都和以前一模一样）。
// 宽屏 / iPad：右边一条竖的，放在右边空出来的那一段（日光浮卡下面、材质栏上面）的正中；
// 那一段放不下竖条（iPad 横放 1180×820、1024×768：日光浮卡和材质栏之间只有 ~150px）就变成日光浮卡下面一条横的；
// 手机（≤ 600px）：工具条下面一条横的。占的位置由 StudioApp 量了告诉引擎（setInsets），模型不会钻到它底下。

import { useLayoutEffect, useRef, useState } from 'react';
import { floorName } from '../plan/model.js';
import { t, isEn } from '../../shared/i18n.js';
import { useMedia } from './kit.jsx';

// 英文按钮放不下「Ground floor」：按钮上用短名（完整的名字在 title / 读屏里）
const SHORT_EN = { 一楼: 'Ground', 二楼: 'First', 三楼: 'Second', 四楼: 'Third', 五楼: 'Fourth', 六楼: 'Fifth' };

/** 小楼的图标：n 层叠起来，亮的那几层 = 现在看得见的（「全部」= 整栋；某一层 = 那一层，上面的空着） */
function Stack({ n, level }) {
  const H = 16;
  const gap = 1.6;
  const h = (H - gap * (n - 1)) / n;
  return (
    <svg className="fs-glyph" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const y = 1 + H - (i + 1) * h - i * gap;
        const lit = level < 0 || i <= level;
        const on = level < 0 || i === level;
        return <rect key={i} x={2} y={y} width={14} height={h} rx={1.2} className={on ? 'on' : lit ? 'lit' : 'off'} />;
      })}
    </svg>
  );
}

export default function FloorSwitch({ plan, view = 'all', onView }) {
  const ref = useRef(null);
  const phone = useMedia('(max-width: 600px)');
  const [row, setRow] = useState(false);
  const floors = plan?.floors || [];
  const n = floors.length;
  const horizontal = phone || row;

  // 竖条放在右边空出来的那一段的正中（工具条 / 日光浮卡下面、材质栏上面）；手机：工具条正下方
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || n < 2) return undefined;
    let raf = 0;
    const place = () => {
      raf = 0;
      const box = (node) => {
        const r = node?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? r : null;
      };
      const tb = box(document.querySelector('.toolbar'));
      if (phone) {
        el.style.top = `${Math.round((tb?.bottom || 60) + 8)}px`;
        return;
      }
      const dayEl = document.querySelector('.day-panel');
      const day = dayEl && getComputedStyle(dayEl).position === 'fixed' ? box(dayEl) : null;
      let bottom = innerHeight;
      for (const node of document.querySelectorAll('.dock-wrap > .dock, .dock-wrap > .day-panel, .dock-wrap > .wish-caption')) {
        const r = box(node);
        if (r) bottom = Math.min(bottom, r.top);
      }
      const top0 = Math.max(tb?.bottom || 0, day?.bottom || 0) + 12;
      const bot0 = bottom - 12;
      // 竖条要多高（按钮 52 + 间隔 2 + 内边距 10）：放不下就横着放在日光浮卡（或工具条）下面
      const colH = 10 + (n + 1) * 52 + n * 2;
      const fits = bot0 - top0 >= colH;
      if (fits === row) setRow(!fits);
      if (!fits) {
        el.style.top = `${Math.round(top0 - 2)}px`;
        return;
      }
      const h = el.offsetHeight;
      const y = Math.max(top0, Math.min(bot0 - h, (top0 + bot0 - h) / 2));
      el.style.top = `${Math.round(y)}px`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (ro) for (const s of ['.toolbar', '.day-panel', '.dock-wrap']) document.querySelectorAll(s).forEach((node) => ro.observe(node));
    addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      removeEventListener('resize', schedule);
    };
  }, [phone, n, row]);

  if (n < 2) return null;
  const items = [
    { id: 'all', label: t('全部'), title: t('看整栋'), level: -1 },
    ...[...floors].reverse().map((f) => {
      const name = floorName(plan, f.id);
      const full = t(name);
      return { id: f.id, label: isEn() && SHORT_EN[name] ? SHORT_EN[name] : full, title: full, level: f.level ?? floors.indexOf(f) };
    }),
  ];
  return (
    <nav ref={ref} className={`floor-switch glass ${horizontal ? 'is-row' : 'is-col'}`} aria-label={t('楼层')}>
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          className={`fs-btn ${view === it.id ? 'on' : ''} ${i === 0 ? 'fs-all' : ''}`}
          aria-pressed={view === it.id}
          title={it.title}
          aria-label={it.title}
          onClick={() => view !== it.id && onView?.(it.id)}
        >
          <Stack n={n} level={it.level} />
          <span className="fs-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
