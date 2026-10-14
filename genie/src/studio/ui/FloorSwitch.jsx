// 楼层切换（像 The Sims / Matterport 的楼层按钮，也像电梯面板：上面的楼层在上面）：全部 · 二楼 · 一楼。
// 只在两层以上的方案出现（单层的方案、许愿模式的示范户型、展厅演示都和以前一模一样）。
// 宽屏 / iPad：右边一条竖的，放在右边空出来的那一段（日光浮卡下面、材质栏上面）的正中；
// 那一段放不下竖条（iPad 横放 1180×820、1024×768：日光浮卡和材质栏之间只有 ~150px）就变成日光浮卡下面一条横的；
// 手机（≤ 600px）：工具条下面一条横的。占的位置由 StudioApp 量了告诉引擎（setInsets），模型不会钻到它底下。
// 横的那条不能比它那一栏宽（日光浮卡的宽度；手机 = 屏幕宽）：三层、四层的房子按钮多，一排「图标 + 字」放不下时
// 先换成「图标在上、字在下」的窄按钮（compact），还放不下就排两行：「全部」一行，各层一行（stack2）。

import { useLayoutEffect, useRef, useState } from 'react';
import { floorName } from '../plan/model.js';
import { t, isEn } from '../../shared/i18n.js';
import { useMedia } from './kit.jsx';

// 英文按钮放不下「Ground floor」：按钮上用短名（完整的名字在 title / 读屏里）
const SHORT_EN = { 一楼: 'Ground', 二楼: 'First', 三楼: 'Second', 四楼: 'Third', 五楼: 'Fourth', 六楼: 'Fifth' };

// 按钮的尺寸（和 studio.css 的 .fs-btn 一致）：横排按钮 = 左 10 + 图标 18 + 间隔 6 + 字 + 右 12；窄按钮 = 字 + 左右各 6，至少 52
const ROW_BTN = (lw) => 10 + 18 + 6 + lw + 12;
const COMPACT_BTN = (lw) => Math.max(52, lw + 12);
const LABEL_MAX = 76; // .fs-label 的 max-width
const PAD = 6; // 横条左右内边距（3 + 3）
const GAP = 2;

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

/**
 * 横条怎么排：放得下一排「图标 + 字」= 'row'；放不下换窄按钮 'compact'；还放不下两行 'stack2'。
 * widths：每个按钮的字宽（px，第一个是「全部」）；avail：那一栏有多宽。
 */
function rowLayout(widths, avail) {
  const k = widths.length;
  const lw = widths.map((w) => Math.min(LABEL_MAX, Math.ceil(w)));
  const gaps = GAP * (k - 1);
  const row = PAD + gaps + lw.reduce((s, w) => s + ROW_BTN(w), 0);
  if (row <= avail) return 'row';
  const compact = PAD + gaps + lw.reduce((s, w) => s + COMPACT_BTN(w), 0);
  if (compact <= avail) return 'compact';
  return 'stack2';
}

export default function FloorSwitch({ plan, view = 'all', onView }) {
  const ref = useRef(null);
  const phone = useMedia('(max-width: 600px)');
  // 'col' 竖条 · 'row' 一排图标 + 字 · 'compact' 一排窄按钮 · 'stack2' 两行（全部 / 各层）
  const [layout, setLayout] = useState(phone ? 'row' : 'col');
  const floors = plan?.floors || [];
  const n = floors.length;
  const items =
    n < 2
      ? []
      : [
          { id: 'all', label: t('全部'), title: t('看整栋'), level: -1 },
          ...[...floors].reverse().map((f) => {
            const name = floorName(plan, f.id);
            const full = t(name);
            return { id: f.id, label: isEn() && SHORT_EN[name] ? SHORT_EN[name] : full, title: full, level: f.level ?? floors.indexOf(f) };
          }),
        ];
  const labelKey = items.map((it) => it.label).join('|');

  // 竖条放在右边空出来的那一段的正中（工具条 / 日光浮卡下面、材质栏上面）；手机：工具条正下方
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || n < 2) return undefined;
    let raf = 0;
    let alive = true;
    const place = () => {
      raf = 0;
      if (!alive) return;
      const box = (node) => {
        const r = node?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? r : null;
      };
      // 横条：按那一栏的宽度挑排法（字宽和排法无关：每种排法字号一样，量现在的就行）
      const pickRow = (avail) => {
        const widths = [...el.querySelectorAll('.fs-label')].map((s) => s.scrollWidth || 0);
        return widths.length ? rowLayout(widths, avail) : 'row';
      };
      const tb = box(document.querySelector('.toolbar'));
      if (phone) {
        const next = pickRow(innerWidth - 32);
        if (next !== layout) setLayout(next);
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
      // 横条不比日光浮卡宽（它下面那一栏本来就留给右边的面板了）；没有浮卡（横屏手机）：不过屏幕中线
      const next = fits ? 'col' : pickRow(day ? day.width : Math.floor(innerWidth / 2) - 28);
      if (next !== layout) setLayout(next);
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
    // 网页字体晚到：字宽会变
    document.fonts?.ready?.then(schedule);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      removeEventListener('resize', schedule);
    };
  }, [phone, n, layout, labelKey]);

  if (n < 2) return null;
  const cls = layout === 'col' ? 'is-col' : `is-row${layout === 'compact' ? ' is-compact' : layout === 'stack2' ? ' is-stack2' : ''}`;
  return (
    <nav ref={ref} className={`floor-switch glass ${cls}`} style={layout === 'stack2' ? { '--fs-cols': n } : undefined} aria-label={t('楼层')}>
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
