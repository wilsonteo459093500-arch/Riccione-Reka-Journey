// 选模板加柜子：大卡片，一按就开始
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { T } from '../../theme.js';
import { TEMPLATE_LIST, newCabinet } from '../../planner/templates.js';
import SvgShapes from '../../render/SvgShapes.jsx';
import { elevationScene } from '../../render/elevation.js';
import { useBackClose } from './bits.jsx';

const COMING = [
  { id: 'kitchen', zh: '厨房', en: 'Kitchen', sub: '一字 / L / U / 二字' },
  { id: 'tv', zh: '电视柜 / 展示柜', en: 'TV & display' },
  { id: 'shoe', zh: '鞋柜 / 玄关柜', en: 'Shoe & foyer' },
];

export default function TemplatePicker({ onPick, onClose }) {
  const ready = new Set(TEMPLATE_LIST.map((t) => t.id));
  useBackClose(onClose); // 手机返回键 = 关闭
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" style={{ background: 'rgba(45,62,54,0.55)' }} onClick={onClose}>
      <div className="w-full sm:max-w-2xl p-5 sm:p-6" style={{ background: T.paper, borderRadius: '2px 2px 0 0' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-display text-2xl" style={{ color: T.ink }}>Add a cabinet 加柜子</div>
          <button onClick={onClose} className="p-2" style={{ color: T.inkSoft }}><X size={18} /></button>
        </div>
        <div className="text-xs mb-4" style={{ color: T.inkSoft }}>Pick a template — you only need the total width. 选一个模板，打总宽就好。</div>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATE_LIST.map((t) => (
            <button key={t.id} onClick={() => onPick(t.id)} className="p-3 text-left transition-colors hover-lift"
              style={{ background: T.cream, border: `1px solid ${T.line}`, borderRadius: 2 }}>
              <div className="h-28 flex items-center justify-center mb-2" style={{ background: '#fff' }}>
                <SvgShapes scene={elevationScene(newCabinet(t.id), { dims: false })} style={{ height: '100%', width: 'auto' }} />
              </div>
              <div className="font-display text-lg" style={{ color: T.ink }}>{t.zh} <span className="text-sm">{t.en}</span></div>
            </button>
          ))}
          {COMING.filter((c) => !ready.has(c.id)).map((c) => (
            <div key={c.id} className="p-3 text-left opacity-50" style={{ background: T.cream, border: `1px dashed ${T.line}`, borderRadius: 2 }}>
              <div className="h-28 flex items-center justify-center mb-2 text-xs" style={{ background: '#fff', color: T.inkSoft }}>Coming soon 即将推出</div>
              <div className="font-display text-lg" style={{ color: T.ink }}>{c.zh} <span className="text-sm">{c.en}</span></div>
              {c.sub && <div className="text-[11px]" style={{ color: T.inkSoft }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
