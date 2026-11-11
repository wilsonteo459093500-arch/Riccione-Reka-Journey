// 积木编辑器用的小控件：大按钮、好按，手机上也顺手。
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { T } from '../../theme.js';
import { parseMetersToMm, mmToM } from '../../planner/model.js';

// 打字的米数 → mm 整数。员工常直接打毫米：某一项 ≥ 100 就当毫米（2700 → 2.70 m）。
// 每一项各自判断，「2.86+2.6」「2400+1200」「2.4+600」都对。只有这一条规则（不猜厘米）。
// 返回 { mm, note }：note 有值 = 有毫米被换算了，要让员工看到（例：「2700 mm → 2.70 m」）。
export function parseMeters(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { mm: 0, note: '' };
  const terms = s.split('+').map((x) => x.trim()).filter(Boolean);
  const nums = terms.map((x) => parseFloat(x) || 0);
  if (!nums.some((n) => n >= 100)) return { mm: parseMetersToMm(s), note: '' }; // 全是米：和原来完全一样
  const mm = Math.round(nums.reduce((a, n) => a + (n >= 100 ? n : n * 1000), 0));
  const note = `${nums.map((n) => (n >= 100 ? `${n} mm` : `${n} m`)).join(' + ')} → ${mmToM(mm)} m`;
  return { mm, note };
}

// ---- 手机返回键 / 浏览器「返回」：关掉最上面的全屏弹窗，不离开 KIRA ----
// 有弹窗开着时，历史里多一条「护栏」记录；按返回只会吃掉护栏 → 叫最上面弹窗的 onBack。
// 正常关闭（X / 保存）时自己 history.back() 把护栏退掉（那次 popstate 忽略），不留多余记录。
// 同一轮里一个关、一个开（选模板 → 编辑器）只保留一条护栏。
const GUARD = 'kiraModal';
export function createBackGuard(win) {
  const stack = []; // 打开中的弹窗（ref.current = onBack），最后一个在最上面
  let guard = null; // 我们推进去、还在当前位置的护栏 token
  let skip = 0;     // 自己 history.back() 引起的 popstate 数
  let bound = false;
  const sync = () => {
    const h = win.history;
    if (stack.length && !guard) {
      guard = Math.random().toString(36).slice(2);
      h.pushState({ ...(h.state || {}), [GUARD]: guard }, '');
    } else if (!stack.length && guard) {
      guard = null;
      if (h.state && h.state[GUARD]) { skip += 1; h.back(); }
    }
  };
  const onPop = () => {
    if (skip > 0) { skip -= 1; return; }
    if (!guard) return; // 不是我们的护栏（没有弹窗开着）→ 不管
    guard = null;       // 护栏被返回键吃掉了
    const top = stack[stack.length - 1];
    try { top?.current?.(); } finally { win.setTimeout(sync, 0); } // 弹窗没关（例：选了继续编辑）→ 补回护栏
  };
  return {
    open(ref) {
      if (!bound) { win.addEventListener('popstate', onPop); bound = true; }
      stack.push(ref);
      win.setTimeout(sync, 0);
      return () => {
        const i = stack.lastIndexOf(ref);
        if (i >= 0) stack.splice(i, 1);
        win.setTimeout(sync, 0);
      };
    },
  };
}
let sharedGuard = null;
// 用法：useBackClose(onClose) —— 弹窗挂载时登记，按返回就调 onBack（拿的是最新的那个函数）。
export function useBackClose(onBack) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history || !window.history.pushState) return undefined;
    sharedGuard = sharedGuard || createBackGuard(window);
    return sharedGuard.open(ref);
  }, []);
}

export function Section({ title, hint, children, right }) {
  return (
    <section className="py-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[11px] uppercase tracking-widest" style={{ color: T.inkSoft }}>{title}</div>
        {right}
      </div>
      {hint && <div className="text-[11px] -mt-1 mb-2" style={{ color: T.inkSoft }}>{hint}</div>}
      {children}
    </section>
  );
}

export function Segmented({ value, options, onChange, size = 'md' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.title}
            className={`${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} transition-colors`}
            style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
            {o.label}
            {o.sub && <span className="block text-[10px] opacity-75">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm py-1">
      <span className="relative inline-block w-9 h-5 rounded-full transition-colors" style={{ background: on ? T.sage : T.line }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
      </span>
      <span style={{ color: T.ink }}>{label}</span>
    </button>
  );
}

export function Stepper({ value, onChange, min = 1, max = 30, suffix }) {
  return (
    <div className="inline-flex items-center" style={{ border: `1px solid ${T.line}`, borderRadius: 2 }}>
      <button type="button" className="w-10 h-10 flex items-center justify-center disabled:opacity-30" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))} style={{ color: T.ink }}><Minus size={16} /></button>
      <div className="px-3 text-sm min-w-[64px] text-center" style={{ color: T.ink }}>{value}{suffix ? ` ${suffix}` : ''}</div>
      <button type="button" className="w-10 h-10 flex items-center justify-center disabled:opacity-30" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))} style={{ color: T.ink }}><Plus size={16} /></button>
    </div>
  );
}

// 米为单位的输入框（支持 2.86+2.6；打毫米 2700 也行，下面会显示「2700 mm → 2.70 m」）。
// 内部保留打字中的文字，失焦/回车才提交。
export function MeterInput({ label, mm, onChange, hint, min = 0 }) {
  const [txt, setTxt] = useState(mmToM(mm));
  const [note, setNote] = useState('');
  const [shown, setShown] = useState(mm);
  if (mm !== shown) { setShown(mm); setTxt(mmToM(mm)); } // 外面的值变了 → 文字跟着变（渲染中调整，不闪）
  const commit = () => {
    const { mm: v, note: n } = parseMeters(txt);
    setTxt(mmToM(mm)); // 先回到现在的值；外面收下新值 → 上一行马上换成新值（同值 / 被夹住也显示真值）
    if (v > min) { onChange(v); setNote(n); } else setNote('');
  };
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>{label}</span>
      <span className="flex items-center" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }}>
        <input value={txt} inputMode="decimal" onChange={(e) => { setTxt(e.target.value); setNote(''); }} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          className="flex-1 min-w-0 px-3 py-2.5 text-base outline-none bg-transparent" style={{ color: T.ink }} />
        <span className="pr-3 text-sm" style={{ color: T.inkSoft }}>m</span>
      </span>
      {note && <span className="block text-[10px] mt-1" style={{ color: T.wood }} data-mm-note>{note}</span>}
      {hint && <span className="block text-[10px] mt-1" style={{ color: T.inkSoft }}>{hint}</span>}
    </label>
  );
}

export function Collapse({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-1.5 py-3 text-[11px] uppercase tracking-widest" style={{ color: T.inkSoft }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export function Tip({ children }) {
  return (
    <span className="inline-flex items-start gap-1 text-[11px]" style={{ color: T.inkSoft }}>
      <Info size={12} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </span>
  );
}
